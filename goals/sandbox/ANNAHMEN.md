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

## Goal 01, Umstellung (11.11.2026, Engineer CP)

- **Server ist `srv1327036` statt eines neuen KVM 1.** Entscheidung Matthias am Topic vom 11.11.2026, das Gate `server_kauf` entfällt.
  Die Zeilen oben zu KVM 1 und seinem Preis gelten nur noch als Herleitung von Zyklus 1; `docs/sandbox/plan.md` rechnet mit KVM 2.
- **Preis KVM 2 nach dem 03.02.2027** gelesen am 11.11.2026 auf `https://www.hostinger.com/de/vps-hosting`: 2 vCPU, 8 GB, 100 GB,
  7,79 Euro im Monat bei 24 Monaten, Verlängerung 14,99 Euro im Monat. Der Plan rechnet die Marge mit der Verlängerung.
- **Kein `/dev/kvm` auf `srv1327036`** ist weiter nur am Zahlungsserver gemessen; sandbox 02 misst nach der Neuinstallation.
- **Erst Neuinstallation, dann Zugang.** Auf `srv1327036` liefen Loop und Deploy-Runner von Wissensanker, darum wird er mit Ubuntu
  24.04 ohne Panel neu installiert, sobald wa-staging umgezogen ist. Gegenprobe vor der Neuinstallation am 11.11.2026:
  `ssh -i ~/.ssh/id_ed25519_cp_sandbox -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 root@72.62.51.224 'uname -sr'`
  gab `Permission denied (publickey)` mit Exit 255; der dabei gespeicherte Hostschlüssel ist mit `ssh-keygen -R 72.62.51.224`
  wieder entfernt, weil die Neuinstallation einen neuen erzeugt.
