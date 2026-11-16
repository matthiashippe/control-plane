# Ein Automaton läuft bei uns

Wer keinen eigenen Server hat, startet mit einem Aufruf einen Automaton, der ganz bei uns läuft: in einer eigenen Sandbox, mit der
unveränderten Runtime am Pin `d8f8168`, bezahlt aus den Credits seines Kontos (Goal sandbox 08). Das gilt für jedes Konto, auch für
ein schlüsselloses aus `POST /v1/auth/keyless`. Die Entscheidungen mit Grund stehen in `goals/sandbox/ANNAHMEN.md` unter
`## Goal 08`, die Fehler in `docs/errors.md` unter `## automatons`.

## Routen

Alle Routen brauchen den API-Schlüssel des Kontos (`Authorization: <key>` oder `Bearer <key>`). Eine ID eines anderen Kontos gibt
404 `automaton_not_found`, nie 403.

| Route | Antwort |
|---|---|
| `POST /v1/automatons` mit `{"name": "...", "genesis_prompt": "..."}` | 201 mit `id`, `name`, `status` (`starting`), `sandbox_id`, `created_at` |
| `GET /v1/automatons` | 200 mit `automatons`, nur die eigenen |
| `GET /v1/automatons/{id}` | 200 mit `status` (`starting`, `running`, `stopped`, `failed`), `reason` bei `stopped` und `failed`, `wallet_address` der Runtime, `turns` |
| `GET /v1/automatons/{id}/logs` | 200 mit `lines`, den letzten 200 Zeilen des Logs der Runtime; jeder API-Schlüssel und jede 64-stellige Hex-Folge steht dort als `[redacted]` |
| `POST /v1/automatons/{id}/stop` | 200, die Sandbox hält an (`reason` `stopped`), gestoppte Zeit kostet nichts |
| `POST /v1/automatons/{id}/start` | 200, nach einem Stopp oder einem Halt bei leerem Guthaben, mit derselben Reservierung wie beim Anlegen |
| `DELETE /v1/automatons/{id}` | 200 mit `{"ok": true, "id": "...", "status": "deleted"}`, Sandbox gelöscht, Schlüssel widerrufen |

`name` hat 1 bis 64 Zeichen aus Buchstaben, Ziffern, Leerzeichen, Punkt, Unterstrich und Bindestrich, `genesis_prompt` 1 bis 8000
Zeichen und geht unverändert an die Runtime; sonst 400 `invalid_request`. `starting` heißt: Die Sandbox läuft, die Runtime hat noch
keinen Turn im Log; `running` heißt: mindestens ein Turn. `POST /v1/automatons/register` ist die Anmeldung, die die Runtime selbst
macht, und bleibt, wie sie war; `register` ist nie eine ID.

Kosten: genau die Sandbox (100 mc je angefangene 6 Minuten in der Stufe klein, 1000 mc Reservierung, `docs/sandbox/plan.md`,
`## Preis`) und die Inferenz der Runtime, beides auf dem Konto, dem die Sandbox gehört. Ohne die Reservierung antwortet das
Anlegen 402 `INSUFFICIENT_CREDITS` mit `details`. Bei leerem Guthaben hält die Sandbox an (`status` `stopped`, `reason` `credit`);
`POST /v1/automatons/{id}/start` startet sie wieder, sobald das Guthaben die Reservierung trägt.

## Was in der Sandbox liegt

Das Image `sandboxd-base:2` (`ops/sandbox/image/Dockerfile`) trägt Node 22, die Runtime als Klon am Pin unter `/opt/automaton`
(gebaut mit `pnpm install --frozen-lockfile` und `pnpm build`, ohne Patch), eine Kopie von `harness/runtime/setup-headless.mjs`
und die Befehle `automaton-start` und `automaton-supervise`. Das Root-Dateisystem kommt aus dem Image; dauerhaft ist nur `/root`,
und dort liegt der ganze Zustand der Runtime.

Beim Anlegen legt das Control Plane eine Sandbox der Stufe klein mit `keep_running` an, einen API-Schlüssel des Kontos mit dem
Namen `automaton:<id>` und lädt die Setup-Datei nach `/root/.automaton-setup.json`:

| Feld | Wert |
|---|---|
| `conwayApiUrl`, `socialRelayUrl` | die öffentliche Basis des Control Planes (`CP_PUBLIC_URL`, in der Produktion `https://postyourprice.com`) |
| `conwayApiKey` | der Schlüssel `automaton:<id>`; das Control Plane behält nur seinen Hash |
| `creatorAddress`, `payTo` | die Smart Wallet des Kontos (konto 03) oder seine SIWE-Adresse; ein schlüsselloses Konto bekommt die Nulladresse |
| `creatorMessage` | sagt der Runtime, dass jede Zahlung mit `payTo` an diese Adresse geht und ihre eigene Wallet nie Geld annimmt |
| `genesisPrompt` | der Text des Kunden, unverändert |
| `disableHeartbeats` | `check_for_updates`, weil ein Update den Pin verließe; `check_social_inbox` bleibt an |

Dann ruft es in der Sandbox `AUTOMATON_HOME=/root automaton-start /root/.automaton-setup.json` auf. Das legt mit der Runtime ihre
Wallet und `automaton.json` an, löscht die Setup-Datei, setzt die Marke `/root/.automaton/autostart` und startet
`automaton-supervise`. Der Supervisor startet `node /opt/automaton/dist/index.js --run` und nach jedem Ende 5 s später neu; die
Ausgabe geht nach `/root/.automaton/run.log`, das ab 10 MB auf die letzten 5 MB gekürzt wird.

Der Automaton läuft von selbst weiter: nach einem Absturz der Runtime über den Supervisor, nach einem Speicherüberlauf über
`--restart unless-stopped` und nach einem Neustart des Sandbox-Servers über `reconcile` in `sandboxd`. In jedem dieser Fälle
startet der Befehl des Containers den Supervisor, wenn die Marke besteht.

Die Wallet, die die Runtime in der Sandbox erzeugt, hält nie Geld: Einnahmen gehen mit `payTo` an das Konto des Kunden. Ihren
Schlüssel liest niemand; die Adresse kommt aus `automaton.json`.

## Grenzen

Ein Automaton belegt eine Sandbox der Stufe klein, also einen der zwei Plätze des Kontos. Seine Sandbox fällt nicht unter die
24 Stunden ohne Aufruf und nicht unter die 30 Tage (`docs/sandbox/plan.md`, `## Grenzen`); sie endet nur durch Stopp, Löschen
und leeres Guthaben. Ein Schlüssel `automaton:<id>` legt keinen weiteren Automaton an (403 `forbidden`), damit kein Automaton
sich selbst vervielfacht; eigene Sandboxes über `POST /v1/sandboxes` bleiben ihm erlaubt und zählen gegen die zwei Plätze des
Kontos. Fremder Code läuft nur auf dem Sandbox-Server, nie auf dem Zahlungsserver.

## Lauf gegen die Produktion

Vor dem Merge kommen Image und `sandboxd` mit `bash ops/sandbox/setup.sh 72.62.51.224` vom Goal-Branch auf den Sandbox-Server,
dann fährt `ops/automaton-live.sh` über die öffentliche Sandbox-API mit dem eigenen Konto dieselben Schritte wie das Control Plane
(`/v1/automatons` rollt erst mit dem Merge aus), mit `--reboot` samt einem Neustart des Sandbox-Servers. Das Skript druckt keinen
Schlüssel, keine Adresse und keine Sandbox-ID.

Umstellung des Sandbox-Servers, 2026-11-16 vom code-host:

- 02:33 UTC: Zustand von `sandboxd` und `docker ps` auf dem Sandbox-Server, nur lesend über SSH: 0 Sandboxes, 0 Container. Damit
  traf die Umstellung keine fremde Sandbox. `bash ops/sandbox/setup.sh --foreign-sandboxes 72.62.51.224` endete zu dieser Zeit mit
  `SETUP FOREIGN-SANDBOXES FAIL: cannot read the accounts of the sandboxes on the payment server`, weil der Zahlungsserver den
  Schlüssel des code-host seit 01:31 UTC abweist (`Permission denied (publickey)`, derselbe Fehler bricht den Job `deploy` von
  `deploy.yml` ab).
- 02:34 UTC: `bash ops/sandbox/setup.sh 72.62.51.224` endete mit `IMAGE runtime d8f8168 clean` und `SETUP CHECK OK changed=0`;
  danach `bash ops/sandbox/setup.sh --check 72.62.51.224` Exit 0, keine Zeile `CHANGE`, einmal `IMAGE runtime d8f8168 clean`.

Messlauf ohne Neustart, 2026-11-16 02:41 UTC: `bash ops/automaton-live.sh` legte die Sandbox an, `automaton-start` meldete
`AUTOMATON_START ok`, der erste Turn stand nach rund 20 Sekunden im Log, die Sandbox wurde gelöscht; die letzte Zeile war
`AUTOMATON LIVE FAIL ledger query gave no answer`, weil die lesende Abfrage des Ledgers über SSH am selben abgewiesenen Schlüssel
scheiterte. Die Kosten des Laufs zeigt die API dem eigenen Konto:

```
curl -s -H "authorization: $LIVE_SANDBOX_KEY" "https://postyourprice.com/v1/credits/history?limit=50"
```

Seit 02:41:19 UTC vier Zeilen, `sandbox` 1 Cent, `inference` 4, 2 und 4 Cent, zusammen 11 Cent; `balance_cents` fiel von 94
auf 87. Gerechnet mit der Obergrenze aus den Zeilen, 11000 mc je Lauf.

Guthaben der Prüfung `automaton` von `ops/live.sh` (`src/automaton/grant.ts`, `ref` `grant:live-automaton`): 11000 mc mal 300
Läufe sind 3300000 mc, aufgerundet auf 10000 mc unverändert, über der Obergrenze von 500000 mc, also 500000 mc. Es bucht einmal
mit dem Rollout auf das eigene Konto aus `src/bounties/ours.ts`.

Lauf mit Neustart, 2026-11-16 vom code-host, nachdem der Zahlungsserver den lesenden Schlüssel des code-host wieder annimmt
(08:52 UTC) und `dev` in den Goal-Branch gemergt ist:

- 09:00 UTC: `bash ops/sandbox/setup.sh --foreign-sandboxes 72.62.51.224` endete mit
  `SETUP FOREIGN-SANDBOXES OK running=0 foreign=0`, `bash ops/sandbox/setup.sh --check 72.62.51.224` mit Exit 0,
  `IMAGE runtime d8f8168 clean` und `SETUP CHECK OK changed=0`.
- 09:00 bis 09:04 UTC: `bash ops/automaton-live.sh --reboot`, Modell `gpt-5-mini`; vor dem Neustart meldete die Prüfung im
  Skript `running=1 foreign=0` (nur die eigene Sandbox), danach dachte der Automaton nach dem Neustart von selbst weiter.
- 2026-11-16 09:00 UTC: AUTOMATON LIVE OK turns=4 reboot=ok turns_after_reboot=1 mem_peak_mb=246 ledger_sandbox_rows=1 ledger_inference_rows=5 hold_mc=0 wallet_usdc=0

Lauf ohne Neustart (Prüfbefehl des Goals), 2026-11-16 09:04 UTC, `bash ops/automaton-live.sh`: letzte Zeile
`AUTOMATON LIVE OK turns=2 reboot=skipped turns_after_reboot=0 mem_peak_mb=174 ledger_sandbox_rows=1 ledger_inference_rows=2 hold_mc=0 wallet_usdc=0`.
`balance_cents` des eigenen Kontos aus `GET /v1/credits/history` (Befehl oben) fiel über beide Läufe von 87 auf 76.

Die Spitze des Speichers ist das Maximum von `memory.peak` der Cgroup des Containers aus beiden Läufen (`mem_peak_mb`, 246 und
174 MB), unter der Schwelle von 400 MB, darum bleibt es bei der Stufe klein:

Speicher Spitze: 246 MB, Stufe: klein
