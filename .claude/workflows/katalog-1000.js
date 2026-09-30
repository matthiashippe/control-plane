export const meta = {
  name: 'katalog-1000',
  description: 'Entwirft einen Katalog aus tausenden Eintraegen: Taxonomie, Lieferbarkeit, Preise, Auffindbarkeit, und die ersten echten Eintraege',
  phases: [
    { title: 'Grundlage', detail: 'was lieferbar ist, was gesucht wird, was der Markt verlangt' },
    { title: 'Entwerfen', detail: 'drei Strukturen fuer tausende Eintraege, aus drei Winkeln' },
    { title: 'Widerlegen', detail: 'je drei Linsen: Lieferbarkeit, Auffindbarkeit, Geld' },
    { title: 'Bauplan', detail: 'eine Struktur, mit echten Eintraegen und der Messung' },
  ],
}

// Matthias am 30.09.2026: "die katalog items sind perfekt? von mehereren swarms analysiert. mach
// ruhig 1000sende katalog items alle mega maximal unterscheidlich. mit geilen eintraegen etc."
//
// Die Gefahr bei tausend Eintraegen ist nicht die Menge, sondern das Versprechen: jeder Eintrag
// sagt einem Menschen, dass wir genau das liefern. Neunhundert, die niemand liefern kann, sind
// neunhundert gebrochene Zusagen. Die zweite Gefahr ist Google: tausend duenne Seiten, die sich
// nur im Wort unterscheiden, sind Doorway Pages und werden abgestraft.
//
// Die Chance ist aber echt: jeder Eintrag ist eine eigene Tuer. Die Messung vom 29.09. zeigt, dass
// "Vorlage" neun- bis neunhundertfach mehr Volumen hat als "schreiben lassen" und ein Sechzehntel
// bis ein Halb im Klick kostet. Tausend genaue Anlaesse treffen genau dort.

const ROOT = '/Users/matthiashippe/GIT/control-plane'
const LAGE = `Das Repo ist ${ROOT}, der Dienst laeuft unter https://postyourprice.com.
Der Katalog steht in src/public/catalog.ts, heute drei Eintraege: Rede zum Fest 19 EUR,
Anschreiben zur Bewerbung 24 EUR, Text ueber Ihr Angebot 17 EUR. Jeder mit drei Fassungen und bis
zu drei Runden Nachbessern. Die Lieferung laeuft ueber src/checkout/deliver.ts und OpenRouter.
Gemessen am 29.09.: drei Fassungen aus drei Anbietern kosten 0,075 EUR und brauchen 19,2 Sekunden
Median. Die Marktmessung (169 Begriffe, Keyword-Planer, Deutschland) liegt in den Tickets der
Firma und in ROADMAP.md.`

const GRUND_SCHEMA = {
  type: 'object',
  properties: {
    befund: { type: 'string' },
    zahlen: { type: 'array', items: { type: 'string' } },
    grenzen: { type: 'array', items: { type: 'string' }, description: 'was NICHT lieferbar oder nicht verkaufbar ist' },
  },
  required: ['befund', 'zahlen'],
}

const ENTWURF_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    kern: { type: 'string' },
    achsen: { type: 'array', items: { type: 'string' }, description: 'die Dimensionen, aus denen die Eintraege entstehen' },
    wie_viele: { type: 'string', description: 'wie viele Eintraege daraus entstehen, gerechnet' },
    beispiele: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titel: { type: 'string' },
          preis_eur: { type: 'number' },
          was_der_kaeufer_bekommt: { type: 'string' },
          fuer_wen: { type: 'string' },
          suchbegriff: { type: 'string' },
          lieferbar_weil: { type: 'string' },
        },
        required: ['titel', 'preis_eur', 'was_der_kaeufer_bekommt', 'suchbegriff', 'lieferbar_weil'],
      },
    },
    auffindbar: { type: 'string', description: 'wie ein Mensch seinen Eintrag findet' },
    gegen_duenne_seiten: { type: 'string', description: 'was jede Seite einzigartig und wertvoll macht' },
  },
  required: ['name', 'kern', 'achsen', 'wie_viele', 'beispiele', 'auffindbar'],
}

const LINSE_SCHEMA = {
  type: 'object',
  properties: {
    haelt: { type: 'boolean' },
    toedlich: { type: 'string' },
    gruende: { type: 'array', items: { type: 'string' } },
    rettung: { type: 'string' },
    note: { type: 'number' },
  },
  required: ['haelt', 'gruende', 'note'],
}

phase('Grundlage')
const GRUND = [
  {
    key: 'lieferbar',
    prompt:
      'Was kann diese Lieferkette wirklich? Lies src/checkout/deliver.ts, src/public/catalog.ts und ' +
      'goals/2026-09-29-goal-23-bekommen.md. Sag genau, welche Formate heute entstehen koennen ' +
      '(reiner Text? Struktur? Laenge?), was die Kette NICHT kann (Bilder, PDF, Tabellen, Code, ' +
      'Uebersetzung?), und was ein neues Format je kosten wuerde, in Cent und in Aenderung am Code. ' +
      'Eine Zeile je Grenze. Das ist die Liste, an der jeder Katalogentwurf scheitert oder nicht.',
  },
  {
    key: 'nachfrage',
    prompt:
      'Wonach suchen Menschen, das eine Textkette liefern kann? Miss es, statt es zu raten: nimm ' +
      'die Methode aus den Marktmessungen der Firma (Keyword-Planer ueber das PropertyPilot-Konto, ' +
      'kleinanzeigen.de als Anbieterdichte, hypestat). Liefere dreissig Themenfelder mit Volumen und ' +
      'Klickpreis, sortiert, und sag bei jedem, ob "Vorlage" oder "schreiben lassen" das groessere ' +
      'Feld ist. Die gemessene Wortgrenze: Vorlage hat neun- bis neunhundertfach mehr Volumen und ' +
      'kostet ein Sechzehntel bis ein Halb im Klick.',
  },
  {
    key: 'seo',
    prompt:
      'Was macht tausend Seiten zu tausend Tueren statt zu tausend Doorway Pages? Recherchiere, ' +
      'was Google 2026 als "scaled content abuse" behandelt und was nicht, und was Wettbewerber mit ' +
      'grossen Katalogen tun (Vorlagen-Portale, Fiverr-Kategorien, Etsy-Nischen). Nenne die drei ' +
      'Eigenschaften, die eine einzelne Seite tragen muessen, damit sie eigenstaendig ist, und die ' +
      'drei Fehler, die einen Katalog dieser Groesse zuverlaessig abstrafen lassen.',
  },
]

const grund = await parallel(
  GRUND.map((g) => () =>
    agent(`${LAGE}\n\n${g.prompt}\n\nKeine Zahl ohne Quelle und Fenster. Was du nicht messen kannst, sag als nicht messbar.`,
      { label: `grundlage:${g.key}`, phase: 'Grundlage', schema: GRUND_SCHEMA }),
  ),
)
const basis = GRUND.map((g, i) => `### ${g.key}\n${grund[i]?.befund ?? '-'}\n${(grund[i]?.zahlen ?? []).join('\n')}\n${(grund[i]?.grenzen ?? []).join('\n')}`).join('\n\n')
log('Grundlage steht, drei Strukturen laufen an')

const WINKEL = [
  {
    key: 'anlass',
    was:
      'Nach Anlass. Der Mensch sucht "Rede zum 80. Geburtstag", nicht "Textdienstleistung". Die ' +
      'Achsen sind Anlass mal Rolle mal Ton. Tausend Eintraege entstehen aus der Kombination, und ' +
      'jeder traegt einen eigenen Suchbegriff mit gemessenem Volumen.',
  },
  {
    key: 'beruf',
    was:
      'Nach Beruf. Der Mensch sucht als Klavierlehrerin, Physiotherapeut, Hausverwalter, Dachdecker. ' +
      'Die Achsen sind Beruf mal Aufgabe. Jeder Eintrag spricht die Sprache dieses Berufs und nennt ' +
      'seine Fachwoerter, was ihn von jedem allgemeinen Angebot unterscheidet.',
  },
  {
    key: 'moment',
    was:
      'Nach Moment im Leben. Der Mensch sucht, weil etwas passiert ist: Kuendigung, Umzug, Todesfall, ' +
      'Gruendung, Hochzeit, Streit mit dem Vermieter. Die Achsen sind Moment mal Gegenueber. Der ' +
      'Katalog ist hier kein Warenregal, sondern eine Liste von Situationen.',
  },
]

phase('Entwerfen')
const geprueft = await pipeline(
  WINKEL,
  (w) =>
    agent(
      `${LAGE}\n\nDie gemessene Grundlage:\n\n${basis}\n\n` +
        `Entwirf den Katalog aus diesem Winkel:\n\n${w.was}\n\n` +
        'Rechne aus, wie viele Eintraege deine Achsen ergeben. Liefere **zehn echte Beispiele**, ' +
        'ausformuliert, wie sie auf der Seite stehen wuerden: Titel, Preis in Euro, was der Kaeufer ' +
        'bekommt, fuer wen, der Suchbegriff mit Volumen, und warum die Kette es liefern kann. ' +
        'Deutsch, konkret, kein Marketing, kein Gedankenstrich, kein Fachjargon. Die Leserin ist ' +
        'eine siebzigjaehrige Klavierlehrerin. Sag, wie ein Mensch in deinem Katalog seinen Eintrag ' +
        'findet, und was jede einzelne Seite eigenstaendig macht.',
      { label: `entwurf:${w.key}`, phase: 'Entwerfen', schema: ENTWURF_SCHEMA },
    ),
  (e, w) =>
    parallel(
      [
        {
          key: 'lieferbar',
          frage:
            'Die Linse Lieferbarkeit. Nimm die zehn Beispiele einzeln und pruefe gegen die Grenzen der ' +
            'Kette: kann sie das wirklich, in drei Fassungen, ohne neue Formate? Wie viele der ' +
            'tausend Eintraege waeren nicht lieferbar? Ein Katalog, der verspricht, was er nicht ' +
            'liefert, ist schlimmer als ein kleiner Katalog.',
        },
        {
          key: 'finden',
          frage:
            'Die Linse Auffindbarkeit. Findet ein Mensch in diesem Katalog seinen Fall in zehn ' +
            'Sekunden? Tausend Eintraege auf einer Seite sind unbenutzbar. Pruefe den Weg: Suche, ' +
            'Kategorien, Einstieg ueber Google. Und pruefe hart gegen Doorway Pages: was hier ' +
            'entsteht, sind tausend Seiten, die sich im Wesentlichen im Titel unterscheiden. Warum ' +
            'ist das kein scaled content abuse?',
        },
        {
          key: 'geld',
          frage:
            'Die Linse Geld. Traegt jeder Preis? Rechne die Lieferkosten gegen den Preis und gegen ' +
            'den gemessenen Klickpreis des jeweiligen Suchbegriffs. Der Break-even einer bezahlten ' +
            'Anzeige liegt bei 11,13 EUR je Kunde. Pruefe auch die Pflegekosten: wer haelt tausend ' +
            'Eintraege aktuell, und was kostet eine Preisaenderung ueber alle?',
        },
      ].map((l) => () =>
        agent(
          `${LAGE}\n\n${l.frage}\n\nDer Entwurf:\n${JSON.stringify(e, null, 1)}\n\n` +
            'Deine Aufgabe ist, ihn umzubringen. Jeder Befund mit Beleg. Bei Unsicherheit haelt er nicht.',
          { label: `linse:${w.key}:${l.key}`, phase: 'Widerlegen', schema: LINSE_SCHEMA },
        ).then((u) => ({ winkel: w.key, linse: l.key, urteil: u })),
      ),
    ).then((urteile) => ({ winkel: w.key, entwurf: e, urteile: urteile.filter(Boolean) })),
)

const bewertet = geprueft.filter(Boolean).map((g) => ({
  ...g,
  note: g.urteile.reduce((s, u) => s + (u.urteil?.note ?? 0), 0) / Math.max(1, g.urteile.length),
  toedlich: g.urteile.filter((u) => !u.urteil?.haelt).map((u) => `${u.linse}: ${u.urteil?.toedlich || u.urteil?.gruende?.[0]}`),
}))
bewertet.sort((a, b) => b.note - a.note)
for (const b of bewertet) log(`${b.winkel}: Note ${b.note.toFixed(1)}, ${b.toedlich.length} toedliche Einwaende`)

phase('Bauplan')
const bauplan = await agent(
  `${LAGE}\n\nDrei Entwuerfe, je von drei Linsen angegriffen:\n${JSON.stringify(bewertet, null, 1)}\n\n` +
    'Schreibe den Bauplan fuer den grossen Katalog. Nimm den bestbewerteten Entwurf, uebernimm aus ' +
    'den anderen, was nachweislich besser ist, und beantworte jeden toedlichen Einwand einzeln: ' +
    'geloest, oder ausdruecklich in Kauf genommen mit Begruendung.\n\n' +
    'Der Plan nennt:\n' +
    '1. Die Struktur: welche Achsen, wie viele Eintraege, wie sie entstehen (von Hand, generiert, ' +
    'oder beides).\n' +
    '2. Das Datenmodell: wo die Eintraege liegen, wie eine Preisaenderung ueber alle geht.\n' +
    '3. Den Weg des Menschen: wie er seinen Eintrag findet, von Google und von der Startseite.\n' +
    '4. Die Staffelung: welche 20 Eintraege zuerst, welche 200 danach, woran man merkt, dass es ' +
    'traegt, bevor man auf tausend geht.\n' +
    '5. Je Schritt die Messung, die zeigt, ob er wirkt, und die, die ihn widerlegt.\n' +
    'Schreibe keinen Code. Die ersten 20 Eintraege aber ausformuliert, so wie sie auf der Seite stehen.',
  { label: 'bauplan', phase: 'Bauplan' },
)

return { grundlage: grund.filter(Boolean), bewertet, bauplan }
