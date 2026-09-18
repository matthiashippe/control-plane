#!/usr/bin/env bash
# Eigene CA plus Server-Zertifikat für cp.test. Die Runtime akzeptiert nur HTTPS; der
# Runtime-Container bekommt die CA über NODE_EXTRA_CA_CERTS. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/certs"
if [[ -f ca.pem && -f cp.test.pem && -f cp.test-key.pem ]]; then
  echo "certs vorhanden"
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
echo "certs erzeugt: $(pwd)"
