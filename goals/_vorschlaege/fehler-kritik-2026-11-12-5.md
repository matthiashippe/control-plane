Schwere: 3
Goal: fehler 04
Befund: Der Beleg `datacenter … (fetcher-cache)` in `ops/known-ips.txt` ist in CI nicht prüfbar; wer eine Besucheradresse mit dieser Zeile einträgt, kommt durch `check`, weil nur der code-host den Cache hat und `test/visitor-addresses.test.ts` die Liste nicht liest.
Beleg: test/known-ips.test.ts, Funktion `listedAddresses` (liest nur die Adresse, nie den Beleg) | `grep -c 'known-ips' test/visitor-addresses.test.ts` -> 0
Empfehlung: Glied am Topic `fehler`: Dort, wo der Cache liegt, prüft `test/visitor-addresses.test.ts` (oder ein Selbsttest von `ops/fetchers.py`) jede Zeile mit `(fetcher-cache)` gegen den Cache: Die Adresse steht dort mit Art `datacenter` und dem genannten Betreiber, sonst rot. In CI bleibt der Teil übersprungen wie heute.
Übernommen: Triage-Glieder 13.11. an den Tech Lead, Glied 4 (Beleg `(fetcher-cache)` gegen den Cache prüfen) (2026-11-13)
