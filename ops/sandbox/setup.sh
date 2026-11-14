#!/usr/bin/env bash
# Sets up the sandbox host after docs/sandbox/plan.md, from the code-host over SSH, idempotent.
#
#   bash ops/sandbox/setup.sh <address>          bring the host to the state below, then check it
#   bash ops/sandbox/setup.sh --check <address>  change nothing; one CHANGE line per item a run would change,
#                                                last line SETUP CHECK OK changed=0 or SETUP CHECK DRIFT changed=<n>
#   bash ops/sandbox/setup.sh --client-key <address>  read the public key of the service cp from the payment server (read only)
#                                                and install it as /etc/sandboxd/keys/cp.pub after an Ed25519 check, idempotent;
#                                                last line SETUP CLIENT-KEY OK changed=0 or changed=1, a broken key changes nothing
#   bash ops/sandbox/setup.sh --client-key-reset <address>  move cp.pub to cp.pub.prev, which sandboxd does not read, so the next
#                                                --client-key gives changed=1 (domains 04, the measured key change); the probe
#                                                key stays; last line SETUP CLIENT-KEY-RESET OK moved=1, without cp.pub moved=0
#   bash ops/sandbox/setup.sh --selftest         without network: the comparison reports a planted deviation and a clean state not,
#                                                --client-key installs a valid key once and rejects broken ones, and
#                                                --client-key-reset takes cp.pub away from sandboxd and leaves the probe key
#
# What it manages: Docker with the gVisor runtime runsc (platform systrap), the nftables table inet sandbox (sandbox.nft), the
# systemd slice sandbox.slice, sandboxd as a unit in that slice on the loopback with its own Node 22, the probe key of the
# code-host in /etc/sandboxd/keys, the base image with its pin (PIN_FUNCS), unattended-upgrades, and the Caddy file of the sandbox with exactly one import
# line in /etc/caddy/Caddyfile (caddy validate before every reload). It never touches wa-staging, ufw, Postgres or the block of
# wa-staging in the Caddyfile. DNS lives in cloudflare.py, run from the code-host. The nightly check runs --check only.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SSH_KEY=${SANDBOX_SSH_KEY:-$HOME/.ssh/id_ed25519_cp_sandbox}
PROBE_KEY=${SANDBOXD_PROBE_KEY:-$HOME/.config/control-plane/sandboxd-probe.key}
NODE_VERSION=22.23.4
NODE_DIR=/opt/sandboxd/node-v$NODE_VERSION
IMAGE=sandboxd-base:1
PIN=sandboxd-base-pin
IMPORT_LINE="import /etc/caddy/sandbox.caddy"

# repo file -> path on the host
FILES=(
  "sandbox.nft:/etc/sandbox/sandbox.nft"
  "sandbox.slice:/etc/systemd/system/sandbox.slice"
  "sandbox-nft.service:/etc/systemd/system/sandbox-nft.service"
  "sandboxd.service:/etc/systemd/system/sandboxd.service"
  "daemon.json:/etc/docker/daemon.json"
  "sandboxd.mjs:/opt/sandboxd/sandboxd.mjs"
  "sandbox.caddy:/etc/caddy/sandbox.caddy"
  "image/Dockerfile:/opt/sandboxd/image/Dockerfile"
  "auto-upgrades.conf:/etc/apt/apt.conf.d/20auto-upgrades"
)
UNITS=(docker sandbox-nft sandboxd unattended-upgrades caddy)

sha() { sha256sum | cut -c1-64; }
ssh_host() { ssh -i "$SSH_KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=20 "root@$1" "${@:2}"; }

# The public half of the probe key, SPKI PEM; the private half stays on the code-host (0600, outside the repo).
probe_pub() {
  if [ ! -f "$PROBE_KEY" ]; then
    (umask 077; /usr/bin/node -e '
      const { generateKeyPairSync } = require("node:crypto");
      const { privateKey } = generateKeyPairSync("ed25519");
      process.stdout.write(privateKey.export({ type: "pkcs8", format: "pem" }));' > "$PROBE_KEY")
  fi
  /usr/bin/node -e '
    const { createPrivateKey, createPublicKey } = require("node:crypto");
    const k = createPrivateKey(require("node:fs").readFileSync(process.argv[1]));
    process.stdout.write(createPublicKey(k).export({ type: "spki", format: "pem" }));' "$PROBE_KEY"
}

# The wanted state, one line per item: <kind> <name> <value>. $1 is the content of probe.pub.
desired() {
  local f src dst
  for f in "${FILES[@]}"; do
    src=${f%%:*}; dst=${f#*:}
    echo "file $dst $(sha < "$HERE/$src")"
  done
  echo "file /etc/sandboxd/keys/probe.pub $(printf '%s' "$1" | sha)"
  for u in "${UNITS[@]}"; do echo "active $u active"; done
  for u in docker sandbox-nft sandboxd unattended-upgrades; do echo "enabled $u enabled"; done
  echo "fact node $NODE_VERSION"
  echo "fact runsc_runtime yes"
  echo "fact nft_table yes"
  echo "fact caddy_import 1"
  echo "fact caddy_valid yes"
  echo "fact image $(sha < "$HERE/image/Dockerfile")"
  echo "fact image_pin yes"
  echo "fact sshd_password no"
  echo "fact sandboxd_public 0"
  echo "fact published_ports 0"
  echo "dir /var/lib/sandboxd/disks yes"
  echo "dir /var/lib/sandboxd/mnt yes"
}

# The pin of the base image: a never started container of the image, which docker image prune -a counts as a user of it, so
# the daily prune cron of the other tenant on the host (until=24h, which setup.sh does not touch) keeps the image (domains 04).
# No label sandboxd=1, because sandboxd removes every such container that is not in its state when it starts; a pin of an older
# build guards the old image ID only, so pin_image replaces it. Shared by GATHER, APPLY and the selftest; no ampersand inside.
PIN_FUNCS=$(cat <<'REMOTE'
pin_fact() { # <image> <pin>: yes when the pin is a never started container of the current image ID without label sandboxd=1
  local img got id status label
  img=$(docker image inspect --format '{{.Id}}' "$1" 2>/dev/null) || { echo no; return 0; }
  got=$(docker container inspect --format '{{.Image}} {{.State.Status}} {{index .Config.Labels "sandboxd"}}' "$2" 2>/dev/null) \
    || { echo no; return 0; }
  read -r id status label <<<"$got"
  if [ "$id" = "$img" ] && [ "$status" = created ] && [ "$label" != 1 ]; then echo yes; else echo no; fi
}
pin_image() { # <image> <pin>: creates the pin when it is missing, stale or not a plain created container; else changes nothing
  if [ "$(pin_fact "$1" "$2")" = yes ]; then return 0; fi
  if docker container inspect --format '{{.Id}}' "$2" >/dev/null 2>/dev/null; then docker rm -f "$2" >/dev/null; fi
  docker create --name "$2" --label sandboxd.pin=1 --network none "$1" >/dev/null
}
REMOTE
)

# What the host has, in the same format. Runs on the host; reads only.
GATHER=$(cat <<'REMOTE'
set -u
shaf() { if [ -f "$1" ]; then sha256sum "$1" | cut -c1-64; else echo missing; fi; }
for p in "$@"; do echo "file $p $(shaf "$p")"; done
for u in docker sandbox-nft sandboxd unattended-upgrades caddy; do echo "active $u $(systemctl is-active "$u" 2>/dev/null | head -1)"; done
for u in docker sandbox-nft sandboxd unattended-upgrades; do echo "enabled $u $(systemctl is-enabled "$u" 2>/dev/null | head -1)"; done
echo "fact node $( (NODE_DIR_PLACEHOLDER/bin/node --version 2>/dev/null || echo vmissing) | sed 's/^v//')"
echo "fact runsc_runtime $(docker info --format '{{range $k, $v := .Runtimes}}{{$k}} {{end}}' 2>/dev/null | grep -qw runsc && echo yes || echo no)"
echo "fact nft_table $(nft list table inet sandbox >/dev/null 2>&1 && echo yes || echo no)"
echo "fact caddy_import $(grep -cxF 'IMPORT_PLACEHOLDER' /etc/caddy/Caddyfile 2>/dev/null)"
echo "fact caddy_valid $(caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && echo yes || echo no)"
echo "fact image $(docker image inspect --format '{{index .Config.Labels "sandboxd.dockerfile"}}' IMAGE_PLACEHOLDER 2>/dev/null || echo missing)"
echo "fact sshd_password $(sshd -T 2>/dev/null | awk '$1=="passwordauthentication"{print $2}')"
echo "fact sandboxd_public $(ss -Hltnp 2>/dev/null | grep sandboxd | grep -vc '127.0.0.1')"
echo "fact published_ports $(docker ps --format '{{.Ports}}' 2>/dev/null | grep -c '0.0.0.0\|:::')"
for d in /var/lib/sandboxd/disks /var/lib/sandboxd/mnt; do echo "dir $d $([ -d "$d" ] && echo yes || echo no)"; done
PIN_FUNCS_PLACEHOLDER
echo "fact image_pin $(pin_fact IMAGE_PLACEHOLDER PIN_PLACEHOLDER)"
REMOTE
)
GATHER=${GATHER//PIN_FUNCS_PLACEHOLDER/"$PIN_FUNCS"}
GATHER=${GATHER//PIN_PLACEHOLDER/$PIN}
GATHER=${GATHER//NODE_DIR_PLACEHOLDER/$NODE_DIR}
GATHER=${GATHER//IMPORT_PLACEHOLDER/$IMPORT_LINE}
GATHER=${GATHER//IMAGE_PLACEHOLDER/$IMAGE}

remote_paths() {
  local f
  for f in "${FILES[@]}"; do echo "${f#*:}"; done
  echo /etc/sandboxd/keys/probe.pub
}

gather() { ssh_host "$1" bash -s -- $(remote_paths) <<<"$GATHER"; }

# compare <desired file> <observed file>: one CHANGE line per differing or missing item, then the summary line.
compare() {
  awk '
    NR == FNR { have[$1 " " $2] = $3; next }
    {
      key = $1 " " $2; want = $3
      got = (key in have) ? have[key] : "missing"
      if (got != want) { n++; printf "CHANGE %s want=%s have=%s\n", key, want, got }
    }
    END { if (n) printf "SETUP CHECK DRIFT changed=%d\n", n; else print "SETUP CHECK OK changed=0" }
  ' "$2" "$1"
}

check() {
  local host=$1 d o
  d=$(mktemp); o=$(mktemp)
  desired "$(probe_pub)" > "$d"
  gather "$host" > "$o"
  compare "$d" "$o"
  rm -f "$d" "$o"
}

# The run itself. Every step is safe to repeat: it compares before it writes, and restarts only what changed.
APPLY=$(cat <<'REMOTE'
set -euo pipefail
S=$1; NODE_VERSION=$2; NODE_DIR=$3; IMAGE=$4; IMPORT_LINE=$5; shift 5
export DEBIAN_FRONTEND=noninteractive
changed=()
install_file() { # <staged> <target> <mode>
  if ! cmp -s "$1" "$2"; then install -D -m "$3" "$1" "$2"; changed+=("$2"); fi
}
was() { local c; for c in "${changed[@]:-}"; do [ "$c" = "$1" ] && return 0; done; return 1; }

# packages: Docker from Ubuntu, runsc from the gVisor repository, unattended-upgrades
if [ ! -f /etc/apt/keyrings/gvisor.gpg ]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /etc/apt/keyrings/gvisor.gpg
fi
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/gvisor.gpg] https://storage.googleapis.com/gvisor/releases release main" > "$S/gvisor.list"
install_file "$S/gvisor.list" /etc/apt/sources.list.d/gvisor.list 0644
missing=()
for p in docker.io runsc unattended-upgrades e2fsprogs; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
if [ ${#missing[@]} -gt 0 ] || was /etc/apt/sources.list.d/gvisor.list; then
  apt-get update -q
  apt-get install -y -q "${missing[@]:-docker.io}"
fi

# Node 22 of sandboxd, independent of any node on the host
if [ "$("$NODE_DIR/bin/node" --version 2>/dev/null)" != "v$NODE_VERSION" ]; then
  t=$(mktemp -d)
  curl -fsSL -o "$t/node.tar.xz" "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz"
  curl -fsSL -o "$t/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  (cd "$t" && grep " node-v$NODE_VERSION-linux-x64.tar.xz\$" SHASUMS256.txt | sed 's/node-v.*$/node.tar.xz/' | sha256sum -c -)
  install -d /opt/sandboxd
  rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR" && tar -xJf "$t/node.tar.xz" -C "$NODE_DIR" --strip-components=1
  rm -rf "$t"
fi

# files
while [ $# -gt 0 ]; do install_file "$S/$1" "$2" 0644; shift 2; done
chmod 0755 /opt/sandboxd; install -d -m 0700 /var/lib/sandboxd /var/lib/sandboxd/disks /var/lib/sandboxd/mnt
systemctl daemon-reload

# nftables first, then Docker, so no sandbox bridge is ever up without the locks
systemctl enable -q sandbox-nft
if was /etc/sandbox/sandbox.nft || ! nft list table inet sandbox >/dev/null 2>&1; then
  nft -c -f /etc/sandbox/sandbox.nft && systemctl restart sandbox-nft
fi
systemctl enable -q docker
if was /etc/docker/daemon.json; then systemctl restart docker; else systemctl start docker; fi

# base image, labeled with the hash of its Dockerfile
want=$(sha256sum /opt/sandboxd/image/Dockerfile | cut -c1-64)
have=$(docker image inspect --format '{{index .Config.Labels "sandboxd.dockerfile"}}' "$IMAGE" 2>/dev/null || true)
if [ "$want" != "$have" ]; then
  docker build -q --pull --label "sandboxd.dockerfile=$want" -t "$IMAGE" /opt/sandboxd/image >/dev/null
fi
# its pin, new after every build (PIN_FUNCS)
PIN_FUNCS_PLACEHOLDER
pin_image "$IMAGE" PIN_PLACEHOLDER

# sandboxd
systemctl enable -q sandboxd
if was /opt/sandboxd/sandboxd.mjs || was /etc/systemd/system/sandboxd.service || was /etc/sandboxd/keys/probe.pub \
   || ! systemctl is-active -q sandboxd; then
  systemctl restart sandboxd
fi

# automatic updates
systemctl enable -q unattended-upgrades; systemctl start unattended-upgrades

# Caddy: the one import line, validated before the reload; an invalid result is rolled back
if ! grep -qxF "$IMPORT_LINE" /etc/caddy/Caddyfile || was /etc/caddy/sandbox.caddy; then
  cp -p /etc/caddy/Caddyfile "$S/Caddyfile.before"
  grep -qxF "$IMPORT_LINE" /etc/caddy/Caddyfile || printf '\n%s\n' "$IMPORT_LINE" >> /etc/caddy/Caddyfile
  if caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    systemctl reload caddy
  else
    cp -p "$S/Caddyfile.before" /etc/caddy/Caddyfile
    echo "setup: caddy validate failed, Caddyfile restored" >&2
    exit 1
  fi
fi
rm -rf "$S"
REMOTE
)
APPLY=${APPLY//PIN_FUNCS_PLACEHOLDER/"$PIN_FUNCS"}
APPLY=${APPLY//PIN_PLACEHOLDER/$PIN}

apply() {
  local host=$1 stage pub f args=()
  pub=$(probe_pub)
  stage=$(mktemp -d)
  for f in "${FILES[@]}"; do
    install -D -m 0644 "$HERE/${f%%:*}" "$stage/${f%%:*}"
    args+=("${f%%:*}" "${f#*:}")
  done
  printf '%s' "$pub" > "$stage/probe.pub"; args+=(probe.pub /etc/sandboxd/keys/probe.pub)
  ssh_host "$host" 'rm -rf /root/.sandbox-setup && mkdir -m 0700 /root/.sandbox-setup'
  tar -C "$stage" -cf - . | ssh_host "$host" 'tar -C /root/.sandbox-setup -xf -'
  rm -rf "$stage"
  ssh_host "$host" bash -s -- /root/.sandbox-setup "$NODE_VERSION" "$NODE_DIR" "$IMAGE" "'$IMPORT_LINE'" "${args[@]}" <<<"$APPLY"
  check "$host"
}

# --client-key: the public key of the service cp (SPKI PEM from /data/sandbox-client.pub in deploy-cp-1) as
# /etc/sandboxd/keys/cp.pub. sandboxd reads its keys on every request, so nothing restarts. $1 of both snippets is a root prefix,
# empty on the host, a temporary directory in the selftest.
CP_PUB=/etc/sandboxd/keys/cp.pub
CP_PUB_READ=$(cat <<'REMOTE'
f=$1/etc/sandboxd/keys/cp.pub
if [ -f "$f" ]; then sha256sum "$f" | cut -c1-64; else echo missing; fi
REMOTE
)
CP_PUB_WRITE=$(cat <<'REMOTE'
set -eu
d=$1/etc/sandboxd/keys
install -d -m 0755 "$d"
t=$(mktemp "$d/.cp-pub.XXXXXX")
trap 'rm -f "$t"' EXIT
cat > "$t"
chmod 0644 "$t"
mv -f "$t" "$d/cp.pub"
REMOTE
)

# --client-key-reset: moves cp.pub to cp.pub.prev, a name sandboxd does not read (it takes *.pub only), so the service's
# calls fail with "key not accepted" until the next --client-key writes the key again (changed=1). The probe key stays.
CP_PUB_RESET=$(cat <<'REMOTE'
set -eu
d=$1/etc/sandboxd/keys
if [ -f "$d/cp.pub" ]; then mv -f "$d/cp.pub" "$d/cp.pub.prev"; echo moved=1; else echo moved=0; fi
REMOTE
)

sbx_read_sha() { ssh_host "$1" "set -- ''
$CP_PUB_READ"; }
sbx_reset_cp_pub() { ssh_host "$1" "set -- ''
$CP_PUB_RESET"; }
sbx_write_cp_pub() { ssh_host "$1" "set -- ''
$CP_PUB_WRITE"; }

# Reads PEM text on stdin; exit 0 only for exactly one Ed25519 public key in SPKI PEM, else one line why.
check_ed25519_pub() {
  /usr/bin/node -e '
    const { createPublicKey } = require("node:crypto");
    const text = require("node:fs").readFileSync(0, "utf8").replace(/\n+$/, "") + "\n";
    const fail = (m) => { process.stdout.write(m); process.exit(1); };
    if (!text.startsWith("-----BEGIN PUBLIC KEY-----\n")) fail("not an SPKI PEM public key");
    let k;
    try { k = createPublicKey(text); } catch { fail("not a readable public key"); }
    if (k.asymmetricKeyType !== "ed25519") fail(`key type ${k.asymmetricKeyType}, want ed25519`);
    if (k.export({ type: "spki", format: "pem" }) !== text) fail("text around the PEM block");'
}

# install_client_key <address> <pem text>: checks the key, then writes it only if the hash on the host differs.
install_client_key() {
  local host=$1 pub=$2 why want have
  if ! why=$(check_ed25519_pub <<<"$pub"); then echo "SETUP CLIENT-KEY FAIL: $why"; return 1; fi
  want=$(printf '%s\n' "$pub" | sha)
  if ! have=$(sbx_read_sha "$host"); then echo "SETUP CLIENT-KEY FAIL: cannot read $CP_PUB on the sandbox host"; return 1; fi
  if [ "$have" = "$want" ]; then echo "SETUP CLIENT-KEY OK changed=0"; return 0; fi
  if ! printf '%s\n' "$pub" | sbx_write_cp_pub "$host"; then echo "SETUP CLIENT-KEY FAIL: cannot write $CP_PUB"; return 1; fi
  if [ "$(sbx_read_sha "$host")" != "$want" ]; then echo "SETUP CLIENT-KEY FAIL: $CP_PUB differs after the write"; return 1; fi
  echo "SETUP CLIENT-KEY OK changed=1"
}

# client_key_reset <address>: takes cp.pub out of what sandboxd reads; last line SETUP CLIENT-KEY-RESET OK moved=1, or
# moved=0 when there was no cp.pub. Prints neither key nor CP_HOST.
client_key_reset() {
  local out
  if ! out=$(sbx_reset_cp_pub "$1"); then echo "SETUP CLIENT-KEY-RESET FAIL: cannot move $CP_PUB on the sandbox host"; return 1; fi
  case "$out" in
    moved=0 | moved=1) ;;
    *) echo "SETUP CLIENT-KEY-RESET FAIL: no moved=0 or moved=1 from the sandbox host"; return 1 ;;
  esac
  if [ "$(sbx_read_sha "$1")" != missing ]; then echo "SETUP CLIENT-KEY-RESET FAIL: $CP_PUB still there"; return 1; fi
  echo "SETUP CLIENT-KEY-RESET OK $out"
}

# client_key <address>: the one read on the payment server, then install_client_key. Never prints CP_HOST or the key path.
client_key() {
  local key pub
  if [ -z "${CP_HOST:-}" ] && [ -f "$HOME/.config/control-plane/loop.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$HOME/.config/control-plane/loop.env"
    set +a
  fi
  key=${CP_SSH_KEY:-${CP_DEPLOY_KEY:-}}
  if [ -z "${CP_HOST:-}" ] || [ -z "$key" ]; then
    echo "SETUP CLIENT-KEY FAIL: CP_HOST and CP_SSH_KEY are not set (~/.config/control-plane/loop.env)"; return 1
  fi
  if ! pub=$(ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" 'docker exec deploy-cp-1 cat /data/sandbox-client.pub' 2>/dev/null); then
    echo "SETUP CLIENT-KEY FAIL: cannot read /data/sandbox-client.pub in deploy-cp-1"; return 1
  fi
  install_client_key "$1" "$pub"
}

# selftest of --client-key: a fake sandbox host under $1, the same snippets as on the host, no network.
selftest_client_key() {
  local t=$1 root=$1/host fail=0 n
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }
  curl() { echo "selftest must not reach the network (curl)" >&2; return 99; }
  sbx_read_sha() { bash -c "$CP_PUB_READ" _ "$root"; }
  sbx_write_cp_pub() { bash -c "$CP_PUB_WRITE" _ "$root"; }
  /usr/bin/node -e '
    const { generateKeyPairSync } = require("node:crypto");
    const fs = require("node:fs"), d = process.argv[1];
    const spki = (p) => p.publicKey.export({ type: "spki", format: "pem" });
    const a = generateKeyPairSync("ed25519");
    fs.writeFileSync(d + "/a.pub", spki(a));
    fs.writeFileSync(d + "/b.pub", spki(generateKeyPairSync("ed25519")));
    fs.writeFileSync(d + "/rsa.pub", spki(generateKeyPairSync("rsa", { modulusLength: 2048 })));
    fs.writeFileSync(d + "/ecdsa.pub", spki(generateKeyPairSync("ec", { namedCurve: "P-256" })));
    fs.writeFileSync(d + "/private.pem", a.privateKey.export({ type: "pkcs8", format: "pem" }));
    fs.writeFileSync(d + "/garbage", "-----BEGIN PUBLIC KEY-----\nnot a key\n-----END PUBLIC KEY-----\n");
    fs.writeFileSync(d + "/empty", "");' "$t"
  state() { if [ -f "$root$CP_PUB" ]; then echo "$(sha < "$root$CP_PUB") $(stat -c '%i %y %a' "$root$CP_PUB")"; else echo missing; fi; }
  # ck <label> <key file> <want>: want is changed=0, changed=1 or FAIL
  ck() {
    local before after out rc=0 why=
    before=$(state)
    out=$(install_client_key selftest-host "$(cat "$t/$2")") || rc=$?
    after=$(state)
    case $3 in
      FAIL)
        [ $rc -ne 0 ] || why="exit 0"
        [[ "$(tail -1 <<<"$out")" == "SETUP CLIENT-KEY FAIL: "* ]] || why="$why, last line $(tail -1 <<<"$out")"
        [ "$before" = "$after" ] || why="$why, file changed" ;;
      *)
        [ $rc -eq 0 ] || why="exit $rc"
        [ "$(tail -1 <<<"$out")" = "SETUP CLIENT-KEY OK $3" ] || why="$why, last line $(tail -1 <<<"$out")"
        cmp -s "$t/$2" "$root$CP_PUB" || why="$why, content differs"
        [ "$(stat -c %a "$root$CP_PUB" 2>/dev/null)" = 644 ] || why="$why, mode not 644"
        if [ "$3" = changed=0 ] && [ "$before" != "$after" ]; then why="$why, file rewritten"; fi ;;
    esac
    if [ -z "$why" ]; then echo "selftest client-key: ok ($1)"; else echo "selftest client-key: FAIL $1: ${why#, }"; return 1; fi
  }
  ck "valid key on an empty host, changed=1" a.pub changed=1 || fail=1
  if [ "$(stat -c %a "$root/etc/sandboxd/keys" 2>/dev/null)" != 755 ]; then echo "selftest client-key: FAIL keys dir mode"; fail=1; fi
  ck "same key again, changed=0" a.pub changed=0 || fail=1
  ck "another valid key, changed=1" b.pub changed=1 || fail=1
  for n in empty garbage rsa.pub ecdsa.pub private.pem; do
    ck "rejects $n" "$n" FAIL || fail=1
  done
  n=$(find "$root/etc/sandboxd/keys" -mindepth 1 2>/dev/null | wc -l)
  if [ "$n" = 1 ]; then echo "selftest client-key: ok (no temp file left)"; else echo "selftest client-key: FAIL $n entries in keys"; fail=1; fi
  return $fail
}

# selftest of --client-key-reset: a fake sandbox host under $1/reset with cp.pub and the probe key, the same snippets as on
# the host, no network. sandboxd takes every *.pub in the keys folder, so after the reset no *.pub but probe.pub may be left.
selftest_client_key_reset() {
  local t=$1 root=$1/reset fail=0 out rc probe_before
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }
  curl() { echo "selftest must not reach the network (curl)" >&2; return 99; }
  sbx_read_sha() { bash -c "$CP_PUB_READ" _ "$root"; }
  sbx_write_cp_pub() { bash -c "$CP_PUB_WRITE" _ "$root"; }
  sbx_reset_cp_pub() { bash -c "$CP_PUB_RESET" _ "$root"; }
  mkdir -p "$root/etc/sandboxd/keys"
  cp "$t/a.pub" "$root$CP_PUB"
  cp "$t/b.pub" "$root/etc/sandboxd/keys/probe.pub"
  probe_before=$(sha < "$root/etc/sandboxd/keys/probe.pub")
  listing() { (cd "$root/etc/sandboxd/keys" && find . -mindepth 1 -printf '%P %s %T@\n' | sort); }
  pubs() { (cd "$root/etc/sandboxd/keys" && find . -mindepth 1 -maxdepth 1 -name '*.pub' -printf '%P\n' | sort | paste -sd, -); }
  # rs <label> <want moved>: one reset, then its last line and what sandboxd would read
  rs() {
    local why=
    rc=0
    out=$(client_key_reset selftest-host) || rc=$?
    [ $rc -eq 0 ] || why="exit $rc"
    [ "$(tail -1 <<<"$out")" = "SETUP CLIENT-KEY-RESET OK moved=$2" ] || why="$why, last line $(tail -1 <<<"$out")"
    [ ! -e "$root$CP_PUB" ] || why="$why, cp.pub still there"
    [ "$(pubs)" = probe.pub ] || why="$why, sandboxd reads $(pubs)"
    [ "$(sha < "$root/etc/sandboxd/keys/probe.pub")" = "$probe_before" ] || why="$why, probe key changed"
    echo "${why#, }"
  }
  local why before
  why=$(rs moved 1)
  cmp -s "$t/a.pub" "$root$CP_PUB.prev" || why="${why:+$why, }cp.pub.prev differs from the old cp.pub"
  if [ -z "$why" ]; then echo "selftest client-key-reset: ok (moved)"; else echo "selftest client-key-reset: FAIL moved: $why"; fail=1; fi
  before=$(listing)
  why=$(rs again 0)
  [ "$(listing)" = "$before" ] || why="${why:+$why, }the keys folder changed"
  if [ -z "$why" ]; then echo "selftest client-key-reset: ok (again)"; else echo "selftest client-key-reset: FAIL again: $why"; fail=1; fi
  why=
  out=$(install_client_key selftest-host "$(cat "$t/a.pub")") || why="exit $?"
  [ "$(tail -1 <<<"$out")" = "SETUP CLIENT-KEY OK changed=1" ] || why="${why:+$why, }last line $(tail -1 <<<"$out")"
  cmp -s "$t/a.pub" "$root$CP_PUB" || why="${why:+$why, }cp.pub is not the old key"
  [ "$(sha < "$root/etc/sandboxd/keys/probe.pub")" = "$probe_before" ] || why="${why:+$why, }probe key changed"
  if [ -z "$why" ]; then echo "selftest client-key-reset: ok (reinstall)"; else echo "selftest client-key-reset: FAIL reinstall: $why"; fail=1; fi
  return $fail
}

# selftest of the image pin: the same PIN_FUNCS as on the host, with a fake docker on PATH that keeps images and containers in
# files and refuses a create over an existing name like docker does; no network. Lines selftest image-pin: ok (<case>).
selftest_image_pin() {
  local t=$1/pin fail=0 why before
  mkdir -p "$t/bin" "$t/state"
  cat > "$t/bin/docker" <<'FAKE'
#!/usr/bin/env bash
s=${PIN_STATE:?}
echo "$*" >> "$s/log"
case "$1 $2" in
  "image inspect") [ -f "$s/image" ] || exit 1; cat "$s/image" ;;
  "container inspect")
    n=${*: -1}; [ -f "$s/c.$n" ] || exit 1
    read -r id status label < "$s/c.$n"
    case "$4" in *State.Status*) echo "$id $status $label" ;; *.Image*) echo "$id" ;; *) echo "cid-$n" ;; esac ;;
  "rm -f") rm -f "$s/c.$3" ;;
  *)
    [ "$1" = create ] || { echo "fake docker: unexpected $*" >&2; exit 2; }
    shift; name=; label=
    while [ $# -gt 1 ]; do
      case "$1" in
        --name) name=$2; shift 2 ;;
        --label) case "$2" in sandboxd=*) label=${2#sandboxd=} ;; esac; shift 2 ;;
        --network) shift 2 ;;
        *) shift ;;
      esac
    done
    [ -n "$name" ] || exit 2
    [ ! -f "$s/c.$name" ] || { echo "fake docker: name $name in use" >&2; exit 1; }
    [ -f "$s/image" ] || exit 1
    echo "$(cat "$s/image") created $label" > "$s/c.$name" ;;
esac
FAKE
  chmod 0755 "$t/bin/docker"
  export PIN_STATE=$t/state
  fake() { PATH="$t/bin:$PATH" bash -c "$PIN_FUNCS"$'\n''"$@"' _ "$@"; }
  fact() { fake pin_fact "$IMAGE" "$PIN"; }
  # pr <case> <want creates> <want removes> <want fact before: yes or no>: one pin_image, then what it did and the fact
  pr() {
    local why= rc=0 creates removes
    [ "$(fact)" = "$4" ] || why="fact before $(fact), want $4"
    : > "$t/state/log"
    fake pin_image "$IMAGE" "$PIN" 2>/dev/null || rc=$?
    [ $rc -eq 0 ] || why="$why, exit $rc"
    creates=$(grep -c "^create --name $PIN " "$t/state/log" || true)
    removes=$(grep -c "^rm -f $PIN\$" "$t/state/log" || true)
    [ "$creates" = "$2" ] || why="$why, $creates creates, want $2"
    [ "$removes" = "$3" ] || why="$why, $removes removes, want $3"
    if grep "^create " "$t/state/log" | grep -q 'sandboxd=1'; then why="$why, pin labeled sandboxd=1"; fi
    [ "$(fact)" = yes ] || why="$why, fact after $(fact)"
    if [ -z "${why#, }" ]; then echo "selftest image-pin: ok ($1)"; else echo "selftest image-pin: FAIL $1: ${why#, }"; return 1; fi
  }
  if [ "$(grep -c '^fact image_pin yes$' "$1/desired")" = 1 ]; then echo "selftest image-pin: ok (desired)"
  else echo "selftest image-pin: FAIL desired: $(grep -c '^fact image_pin yes$' "$1/desired") lines fact image_pin yes"; fail=1; fi
  echo "sha256:$(printf 1 | sha)" > "$t/state/image"
  pr fresh 1 0 no || fail=1
  echo "sha256:$(printf 2 | sha)" > "$t/state/image"
  pr rebuild 1 1 no || fail=1
  pr again 0 0 yes || fail=1
  return $fail
}

selftest() {
  local t d o out fail=0
  t=$(mktemp -d)
  desired "-----BEGIN PUBLIC KEY-----
selftest
-----END PUBLIC KEY-----" > "$t/desired"
  # 1. a clean host reports nothing
  cp "$t/desired" "$t/clean"
  out=$(compare "$t/desired" "$t/clean")
  if [ "$out" = "SETUP CHECK OK changed=0" ]; then echo "selftest clean: ok"; else echo "selftest clean: FAIL $out"; fail=1; fi
  # 2. planted deviations: a changed file, a stopped unit, a second import line, a missing item
  sed -e '/^file \/etc\/sandbox\/sandbox.nft /s/ [0-9a-f]*$/ 0000000000000000000000000000000000000000000000000000000000000000/' \
      -e '/^active sandboxd /s/active$/inactive/' \
      -e '/^fact caddy_import /s/1$/2/' \
      -e '/^fact sandboxd_public /d' "$t/desired" > "$t/drift"
  out=$(compare "$t/desired" "$t/drift")
  for want in "CHANGE file /etc/sandbox/sandbox.nft" "CHANGE active sandboxd want=active have=inactive" \
              "CHANGE fact caddy_import want=1 have=2" "CHANGE fact sandboxd_public want=0 have=missing"; do
    if grep -qF "$want" <<<"$out"; then echo "selftest drift: ok ($want)"; else echo "selftest drift: FAIL missing $want"; fail=1; fi
  done
  if [ "$(tail -1 <<<"$out")" = "SETUP CHECK DRIFT changed=4" ]; then echo "selftest drift: ok (count)"; else echo "selftest drift: FAIL $(tail -1 <<<"$out")"; fail=1; fi
  # 3. every managed file is in the wanted state, and --check never runs the apply script
  for f in "${FILES[@]}"; do
    grep -q "^file ${f#*:} [0-9a-f]\{64\}$" "$t/desired" || { echo "selftest files: FAIL ${f#*:}"; fail=1; }
  done
  if declare -f check | grep -q 'APPLY\|apply '; then echo "selftest check: FAIL check runs apply"; fail=1; else echo "selftest check: ok (read only)"; fi
  # 4. --client-key against a fake host in a subshell, so the stubs stay local
  ( selftest_client_key "$t" ) || fail=1
  # 5. --client-key-reset on a second fake host, with the keys selftest_client_key made
  ( selftest_client_key_reset "$t" ) || fail=1
  # 6. the pin of the base image against a fake docker
  ( selftest_image_pin "$t" ) || fail=1
  rm -rf "$t"
  if [ $fail -eq 0 ]; then echo "SETUP SELFTEST OK"; else echo "SETUP SELFTEST FAIL"; return 1; fi
}

case "${1:-}" in
  --selftest) selftest ;;
  --check) [ -n "${2:-}" ] || { echo "usage: $0 --check <address>" >&2; exit 2; }; check "$2" ;;
  --client-key) [ -n "${2:-}" ] || { echo "usage: $0 --client-key <address>" >&2; exit 2; }; client_key "$2" ;;
  --client-key-reset) [ -n "${2:-}" ] || { echo "usage: $0 --client-key-reset <address>" >&2; exit 2; }; client_key_reset "$2" ;;
  -*|"") echo "usage: $0 <address> | --check <address> | --client-key <address> | --client-key-reset <address> | --selftest" >&2; exit 2 ;;
  *) apply "$1" ;;
esac
