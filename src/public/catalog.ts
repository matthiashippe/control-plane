/**
 * The catalogue: what a person without a wallet can buy here, what it costs, what they get.
 *
 * Built on 2026-09-30 for HAN-14, proposal A from HAN-7 with the three conditions the sceptic set
 * in HAN-11. The buyer is a person, so the page is German and says nothing a person has to
 * translate: no "job", no "agent", no "USDC".
 *
 * Every sentence here was checked against the code before it went in, and two of the first draft
 * failed. "Up to four times" was wrong: `MAX_ROUNDS = 4` in src/bounties/store.ts counts the first
 * version as round one, so a buyer can ask for changes three times. "Three different AI programs,
 * no outside provider" was wrong twice: /v1/models served two OpenAI models on 2026-09-29, and
 * OpenAI is an outside provider. What stands instead is what is true in any configuration.
 *
 * No sentence names a time. The 19.2 s median measured on 2026-09-29 is the chain's compute time,
 * not an order a person has lived through, and there is no such order yet.
 */

export interface Offer {
  /** Fixed, because a form posts it and a Stripe session carries it (Goal 20). Never rename. */
  readonly id: string;
  readonly name: string;
  readonly delivers: string;
  /** Gross, in euro cents. Not millicents and not dollars: this is what a person pays. */
  readonly priceCents: number;
}

/**
 * The three offers, as one constant so a price change is one line.
 *
 * Wording by the CMO (HAN-12, 2026-09-29 19:25 and 19:27 UTC). Prices by the CFO (HAN-13, 19:26
 * UTC): 19 and 24 EUR confirmed, the third raised from 15 to 17 EUR, because at 15 EUR its
 * contribution at the cost ceiling is 10.24 EUR, under the 11.13 EUR an advertised customer costs
 * (ops/anzeigen-rechnung.py).
 */
export const OFFERS: readonly Offer[] = [
  {
    id: "rede-zum-fest",
    name: "Rede zum Fest",
    delivers:
      "Sie bekommen drei fertige Fassungen einer Rede für Geburtstag, Hochzeit oder Jubiläum, " +
      "geschrieben aus Ihren Angaben, und können bis zu dreimal sagen, was anders werden soll.",
    priceCents: 1900,
  },
  {
    id: "anschreiben-bewerbung",
    name: "Anschreiben zur Bewerbung",
    delivers:
      "Sie bekommen drei fertige Fassungen eines Anschreibens für eine bestimmte Stelle, geschrieben " +
      "aus der Stellenanzeige und Ihren Angaben, und können bis zu dreimal sagen, was anders werden soll.",
    priceCents: 2400,
  },
  {
    id: "text-ueber-ihr-angebot",
    name: "Text über Ihr Angebot",
    delivers:
      "Sie bekommen drei fertige Fassungen eines Textes, der Ihr Angebot vorstellt (etwa Ihren " +
      "Unterricht oder Ihren Laden), für Aushang, Faltblatt oder Internetseite, und können bis zu " +
      "dreimal sagen, was anders werden soll.",
    priceCents: 1700,
  },
];

/** Who writes the texts. ops/ziele.sh looks for this sentence verbatim on the live page. */
export const DELIVERY_SENTENCE =
  "Alle Texte liefern wir selbst. Sie werden mit KI geschrieben, kein anderer Händler und kein Freiberufler ist beteiligt.";

export const REWORK_LINE = "Nachbessern kostet nichts extra.";

/** "19 €" or "11,13 €": German decimal comma, cents only when there are any. */
export function euro(cents: number): string {
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest ? `${whole},${String(rest).padStart(2, "0")} €` : `${whole} €`;
}

/**
 * A depth mark, lazy like the ones on / and /fix. See the /px/ route in src/app.ts.
 *
 * The catalogue has its own names so ops/traffic.sh can count it per page: HAN-11 found that a
 * reader who scrolled / and then opened the catalogue would otherwise count as a catalogue reader.
 */
const mark = (name: string): string =>
  `<img src="/px/${name}.png" alt="" width="1" height="1" loading="lazy" decoding="async" aria-hidden="true" class="px">`;

/** Shown above every buy button while the Stripe key is a test key. */
export const TEST_MODE_LINE = "Testbetrieb: Es wird kein Geld abgebucht.";

/**
 * The buy button under an offer (Goal 20). It posts the offer id and nothing else: the price is
 * looked up server-side in OFFERS, so there is no field a visitor could change it in.
 */
function buyForm(o: Offer, testMode: boolean): string {
  return `
        ${testMode ? `<p class="fine">${TEST_MODE_LINE}</p>` : ""}
        <form method="post" action="/katalog/kaufen">
          <input type="hidden" name="angebot" value="${o.id}">
          <button type="submit" class="btn btn-1">Kaufen</button>
        </form>`;
}

/**
 * `buy` is absent while the card path is off, and then there is no button: a button that answers
 * "not switched on" is worse than none.
 */
export function renderCatalog(offers: readonly Offer[] = OFFERS, buy?: { testMode: boolean }): string {
  const cards = offers
    .map(
      (o, i) => `
      <div class="offer" data-offer>
        <h2 class="offer-name">${o.name}</h2>
        <p class="offer-price">${euro(o.priceCents)}</p>
        <p>${o.delivers}</p>
        <p class="fine">${REWORK_LINE}</p>${buy ? buyForm(o, buy.testMode) : ""}
      </div>${
        // One mark after each offer. On a 390 px phone the first card already reaches past the
        // first screen, so every one of these is below the fold there; see test/catalog-page.test.ts.
        mark(`katalog-${i + 1}`)
      }`,
    )
    .join("");
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Katalog</p>
      <h1 class="ph">Texte, die wir für Sie schreiben</h1>
      <p class="sub">${DELIVERY_SENTENCE}</p>
      ${mark("katalog-top")}
      <div class="offers" style="margin-top:1.6rem;display:grid;gap:1.4rem">${cards}
      </div>
      ${mark("katalog-end")}
    </div>
  </section>`;
}
