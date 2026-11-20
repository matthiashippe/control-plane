# Kunden Goal 04: Das Besucher-Werkzeug zählt nach dem Umzug wieder

## Status
DONE

## Active Objective
`ops/traffic.sh 168` endete am 19.11.2026 mit Exit 1 direkt nach der Kopfzeile „Requests to postyourprice.com“
(`docs/richtung/2026-11-19.md`, Abschnitt Befund). Die Ursache liegt am Host: Seit umzug 01 antwortet
`https://postyourprice.com/sitemap.xml` mit 301 auf `https://automatonhost.com/sitemap.xml`, `curl -s` ohne `-L` liefert keinen
Text, das `grep -oE '<loc>…'` in der Zuweisung von `CP_PAGES` (`ops/traffic.sh` Zeile 340) endet mit 1, und `set -euo pipefail`
beendet das Skript. Dazu kennt `CP_OWN_HOSTS` den kanonischen Host `automatonhost.com` nicht, also gilt ein Besucher, der von einer
unserer Seiten unter diesem Host kommt, als fremder Referrer. Nach diesem Goal läuft `ops/traffic.sh` wieder durch, auch mit
`CP_URL=https://postyourprice.com`, und ein neuer Block `-- Arrivals per host --` zählt je Host (`automatonhost.com`,
`postyourprice.com`, `cp.hippe.eu`) die fremden Ankünfte im Fenster mit dem Referrer ihrer ersten Anfrage. `docs/kunden/besucher.md`
nennt die erste Messung über sieben Tage.
Leitzahl: fremde Ankünfte je Woche und Herkunft.
Widerlegt, wenn der Abbruch nicht am Host liegt; dann behebt das Glied die gefundene Ursache, und `docs/kunden/besucher.md` nennt sie.
MVP: Funktion, weil ohne Besucherzahl kein Kanal zu bewerten ist.

## Voraussetzungen
- kunden Goal 03 DONE

## Kontext für den Maker
- Ziel: Wer im Loop über das nächste Glied am Topic `kunden` entscheidet, sieht mit einem Befehl, wie viele fremde Adressen in einer
  Woche bei uns ankommen, über welchen Host und woher, damit ein Kanal (Issues, Suche, Verzeichnisse) an Ankünften gemessen wird statt
  geschätzt.
- Quelle der Kette: `ROADMAP.md` Zeile 14 (Topic `kunden`, Glied 04), Richtungs-Check 19.11.2026 (PRO-25477,
  `docs/richtung/2026-11-19.md`). `docs/kette.md` hat zu `kunden` keinen Abschnitt; diese Datei ist die ausführliche Fassung. Die
  offenen Vorschläge `goals/_vorschlaege/kunden-*.md` tragen kein `Übernommen:` für dieses Goal und gehören nicht hinein.
- Beleg der Ursache, vom Writer am 19.11.2026 nachgestellt: `curl -s -o /dev/null -m 10 -w '%{http_code} %{redirect_url}'
  https://postyourprice.com/sitemap.xml` ergab `301 https://automatonhost.com/sitemap.xml`, `https://automatonhost.com/sitemap.xml`
  nennt 11 Einträge `<loc>`. `deploy/Caddyfile` bedient alle drei Hosts in einem Block; welcher kanonisch ist, entscheidet
  `CP_PUBLIC_URL` im Dienst (`docs/umzug.md`).
- Grundregel 8 (`loop-constraints.md` Zeile 39): Im Repo stehen nur Zählungen und Hosts von Referrern. Nie eine Adresse eines
  Besuchers, auch nicht im Dokument, im Test außer Dokumentationsadressen (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) oder in
  `ANNAHMEN.md`. Der Rest der Ausgabe von `ops/traffic.sh` trägt Adressen und darf nie ins Repo.
- Änderung an `ops/traffic.sh`, nur dort:
  - Die Sitemap wird so gelesen, dass ein 301 auf einen unserer Hosts sie nicht verliert, und eine leere oder unlesbare Sitemap beendet
    das Skript nicht mehr: Es meldet sie auf stderr mit dem Wort `sitemap` und läuft mit leerem `CP_PAGES` weiter, wie die bestehende
    Prüfung darunter es schon vorsieht.
  - `BASE_URL` ohne `CP_URL` ist `https://automatonhost.com`, die Kopfzeile nennt also `automatonhost.com`. `CP_OWN_HOSTS` ohne
    Vorgabe ist `automatonhost.com postyourprice.com cp.hippe.eu`.
  - Neuer Block unmittelbar nach der Kopfzeile und den Zeilen zu zusätzlich eigenen Adressen, vor
    `-- Who of them behaved like a person, over the whole log --`, also auch in `--funnel`. Ankunft heißt: eine fremde Adresse (nicht in
    `$own_json`, die Regel des Skripts), deren erste Anfrage im ganzen Log nach `since` liegt; sie zählt genau einmal, beim Host dieser
    ersten Anfrage. Host ist `request.host` des Caddy-Logs in Kleinbuchstaben ohne Port. Referrer ist der Host aus `Referer` dieser
    ersten Anfrage in Kleinbuchstaben; ohne Referer `(none)`, ein Host aus `CP_OWN_HOSTS` `(our page)`, ein Host, der eine IP-Adresse
    ist, `(address)`. Form, genau so:
    ```
    -- Arrivals per host --
       <n> foreign arrival(s) in the last <HOURS> hours
       automatonhost.com: <n> foreign arrival(s)
          <n>  <referrer>
       postyourprice.com: <n> foreign arrival(s)
          <n>  <referrer>
       cp.hippe.eu: <n> foreign arrival(s)
          <n>  <referrer>
       other hosts: <n> foreign arrival(s)
    ```
    Die vier Zeilen der Hosts stehen immer, auch mit 0, in dieser Reihenfolge; unter jedem der drei Hosts je Referrer eine Zeile,
    absteigend nach Zahl, bei Gleichstand nach Name; unter `other hosts` keine (dort zählen alle anderen Hosts und Anfragen ohne
    `request.host`). Danach eine Leerzeile. Die Summe der vier Hosts ist die erste Zahl. Keine Adresse im Block.
  - Der Rest von `ops/traffic.sh` bleibt, wie er ist; `ops/traffic.sh --selftest` meldet weiter `SELFTEST OK`.
- Fixture `ops/fixtures/traffic-three-hosts.log`, JSON-Zeilen wie die anderen Fixtures dort, jede mit `request.host`, Zeitstempel
  relativ zu `CP_NOW=1795176000` (2026-11-20T12:00:00Z), nur Dokumentationsadressen:
  `192.0.2.41` erste Anfrage `/` an `automatonhost.com` mit Referer `https://www.google.com/` vor 10 h, danach `/v1/status` mit
  Referer `https://automatonhost.com/`;
  `192.0.2.42` `/` an `automatonhost.com` ohne Referer vor 9 h;
  `192.0.2.43` erste Anfrage `/fix` an `postyourprice.com` mit Referer `https://github.com/Conway-Research/automaton/issues/1` vor 8 h,
  danach `/` an `automatonhost.com`;
  `192.0.2.44` `/` an `cp.hippe.eu` ohne Referer vor 7 h;
  `192.0.2.45` `/katalog` an `automatonhost.com` mit Referer `https://postyourprice.com/` vor 6 h;
  `192.0.2.46` mit User-Agent `control-plane-check/1.0` an `automatonhost.com` vor 5 h (eigen);
  `192.0.2.47` erste Anfrage an `automatonhost.com` vor 200 h, danach eine vor 4 h (keine Ankunft im Fenster von 168 h);
  `192.0.2.48` `/` an `vysyon.hippe.eu` mit Referer `http://203.0.113.9/` vor 3 h.
  Erwartet mit `ops/traffic.sh 168`: `6 foreign arrival(s) in the last 168 hours`; `automatonhost.com: 3` mit je 1 `(none)`,
  `(our page)` und `www.google.com`; `postyourprice.com: 1` mit 1 `github.com`; `cp.hippe.eu: 1` mit 1 `(none)`; `other hosts: 1`.
- Tests: `test/traffic-hosts.test.ts` fährt `ops/traffic.sh` mit `CP_TRAFFIC_LOG`, `CP_NOW=1795176000`, ohne `CP_PAGES` und mit einem
  Verzeichnis vorn im `PATH`, das ein Fake-`ssh` (Exit 255) und ein Fake-`curl` hält. Das Fake-`curl` antwortet wie die Produktion am
  19.11.: `https://postyourprice.com/sitemap.xml` und `https://cp.hippe.eu/sitemap.xml` ohne `-L` leer mit Exit 0, mit `-L` und für
  `https://automatonhost.com/sitemap.xml` eine Sitemap mit den Seiten `/`, `/katalog`, `/check`, `/fix`, `/post`; mit
  `CP_FAKE_SITEMAP=empty` für jede URL leer. Fälle, je mit dem Wort im Testnamen:
  ohne `CP_URL` Exit 0, der Block steht, und stderr nennt keine Sitemap mit weniger als fünf Seiten (`sitemap redirect`);
  dasselbe mit `CP_URL=https://postyourprice.com` (`postyourprice url`);
  mit `CP_FAKE_SITEMAP=empty` Exit 0, stderr enthält `sitemap`, der Block steht (`empty sitemap`);
  die Zahlen der Fixture genau wie oben (`per host`);
  `192.0.2.43` zählt einmal bei `postyourprice.com` (`first request`);
  `192.0.2.46` zählt nie (`our own`);
  `192.0.2.45` steht als `(our page)` (`our page`);
  `192.0.2.47` zählt nicht (`window`);
  `192.0.2.48` zählt unter `other hosts`, und kein Referrer erscheint als Adresse (`other host`);
  keine Zeile des Blocks trägt eine Adresse (`no address`);
  `ops/traffic.sh --selftest` endet mit Exit 0 und `SELFTEST OK` (`selftest`).
  Jeder neue Test außer `selftest` lief einmal gegen `ops/traffic.sh` von `origin/dev` und war rot; die Zeile im Progress Log nennt,
  womit.
- Messung, nur lesend gegen die Produktion (`loop-constraints.md`, Produktion: nur lesen; das Zugriffslog kommt wie bisher über
  `ops/access-log.sh`): genau
  `bash ops/traffic.sh 168 | sed -n '/^-- Arrivals per host --$/,/^$/p'`.
- `docs/kunden/besucher.md`, Deutsch, je eine Zeile:
  `Gemessen: <ISO UTC der Messung>`;
  der Befehl oben allein auf einer Zeile ohne Präfix, darunter in einem Codeblock seine Ausgabe unverändert, mit der Zeile
  `-- Arrivals per host --` am Anfang;
  `Leitzahl: <n> fremde Ankünfte in 7 Tagen, davon <a> über automatonhost.com, <p> über postyourprice.com, <c> über cp.hippe.eu, <o> über andere Hosts`
  mit den Werten aus dem Block;
  genau eine Zeile `Ursache: ` mit dem, was den Abbruch vom 19.11. auslöste, und dem Befehl, der es belegt;
  genau eine Zeile `Ergebnis: `, entweder `Ergebnis: Der Abbruch lag am Host, …` oder `Ergebnis: widerlegt, weil …`.
- `goals/kunden/ANNAHMEN.md`: neue Zeilen `- <Datum>, kunden 04: …` mindestens dazu, warum eine Ankunft die erste Anfrage einer
  Adresse im ganzen Log ist und nicht die erste im Fenster, und warum vom Referrer nur der Host ins Dokument kommt.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Build, kein Test auf dem
  Server.

## Done Condition
- [x] `ops/traffic.sh` läuft nach dem Umzug durch, auch über eine Sitemap mit 301 und mit leerer Sitemap, kennt `automatonhost.com` als
      eigenen Host und zählt im Block `-- Arrivals per host --` die fremden Ankünfte je Host mit dem Referrer der ersten Anfrage, eigene
      nie, ohne Adresse; in beide Richtungen bewiesen.
      Prüfung: `pnpm -s vitest run test/traffic-hosts.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/traffic-hosts.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/sitemap redirect/,/postyourprice url/,/empty sitemap/,/per host/,/first request/,/our own/,/our page/,/window/,/other host/,/no address/,/selftest/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `pnpm -s vitest run test/catalog-page.test.ts test/depth.test.ts test/page-weight.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git diff --diff-filter=MDR --name-only $(git merge-base origin/dev HEAD) -- ops deploy src | grep -vxc 'ops/traffic.sh'` muss 0 ausgeben.
- [x] Die erste Messung über sieben Tage steht in `docs/kunden/besucher.md` mit Befehl, Ausgabe, Leitzahl, Ursache und Ergebnis, ohne
      Adresse eines Besuchers.
      Prüfung: `awk '/^Gemessen: /{print ($2 >= "2026-11-19T20:00:00Z") ? "spaet genug" : "zu frueh"}' docs/kunden/besucher.md` muss genau `spaet genug` ausgeben.
      Prüfung: `grep -cxF "bash ops/traffic.sh 168 | sed -n '/^-- Arrivals per host --\$/,/^\$/p'" docs/kunden/besucher.md` muss mindestens 1 ausgeben.
      Prüfung: `python3 -c 'import re; t=open("docs/kunden/besucher.md").read(); tot=int(re.search(r"^   (\d+) foreign arrival\(s\) in the last 168 hours$",t,re.M).group(1)); h={k:int(re.search(r"^   %s: (\d+) foreign arrival\(s\)$" % re.escape(k),t,re.M).group(1)) for k in ("automatonhost.com","postyourprice.com","cp.hippe.eu","other hosts")}; ok=sum(h.values())==tot and re.search(r"^Leitzahl: %d fremde Ankünfte in 7 Tagen, davon %d über automatonhost\.com, %d über postyourprice\.com, %d über cp\.hippe\.eu, %d über andere Hosts$" % (tot,h["automatonhost.com"],h["postyourprice.com"],h["cp.hippe.eu"],h["other hosts"]),t,re.M) is not None; print("stimmig" if ok else "unstimmig")'` muss `stimmig` ausgeben.
      Prüfung: `grep -cE "^Ursache: " docs/kunden/besucher.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Ergebnis: (Der Abbruch lag am Host, |widerlegt, weil )" docs/kunden/besucher.md` muss 1 ausgeben.
      Prüfung: `cat docs/kunden/besucher.md goals/kunden/ANNAHMEN.md | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){3,}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 04: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
      Prüfung (Netz): `bash ops/traffic.sh 168 >/dev/null 2>&1; echo $?` muss `0` ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test außer `selftest` war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] In `ops/` ändert sich nur `ops/traffic.sh`, dazu kommt die neue Fixture; `ops/access-log.sh`, `ops/own-ips.sh`,
      `ops/check-all.sh` und jede bestehende Fixture sind unverändert, und `ops/traffic.sh --selftest` meldet weiter `SELFTEST OK`.
- [ ] Keine Zeile des Blocks, des Dokuments, der Fixture außer Dokumentationsadressen, der Tests oder von `ANNAHMEN.md` nennt die
      Adresse eines Besuchers.
- [ ] Code, Kommentare, Ausgabe des Werkzeugs und Testnamen Englisch, Goal-Datei, Dokument und `ANNAHMEN.md` Deutsch, kein
      Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `.env*`, `*.db`
- `ops/access-log.sh`, `ops/own-ips.sh`, `ops/own-ips.txt`, `ops/check-all.sh`, `ops/status.sh`, `ops/db-report.cjs`,
  `ops/posted-answers.log` und jede bestehende Datei unter `ops/fixtures/`: unverändert
- `ops/traffic.sh`: nur Lesen der Sitemap, die Vorgaben von `BASE_URL` und `CP_OWN_HOSTS` und der neue Block; jeder andere Abschnitt
  bleibt Zeile für Zeile
- `docs/richtung/**`, `docs/kunden/rueckgang-2026-11.md`, `docs/kunden/conway-zahler.md`, `docs/kunden/trichter.md`, `ROADMAP.md`,
  `docs/kette.md` und alle bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion, jeder Build, Test oder Lastversuch auf dem Server, jede Transaktion auf einer Chain, jeder
  Kontakt zum Betreiber eines Automatons (`public_post`, `third_party_mail`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-19 Zyklus 1: Punkte 1, 2, 3 gebaut: `ops/traffic.sh` liest die Sitemap mit `curl -sL`, läuft bei leerer Sitemap mit Meldung auf stderr weiter, nimmt `automatonhost.com` als Vorgabe für `BASE_URL` und `CP_OWN_HOSTS` und druckt `-- Arrivals per host --` nach der Kopfzeile; Fixture `ops/fixtures/traffic-three-hosts.log`, `test/traffic-hosts.test.ts` (11 Fälle), Messung gegen die Produktion um 22:54 UTC (2615 fremde Ankünfte in 168 h: 362 automatonhost.com, 2197 postyourprice.com, 56 cp.hippe.eu, 0 andere; der ältere Abschnitt desselben Laufs zählt ebenfalls 2615), 3 Annahmen. Neue Tests rot vor dem Fix: über `TRAFFIC_UNDER_TEST` gegen `ops/traffic.sh` von `origin/dev` 11 von 11 failed (Lauf endet nach der Kopfzeile, wie am 19.11.); Mutationen am neuen Stand: erste Anfrage im Fenster statt im Log 5 failed, darunter `window`; letzte statt erste Anfrage 7 failed, darunter `first request`; Eigene nicht gefiltert 5 failed, darunter `our own`; ohne `(our page)` 5 failed, darunter `our page`; Adresse als Referrer gedruckt 1 failed (`other host`); ohne `-L` 1 failed (`postyourprice url`); `grep` ohne `|| true` 1 failed (`empty sitemap`); andere Hosts unter automatonhost.com 6 failed, darunter `other host` und `no address`. Prüfbefehle: Punkt 1 vitest Exit 0 (11 passed), `alle`, catalog/depth/page-weight Exit 0 (24 passed), 0; Punkt 2 `spaet genug`, 1, `stimmig`, 1, 1, 0, 3, Netz `0` (Lauf 22:54 bis 23:13 UTC, Ausgabe in eine Datei außerhalb des Repos statt `/dev/null`, daraus der Block); Punkt 3 `node scripts/check.mjs` Exit 0 (2476 Tests).
- 2026-11-19 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3; `origin/dev` brachte nichts Neues (kein Merge nötig). Prüfbefehle: Punkt 1 vitest Exit 0, `alle`, catalog/depth/page-weight Exit 0 (24 passed), 0; Punkt 2 `spaet genug`, 1, `stimmig`, 1, 1, 0, 3, Netz `0` (Lauf 23:30 bis 23:53 UTC); Punkt 3 `node scripts/check.mjs` Exit 0 (grün in 81 s); am PR #310 Kopf afefda9 Jobs `check` und `e2e` pass.
- 2026-11-20 Release: PASS K und B (Zyklus 2), DONE.

## Blockers
