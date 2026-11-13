#!/usr/bin/env bash
# Does the cp:8402 block of deploy/Caddyfile hold a request while the service restarts?
#
# Every rollout restarts `cp`, and for about 16 seconds nothing listens on cp:8402. Without a
# retry window Caddy answers 502 at once; in the deploy windows of 2026-11-10 and 2026-11-12
# paying automatons got exactly that. `lb_try_duration` makes Caddy keep a request whose
# connection failed and try again until the new process answers.
#
#   ops/caddy-retry.sh --selftest   local only, no network: a real caddy in front of a service
#                                   that starts 3 s after the request arrives
#
# Cases, one line each, `ok   <case>` or `FAIL <case>: ...`:
#   held      POST with a JSON body, answer 200, the body arrives unchanged
#   get-held  the same with GET
#   control   the same block without the lb_try_* lines answers 502, so this test can see an outage
# Last line CADDY RETRY SELFTEST OK (exit 0) or CADDY RETRY SELFTEST FAIL (exit 1).
# Without caddy on PATH: COULD NOT TELL: caddy not found (exit 2).
#
# Ports come only from a bind on port 0, never a fixed one. Own processes are stopped by PID.
set -uo pipefail

CADDYFILE="${CP_CADDYFILE:-$(cd "$(dirname "$0")/.." && pwd)/deploy/Caddyfile}"

if [[ "${1:-}" != "--selftest" ]]; then
  echo "usage: ops/caddy-retry.sh --selftest" >&2
  exit 2
fi
if ! command -v caddy >/dev/null 2>&1; then
  echo "COULD NOT TELL: caddy not found"
  exit 2
fi

TMP=$(mktemp -d)
# Each case runs in a command substitution, a subshell, so the PIDs go to a file the trap can read.
cleanup() {
  local p
  if [[ -f "$TMP/pids" ]]; then
    while read -r p; do kill "$p" 2>/dev/null; done < "$TMP/pids"
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

# The block exactly as deploy/Caddyfile has it, from `reverse_proxy cp:8402 {` to its closing brace.
block=$(awk '
  !f && /^[[:space:]]*reverse_proxy cp:8402 \{[[:space:]]*$/ { f=1 }
  f {
    print
    line=$0; sub(/#.*/, "", line)
    o=gsub(/\{/, "{", line); c=gsub(/\}/, "}", line); d+=o-c
    if (d==0) exit
  }' "$CADDYFILE")
if [[ -z "$block" ]]; then
  echo "FAIL block: no reverse_proxy cp:8402 block in $CADDYFILE"
  echo "CADDY RETRY SELFTEST FAIL"
  exit 1
fi

# The upstream: answers every request with 200 and the request body it received, as JSON.
cat > "$TMP/upstream.py" <<'PY'
import http.server, json, sys
class H(http.server.BaseHTTPRequestHandler):
    def _answer(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n).decode() if n else ""
        out = json.dumps({"method": self.command, "body": body}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)
    do_GET = do_POST = _answer
    def log_message(self, *a):
        pass
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PY

# One case: start caddy with the block, send the request while nothing listens upstream, start the
# upstream after 3 s, read status and body. Prints "<status> <body>".
run_case() {
  local name=$1 method=$2 strip=$3
  local up proxy cfg body status out cpid upid start
  up=$(free_port); proxy=$(free_port)
  cfg="$TMP/$name.Caddyfile"
  local b="$block"
  if [[ "$strip" == strip ]]; then
    b=$(printf '%s\n' "$block" | grep -vE '^[[:space:]]*lb_try_(duration|interval)[[:space:]]')
  fi
  b=$(printf '%s\n' "$b" | sed "1s#reverse_proxy cp:8402#reverse_proxy 127.0.0.1:$up#")
  {
    echo "{"
    echo "	admin off"
    echo "	auto_https off"
    echo "}"
    echo "http://127.0.0.1:$proxy {"
    printf '%s\n' "$b"
    echo "}"
  } > "$cfg"
  caddy run --config "$cfg" --adapter caddyfile > "$TMP/$name.caddy.log" 2>&1 &
  cpid=$!; echo "$cpid" >> "$TMP/pids"
  for _ in $(seq 1 100); do
    if (exec 3<>"/dev/tcp/127.0.0.1/$proxy") 2>/dev/null; then break; fi
    sleep 0.1
  done
  body="{\"model\":\"planted\",\"messages\":[{\"role\":\"user\",\"content\":\"hold me $name\"}]}"
  ( sleep 3; exec python3 "$TMP/upstream.py" "$up" ) &
  upid=$!; echo "$upid" >> "$TMP/pids"
  start=$(date +%s.%N)
  # --noproxy: the nightly audit sets HTTP_PROXY to a dead port, and curl would send even 127.0.0.1 through it.
  if [[ "$method" == POST ]]; then
    out=$(curl --noproxy '*' -s -m 40 -o "$TMP/$name.out" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      --data-binary "$body" "http://127.0.0.1:$proxy/v1/chat/completions")
  else
    out=$(curl --noproxy '*' -s -m 40 -o "$TMP/$name.out" -w '%{http_code}' "http://127.0.0.1:$proxy/v1/credits/balance")
  fi
  status=$out
  local took
  took=$(python3 -c "import time; print(f'{time.time()-$start:.1f}')")
  kill "$cpid" "$upid" 2>/dev/null
  echo "$status $took"
  if [[ "$method" == POST ]]; then
    python3 - "$TMP/$name.out" "$body" <<'PY'
import json, sys
try:
    got = json.load(open(sys.argv[1]))
except Exception:
    print("nobody"); raise SystemExit
print("same" if got.get("body") == sys.argv[2] and got.get("method") == "POST" else "changed")
PY
  else
    python3 - "$TMP/$name.out" <<'PY'
import json, sys
try:
    got = json.load(open(sys.argv[1]))
except Exception:
    print("nobody"); raise SystemExit
print("same" if got.get("method") == "GET" else "changed")
PY
  fi
}

fails=0
check() {
  local name=$1 want=$2 res status took seen
  res=$(run_case "$name" "$3" "$4")
  status=$(sed -n 1p <<<"$res" | awk '{print $1}')
  took=$(sed -n 1p <<<"$res" | awk '{print $2}')
  seen=$(sed -n 2p <<<"$res")
  if [[ "$want" == 200 && "$status" == 200 && "$seen" == same ]]; then
    echo "ok   $name"
  elif [[ "$want" == 502 && "$status" == 502 ]]; then
    echo "ok   $name"
  else
    echo "FAIL $name: wanted $want, got $status after $took s, request at the service: $seen"
    fails=$((fails + 1))
  fi
}

check held 200 POST keep
check get-held 200 GET keep
check control 502 POST strip

if [[ $fails -eq 0 ]]; then
  echo "CADDY RETRY SELFTEST OK"
  exit 0
fi
echo "CADDY RETRY SELFTEST FAIL"
exit 1
