#!/usr/bin/env bash
# Measures every lock of docs/sandbox/plan.md (## Schritte, sandbox 02) on the sandbox host, each with a counter-proof, and leaves
# no sandbox behind. Runs on the code-host:
#
#   bash ops/sandbox/probe.sh <address>     one line PROBE <name> OK | PROBE <name> FAIL <reason> per lock, last line
#                                           SANDBOX PROBE OK left=0 or SANDBOX PROBE FAIL ...
#   bash ops/sandbox/probe.sh --selftest    without network: a lock without a rising counter-proof is FAIL, a missing name is FAIL
#
# sandboxd only listens on the loopback of the host, and Caddy opens ctl.sbx only for the payment server, so the probe talks to
# sandboxd over SSH, signed on the code-host with the probe key (setup.sh puts its public half on the host). The signer below is
# written from the format in docs/sandbox/plan.md, ## Verbindung, not from sandboxd.mjs, so it checks that format as well.
#
# A lock only counts when its counter-proof moved: the named nftables counter of the rule that dropped the packet (sbx_host,
# sbx_pay, sbx_meta, sbx_peer, sbx_smtp), the kernel OOM line of the sandbox cgroup, or, where no rule of ours is involved, the same
# target reached without the sandbox (host_file: the host reads the canary; host_ipv6: the code-host reaches the host over IPv6).
# The host itself never connects to the payment server; that counter-proof is the sbx_pay counter only.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SSH_KEY=${SANDBOX_SSH_KEY:-$HOME/.ssh/id_ed25519_cp_sandbox}
PROBE_KEY=${SANDBOXD_PROBE_KEY:-$HOME/.config/control-plane/sandboxd-probe.key}
NODE=${NODE:-/usr/bin/node}
PAYMENT=76.13.144.207
NAMES=(host_file payment_https payment_ssh payment_udp443 metadata host_bridge host_public host_ipv6 other_sandbox smtp memory expose)

# evaluate < RAW lines > PROBE lines. RAW <name> lock <blocked 0|1> <before> <after> | RAW <name> allow <ok 0|1> | LEFT <n>
evaluate() {
  awk -v names="${NAMES[*]}" '
    $1 == "RAW" && $3 == "lock" {
      if ($4 != 1) r[$2] = "FAIL not blocked"
      else if ($6 + 0 <= $5 + 0) r[$2] = "FAIL counter-proof did not rise (" $5 " -> " $6 ")"
      else r[$2] = "OK"
      next
    }
    $1 == "RAW" && $3 == "allow" { r[$2] = ($4 == 1) ? "OK" : "FAIL not reached"; next }
    $1 == "LEFT" { left = $2; seen_left = 1; next }
    END {
      n = split(names, list, " "); bad = 0
      for (i = 1; i <= n; i++) {
        k = list[i]
        if (!(k in r)) { print "PROBE " k " FAIL missing"; bad++ }
        else { print "PROBE " k " " r[k]; if (r[k] != "OK") bad++ }
      }
      if (!seen_left) { print "SANDBOX PROBE FAIL left=unknown"; exit }
      if (bad == 0 && left == 0) print "SANDBOX PROBE OK left=0"
      else print "SANDBOX PROBE FAIL failed=" bad " left=" left
    }'
}

selftest() {
  local good out fail=0
  good=$(for n in "${NAMES[@]}"; do
    case $n in payment_https|expose) echo "RAW $n allow 1" ;; *) echo "RAW $n lock 1 3 7" ;; esac
  done; echo "LEFT 0")
  expect() { # <label> <input> <grep pattern of a wanted line> [last line]
    out=$(evaluate <<<"$2")
    if grep -qxF -- "$3" <<<"$out" && { [ -z "${4:-}" ] || [ "$(tail -1 <<<"$out")" = "$4" ]; }; then echo "selftest $1: ok"
    else echo "selftest $1: FAIL"; echo "$out" | sed 's/^/  /'; fail=1; fi
  }
  expect "all locks" "$good" "PROBE memory OK" "SANDBOX PROBE OK left=0"
  expect "counter-proof flat" "$(sed 's/^RAW smtp lock 1 3 7$/RAW smtp lock 1 3 3/' <<<"$good")" \
    "PROBE smtp FAIL counter-proof did not rise (3 -> 3)" "SANDBOX PROBE FAIL failed=1 left=0"
  expect "not blocked" "$(sed 's/^RAW payment_ssh lock 1 /RAW payment_ssh lock 0 /' <<<"$good")" \
    "PROBE payment_ssh FAIL not blocked" "SANDBOX PROBE FAIL failed=1 left=0"
  expect "missing name" "$(grep -v '^RAW host_ipv6 ' <<<"$good")" "PROBE host_ipv6 FAIL missing" "SANDBOX PROBE FAIL failed=1 left=0"
  expect "allow failed" "$(sed 's/^RAW expose allow 1$/RAW expose allow 0/' <<<"$good")" "PROBE expose FAIL not reached"
  expect "sandbox left" "$(sed 's/^LEFT 0$/LEFT 1/' <<<"$good")" "PROBE memory OK" "SANDBOX PROBE FAIL failed=0 left=1"
  expect "no left line" "$(grep -v '^LEFT' <<<"$good")" "SANDBOX PROBE FAIL left=unknown"
  # the signer reproduces the example signature printed in docs/sandbox/plan.md
  if sign_selftest; then echo "selftest signer: ok"; else echo "selftest signer: FAIL"; fail=1; fi
  if [ $fail -eq 0 ]; then echo "PROBE SELFTEST OK"; else echo "PROBE SELFTEST FAIL"; return 1; fi
}

# ---- signing after docs/sandbox/plan.md, ## Verbindung
SIGNER='
const c = require("node:crypto"), fs = require("node:fs");
const [keyArg, method, path, ts, bodyFile] = process.argv.slice(1);
const body = bodyFile ? fs.readFileSync(bodyFile) : Buffer.alloc(0);
const key = /^[0-9a-f]{64}$/.test(keyArg)
  ? c.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(keyArg, "hex")]), format: "der", type: "pkcs8" })
  : c.createPrivateKey(fs.readFileSync(keyArg));
const msg = [method.toUpperCase(), path, ts, c.createHash("sha256").update(body).digest("hex")].join("\n");
process.stdout.write(c.sign(null, Buffer.from(msg, "utf8"), key).toString("base64"));
'
sign() { "$NODE" -e "$SIGNER" "$@"; }

# Reads the worked example from the ## Verbindung section (lines "key: value" in a fenced block) and signs it again.
sign_selftest() {
  local sec seed method path ts body want got bf
  sec=$(awk '/^## Verbindung/{f=1;next} /^## /{f=0} f' "$HERE/../../docs/sandbox/plan.md")
  field() { sed -n "s/^$1: *//p" <<<"$sec" | head -1 | sed 's/^`//; s/`$//'; }
  seed=$(field seed); method=$(field method); path=$(field path); ts=$(field timestamp); body=$(field body)
  want=$(field signature)
  [ -n "$seed" ] && [ -n "$want" ] || { echo "  plan.md example not found" >&2; return 1; }
  bf=$(mktemp); printf '%s' "$body" > "$bf"
  got=$(sign "$seed" "$method" "$path" "$ts" "$bf"); rm -f "$bf"
  [ "$got" = "$want" ] || { echo "  signature $got != $want" >&2; return 1; }
}

# ---- talking to the host
HOST=
ssh_host() { ssh -i "$SSH_KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=20 "root@$HOST" "$@"; }

# api <method> <path> [json body] -> response body on stdout; the HTTP status goes to $STATUS_FILE, read with api_status
STATUS_FILE=$(mktemp)
api_status() { cat "$STATUS_FILE"; }
api() {
  local method=$1 path=$2 body=${3:-} ts sig bf out
  ts=$(date +%s); bf=$(mktemp); printf '%s' "$body" > "$bf"
  sig=$(sign "$PROBE_KEY" "$method" "$path" "$ts" "$bf")
  out=$(ssh_host "curl -s -w '\n%{http_code}' -X $method -H 'Content-Type: application/json' -H 'X-CP-Timestamp: $ts' -H 'X-CP-Signature: $sig' --data-binary @- 'http://127.0.0.1:8730$path'" < "$bf")
  rm -f "$bf"
  tail -1 <<<"$out" > "$STATUS_FILE"
  sed '$d' <<<"$out"
}
jget() { python3 -I -c 'import sys, json; d = json.load(sys.stdin); print(d.get(sys.argv[1], ""))' "$1"; }

# run <sandbox id> <shell command> [timeout ms] -> stdout of the command; its exit code goes to $STATUS_FILE.code
run() {
  local body res
  body=$(python3 -I -c 'import sys, json; print(json.dumps({"command": sys.argv[1], "timeout": int(sys.argv[2])}))' "$2" "${3:-30000}")
  res=$(api POST "/v1/sandboxes/$1/exec" "$body")
  (jget exit_code <<<"$res" 2>/dev/null || echo -1) > "$STATUS_FILE.code"
  jget stdout <<<"$res" 2>/dev/null || true
}

counter() { ssh_host "nft list counter inet sandbox $1" | awk '/packets/{print $2; exit}'; }

# tcp_any <sandbox> <host> <port...>: number of ports that accepted a connection from inside the sandbox
tcp_any() {
  local sb=$1 h=$2 cmd=""; shift 2
  for p in "$@"; do cmd+="timeout 4 bash -c 'echo > /dev/tcp/$h/$p' 2>/dev/null && echo open; "; done
  run "$sb" "$cmd true" 60000 | grep -c open || true
}

SANDBOXES=()
OWNER=
cleanup() {
  local id
  if [ -n "$OWNER" ]; then # every sandbox of this run, also one whose create answer got lost
    for id in $(api GET "/v1/sandboxes?owner=$OWNER" 2>/dev/null | python3 -I -c 'import sys, json; [print(s["id"]) for s in json.load(sys.stdin).get("sandboxes", [])]' 2>/dev/null); do
      SANDBOXES+=("$id")
    done
  fi
  for id in "${SANDBOXES[@]:-}"; do [ -n "$id" ] && api DELETE "/v1/sandboxes/$id" >/dev/null 2>&1 || true; done
  ssh_host "rm -f /root/sbx-probe-canary" 2>/dev/null || true
}

probe() {
  HOST=$1
  local owner a b gw v6 c0 c1 n ok canary ip_b url res id
  owner="probe-$(date +%s)"; OWNER=$owner
  trap cleanup EXIT
  for v in a b; do
    res=$(api POST /v1/sandboxes "{\"owner\":\"$owner\",\"memory_mb\":512}")
    id=$(jget id <<<"$res" 2>/dev/null || true)
    [ -n "$id" ] && SANDBOXES+=("$id")
    [ "$(api_status)" = 201 ] && [ -n "$id" ] || { echo "create $v failed: $(api_status) $res" >&2; echo "SANDBOX PROBE FAIL create"; return 1; }
    printf -v "$v" '%s' "$id"
  done
  gw=$(ssh_host "docker network inspect -f '{{(index .IPAM.Config 0).Gateway}}' sbx-$a")
  ip_b=$(ssh_host "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' sbx-$b")
  v6=$(ssh_host "ip -6 -o addr show scope global" | awk '{sub("/.*", "", $4); print $4; exit}')

  {
    # host_file: a canary line in a file of the host, looked for inside the sandbox, also through /proc/1/root
    canary="sbx-canary-$RANDOM$RANDOM"
    ssh_host "echo $canary > /root/sbx-probe-canary"
    n=$(run "$a" "grep -rsl $canary /root /proc/1/root/root /proc/1/root/etc /etc /tmp /proc/1/root/tmp 2>/dev/null | wc -l; cat /proc/1/root/root/sbx-probe-canary 2>/dev/null | grep -c $canary" 60000 | awk '{s+=$1} END {print s+0}')
    c1=$(ssh_host "grep -c $canary /root/sbx-probe-canary")
    ssh_host "rm -f /root/sbx-probe-canary"
    echo "RAW host_file lock $([ "$n" = 0 ] && echo 1 || echo 0) 0 $c1"

    # payment_https: the allowed way, the public API like any customer
    res=$(run "$a" "curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://postyourprice.com/health")
    echo "RAW payment_https allow $([ "$res" = 200 ] && echo 1 || echo 0)"

    c0=$(counter sbx_pay); n=$(tcp_any "$a" "$PAYMENT" 22); c1=$(counter sbx_pay)
    echo "RAW payment_ssh lock $([ "$n" = 0 ] && echo 1 || echo 0) $c0 $c1"

    c0=$(counter sbx_pay)
    res=$(run "$a" "for i in 1 2 3; do echo probe > /dev/udp/$PAYMENT/443; done; timeout 3 nc -u -w 2 $PAYMENT 443 < /dev/null | wc -c")
    c1=$(counter sbx_pay)
    echo "RAW payment_udp443 lock $([ "${res:-0}" = 0 ] && echo 1 || echo 0) $c0 $c1"

    c0=$(counter sbx_meta); n=$(tcp_any "$a" 169.254.169.254 80); c1=$(counter sbx_meta)
    echo "RAW metadata lock $([ "$n" = 0 ] && echo 1 || echo 0) $c0 $c1"

    c0=$(counter sbx_host); n=$(tcp_any "$a" "$gw" 22 80 443 5432); c1=$(counter sbx_host)
    echo "RAW host_bridge lock $([ "$n" = 0 ] && echo 1 || echo 0) $c0 $c1"

    c0=$(counter sbx_host); n=$(tcp_any "$a" "$HOST" 22 80 443 5432); c1=$(counter sbx_host)
    echo "RAW host_public lock $([ "$n" = 0 ] && echo 1 || echo 0) $c0 $c1"

    # host_ipv6: the sandbox reaches no port of the host over IPv6; the code-host does (22, 80, 443), so the target listens
    n=$(tcp_any "$a" "$v6" 22 80 443 5432)
    c1=0
    for p in 22 80 443; do timeout 5 bash -c "echo > /dev/tcp/$v6/$p" 2>/dev/null && c1=$((c1 + 1)); done
    echo "RAW host_ipv6 lock $([ -n "$v6" ] && [ "$n" = 0 ] && echo 1 || echo 0) 0 $c1"

    c0=$(counter sbx_smtp); n=$(tcp_any "$a" 1.1.1.1 25); c1=$(counter sbx_smtp)
    echo "RAW smtp lock $([ "$n" = 0 ] && echo 1 || echo 0) $c0 $c1"

    # other_sandbox: b listens on 8080, a tries it; the host itself reaches it, the sbx_peer counter takes a's packets
    run "$b" "mkdir -p /root/www && echo sbx-probe > /root/www/index.html && cd /root/www && (setsid python3 -m http.server 8080 > /dev/null 2>&1 &) ; sleep 1; true" >/dev/null
    c0=$(counter sbx_peer); n=$(tcp_any "$a" "$ip_b" 8080); c1=$(counter sbx_peer)
    echo "RAW other_sandbox lock $([ "$n" = 0 ] && echo 1 || echo 0) $c0 $c1"

    # expose: b's port 8080 through Cloudflare and Caddy from the code-host
    res=$(api POST "/v1/sandboxes/$b/ports/expose" '{"port":8080}')
    url=$(jget public_url <<<"$res" 2>/dev/null || true)
    ok=0
    for i in 1 2 3 4 5 6; do
      [ -n "$url" ] && [ "$(curl -s --max-time 15 "$url/")" = sbx-probe ] && { ok=1; break; }
      sleep 5
    done
    echo "RAW expose allow $ok"

    # memory: a process over 512 MB dies with OOM (the kernel logs it for the cgroup of the sandbox), the host still answers on SSH
    id=$(ssh_host "docker inspect -f '{{.Id}}' sbx-$a")
    c0=$(ssh_host "journalctl -k --since=-15min --no-pager | grep -c 'oom_memcg=/sandbox.slice/docker-$id' || true")
    run "$a" "head -c 700m /dev/zero | tail > /dev/null; echo survived" 120000 > /dev/null || true
    sleep 3
    c1=$(ssh_host "journalctl -k --since=-15min --no-pager | grep -c 'oom_memcg=/sandbox.slice/docker-$id' || true")
    n=$(timeout 30 ssh -i "$SSH_KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=20 "root@$HOST" echo up 2>/dev/null || true)
    echo "RAW memory lock $([ "$n" = up ] && [ "$(cat "$STATUS_FILE.code")" != 0 ] && echo 1 || echo 0) $c0 $c1"
  } > "${RAW_OUT:=$(mktemp)}"

  cleanup; trap - EXIT
  left=$(ssh_host "docker ps -aq --filter label=sandboxd.owner=$owner | wc -l")
  echo "LEFT $left" >> "$RAW_OUT"
  [ -n "${PROBE_RAW:-}" ] && cp "$RAW_OUT" "$PROBE_RAW"
  evaluate < "$RAW_OUT"
  rm -f "$RAW_OUT" "$STATUS_FILE" "$STATUS_FILE.code"
}

case "${1:-}" in
  --selftest) selftest ;;
  -*|"") echo "usage: $0 <address> | --selftest" >&2; exit 2 ;;
  *) probe "$1" ;;
esac
