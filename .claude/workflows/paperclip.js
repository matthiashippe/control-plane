export const meta = {
  name: 'paperclip',
  description: 'Ein Durchlauf der Org: messen, drei Vorschlaege gegen das schwaechste Glied, widerlegen, bauen, nachmessen',
  phases: [
    { title: 'Messen', detail: 'ops/ziele.sh, ops/sperren.sh, ops/org.sh gegen die Produktion' },
    { title: 'Vorschlagen', detail: 'Nachfrage, Angebot und Produkt je drei Wege gegen das schwaechste Glied' },
    { title: 'Widerlegen', detail: 'der Skeptiker nimmt jeden Vorschlag auseinander' },
    { title: 'Entscheiden', detail: 'was uebrig bleibt, nach erwarteter Wirkung je Aufwand' },
  ],
}

// Die Org aus ORG.md, als ein Durchlauf. Sie misst zuerst und schlaegt danach vor, nie umgekehrt:
// am 29.09.2026 hat ein Lauf zehn Tage lang gemessen, ob Agenten kommen, waehrend 33 von 47
// Auftraegen dem Gewinner 0,9 Cent zahlten, bei Antwortkosten von 0,5 bis 5,8 Cent. Die Messung
// war da, der Vorschlag hat sie nie gelesen.
//
// Gebaut wird hier nichts. Das Skript liefert die Entscheidung samt Begruendung zurueck, und der
// Bau laeuft danach im Hauptlauf mit WIP = 1.

const GLIED_SCHEMA = {
  type: 'object',
  properties: {
    zahl: { type: 'number', description: 'fiverr_orders_30d, gemessen' },
    nachfrage: { type: 'number' },
    angebot: { type: 'number' },
    abschluss: { type: 'number' },
    schwaechstes_glied: { type: 'string', enum: ['Nachfrage', 'Angebot', 'Abschluss'] },
    warum: { type: 'string' },
    fenster: { type: 'string', description: 'Messfenster und Quelle je Zahl' },
    nicht_messbar: { type: 'array', items: { type: 'string' } },
  },
  required: ['zahl', 'schwaechstes_glied', 'warum', 'fenster'],
}

const VORSCHLAG_SCHEMA = {
  type: 'object',
  properties: {
    vorschlaege: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titel: { type: 'string' },
          was: { type: 'string' },
          warum_jetzt: { type: 'string', description: 'mit der gemessenen Zahl, die ihn traegt' },
          erwartete_wirkung: { type: 'string', description: 'auf fiverr_orders_30d, mit Frist' },
          kosten: { type: 'string' },
          widerlegt_durch: { type: 'string' },
        },
        required: ['titel', 'was', 'warum_jetzt', 'erwartete_wirkung', 'kosten', 'widerlegt_durch'],
      },
    },
  },
  required: ['vorschlaege'],
}

const URTEIL_SCHEMA = {
  type: 'object',
  properties: {
    urteil: { type: 'string', enum: ['HAELT', 'WIDERLEGT', 'NICHT PRUEFBAR'] },
    nachgerechnet: { type: 'string', description: 'Befehl und Ergebnis, nicht die Behauptung des anderen' },
    gruende: { type: 'array', items: { type: 'string' } },
    damit_es_haelt: { type: 'string' },
  },
  required: ['urteil', 'nachgerechnet'],
}

phase('Messen')
const lage = await agent(
  'Du bist org-messer aus ORG.md. Miss die eine Zahl und ihre drei Glieder gegen die Produktion: ' +
    'ops/ziele.sh, ops/sperren.sh, ops/org.sh, und bei Bedarf ops/db-report.cjs auf der VM. ' +
    'Lies keine Zahl aus ZIELE.md, ROADMAP.md oder STATE.md. Nenne zu jeder Zahl Fenster, Quelle ' +
    'und Einheit. Sag am Ende, welches Glied das schwaechste ist und warum.',
  { label: 'messen', phase: 'Messen', schema: GLIED_SCHEMA, agentType: 'org-messer' },
)

const ROLLEN = [
  { key: 'nachfrage', agent: 'org-nachfrage', was: 'Wege, auf denen ein Mensch mit echtem Bedarf hier einen bezahlten Auftrag stellt' },
  { key: 'angebot', agent: 'org-angebot', was: 'Wege, auf denen ein fremder Agent einen Auftrag von diesem Brett annimmt und liefert' },
  { key: 'produkt', agent: 'org-produkt', was: 'Produktschritte, die die Kette an genau dieser Stelle oeffnen' },
]

// Pipeline statt Barriere: jeder Vorschlagssatz geht sofort zum Skeptiker, waehrend die anderen
// Rollen noch schreiben. Es gibt nichts, was der Skeptiker rollenuebergreifend braucht.
phase('Vorschlagen')
const geprueft = await pipeline(
  ROLLEN,
  (r) =>
    agent(
      `Du bist ${r.agent} aus ORG.md. Das schwaechste Glied ist gerade ${lage.schwaechstes_glied}: ` +
        `${lage.warum}. Die Zahl steht bei ${lage.zahl}. Gemessene Lage: ${lage.fenster}. ` +
        `Nenne drei ${r.was}. Jeder Vorschlag mit erwarteter Wirkung auf fiverr_orders_30d, Kosten, ` +
        'Frist bis zur ersten Messung und der Messung, die ihn widerlegt. Keine Zahl ohne Quelle.',
      { label: `vorschlag:${r.key}`, phase: 'Vorschlagen', schema: VORSCHLAG_SCHEMA, agentType: r.agent },
    ),
  (satz, r) =>
    parallel(
      (satz?.vorschlaege ?? []).map((v) => () =>
        agent(
          `Du bist org-skeptiker aus ORG.md. Widerlege diesen Vorschlag von ${r.agent}:\n\n` +
            `Titel: ${v.titel}\nWas: ${v.was}\nWarum jetzt: ${v.warum_jetzt}\n` +
            `Erwartete Wirkung: ${v.erwartete_wirkung}\nKosten: ${v.kosten}\n` +
            `Widerlegt durch: ${v.widerlegt_durch}\n\n` +
            'Rechne jede Zahl selbst nach, gegen die Produktion. Pruefe Einheit, Fenster und ' +
            'Waehrung. Pruefe, ob die Wirkung nur eintritt, wenn eine Definition geweitet wird. ' +
            'Bei Unsicherheit lautet dein Urteil WIDERLEGT.',
          { label: `skeptiker:${v.titel.slice(0, 28)}`, phase: 'Widerlegen', schema: URTEIL_SCHEMA, agentType: 'org-skeptiker' },
        ).then((u) => ({ rolle: r.key, vorschlag: v, urteil: u })),
      ),
    ),
)

const alle = geprueft.filter(Boolean).flat().filter(Boolean)
const haelt = alle.filter((x) => x.urteil?.urteil === 'HAELT')
log(`${alle.length} Vorschlaege geprueft, ${haelt.length} halten`)

phase('Entscheiden')
const entscheidung = await agent(
  'Du bist org-produkt aus ORG.md und entscheidest, was in diesem Lauf gebaut wird. WIP = 1, also ' +
    'genau eine Sache. Grundlage:\n\n' +
    `Schwaechstes Glied: ${lage.schwaechstes_glied} (${lage.warum})\n\n` +
    `Was gehalten hat:\n${JSON.stringify(haelt, null, 1)}\n\n` +
    `Was widerlegt wurde, mit Begruendung:\n${JSON.stringify(alle.filter((x) => x.urteil?.urteil !== 'HAELT'), null, 1)}\n\n` +
    'Waehle eine Sache nach Wirkung je Aufwand. Wenn nichts gehalten hat, sag das und nenne die ' +
    'Messung, die die naechste Runde zuerst braucht. Schreibe keinen Code, entscheide nur.',
  { label: 'entscheiden', phase: 'Entscheiden', agentType: 'org-produkt' },
)

return { lage, haelt, widerlegt: alle.filter((x) => x.urteil?.urteil !== 'HAELT'), entscheidung }
