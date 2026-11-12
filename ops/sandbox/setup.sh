#!/usr/bin/env bash
# Sets up the sandbox host after docs/sandbox/plan.md, from the code-host over SSH, idempotent.
#
#   bash ops/sandbox/setup.sh <address>          bring the host to the state below, then check it
#   bash ops/sandbox/setup.sh --check <address>  change nothing; one CHANGE line per item a run would change,
#                                                last line SETUP CHECK OK changed=0 or SETUP CHECK DRIFT changed=<n>
#   bash ops/sandbox/setup.sh --selftest         without network: the comparison reports a planted deviation and a clean state not
#
# What it manages: Docker with the gVisor runtime runsc (platform systrap), the nftables table inet sandbox (sandbox.nft), the
# systemd slice sandbox.slice, sandboxd as a unit in that slice on the loopback with its own Node 22, the probe key of the
# code-host in /etc/sandboxd/keys, the base image, unattended-upgrades, and the Caddy file of the sandbox with exactly one import
# line in /etc/caddy/Caddyfile (caddy validate before every reload). It never touches wa-staging, ufw, Postgres or the block of
# wa-staging in the Caddyfile. DNS lives in cloudflare.py, run from the code-host. The nightly check runs --check only.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SSH_KEY=${SANDBOX_SSH_KEY:-$HOME/.ssh/id_ed25519_cp_sandbox}
PROBE_KEY=${SANDBOXD_PROBE_KEY:-$HOME/.config/control-plane/sandboxd-probe.key}
NODE_VERSION=22.23.4
NODE_DIR=/opt/sandboxd/node-v$NODE_VERSION
IMAGE=sandboxd-base:1
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
  echo "fact sshd_password no"
  echo "fact sandboxd_public 0"
  echo "fact published_ports 0"
  echo "dir /var/lib/sandboxd/disks yes"
  echo "dir /var/lib/sandboxd/mnt yes"
}

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
REMOTE
)
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
  rm -rf "$t"
  if [ $fail -eq 0 ]; then echo "SETUP SELFTEST OK"; else echo "SETUP SELFTEST FAIL"; return 1; fi
}

case "${1:-}" in
  --selftest) selftest ;;
  --check) [ -n "${2:-}" ] || { echo "usage: $0 --check <address>" >&2; exit 2; }; check "$2" ;;
  -*|"") echo "usage: $0 <address> | --check <address> | --selftest" >&2; exit 2 ;;
  *) apply "$1" ;;
esac
