# Warum der erste Sandbox-Kunde nach einem Tag aufhört (November 2026)

Ziel: Wir wissen gemessen, warum der einzige Kunde, der Sandbox und Inferenz bezahlt hat, nach einem Tag aufhörte, und beheben
eine Ursache bei uns als Nächstes, statt weiter für Kunden zu bauen, die noch nicht da sind. Goal:
`goals/kunden/16-warum-der-erste-sandbox-kunde-nach-10-usd-aufhoert.md`.

Gemessen: 2026-11-26T19:31:37Z
Gelesen wurde nur: das Ledger über `ops/db-report.cjs` mit `CP_REPORT=sandbox-customer` (`readonly: true`, im Container `cp`) und
das Caddy-Zugriffslog über `ops/access-log.sh`. Adressen, Wallet, Sandbox-ID und Beträge je Kunde stehen nicht in der Ausgabe und
nicht in diesem Dokument (`loop-constraints.md`, Grundregel 8).

## Befehl und Ausgabe

$ bash ops/sandbox-customer.sh --since 2026-11-21T00:00:00Z

```
SANDBOX CUSTOMERS since 2026-11-21T00:00:00Z until 2026-11-26T19:31:37Z: 1 foreign customers with a sandbox
CUSTOMER 1: first sandbox 2026-11-21T02:27:10Z, sandboxes 1, ips 1, balance covers hold
SANDBOX 1.1: tier medium, created 2026-11-21T02:27:10Z, status stopped, stop credit, steps 50, last step 2026-11-21T07:21:36Z
LEDGER 1: grant 1, inference 304, sandbox 50, topup 2, last inference 2026-11-21T16:25:30Z
AFTER 1 halt 2026-11-21T07:21:36Z: 662 requests
PATH 1 halt GET /v1/credits/balance 200 x451
PATH 1 halt POST /v1/chat/completions 402 x86
PATH 1 halt GET /pay/5/{address} 402 x1
PATH 1 halt GET /pay/5/{address} 200 x1
PATH 1 halt POST /v1/chat/completions 200 x117
PATH 1 halt GET /v1/domains/search 501 x2
PATH 1 halt POST /v1/chat/completions 404 x1
PATH 1 halt POST /v1/chat/completions 0 x3
AFTER 1 last-inference 2026-11-21T16:25:30Z: 32 requests
PATH 1 last-inference GET /v1/credits/balance 200 x16
PATH 1 last-inference POST /v1/chat/completions 402 x16
LAST 1: 2026-11-23T03:39:36Z POST /v1/chat/completions 402
QUIET 1: 87 hours without a request before 2026-11-26T19:31:37Z
WEEK: 2 foreign payments in the 7 days before 2026-11-26T19:31:37Z
```

Leitzahl: 2 fremde Zahlungen in den 7 Tagen bis 2026-11-26

## Was die Runtime am Pin tut

Runtime: harness/runtime/src/agent/tools.ts:361 (Quelle der Runtime am Pin d8f8168, die `harness/runtime/Dockerfile` klont) legt
eine Sandbox nur an, wenn das Modell das Werkzeug `create_sandbox` aufruft; eine gehaltene Sandbox ruft die Runtime nie von selbst
wieder auf und legt auch keine neue an, ihre eigene Sandbox-ID ist je Prozess fest (harness/runtime/src/conway/client.ts:42).

Runtime: harness/runtime/src/conway/topup.ts:179 entscheidet über die Aufladung: Die kleinste Stufe ist 5 USD, und liegt das
USDC-Guthaben der Wallet darunter, kauft die Runtime nichts (`Bootstrap topup skipped`); dieselbe Grenze gilt im Takt der Schleife
(harness/runtime/src/agent/loop.ts:444, `financial.usdcBalance >= 5`). Eine 402 auf Inferenz löst keine Aufladung aus und wird nicht
wiederholt (`retryableStatuses` ohne 402, harness/runtime/src/types.ts:616). Der Prozess beendet sich nur auf SIGTERM oder SIGINT
(harness/runtime/src/index.ts:391); solange er läuft, fragt der Heartbeat jede Minute `GET /v1/credits/balance`.

## Befund

- Halt der Sandbox: Sie lief ab 02:27 UTC 50 Schritte aus Credits und hielt um 07:21:36 für Credits (`stop credit`). Danach rief
  der Kunde nie wieder einen Pfad unter `/v1/sandboxes/` auf: Keine Zeile `PATH 1 halt` nennt ihn. Das passt zur Fundstelle oben,
  die Runtime kommt auf eine gehaltene Sandbox nicht von selbst zurück.
- Nach dem Halt arbeitete er weiter: 662 Anfragen, darunter 117 beantwortete Inferenzen und um 14:50 eine zweite Aufladung über
  `/pay/5/{address}` (erst 402, dann 200).
- Die letzte Ledger-Zeile ist die Inferenz um 16:25:30 (`last inference`); danach bekam jede seiner 16 Inferenzen eine 402. Laut
  Zugriffslog kamen sie in Salven am 21.11. um 20:51 bis 20:52 und um 20:57, dazwischen und bis 20:59:40 die Abfrage des Guthabens im Minutentakt
  des Heartbeats, danach nichts mehr bis zu einer einzelnen 402 am 23.11. um 03:39:36 (`LAST 1`). Seitdem 87 Stunden Ruhe.
- Warum 402, obwohl die Zeile `CUSTOMER 1` `covers hold` sagt: `covers hold` ist der Hold der Sandbox (`HOLD_MC`, 1000 mc). Eine
  Inferenz reserviert dagegen den Preis von geschätztem Prompt und `max_tokens` (`src/inference/proxy.ts`, `reserveMc`). Die Runtime
  fragt mit 4096 Tokens (`maxTokensPerTurn`, harness/runtime/src/types.ts:83), und die Prompts seiner letzten 30 Inferenzen hatten
  26652 bis 33638 Tokens. Gelesen mit `readonly: true` im Container: Sein verfügbares Guthaben liegt unter der Reservierung für den
  kleinsten dieser Prompts mit 4096 Tokens (`avail < reservation(prompt min, 4096): true`) und über der für den Prompt allein, also
  deckte es keine Anfrage mehr, wie die Runtime sie stellt. Seit 16:25:30 gibt es keine Ledger-Zeile mehr, das Guthaben war also bei
  jeder dieser 402 dasselbe.
- Seine Wallet hält nach öffentlichen Daten auf Base (`balanceOf` des USDC-Vertrags über `https://mainnet.base.org`, Gegenprobe
  `totalSupply` desselben Vertrags) unter 5 USD, also unter der kleinsten Stufe der Aufladung.
- Die drei Abbrüche auf `/v1/chat/completions` (Status 0, `PATH 1 halt … 0 x3`) stehen in `inference_aborts` mit `answered = 0`;
  berechnet wurde keiner. Die 404 auf `/v1/chat/completions` und die zwei 501 auf `/v1/domains/search` nach dem Halt hielten ihn
  nicht an, nach ihnen kamen weitere beantwortete Inferenzen; als Fehler eines echten Nutzers stehen sie in
  `goals/_vorschlaege/fehler-2026-11-26-1.md` mit Schwere 5.

### Befehle zu den Zahlen im Befund

Jede Zahl im Befund oben, die nicht im Codeblock der Ausgabe steht, mit dem nur lesenden Befehl, aus dem sie stammt, gefahren am
2026-11-26T20:04:12Z im Repo nach `set -a; . ~/.config/control-plane/loop.env; set +a`. Die Datenbank öffnet jeder Befehl mit `readonly: true`
im laufenden Container; den Kunden findet er selbst über seine Sandbox (`stop_reason = 'credit'`, angelegt 2026-11-21 um 02:2x),
keine Adresse steht im Befehl oder in der Ausgabe.

Tokens der Prompts seiner letzten 30 Inferenzen, aus `usage.prompt_tokens` in `meta` der Ledger-Zeilen:

$ ssh -i "$CP_DEPLOY_KEY" "$CP_DEPLOY_HOST" docker exec -i -w /app deploy-cp-1 node - <<<'const db=new (require("better-sqlite3"))("/data/cp.db",{readonly:true});const a=db.prepare("SELECT address FROM sandboxes WHERE stop_reason=? AND created_at LIKE ? ORDER BY created_at LIMIT 1").pluck().get("credit","2026-11-21T02:2%");const t=db.prepare("SELECT meta FROM ledger WHERE address=? AND kind=? ORDER BY id DESC LIMIT 30").pluck().all(a,"inference").map(m=>JSON.parse(m).usage.prompt_tokens);console.log("last",t.length,"inference prompts: prompt_tokens min",Math.min(...t),"max",Math.max(...t))'

```
last 30 inference prompts: prompt_tokens min 26652 max 33638
```

Verfügbares Guthaben (`balance_mc - reserved_mc`) gegen die Reservierung mit `costMc` aus `dist/inference/proxy.js` für den kleinsten dieser Prompts, einmal mit 4096 Tokens Ausgabe und als Gegenprobe mit 0. Die Preise sind die des gespeicherten Katalogs von heute (`openrouter_price_snapshot`), nicht die vom 21.11., und der Dienst reserviert mit seiner Schätzung des Prompts (`estimateTokens`), nicht mit `prompt_tokens` des Anbieters; beides kann den Abstand verschieben, das Ergebnis steht nur als wahr oder falsch, nie als Betrag:

$ ssh -i "$CP_DEPLOY_KEY" "$CP_DEPLOY_HOST" docker exec -i -w /app deploy-cp-1 node --input-type=module - <<<'import D from "better-sqlite3";import {costMc} from "/app/dist/inference/proxy.js";const db=new D("/data/cp.db",{readonly:true});const a=db.prepare("SELECT address FROM sandboxes WHERE stop_reason=? AND created_at LIKE ? ORDER BY created_at LIMIT 1").pluck().get("credit","2026-11-21T02:2%");const w=db.prepare("SELECT balance_mc-reserved_mc FROM wallets WHERE address=?").pluck().get(a);const m=db.prepare("SELECT meta FROM ledger WHERE address=? AND kind=? ORDER BY id DESC LIMIT 30").pluck().all(a,"inference").map(x=>JSON.parse(x));const p=Math.min(...m.map(x=>x.usage.prompt_tokens));const k=db.prepare("SELECT value,updated_at FROM kv WHERE key=?").get("openrouter_price_snapshot");const s=JSON.parse(k.value).find(x=>x.id===m[0].model);console.log("model",s.id,"prices from snapshot",k.updated_at);console.log("avail < costMc(prompt min, 4096 tokens):",w<costMc(s,{prompt_tokens:p,completion_tokens:4096}));console.log("avail < costMc(prompt min, 0 tokens):",w<costMc(s,{prompt_tokens:p,completion_tokens:0}))'

```
model openai/gpt-5-mini prices from snapshot 2026-11-26T19:27:41.065Z
avail < costMc(prompt min, 4096 tokens): true
avail < costMc(prompt min, 0 tokens): false
```

Letzte Ledger-Zeile des Kunden, Zahl der Zeilen nach 16:25:31 und als Gegenprobe nach 16:00:00 (das Guthaben war bei jeder 402 danach dasselbe):

$ ssh -i "$CP_DEPLOY_KEY" "$CP_DEPLOY_HOST" docker exec -i -w /app deploy-cp-1 node - <<<'const db=new (require("better-sqlite3"))("/data/cp.db",{readonly:true});const a=db.prepare("SELECT address FROM sandboxes WHERE stop_reason=? AND created_at LIKE ? ORDER BY created_at LIMIT 1").pluck().get("credit","2026-11-21T02:2%");const r=db.prepare("SELECT created_at,kind FROM ledger WHERE address=? ORDER BY id DESC LIMIT 1").get(a);const n=t=>db.prepare("SELECT count(*) FROM ledger WHERE address=? AND created_at>?").pluck().get(a,t);console.log("last ledger row",r.created_at,r.kind);console.log("rows after 2026-11-21T16:25:31Z:",n("2026-11-21T16:25:31Z"));console.log("rows after 2026-11-21T16:00:00Z:",n("2026-11-21T16:00:00Z"))'

```
last ledger row 2026-11-21T16:25:30.428Z inference
rows after 2026-11-21T16:25:31Z: 0
rows after 2026-11-21T16:00:00Z: 22
```

Zeiten der 402 auf `/v1/chat/completions` nach der letzten Inferenz, je Minute. Die Adresse des Kunden ist die eine, die die Zeile `LAST 1` (2026-11-23T03:39:36Z, 402) schickte; der Befehl zählt sie, statt sie zu nennen:

$ bash ops/access-log.sh | python3 -c 'import sys,json,datetime as d;L=[json.loads(x) for x in sys.stdin if x.startswith("{")];T=lambda e:d.datetime.fromtimestamp(e["ts"],d.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ");U=lambda e:e["request"]["uri"].split("?")[0];I=lambda e:e["request"].get("client_ip") or e["request"]["remote_ip"];ips={I(e) for e in L if T(e)=="2026-11-23T03:39:36Z" and e["status"]==402 and U(e)=="/v1/chat/completions"};print("customer ips (LAST 1):",len(ips));C={};[C.__setitem__(T(e)[:16],C.get(T(e)[:16],0)+1) for e in L if I(e) in ips and e["status"]==402 and U(e)=="/v1/chat/completions" and T(e)>"2026-11-21T16:25:35Z"];[print("402 /v1/chat/completions",k,"x%d"%v) for k,v in sorted(C.items())]'

```
customer ips (LAST 1): 1
402 /v1/chat/completions 2026-11-21T20:51 x5
402 /v1/chat/completions 2026-11-21T20:52 x5
402 /v1/chat/completions 2026-11-21T20:57 x5
402 /v1/chat/completions 2026-11-23T03:39 x1
```

Abfragen des Guthabens derselben Adresse nach der letzten Inferenz bis zum Ende des 21.11.:

$ bash ops/access-log.sh | python3 -c 'import sys,json,datetime as d;L=[json.loads(x) for x in sys.stdin if x.startswith("{")];T=lambda e:d.datetime.fromtimestamp(e["ts"],d.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ");U=lambda e:e["request"]["uri"].split("?")[0];I=lambda e:e["request"].get("client_ip") or e["request"]["remote_ip"];ips={I(e) for e in L if T(e)=="2026-11-23T03:39:36Z" and e["status"]==402 and U(e)=="/v1/chat/completions"};B=sorted(T(e) for e in L if I(e) in ips and U(e)=="/v1/credits/balance" and "2026-11-21T16:25:35Z"<T(e)<"2026-11-23");print("customer ips (LAST 1):",len(ips));print("GET /v1/credits/balance after 16:25:35 on 2026-11-21: x%d, first %s, last %s"%(len(B),B[0],B[-1]));print("from 2026-11-21T20:50:00Z: x%d"%len([b for b in B if b>="2026-11-21T20:50:00Z"]))'

```
customer ips (LAST 1): 1
GET /v1/credits/balance after 16:25:35 on 2026-11-21: x16, first 2026-11-21T16:25:37Z, last 2026-11-21T20:59:40Z
from 2026-11-21T20:50:00Z: x15
```

Wallet unter 5 USD nach öffentlichen Daten auf Base: Die Adresse liest der Container und gibt sie nur in die Pipe, die Adresse des USDC-Vertrags kommt aus `src/konto/config.ts` (`MAINNET_USDC`); Gegenprobe `totalSupply` desselben Vertrags und ob überhaupt eine Adresse ankam:

$ ssh -i "$CP_DEPLOY_KEY" "$CP_DEPLOY_HOST" docker exec -i -w /app deploy-cp-1 node - <<<'const db=new (require("better-sqlite3"))("/data/cp.db",{readonly:true});process.stdout.write(db.prepare("SELECT address FROM sandboxes WHERE stop_reason=? AND created_at LIKE ? ORDER BY created_at LIMIT 1").pluck().get("credit","2026-11-21T02:2%"))' | U="$(sed -nE 's/.*MAINNET_USDC = "(0x[0-9a-fA-F]{40})".*/\1/p' src/konto/config.ts)" node -e 'let a="";process.stdin.on("data",d=>a+=d).on("end",async()=>{const q=async data=>BigInt((await (await fetch("https://mainnet.base.org",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_call",params:[{to:process.env.U,data},"latest"]})})).json()).result);const b=await q("0x70a08231"+a.trim().slice(2).toLowerCase().padStart(64,"0"));const s=await q("0x18160ddd");console.log("address read from the container:",/^0x[0-9a-fA-F]{40}$/.test(a.trim()));console.log("customer wallet USDC < 5 USD:",b<5000000n);console.log("USDC totalSupply < 5 USD:",s<5000000n)})'

```
address read from the container: true
customer wallet USDC < 5 USD: true
USDC totalSupply < 5 USD: false
```

## Ursache

- Kunde 1: Sandbox medium, 50 Schritte, Halt credit, letzte Anfrage 2026-11-23, Ursache: kein Geld, weil nach der letzten Inferenz um 16:25:30 alle 16 Inferenzen eine 402 bekamen (`PATH 1 last-inference POST /v1/chat/completions 402 x16`), sein Guthaben die Reservierung einer Anfrage mit 4096 Tokens nicht mehr deckte, danach keine Aufladung kam und seine Wallet unter den 5 USD der kleinsten Stufe liegt.

Ergebnis: kein Fehler bei uns, weil der Kunde aufhörte, als sein Guthaben die nächste Inferenz nicht mehr deckte und seine Wallet für die kleinste Aufladung nicht reichte; die 402 rechnete mit der Reservierung, die jeder Kunde bekommt, und nach der letzten 402 hörte sein Betreiber auf (der Prozess fragte ab 20:59:40 nicht mehr im Minutentakt).

Widerlegt: nein, weil 662 Anfragen nach dem Halt kamen

Für das nächste Glied: Er hat für eine Sandbox und rund 300 Inferenzen zweimal 5 USD gezahlt und dann aufgehört, als die Wallet
leer war. Ob er bei einem anderen Preis der Sandbox wiederkäme, sagt diese Messung nicht; sie sagt nur, dass ihm das Geld ausging,
nicht dass ihn eine Antwort des Servers stoppte. Offen bleibt, dass ein Rest unter einer Reservierung, aber über den tatsächlichen
Kosten der meisten seiner Anfragen, ungenutzt liegen bleibt.
