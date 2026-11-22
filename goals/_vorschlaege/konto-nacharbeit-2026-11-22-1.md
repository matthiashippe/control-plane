Schwere: 3
Goal: konto 16
Befund: Mit der Prüfung der Freigabe für SEPA aus konto 16 kommt `ops/soll-live-money.mjs` nicht mehr bis `payout-bank`, weil sein eigener nachgebauter Bridge `GET /v0/customers/cus_1` mit 404 beantwortet und die Route darauf 502 gibt; konto 16 Punkt 4 verlangt das Skript zugleich unverändert und grün.
Beleg: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-money.mjs --out $T` -> `soll-live-money: payout-bank: GET /h/… answered 502, expected 200`, Exit 2 | ops/soll-live-money.mjs:57
Empfehlung: In `bridgeFetch` von `ops/soll-live-money.mjs` nach der Zeile zu `GET /v0/kyc_links/kyc_1` eine Zeile `if (method === "GET" && url.pathname === "/v0/customers/cus_1") return answer(200, { id: "cus_1", status: "active", endorsements: [{ name: "sepa", status: "approved" }] });` ergänzen, als Kritik-Punkt von konto 16 mit Freigabe dieser einen Datei aus der Deny List oder als eigenes Goal direkt nach dem Merge; in einer Wegwerfkopie von HEAD mit genau dieser Zeile meldet `ops/soll-money.mjs --check` `soll money: 16 images, blocks end 390=655 1440=684, 0 defects` bei Exit 0.
MVP: Funktion
