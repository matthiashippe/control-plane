#!/usr/bin/env bash
# Own CA plus server certificate for cp.test. The runtime only accepts HTTPS; the runtime
# container gets the CA over NODE_EXTRA_CA_CERTS. Idempotent.
set -euo pipefail
# mkdir, because harness/certs/ is gitignored and therefore missing in a fresh clone: without
# it every e2e run died on the very first line with "cd: ./certs: No such file or directory".
mkdir -p "$(dirname "$0")/certs"
cd "$(dirname "$0")/certs"
if [[ -f ca.pem && -f cp.test.pem && -f cp.test-key.pem ]]; then
  echo "certs present"
  exit 0
fi
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
  -keyout ca-key.pem -out ca.pem -subj "/CN=control-plane harness CA" >/dev/null 2>&1
openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout cp.test-key.pem -out cp.test.csr -subj "/CN=cp.test" >/dev/null 2>&1
cat > san.cnf <<CNF
subjectAltName=DNS:cp.test,DNS:localhost,IP:127.0.0.1
extendedKeyUsage=serverAuth
CNF
openssl x509 -req -in cp.test.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
  -out cp.test.pem -days 3650 -extfile san.cnf >/dev/null 2>&1
rm -f cp.test.csr san.cnf ca.srl
chmod 644 ca.pem cp.test.pem cp.test-key.pem ca-key.pem
echo "certs created: $(pwd)"
