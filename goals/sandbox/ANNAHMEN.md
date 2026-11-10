# Annahmen sandbox

## Goal 01 (10.11.2026, Engineer CP)

- **Kurs Euro zu USD 1,17.** Der Preis in `docs/sandbox/plan.md`, Abschnitt `## Preis`, rechnet den Einkauf bei Hostinger mit
  1 Euro = 1,17 USD in mc um. Ein Kurs ist keine Zahl der Produktion; bei 1,05 läge der Server bei 790 mc je Stunde und die Marge bei
  halber Belegung bei Faktor 3,8, die Entscheidung kippt in keinem plausiblen Bereich.
- **Kein `/dev/kvm` auf Hostinger KVM 1.** Gemessen am Zahlungsserver, der dasselbe Paket ist, nicht am neuen Server, den es noch
  nicht gibt: `ls -l /dev/kvm` gab `No such file or directory`, `grep -cE "vmx|svm" /proc/cpuinfo` gab `0`. sandbox 02 misst am neuen
  Server erneut; der Plan bleibt bei gVisor auch dann, wenn es dort `/dev/kvm` gibt.
- **Die 4xx und 501 fremder Adressen auf `/v1/sandboxes` und `/v1/domains` werden kein neuer Vorschlag `fehler`.** Sie sind genau der
  Beleg, aus dem die Topics `sandbox` (Prio 2) und `domains` (Prio 3) in `ROADMAP.md` entstanden sind; sandbox 03 und domains 01
  beheben sie. Ein Vorschlag mit Schwere 5 würde dieselbe Arbeit als zweites Glied unter `fehler` vor die Kette stellen. Der eine
  401 auf `POST /v1/sandboxes` ist eine Anfrage ohne gültigen API-Key, kein Fehler des Dienstes.
- **Preise bei Hostinger** gelesen am 10.11.2026 auf `https://www.hostinger.com/de/vps-hosting`: KVM 1 mit 1 vCPU, 4 GB, 50 GB NVMe
  für 5,49 Euro im Monat bei 24 Monaten (131,76 Euro im Voraus), danach 11,99 Euro im Monat. Ob der Shop bei der Bestellung einen
  anderen Preis zeigt, sieht erst Matthias; `docs/sandbox/server.md` nennt den Preis, den er bezahlt hat.
- **Schlüsselpaar `~/.ssh/id_ed25519_cp_sandbox`** am 10.11.2026 auf dem code-host angelegt (ed25519, ohne Passphrase, Kommentar
  `code-host cp-sandbox`). Die öffentliche Hälfte steht unter `## Blockers` der Goal-Datei, die private verlässt den code-host nie.
