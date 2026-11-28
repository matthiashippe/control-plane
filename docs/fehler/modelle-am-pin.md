# Modell-IDs der Runtime am Pin d8f8168

Stand 27.11.2026, fehler 15. Welche Modell-ID kann die unveränderte Runtime (`Conway-Research/automaton`, Commit `d8f8168`) als
Wert für `model` an `POST /v1/chat/completions` des Control Plane schicken, und bekommt sie dort eine Antwort? Gelesen aus einem Klon
am Pin in einem Verzeichnis aus `mktemp -d`, nur lesend. Ergebnis je ID: `served` (Modell im Katalog unter diesem Namen), `alias <ziel>`
(Eintrag in `DEFAULT_OPENROUTER_ALIASES`) oder `missing` mit Grund (die Anfrage bekommt 404 `model_not_found`).

## Die IDs

MODEL gpt-5.2: alias openai/gpt-5.2, src/inference/types.ts:142 am Pin d8f8168
MODEL gpt-5-mini: alias openai/gpt-5-mini, src/inference/types.ts:143 am Pin d8f8168
MODEL gpt-5.3: missing, OpenRouter führt kein openai/gpt-5.3, nur die Variante openai/gpt-5.3-codex, und ein Alias auf eine Variante ist nach Entscheidung 3 ausgeschlossen, src/inference/types.ts:142 am Pin d8f8168
MODEL gpt-4.1: alias openai/gpt-4.1, src/inference/provider-registry.ts:79 am Pin d8f8168
MODEL gpt-4.1-mini: alias openai/gpt-4.1-mini, src/inference/provider-registry.ts:90 am Pin d8f8168
MODEL gpt-4.1-nano: alias openai/gpt-4.1-nano, src/inference/provider-registry.ts:101 am Pin d8f8168

## Wie die IDs zu uns kommen

- Routing-Matrix `DEFAULT_ROUTING_MATRIX` in `src/inference/types.ts` Zeile 140 bis 176: Die Runtime fragt je Aufgabe ihre Kandidaten
  in fester Reihenfolge, `agent_turn`, `safety_check` und `planning` im Tier `high` zuerst `gpt-5.2`, dann `gpt-5.3` (Zeile 142, 144,
  146), `heartbeat_triage` und alle Aufgaben in `low_compute` und `critical` `gpt-5-mini` (Zeile 143, 150, 156 bis 165). Der Router
  (`src/inference/router.ts` Zeile 199 bis 208) nimmt den ersten Kandidaten, der im Register der Runtime steht und eingeschaltet ist.
- Rückfälle: Findet der Router keinen Kandidaten, nimmt er `inferenceModel`, `lowComputeModel` und `criticalModel`
  (`src/inference/router.ts` Zeile 213 bis 216), voreingestellt `gpt-5.2` und `gpt-5-mini` (`src/types.ts` Zeile 82, 1248 bis 1250;
  `src/inference/types.ts` Zeile 181 bis 183; `src/config.ts` Zeile 147). Im Sparmodus setzt `src/conway/inference.ts` Zeile 138 und
  `src/survival/low-compute.ts` Zeile 109 bis 113 `gpt-5-mini`.
- Grundliste des Registers `STATIC_MODEL_BASELINE` (`src/inference/types.ts` Zeile 50 bis 135): `gpt-5.2`, `gpt-4.1`, `gpt-4.1-mini`,
  `gpt-4.1-nano`, `gpt-5-mini`, `gpt-5.3`. Aus dieser Liste und aus unserem `/v1/models` wählt der Betreiber im Setup
  (`src/setup/configure.ts` Zeile 230 bis 242) sein `inferenceModel`; jede ID aus `/v1/models` bedienen wir ohnehin.
- Worker und Planer: `src/agent/loop.ts` Zeile 154 bis 157 setzt ohne eigenen OpenAI-Schlüssel `OPENAI_BASE_URL` auf
  `<conwayApiUrl>/v1`, und Zeile 166 bis 169 biegt den Anbieter `openai` der `ProviderRegistry` dorthin um. Dessen Modelle je Tier
  sind `gpt-4.1` (reasoning), `gpt-4.1-mini` (fast) und `gpt-4.1-nano` (cheap) in `src/inference/provider-registry.ts` Zeile 79, 90
  und 101; für `reasoning` steht `openai` an erster Stelle (Zeile 58), für `fast` und `cheap` nach Anbietern mit eigenem Schlüssel.
- Nicht an uns gehen die Modelle der Anbieter `groq` und `together` (`src/inference/provider-registry.ts` ab Zeile 118, eigene URL und
  eigener Schlüssel), Ollama-Modelle (`ollamaBaseUrl`) und Modelle mit eigenem Backend und eigenem Schlüssel in
  `src/conway/inference.ts` Zeile 100 bis 126. Die ID in `src/types.ts` Zeile 1155 ist ein Beispiel in einem Kommentar.

Was der Dienst bedient, steht im Startlog der Produktion (`docker logs deploy-cp-1`, Neustart vom 2026-11-26 08:27 UTC):
`providers=openrouter aliases=gpt-5.2,gpt-5-mini`; `CP_MODEL_ALIASES` ist im Container nicht gesetzt, also gelten die Vorgaben aus
`src/inference/openrouter.ts`, und `CP_OPENROUTER_MODELS` nennt `openai/gpt-5.2,openai/gpt-5-mini`.

## OpenRouter

Gelesen: 2026-11-27T14:40:38Z, 477 Modelle

Befehl, öffentlich und nur lesend:

```
curl -sS https://openrouter.ai/api/v1/models | python3 -I -c 'import json,sys; d=json.load(sys.stdin)["data"]; ids={m["id"] for m in d}; print(len(d)); [print(x, "openai/"+x in ids, sorted(i for i in ids if i.startswith("openai/"+x))) for x in ["gpt-5.2","gpt-5-mini","gpt-5.3","gpt-4.1","gpt-4.1-mini","gpt-4.1-nano"]]'
```

Ausgabe:

```
477
gpt-5.2 True ['openai/gpt-5.2', 'openai/gpt-5.2-chat', 'openai/gpt-5.2-codex', 'openai/gpt-5.2-pro', 'openai/gpt-5.2-pro:batch', 'openai/gpt-5.2:batch']
gpt-5-mini True ['openai/gpt-5-mini', 'openai/gpt-5-mini:batch']
gpt-5.3 False ['openai/gpt-5.3-codex']
gpt-4.1 True ['openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4.1-mini:batch', 'openai/gpt-4.1-nano', 'openai/gpt-4.1-nano:batch', 'openai/gpt-4.1:batch']
gpt-4.1-mini True ['openai/gpt-4.1-mini', 'openai/gpt-4.1-mini:batch']
gpt-4.1-nano True ['openai/gpt-4.1-nano', 'openai/gpt-4.1-nano:batch']
```

Die drei IDs `gpt-4.1`, `gpt-4.1-mini` und `gpt-4.1-nano` erfüllen damit die Bedingung aus Entscheidung 3, bekommen aber keinen Alias:
Ein Alias wirkt nur, wenn sein Ziel im Katalog geladen ist (`defaultAliases()` in `src/inference/openrouter.ts`), und den Katalog der
Produktion legt `CP_OPENROUTER_MODELS` in `/opt/control-plane/.env` fest, das dieses Goal nicht ändert. Ein Eintrag in
`DEFAULT_OPENROUTER_ALIASES` bliebe dort wirkungslos und würde `test/openrouter.test.ts` Zeile 95 rot machen, der die Vorgaben mit den
geladenen Zielen gleichsetzt. Die Begründung steht in `goals/fehler/ANNAHMEN.md`.

## 404 seit 2026-11-21

404 auf `POST /v1/chat/completions` an Adressen, die nicht in `ops/own-ips.txt` stehen, je Tag (UTC), aus dem ganzen Zugriffslog
(`ops/access-log.sh`, sieht laut `--span` 1367,8 Stunden zurück, 10-01 14:59 bis 11-27 14:45 UTC):

```
set -a; . ~/.config/control-plane/loop.env; set +a; source ops/own-ips.sh; OWN=$(own_ips_checked "$CP_OWN_IPS_FILE") || exit 2; bash ops/access-log.sh | OWN="$OWN" python3 -I -c 'import json,os,sys,datetime,collections
own=set(os.environ["OWN"].split()); c=collections.Counter(); a=set()
for l in sys.stdin:
    try: e=json.loads(l)
    except ValueError: continue
    r=e.get("request") or {}; ip=r.get("client_ip") or r.get("remote_ip")
    if e.get("status")!=404 or r.get("method")!="POST" or r.get("uri","").split("?")[0]!="/v1/chat/completions" or ip in own: continue
    d=datetime.datetime.fromtimestamp(e["ts"],datetime.timezone.utc).date().isoformat()
    if d>="2026-11-21": c[d]+=1; a.add(ip)
for d in sorted(c): print(d,c[d])
print("gesamt",sum(c.values()),"adressen",len(a))'
```

Ausgabe am 2026-11-27 gegen 14:45 UTC:

```
2026-11-21 5
gesamt 5 adressen 1
```

Gegenprobe: Mit vier gepflanzten Zeilen am Ende des Stroms (ein fremder 404 am 2026-11-22, ein 404 einer eigenen Adresse am selben Tag,
ein fremder 200 und ein fremder 404 am 2026-11-20) gab derselbe Zähler `2026-11-21 5`, `2026-11-22 1`, `gesamt 6 adressen 2` aus:
Er zählt den fremden 404 und lässt die eigene Adresse, den 200 und den Tag vor dem Stichtag weg.

Welches Modell diese fünf Anfragen wollten, ist nicht mehr lesbar: Der Dienst schrieb bei `model_not_found` keine Zeile, und sein Log
beginnt mit dem Neustart vom 2026-11-26. Seit fehler 15 steht bei jedem `model_not_found` die Zeile
`[inference] model_not_found model=<id> known=<n>` im Log; sie liest der Release Manager nach dem Rollout in der Live-Prüfung.

## 404 je Modell seit fehler 15

Zeilen `[inference] model_not_found model=<id>` im Log des Dienstes seit dem Rollout von fehler 15 (Job `deploy` fertig
2026-11-27T16:10:23Z), je ID gezählt, ohne Adresse. Gelesen werden die gesicherten Logs ersetzter Container, deren Dateiname nach
dem Rollout liegt (`cp-20261127T194647Z`, `cp-20261127T220538Z`, `cp-20261128T030722Z`; `cp-20261127T160619Z` ist der Container vor
dem Rollout und kennt die Zeile noch nicht), und das Log des laufenden Containers (gestartet 2026-11-28T03:08 UTC). Die Zeile gibt es
erst seit fehler 15, ältere Logs können also keinen Treffer haben.

Gemessen: 2026-11-28T07:47:02Z

NOT_FOUND gpt-4.1 since 2026-11-27T16:10:23Z: 0
NOT_FOUND gpt-4.1-mini since 2026-11-27T16:10:23Z: 0
NOT_FOUND gpt-4.1-nano since 2026-11-27T16:10:23Z: 0
NOT_FOUND other since 2026-11-27T16:10:23Z: 0

Befehl, nur lesend (`docker logs` und `zcat`), der Zähler läuft auf dem code-host:

```
set -a; . ~/.config/control-plane/loop.env; set +a
ssh -i "$CP_SSH_KEY" "$CP_HOST" 'for f in /var/log/cp-history/cp-*.log.gz; do t=$(basename "$f" .log.gz); t=${t#cp-}; if [ "$t" \> "20261127T161023Z" ]; then zcat "$f"; fi; done; docker logs deploy-cp-1 2>&1' \
  | grep -oE '\[inference\] model_not_found model=[^ ]+' | sed 's/.*model=//' | awk '
  { if ($0=="gpt-4.1"||$0=="gpt-4.1-mini"||$0=="gpt-4.1-nano") c[$0]++; else c["other"]++ }
  END { n=split("gpt-4.1 gpt-4.1-mini gpt-4.1-nano other",k," "); for(i=1;i<=n;i++) printf "NOT_FOUND %s since 2026-11-27T16:10:23Z: %d\n", k[i], c[k[i]]+0 }'
```

Der Strom hatte 392 Zeilen. Gegenprobe: Derselbe Zähler über denselben Strom mit vier gepflanzten Zeilen am Ende
(`[inference] model_not_found model=<id> known=4` für `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano` und `gpt-5.3`) gab je ID 1 aus: Er
sieht jede der drei IDs und zählt jede andere unter `other`. Die Null ist also keine Blindheit des Zählers, sondern heißt, dass seit
dem Rollout keine Runtime eine dieser IDs bei uns angefragt hat. Gebaut wird trotzdem (`goals/fehler/ANNAHMEN.md`, fehler 17
Entscheidung 1), weil die Runtime am Pin sie nachweislich schickt.

Seit fehler 17 lädt der Dienst `openai/gpt-4.1`, `openai/gpt-4.1-mini` und `openai/gpt-4.1-nano` aus `RUNTIME_PIN_MODELS` in
`src/inference/openrouter.ts` zu `CP_OPENROUTER_MODELS` dazu, wenn OpenRouter sie führt, und `DEFAULT_OPENROUTER_ALIASES` setzt die
drei IDs der Runtime darauf. Damit gilt der Absatz unter „OpenRouter“, nach dem die drei keinen Alias bekommen, nicht mehr; die Zeilen
`MODEL gpt-4.1…` oben stehen deshalb als `alias`. Ein Modell der Runtime, das OpenRouter nicht führt, bleibt draußen, bekommt beim
Start die Zeile `[inference] pin model not offered model=<id>` und hält den Start nicht auf.
