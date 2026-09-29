export const meta = {
  name: 'org-challenge',
  description: 'Nimmt das Paperclip-Setup der Org auseinander: Rollen, Vertraege, Takt, Sicherheit, und ob ueberhaupt etwas gebaut wird',
  phases: [
    { title: 'Lesen', detail: 'was tatsaechlich konfiguriert ist, gegen die laufende Instanz' },
    { title: 'Angreifen', detail: 'sechs Linsen, jede versucht das Setup umzubringen' },
    { title: 'Urteil', detail: 'was geaendert wird, bevor die Firma losfaehrt' },
  ],
}

// Matthias am 29.09.2026: "kannst du das bitte challengen das setup? damit es direkt richtig mit
// feuer losgeht". Also nicht bestaetigen, sondern brechen.
//
// Die Org ist heute gebaut worden und hat einen einzigen erfolgreichen Lauf hinter sich. Alles an
// ihr ist Vermutung, und die teuerste Klasse Fehler in diesem Projekt war immer dieselbe: ein
// Werkzeug, das nur einen Zustand gesehen hat, und deshalb immer dasselbe sagt.

const ROOT = '/Users/matthiashippe/GIT/control-plane'
const API = 'http://127.0.0.1:3140'
const FIRMA = '40312e4b-7d3e-48e6-84b5-d152947de567'

const LAGE = `Die Org heisst Handsel und laeuft in Paperclip unter ${API}, Firma ${FIRMA}.
Das Repo ist ${ROOT}. Die CLI ist /tmp/pc (ein Wrapper, der Node 24 setzt), Beispiele:
  /tmp/pc agent list -C ${FIRMA} --json
  /tmp/pc issue list -C ${FIRMA} --json
  curl -s ${API}/api/companies/${FIRMA}/heartbeat-runs?limit=30
Die Rollenvertraege liegen je Agent unter
~/.paperclip/instances/default/companies/${FIRMA}/agents/<id>/instructions/ (SOUL.md, AGENTS.md).
ORG.md im Repo beschreibt die Firma, ZIELE.md die Ziele.`

const BEFUND_SCHEMA = {
  type: 'object',
  properties: {
    toedlich: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titel: { type: 'string' },
          was: { type: 'string', description: 'der Defekt, konkret' },
          beleg: { type: 'string', description: 'Befehl und Ausgabe, oder Dateistelle' },
          folge: { type: 'string', description: 'was konkret passiert, wenn es so bleibt' },
          fix: { type: 'string', description: 'die kleinste Aenderung, die es behebt' },
          schwere: { type: 'string', enum: ['blockiert', 'kostet', 'laestig'] },
        },
        required: ['titel', 'was', 'beleg', 'folge', 'fix', 'schwere'],
      },
    },
    geprueft_und_haelt: { type: 'array', items: { type: 'string' } },
    nicht_pruefbar: { type: 'array', items: { type: 'string' } },
  },
  required: ['toedlich'],
}

phase('Lesen')
const bestand = await agent(
  `${LAGE}\n\nLies den tatsaechlichen Zustand der Org aus der laufenden Instanz, nicht aus ORG.md. ` +
    'Liste: alle 19 Agenten mit Rolle, Vorgesetztem, Modell, Budget, Heartbeat-Einstellung und ' +
    'Adapter-Konfiguration; alle Tickets mit Status und Zuweisung; alle bisherigen Laeufe mit ' +
    'Ergebnis, Modell und Fehler; das Ziel. Lies ausserdem einen Rollenvertrag vollstaendig ' +
    '(SOUL.md und AGENTS.md des CEO) und sag, was darin steht und was Paperclip selbst ' +
    'dazugeschrieben hat. Gib das kompakt als Fakten zurueck, ohne Bewertung.',
  { label: 'bestand', phase: 'Lesen' },
)

const LINSEN = [
  {
    key: 'stillstand',
    frage:
      'Die Linse Stillstand. Kann diese Org sich selbst blockieren? ORG.md sagt "ohne die Lage ' +
      'beginnt kein Bau", und der Stabschef ist heute mehrfach ausgefallen. Such jede Regel, die ' +
      'bei Ausfall oder Unsicherheit dazu fuehrt, dass niemand etwas tut. Pruefe auch: wer weckt ' +
      'wen? Heartbeats sind aus. Wenn niemand einen Agenten weckt, passiert nie etwas, und dann ' +
      'ist die ganze Org ein Organigramm ohne Puls.',
  },
  {
    key: 'bericht',
    frage:
      'Die Linse Berichtsfabrik. Erzeugt dieses Setup Arbeit oder nur Text ueber Arbeit? Zaehle, ' +
      'wie viele der 19 Rollen etwas bauen oder messen, und wie viele nur schreiben, pruefen oder ' +
      'entscheiden. Pruefe den Takt in ORG.md: wie viele Schritte und wie viele Agentenlaeufe ' +
      'liegen zwischen einer Messung und einer Zeile Code, die live geht? Der erste echte Lauf ' +
      'hat 5,58 USD an Tokenwert und drei Commits erzeugt, und kein einziges Produktfeature.',
  },
  {
    key: 'sicherheit',
    frage:
      'Die Linse Sicherheit. Die Agenten laufen mit dangerouslySkipPermissions in einem Repo, das ' +
      'ein Produktionssystem deployt. Pruefe konkret: koennen sie committen (der Schreiber hat es ' +
      'bereits getan), koennen sie pushen, koennen sie ops/deploy.sh ausfuehren, koennen sie an ' +
      'gesperrte Pfade (.env, deploy/, src/payments/), koennen sie Geld bewegen, koennen sie ' +
      'Tests abschalten? Was davon ist nur durch einen Satz in einer Vertragsdatei verhindert, ' +
      'also gar nicht? Nenne fuer jede echte Luecke die technische Sperre, die sie schliesst.',
  },
  {
    key: 'rollen',
    frage:
      'Die Linse Rollenschnitt. Sind 19 Rollen fuer ein Projekt mit null Kunden die richtige ' +
      'Zahl? Welche Rolle wird in den naechsten sieben Tagen nachweislich nichts bewegen? Welche ' +
      'fehlt? Pruefe besonders: gibt es eine Rolle, deren Aufgabe schon von einem Werkzeug im ' +
      'Repo erledigt wird (ops/ziele.sh, ops/sperren.sh, ops/org.sh)? Und: ist der Zuschnitt ' +
      'nach Bereichen (CFO, CMO, CTO) fuer den Engpass sinnvoll, wenn der Engpass gerade eine ' +
      'einzige Sache ist, naemlich dass ein Mensch nichts kaufen kann?',
  },
  {
    key: 'vertraege',
    frage:
      'Die Linse Vertraege. Lies mehrere SOUL.md und AGENTS.md wirklich. Widersprechen sich ' +
      'Paperclips eigene Standardanweisungen und unser Vertrag? Die Standardfassung nennt Rollen ' +
      'wie UXDesigner, die es nicht gibt, und sagt dem CEO, er solle Agenten einstellen. Pruefe, ' +
      'ob ein Agent daraus falsche Schluesse ziehen kann, und ob die Sperrliste an einer Stelle ' +
      'steht, an der sie gelesen wird. Pruefe auch die Laenge: ein Vertrag von 6.000 Zeichen plus ' +
      'Paperclips eigenen Anweisungen, wie viel davon ueberlebt bis zur ersten Handlung?',
  },
  {
    key: 'kosten',
    frage:
      'Die Linse Kosten und Grenzen. Ein Lauf hat 126.930 Eingabe-Token und 6,2 Millionen Token ' +
      'insgesamt verbraucht, verbucht als subscription_included. Pruefe: was passiert bei 19 ' +
      'Agenten mit Heartbeats? Welche Rate- und Kontextgrenzen treffen zuerst? Ein Lauf ist heute ' +
      'mit "terminal limit failure" gestorben. Pruefe die Budget-Einstellungen: sie stehen in ' +
      'Cent, aber der Verbrauch wird als subscription_included gefuehrt und die Firma zeigt 0 USD ' +
      'Verbrauch. Greift die Budgetgrenze ueberhaupt, oder ist sie eine Zahl ohne Wirkung?',
  },
]

phase('Angreifen')
const befunde = await parallel(
  LINSEN.map((l) => () =>
    agent(
      `${LAGE}\n\nDer Bestand, von einem anderen Agenten gelesen:\n${bestand}\n\n${l.frage}\n\n` +
        'Deine Aufgabe ist, das Setup umzubringen, nicht es zu verbessern. Jeder Befund braucht ' +
        'einen Beleg aus der laufenden Instanz oder aus einer Datei, keinen aus deiner Vermutung. ' +
        'Was du nicht belegen kannst, kommt unter nicht_pruefbar.',
      { label: `linse:${l.key}`, phase: 'Angreifen', schema: BEFUND_SCHEMA },
    ).then((b) => ({ linse: l.key, ...b })),
  ),
)

const alle = befunde.filter(Boolean).flatMap((b) => (b.toedlich || []).map((t) => ({ linse: b.linse, ...t })))
const blockierend = alle.filter((t) => t.schwere === 'blockiert')
log(`${alle.length} Befunde, davon ${blockierend.length} blockierend`)

phase('Urteil')
const urteil = await agent(
  `${LAGE}\n\nSechs Linsen haben das Setup angegriffen. Hier ihre Befunde:\n` +
    `${JSON.stringify(alle, null, 1)}\n\n` +
    'Entscheide, was geaendert wird, bevor die Firma losfaehrt. Regeln fuer dein Urteil:\n' +
    '1. Sortiere nach der Frage "was verhindert, dass in den naechsten 48 Stunden eine Zeile Code ' +
    'live geht, die einem Menschen etwas verkauft".\n' +
    '2. Ein Befund, der nur durch einen Satz in einer Vertragsdatei verhindert wird, ist nicht ' +
    'verhindert. Nenne die technische Sperre.\n' +
    '3. Weniger ist mehr: wenn eine Rolle oder ein Schritt nichts bewegt, streiche ihn.\n' +
    '4. Zu jeder Aenderung: die konkrete Anweisung, wie sie umgesetzt wird (Befehl, Datei, Feld).\n' +
    'Schreib keinen Code. Liefere eine geordnete Liste von Aenderungen, jede mit Begruendung und ' +
    'mit der Messung, an der man sieht, dass sie gewirkt hat.',
  { label: 'urteil', phase: 'Urteil' },
)

return { bestand, befunde: alle, blockierend: blockierend.length, urteil }
