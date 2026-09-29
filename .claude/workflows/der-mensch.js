export const meta = {
  name: 'der-mensch',
  description: 'Entwirft Katalog, Gespraech und Lieferung fuer einen Menschen ohne Wallet, drei unabhaengige Entwuerfe, adversarisch geprueft',
  phases: [
    { title: 'Grundlage', detail: 'was die Seite heute ist, was eine Lieferung kostet, was gemessen nachgefragt wird' },
    { title: 'Entwerfen', detail: 'drei unabhaengige Entwuerfe des ganzen Ablaufs, aus drei Winkeln' },
    { title: 'Widerlegen', detail: 'je drei Linsen auf jeden Entwurf: Mensch, Geld, Lieferkette' },
    { title: 'Bauplan', detail: 'ein Ablauf, aus dem Sieger gebaut, mit dem Besten der anderen' },
  ],
}

// Matthias am 29.09.2026: "für den menschen musst du die experience menschlich gestalten. also
// einen katalog. dann einen chat bei dem man chatten kann und anforderungen spezifizieren kann
// etc nachfragen stellen kann alles das bitte. es muss krank geil werden."
//
// Drei Entwuerfe statt einer und dann iterieren: der Loesungsraum ist breit, und ein Entwurf, der
// nur verbessert wird, bleibt in der Ecke, in der er gestartet ist. Jeder Entwurf wird von drei
// Linsen angegriffen, weil ein Ablauf auf drei verschiedene Weisen scheitern kann und Redundanz
// nur eine davon findet.

const ROOT = '/Users/matthiashippe/GIT/control-plane'
const rolle = (datei) =>
  `Lies zuerst ORG.md, ZIELE.md und .claude/agents/${datei}.md in ${ROOT}. ` +
  `Du bist diese Rolle und haeltst dich an ihre Regeln und ihre Ausgabeform. `

const GRUND_SCHEMA = {
  type: 'object',
  properties: {
    befund: { type: 'string', description: 'was gemessen wurde, mit Quelle und Fenster' },
    zahlen: { type: 'array', items: { type: 'string' } },
    offen: { type: 'array', items: { type: 'string' } },
  },
  required: ['befund', 'zahlen'],
}

const ENTWURF_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    kern: { type: 'string', description: 'der Entwurf in einem Satz' },
    ablauf: { type: 'array', items: { type: 'string' }, description: 'Schritt fuer Schritt aus der Sicht des Menschen' },
    bildschirme: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          zweck: { type: 'string' },
          oben: { type: 'string', description: 'der eine Satz, der oben steht, woertlich' },
          handlung: { type: 'string', description: 'die eine Handlung, die er anbietet' },
          inhalt: { type: 'string' },
        },
        required: ['name', 'zweck', 'oben', 'handlung'],
      },
    },
    produkte: { type: 'array', items: { type: 'string' }, description: 'was im Katalog steht, mit Preis ueber 11 EUR' },
    lieferung: { type: 'string', description: 'wie die Fassungen entstehen, mit Modellen, Kosten und Zeit' },
    was_daran_neu_ist: { type: 'string' },
    was_scheitern_kann: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'kern', 'ablauf', 'bildschirme', 'produkte', 'lieferung'],
}

const LINSE_SCHEMA = {
  type: 'object',
  properties: {
    haelt: { type: 'boolean' },
    toedlich: { type: 'string', description: 'der eine Einwand, der den Entwurf umbringt, oder leer' },
    gruende: { type: 'array', items: { type: 'string' } },
    rettung: { type: 'string', description: 'was den Entwurf retten wuerde, falls er zu retten ist' },
    note: { type: 'number', description: '0 bis 10' },
  },
  required: ['haelt', 'gruende', 'note'],
}

phase('Grundlage')
const GRUND = [
  {
    key: 'seite',
    rolle: 'org-gestalt',
    prompt:
      'Sieh dir an, was auf https://postyourprice.com heute wirklich steht: die Startseite, /post, ' +
      '/jobs, /fix, /terms, und die Quellen in src/public/. Sag, was ein Mensch ohne Wallet dort ' +
      'heute tun kann und woran er scheitert. Woertliche Saetze, die schon da sind und bleiben ' +
      'koennen, und die, die weg muessen.',
  },
  {
    key: 'kosten',
    rolle: 'org-lieferkette',
    prompt:
      'Miss, was eine Lieferung wirklich kostet und dauert. Lies ops/compete.ts, ops/db-report.cjs ' +
      'und die Preise der Modelle, und rechne: drei Fassungen aus drei Modellen fuer ein Briefing ' +
      'von 300 Woertern, in Cent und in Minuten. Nenne die Quelle jeder Zahl. Keine Schaetzung ' +
      'ohne Kennzeichnung.',
  },
  {
    key: 'nachfrage',
    rolle: 'org-nachfrage',
    prompt:
      'Welche drei Sachen kann man einem Menschen fuer 25 bis 300 EUR verkaufen, die eine ' +
      'Agentenkette in Minuten liefern kann, und fuer die es gemessene Nachfrage gibt? Miss die ' +
      'Nachfrage in Anfragen je Monat und nenne den Klickpreis, mit der Methode aus ' +
      'ops/ und aus dem Brain (Keyword-Planer, Sitemap zaehlen, hypestat, ahrefstop). Keine ' +
      'Behauptung ohne Zahl.',
  },
]

const grund = await parallel(
  GRUND.map((g) => () =>
    agent(rolle(g.rolle) + g.prompt, { label: `grundlage:${g.key}`, phase: 'Grundlage', schema: GRUND_SCHEMA }),
  ),
)
const lage = GRUND.map((g, i) => `### ${g.key}\n${grund[i]?.befund ?? 'nichts'}\n${(grund[i]?.zahlen ?? []).join('\n')}`).join('\n\n')
log('Grundlage steht, drei Entwuerfe laufen an')

// Drei Winkel, absichtlich unvereinbar. Ein Entwurf, der alle drei gleichzeitig sein will, ist
// keiner.
const WINKEL = [
  {
    key: 'laden',
    was:
      'Der Laden. Der Katalog ist das Produkt: feste Pakete mit festem Preis und fester Lieferzeit, ' +
      'Kaufen in zwei Klicks, das Gespraech kommt NACH dem Kauf und praezisiert nur noch. Vorbild ' +
      'ist der Gig bei Fiverr, den ihr Geschaeftsbericht als "streamlined browsing, searching and ' +
      'purchasing" beschreibt.',
  },
  {
    key: 'gespraech',
    was:
      'Das Gespraech zuerst. Der Mensch sagt in eigenen Worten, was er braucht, das System stellt ' +
      'Nachfragen und schlaegt am Ende Umfang und Preis vor. Der Katalog ist nur der Einstieg fuer ' +
      'die, die nicht wissen, was sie wollen.',
  },
  {
    key: 'probe',
    was:
      'Die Probe. Der Mensch bekommt zuerst etwas zu sehen, umsonst und in einer Minute, und ' +
      'bezahlt erst fuer die vollstaendige Lieferung und die Runden. Das Versprechen "schnell und ' +
      'zur Auswahl" wird bewiesen, bevor Geld verlangt wird.',
  },
]

const geprueft = await pipeline(
  WINKEL,
  (w) =>
    agent(
      rolle('org-gestalt') +
        `Entwirf den ganzen Ablauf fuer einen Menschen ohne Wallet, aus diesem Winkel:\n\n${w.was}\n\n` +
        `Die gemessene Grundlage:\n\n${lage}\n\n` +
        'Gib den Ablauf Schritt fuer Schritt, jeden Bildschirm mit dem einen Satz, der oben steht, ' +
        'woertlich und auf Deutsch, ohne Fachjargon und ohne Gedankenstrich. Nenne die Produkte im ' +
        'Katalog mit Preisen ueber 11 EUR und sag, wie die Fassungen entstehen. Sei konkret genug, ' +
        'dass man es bauen kann.',
      { label: `entwurf:${w.key}`, phase: 'Entwerfen', schema: ENTWURF_SCHEMA },
    ),
  (e, w) =>
    parallel(
      [
        {
          key: 'mensch',
          rolle: 'org-gestalt',
          frage:
            'Die Linse Mensch: Versteht jemand ohne Fachbegriffe in zehn Sekunden, was er hier tun ' +
            'kann? Wo bricht er ab? Ist ein Satz auf einem Bildschirm Werbesprache statt Auskunft? ' +
            'Wuerde Matthias Mutter das bedienen koennen?',
        },
        {
          key: 'geld',
          rolle: 'org-skeptiker',
          frage:
            'Die Linse Geld: Traegt der Preis? Rechne Kosten je Bestellung gegen den Preis, mit den ' +
            'gemessenen Inferenzkosten und der Kartengebuehr (bei 1 EUR frisst sie 26,5 Prozent). ' +
            'Pruefe, ob der Entwurf eine Zahl braucht, die es nicht gibt. Bei Unsicherheit haelt er nicht.',
        },
        {
          key: 'kette',
          rolle: 'org-lieferkette',
          frage:
            'Die Linse Lieferkette: Kann eine Agentenkette das wirklich in der versprochenen Zeit ' +
            'liefern, in der versprochenen Qualitaet, drei verschiedene Fassungen? Was passiert beim ' +
            'ersten Fehlschlag? Wo luegt das Versprechen auf der Seite die Kette an?',
        },
      ].map((l) => () =>
        agent(
          rolle(l.rolle) +
            `Pruefe diesen Entwurf adversarisch. Deine Aufgabe ist, ihn umzubringen, nicht ihn zu ` +
            `verbessern.\n\n${l.frage}\n\nDer Entwurf:\n${JSON.stringify(e, null, 1)}`,
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
  rolle('org-produkt') +
    'Schreibe den Bauplan. Nimm den bestbewerteten Entwurf als Grundlage, uebernimm aus den anderen ' +
    'beiden, was nachweislich besser ist, und beantworte jeden toedlichen Einwand einzeln: entweder ' +
    'geloest, oder ausdruecklich in Kauf genommen mit Begruendung.\n\n' +
    `Die Entwuerfe mit ihren Urteilen:\n${JSON.stringify(bewertet, null, 1)}\n\n` +
    'Der Bauplan nennt: die Bildschirme in der Reihenfolge des Menschen mit ihren woertlichen ' +
    'Texten, das Datenmodell (Tabellen und Felder), die Endpunkte, die Lieferkette, und die ' +
    'Reihenfolge des Bauens in Schritten, bei der nach jedem Schritt etwas Benutzbares dasteht. ' +
    'Nenne zu jedem Schritt die Messung, die zeigt, ob er wirkt. Schreibe keinen Code.',
  { label: 'bauplan', phase: 'Bauplan' },
)

return { grundlage: grund.filter(Boolean), bewertet, bauplan }
