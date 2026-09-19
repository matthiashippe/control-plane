#!/usr/bin/env bash
# Der eigentliche Ablauf, ausgeführt AUF dem Docker-Host. `deploy/rollout.sh` ruft ihn per SSH auf.
#
# Warum eine eigene Datei statt eines Heredocs in rollout.sh: So lässt sich der Ablauf gegen ein
# beliebiges Compose-Projekt fahren (CP_COMPOSE_DIR/CP_COMPOSE_FILE) und damit lokal testen, ohne
# Produktion anzufassen. Ein Ablauf, den man nur in Produktion ausprobieren kann, ist kein Ablauf,
# sondern eine Wette.
#
# Umgebung (alles optional, Defaults passen für srv1336627):
#   CP_COMPOSE_DIR      Verzeichnis mit der Compose-Datei (Default: dieses Verzeichnis)
#   CP_COMPOSE_FILE     Default docker-compose.prod.yml
#   CP_SERVICE          Default cp
#   CP_CADDY_SERVICE    Default caddy
#   CP_HEALTH_TIMEOUT   Sekunden bis `healthy`, Default 150 (start_period ist 45 s)
#   CP_QUIESCE_TIMEOUT  Sekunden, die auf ein ruhiges Fenster gewartet wird, Default 90
#   CP_CANARY           0 schaltet den Vorabtest ab. Nur für den Notfall, nimmt dem Ablauf den Sinn.
set -uo pipefail

DIR="${CP_COMPOSE_DIR:-$(cd "$(dirname "$0")" && pwd)}"
FILE="${CP_COMPOSE_FILE:-docker-compose.prod.yml}"
SVC="${CP_SERVICE:-cp}"
CADDY_SVC="${CP_CADDY_SERVICE:-caddy}"
HEALTH_TIMEOUT="${CP_HEALTH_TIMEOUT:-150}"
QUIESCE_TIMEOUT="${CP_QUIESCE_TIMEOUT:-90}"
CANARY="${CP_CANARY:-1}"

cd "$DIR" || { echo "[rollout] ABBRUCH: $DIR nicht erreichbar" >&2; exit 1; }

log()    { printf '[rollout] %s\n' "$*"; }
warn()   { printf '[rollout] WARNUNG: %s\n' "$*" >&2; }
abbruch() { printf '[rollout] ABBRUCH: %s\n' "$*" >&2; exit 1; }
dc()     { docker compose -f "$FILE" "$@"; }

# sha256sum gibt es auf Linux, shasum auf macOS. Der Ablauf soll auf beiden laufen, damit der
# lokale Test denselben Code fährt wie die VM.
hash_datei() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

gesundheit() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || echo "weg"
}

# Wartet, bis der Container `healthy` meldet. Gibt 1 zurück, wenn die Frist abläuft oder der
# Container vorher stirbt: Ein Container, der beim Start abstürzt, wird von `restart: unless-stopped`
# endlos neu gestartet, und ohne diese Abbruchbedingung würde hier bis zum Timeout gewartet, obwohl
# die Lage längst entschieden ist.
warte_gesund() {
  local cid="$1" frist="$2" start jetzt zustand
  start=$(date +%s)
  while :; do
    zustand="$(gesundheit "$cid")"
    case "$zustand" in
      healthy|running) [[ "$zustand" == healthy ]] && return 0 ;;
      exited|dead|weg)  log "Container ist $zustand"; return 1 ;;
    esac
    jetzt=$(date +%s)
    (( jetzt - start >= frist )) && { log "nach ${frist}s immer noch '$zustand'"; return 1; }
    sleep 2
  done
}

########################################################################################
# Schritt 1: Ist-Zustand festhalten, bevor irgendetwas angefasst wird.
########################################################################################
# Ohne laufenden, gesunden Dienst gibt es nichts umzuschalten und keinen Zustand, auf den
# zurückgefallen werden könnte. Dann ist `up.sh` das richtige Werkzeug (Erstinstallation, Dienst
# liegt bereits am Boden), nicht dieses Skript.
alt_cid="$(dc ps -q "$SVC" 2>/dev/null)"
[[ -n "$alt_cid" ]] || abbruch "Service '$SVC' läuft nicht. Für einen Kaltstart deploy/up.sh nehmen."
alt_zustand="$(gesundheit "$alt_cid")"
[[ "$alt_zustand" == "healthy" ]] || abbruch \
  "Service '$SVC' ist '$alt_zustand', nicht healthy. Erst die Ursache klären; dieses Skript ist für den Wechsel eines gesunden Dienstes."

alt_image_id="$(docker inspect --format '{{.Image}}' "$alt_cid")"
image_ref="$(docker inspect --format '{{.Config.Image}}' "$alt_cid")"
ROLLBACK_TAG="${CP_ROLLBACK_TAG:-control-plane:rollback}"
# Der Build überschreibt gleich das Tag `control-plane:latest`. Danach hätte das alte Image keinen
# Namen mehr und wäre nur noch über die ID erreichbar, die nach dem nächsten `image prune`
# verschwindet. Deshalb bekommt es jetzt ein eigenes Tag: Das ist der Rückweg.
docker tag "$alt_image_id" "$ROLLBACK_TAG" >/dev/null || abbruch "Rollback-Tag konnte nicht gesetzt werden"
log "läuft: $image_ref ($(cut -c8-19 <<<"$alt_image_id")), gesichert als $ROLLBACK_TAG"

daten_volume="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$alt_cid")"

########################################################################################
# Schritt 2: Bauen, ohne den laufenden Container anzufassen.
########################################################################################
# `up -d --build` mischt Bauen und Umschalten in einen Befehl. Schlägt der Build fehl, merkt man
# das erst, wenn der Dienst schon angefasst ist. Hier ist der Build ein eigener Schritt: Geht er
# schief, endet der Ablauf, und draußen hat niemand etwas gemerkt.
log "baue Image ..."
dc build "$SVC" || abbruch "Build fehlgeschlagen. Der laufende Dienst ist unberührt."
neu_image_id="$(docker inspect --format '{{.Id}}' "$image_ref" 2>/dev/null)"
[[ -n "$neu_image_id" ]] || abbruch "Image $image_ref nach dem Build nicht auffindbar"

if [[ "$neu_image_id" == "$alt_image_id" ]]; then
  # Gleicher Code, gleiches Image: Der Dienst muss nicht neu starten. Das ist der Normalfall bei
  # einer reinen Caddyfile-Änderung, und genau dafür ist die Unterscheidung da.
  log "Image unverändert, kein Neustart des Dienstes nötig"
  cp_wechsel=0
else
  log "neues Image: $(cut -c8-19 <<<"$neu_image_id")"
  cp_wechsel=1
fi

########################################################################################
# Schritt 3: Kanarienvogel. Der neue Container startet neben dem alten, aber auf einer Kopie der
# Datenbank.
########################################################################################
# Warum keine echte Blau/Grün-Umschaltung: Zwei Prozesse dürfen nicht gleichzeitig auf cp.db
# arbeiten. `migrate()` in src/db.ts setzt beim Start `reserved_mc = 0` und alle `pending`-Zahlungen
# auf `failed`; beides ist genau dann richtig, wenn ein einziger Prozess die Datei hat, und genau
# dann falsch, wenn der alte Container parallel weiterläuft. Der Kommentar an der Stelle sagt es
# selbst. Also wird der neue Container vorher gegen eine Kopie geprüft: Er beweist, dass das Image
# startet, die Migrationen über den echten Datenbestand laufen und /health antwortet. Erst dann
# wird umgeschaltet, und der Wechsel ist so kurz wie ein Neustart eines bereits bewiesenen Images.
canary_name="cp-rollout-canary-$$"
canary_env="$(mktemp)"
aufraeumen_canary() {
  docker rm -f "$canary_name" >/dev/null 2>&1
  rm -f "$canary_env"
  dc exec -T "$SVC" sh -c 'rm -f /data/rollout-canary.db /data/rollout-canary.db-wal /data/rollout-canary.db-shm' >/dev/null 2>&1
}

if [[ "$cp_wechsel" == "1" && "$CANARY" != "0" ]]; then
  log "Kanarienvogel: Kopie der Datenbank ziehen ..."
  dc exec -T "$SVC" sh -c 'rm -f /data/rollout-canary.db /data/rollout-canary.db-wal /data/rollout-canary.db-shm' >/dev/null 2>&1
  # VACUUM INTO statt `cp`: Die Datenbank läuft im WAL-Modus, die .db-Datei allein ist fast leer
  # (steht so in deploy/README.md unter Backup). VACUUM INTO ist lesend und stört den laufenden
  # Betrieb nicht.
  dc exec -T "$SVC" node - <<'JS' || { warn "Kopie fehlgeschlagen, Kanarienvogel entfällt"; CANARY=0; }
const D = require("better-sqlite3");
new D(process.env.CP_DB_PATH, { readonly: true }).exec("VACUUM INTO '/data/rollout-canary.db'");
JS
fi

if [[ "$cp_wechsel" == "1" && "$CANARY" != "0" ]]; then
  # Die Umgebung kommt aus dem laufenden Container, nicht aus der .env-Datei: Nur so hat der
  # Kanarienvogel garantiert dieselben Variablen wie der Dienst, samt allem, was das Image selbst
  # setzt. Die Datei ist ein mktemp mit umask 077 und wird sofort wieder gelöscht, damit die
  # Secrets nicht in der Prozessliste oder dauerhaft auf der Platte landen.
  ( umask 077; docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$alt_cid" \
      | grep -v '^CP_DB_PATH=' > "$canary_env" )
  canary_port="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$alt_cid" \
      | sed -n 's/^CP_PORT=//p' | head -1)"
  canary_port="${canary_port:-8402}"

  # Bewusst `docker run` im Default-Netz statt `compose run`: Im Compose-Netz könnte der
  # Kanarienvogel den DNS-Alias des Dienstes erben, und dann schickt Caddy die Hälfte des echten
  # Verkehrs an einen Container, der auf einer Datenbank-Kopie rechnet. Ausgehendes Netz braucht er
  # trotzdem, denn der Preisabruf bei OpenRouter ist die Stelle, an der der Start am 19.09. zweimal
  # hängen blieb; genau das soll hier auffliegen.
  log "Kanarienvogel startet (Port $canary_port, DB /data/rollout-canary.db) ..."
  if ! docker run -d --name "$canary_name" \
        --env-file "$canary_env" \
        -e CP_DB_PATH=/data/rollout-canary.db \
        -v "$daten_volume:/data" \
        "$image_ref" >/dev/null; then
    aufraeumen_canary
    abbruch "Kanarienvogel ließ sich nicht starten. Der laufende Dienst ist unberührt."
  fi

  start=$(date +%s); canary_ok=0
  while :; do
    if docker exec "$canary_name" node -e \
        "fetch('http://127.0.0.1:${canary_port}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      canary_ok=1; break
    fi
    [[ "$(docker inspect --format '{{.State.Status}}' "$canary_name" 2>/dev/null)" == "running" ]] || break
    (( $(date +%s) - start >= HEALTH_TIMEOUT )) && break
    sleep 2
  done
  canary_dauer=$(( $(date +%s) - start ))

  if [[ "$canary_ok" != "1" ]]; then
    echo "----- Logs des Kanarienvogels -----" >&2
    docker logs --tail 50 "$canary_name" >&2 2>&1
    echo "-----------------------------------" >&2
    aufraeumen_canary
    abbruch "Das neue Image wird nicht gesund (${HEALTH_TIMEOUT}s). Nicht umgeschaltet, der alte Container läuft weiter."
  fi
  log "Kanarienvogel war nach ${canary_dauer}s gesund. So lange dauert gleich auch der Wechsel."
  aufraeumen_canary
fi

########################################################################################
# Schritt 4: Ruhiges Fenster abwarten, dann umschalten.
########################################################################################
if [[ "$cp_wechsel" == "1" ]]; then
  # Der Wechsel tötet den alten Prozess mitten in dem, was er gerade tut. Bei einer laufenden
  # Inferenz kostet das uns Provider-Token, aber den Kunden nichts, weil erst nach der Antwort
  # gebucht wird (src/inference/proxy.ts). Bei einer Zahlung im Zustand `pending` ist es ernst:
  # Zwischen `INSERT ... 'pending'` und `status='settled'` in src/payments/pay.ts liegt der
  # On-Chain-Settle. Wer dort abschneidet, riskiert geflossene USDC ohne Gutschrift. Also warten,
  # und wenn es nicht ruhig wird, lieber gar nicht deployen.
  log "warte auf ein ruhiges Fenster (keine offene Zahlung, keine laufende Inferenz) ..."
  start=$(date +%s); ruhig=0
  while :; do
    lage="$(dc exec -T "$SVC" node - <<'JS' 2>/dev/null
const D = require("better-sqlite3");
const db = new D(process.env.CP_DB_PATH, { readonly: true });
const frisch = new Date(Date.now() - 600e3).toISOString();
const p = db.prepare("SELECT count(*) n FROM payments WHERE status='pending' AND created_at >= ?").get(frisch).n;
const alt = db.prepare("SELECT count(*) n FROM payments WHERE status='pending' AND created_at < ?").get(frisch).n;
const r = db.prepare("SELECT count(*) n FROM wallets WHERE reserved_mc <> 0").get().n;
console.log(`${p} ${alt} ${r}`);
JS
)"
    read -r pending_frisch pending_alt reserviert <<<"${lage:-0 0 0}"
    if [[ "${pending_frisch:-0}" == "0" && "${reserviert:-0}" == "0" ]]; then ruhig=1; break; fi
    (( $(date +%s) - start >= QUIESCE_TIMEOUT )) && break
    log "  offen: $pending_frisch Zahlung(en), $reserviert Wallet(s) mit Reservierung"
    sleep 3
  done

  if [[ "${pending_alt:-0}" != "0" ]]; then
    # Älter als zehn Minuten heißt: hängt schon, der Reaper beim Start ist die Reparatur, nicht der
    # Schaden. Trotzdem hinsehen, es geht um fremdes Geld.
    warn "$pending_alt Zahlung(en) hängen seit über 10 Minuten in 'pending'. Der Neustart setzt sie auf 'failed'. Nachher on-chain prüfen."
  fi
  if [[ "$ruhig" != "1" && "${pending_frisch:-0}" != "0" ]]; then
    abbruch "Seit ${QUIESCE_TIMEOUT}s läuft eine frische Zahlung. Nicht umgeschaltet: Ein Abbruch mitten im Settlement kann USDC ohne Gutschrift bedeuten. Später erneut."
  fi
  if [[ "$ruhig" != "1" ]]; then
    warn "Nach ${QUIESCE_TIMEOUT}s noch $reserviert Wallet(s) mit Reservierung. Wird trotzdem gewechselt: Eine abgebrochene Inferenz kostet den Kunden nichts, die Reservierung räumt der Start auf."
  fi

  log "schalte um ..."
  t0=$(date +%s)
  if ! dc up -d --no-deps --force-recreate "$SVC"; then
    abbruch "Compose konnte '$SVC' nicht ersetzen. Zustand mit 'docker compose -f $FILE ps' prüfen."
  fi
  neu_cid="$(dc ps -q "$SVC")"
  if warte_gesund "$neu_cid" "$HEALTH_TIMEOUT"; then
    log "neuer Container gesund nach $(( $(date +%s) - t0 ))s Unterbrechung"
  else
    # Der Kanarienvogel hat gesagt, dass das Image startet. Wenn es hier trotzdem klemmt, liegt es
    # an der echten Datenbank oder am Volume, und dann hilft nur zurück. Logs vorher sichern, der
    # Container überlebt das Rollback nicht.
    echo "----- Logs des neuen Containers -----" >&2
    docker logs --tail 80 "$neu_cid" >&2 2>&1
    echo "-------------------------------------" >&2
    warn "Der neue Container wird nicht gesund. Rollback auf $ROLLBACK_TAG ..."
    docker tag "$ROLLBACK_TAG" "$image_ref" >/dev/null
    dc up -d --no-deps --force-recreate "$SVC" >/dev/null 2>&1
    if warte_gesund "$(dc ps -q "$SVC")" "$HEALTH_TIMEOUT"; then
      abbruch "Neues Image untauglich, Rollback auf den alten Stand ist gesund. Dienst läuft wieder."
    fi
    abbruch "Neues Image untauglich UND das Rollback wird nicht gesund. Der Dienst ist unten, sofort von Hand nachsehen."
  fi
fi

########################################################################################
# Schritt 5: Caddyfile. Getrennt und nach dem Dienst, weil es den Dienst nicht anfasst.
########################################################################################
# Der Kern des Problems: `./Caddyfile:/etc/caddy/Caddyfile:ro` ist ein Datei-Bind-Mount und hängt
# unter Linux an der Inode. rsync schreibt eine neue Datei, der laufende Container sieht weiter die
# alte, und `caddy reload` liest die Datei aus Containersicht, also ebenfalls die alte.
#
# Deshalb zwei Signale statt eines Dateivergleichs gegen git:
#  1. Was liest der Container gerade? Weicht das vom Repo-Stand ab, sitzt der Container auf der
#     alten Inode. Das ist der Linux-Fall.
#  2. Mit welchem Hash wurde Caddy zuletzt absichtlich erzeugt? Der steht in einer Stempeldatei
#     ausserhalb des rsync-Ziels, damit `--delete` sie nicht wegräumt. Sie fängt den umgekehrten
#     Fall: Datei im Container aktuell, aber Caddy hat sie nie geladen, weil es seither nicht neu
#     gestartet ist. Caddy liest den Caddyfile nur beim Start, nicht laufend.
# Fehlt die Stempeldatei (erster Lauf), entscheidet Signal 1 allein, und der Stempel wird angelegt.
STAMP="${CP_CADDY_STAMP:-$DIR/../../caddyfile.sha256}"
ist_hash="$(dc exec -T "$CADDY_SVC" sha256sum /etc/caddy/Caddyfile 2>/dev/null | awk '{print $1}')"
soll_hash="$(hash_datei "$DIR/Caddyfile")"

caddy_aendern=0
grund=""
if [[ -z "$ist_hash" ]]; then
  warn "Caddy antwortet nicht auf exec, Caddyfile gilt sicherheitshalber als geändert"
  ist_hash="unbekannt"; caddy_aendern=1; grund="Caddy nicht erreichbar"
elif [[ "$ist_hash" != "$soll_hash" ]]; then
  caddy_aendern=1
  grund="Container liest $(cut -c1-12 <<<"$ist_hash"), Repo hat $(cut -c1-12 <<<"$soll_hash") (Inode-Falle)"
elif [[ -f "$STAMP" && "$(cat "$STAMP" 2>/dev/null)" != "$soll_hash" ]]; then
  caddy_aendern=1
  grund="Caddy wurde zuletzt mit $(cut -c1-12 < "$STAMP") erzeugt, im Repo steht $(cut -c1-12 <<<"$soll_hash")"
fi

if [[ "$caddy_aendern" == "0" ]]; then
  log "Caddyfile unverändert ($(cut -c1-12 <<<"$soll_hash")), Caddy bleibt stehen"
  printf '%s' "$soll_hash" > "$STAMP" 2>/dev/null || true
else
  log "Caddyfile geändert: $grund"
  caddy_cid="$(dc ps -q "$CADDY_SVC" 2>/dev/null)"
  caddy_image="caddy:2-alpine"
  [[ -n "$caddy_cid" ]] && caddy_image="$(docker inspect --format '{{.Config.Image}}' "$caddy_cid")"

  # Ein Caddyfile mit Syntaxfehler lässt den Container gar nicht erst starten, und dann ist alles
  # weg, nicht nur die Änderung. Validieren kostet zwei Sekunden.
  log "validiere ..."
  if ! docker run --rm -v "$DIR/Caddyfile:/etc/caddy/Caddyfile:ro" "$caddy_image" \
        caddy validate --config /etc/caddy/Caddyfile; then
    abbruch "Caddyfile ist ungültig. Nicht angewendet, Caddy läuft mit der alten Fassung weiter."
  fi

  # Die alte, tatsächlich laufende Fassung sichern. Nicht aus git: Was der Container liest, kann
  # von jedem Stand im Repo abweichen, genau darum geht es hier.
  ruecklage="$DIR/.Caddyfile.rollback"
  if [[ -n "$caddy_cid" ]]; then
    dc exec -T "$CADDY_SVC" cat /etc/caddy/Caddyfile > "$ruecklage" 2>/dev/null || rm -f "$ruecklage"
  fi

  # `--force-recreate` ist der Punkt: Nur ein neuer Container bekommt die neue Inode zu sehen.
  # `--no-deps`, damit Compose nicht nebenbei den gerade frisch gestarteten Dienst mit anfasst.
  log "erzeuge Caddy neu ..."
  if ! dc up -d --no-deps --force-recreate "$CADDY_SVC"; then
    abbruch "Caddy ließ sich nicht neu erzeugen. Sofort nachsehen, von außen ist der Dienst vermutlich weg."
  fi
  sleep 3
  caddy_cid="$(dc ps -q "$CADDY_SVC")"
  neu_hash="$(dc exec -T "$CADDY_SVC" sha256sum /etc/caddy/Caddyfile 2>/dev/null | awk '{print $1}')"
  if [[ "$(docker inspect --format '{{.State.Status}}' "$caddy_cid" 2>/dev/null)" != "running" || "$neu_hash" != "$soll_hash" ]]; then
    echo "----- Logs von Caddy -----" >&2
    docker logs --tail 40 "$caddy_cid" >&2 2>&1
    echo "--------------------------" >&2
    if [[ -s "$ruecklage" ]]; then
      warn "Caddy läuft nicht mit der neuen Fassung. Zurück auf die vorherige ..."
      cp "$ruecklage" "$DIR/Caddyfile"
      dc up -d --no-deps --force-recreate "$CADDY_SVC" >/dev/null 2>&1
      abbruch "Caddyfile zurückgerollt. ACHTUNG: deploy/Caddyfile auf dem Host trägt jetzt die alte Fassung, der nächste rsync überschreibt sie wieder."
    fi
    abbruch "Caddy läuft nicht mit der neuen Fassung und es gibt keine Rücklage. Sofort von Hand nachsehen."
  fi
  rm -f "$ruecklage"
  printf '%s' "$soll_hash" > "$STAMP" 2>/dev/null || warn "Stempeldatei $STAMP nicht schreibbar; der nächste Lauf erzeugt Caddy sicherheitshalber erneut."
  log "Caddyfile ist wirksam ($(cut -c1-12 <<<"$neu_hash"))"
fi

########################################################################################
# Schritt 6: Bericht.
########################################################################################
dc ps
dc logs --tail 5 "$SVC"
log "fertig. Rückweg bei Bedarf: docker tag $ROLLBACK_TAG $image_ref && docker compose -f $FILE up -d --no-deps --force-recreate $SVC"
