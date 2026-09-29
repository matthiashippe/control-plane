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
  /**
   * What the order page asks before payment (Goal 21), in order. Required fields with a minimum
   * each, not one free question: the sceptic found in HAN-24 that a single "x" would otherwise
   * count as an order with a brief.
   */
  readonly fields: readonly OfferField[];
}

/**
 * One field on the order page. Lengths are counted after trimming. A text field also needs two
 * words (see `hasTwoWords` in src/checkout), so "xxxxxxxxxx" is not an occasion.
 */
export type OfferField =
  | { readonly name: string; readonly label: string; readonly kind: "line" | "text"; readonly min: number; readonly max: number }
  | { readonly name: string; readonly label: string; readonly kind: "choice"; readonly options: readonly string[] };

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
    fields: [
      { name: "anlass", label: "Zu welchem Anlass?", kind: "line", min: 3, max: 200 },
      { name: "person", label: "Für wen ist die Rede?", kind: "line", min: 2, max: 200 },
      { name: "laenge", label: "Wie lang darf sie sein?", kind: "choice", options: ["3 Minuten", "5 Minuten", "10 Minuten"] },
      { name: "inhalt", label: "Was soll vorkommen: Namen, eine gemeinsame Geschichte?", kind: "text", min: 40, max: 4000 },
    ],
  },
  {
    id: "anschreiben-bewerbung",
    name: "Anschreiben zur Bewerbung",
    delivers:
      "Sie bekommen drei fertige Fassungen eines Anschreibens für eine bestimmte Stelle, geschrieben " +
      "aus der Stellenanzeige und Ihren Angaben, und können bis zu dreimal sagen, was anders werden soll.",
    priceCents: 2400,
    fields: [
      { name: "stellenanzeige", label: "Fügen Sie die Stellenanzeige ein", kind: "text", min: 200, max: 8000 },
      { name: "erfahrung", label: "Was bringen Sie mit?", kind: "text", min: 40, max: 4000 },
    ],
  },
  {
    id: "text-ueber-ihr-angebot",
    name: "Text über Ihr Angebot",
    delivers:
      "Sie bekommen drei fertige Fassungen eines Textes, der Ihr Angebot vorstellt (etwa Ihren " +
      "Unterricht oder Ihren Laden), für Aushang, Faltblatt oder Internetseite, und können bis zu " +
      "dreimal sagen, was anders werden soll.",
    priceCents: 1700,
    fields: [
      { name: "was", label: "Was bieten Sie an?", kind: "text", min: 10, max: 2000 },
      { name: "fuer_wen", label: "Für wen ist Ihr Angebot?", kind: "line", min: 5, max: 500 },
      { name: "wo", label: "Wo soll der Text stehen?", kind: "choice", options: ["Aushang", "Faltblatt", "Internetseite"] },
    ],
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
 * The way to buy under an offer (Goal 21). A link to the order page, not a form any more: nobody
 * reaches Stripe without first saying what they need and leaving an address.
 *
 * `rel="nofollow"` because the sceptic found in HAN-25 that every crawler follows a plain link and
 * would otherwise land in `order_page_opened`; the order page is `noindex` for the same reason.
 */
function buyLink(o: Offer, testMode: boolean): string {
  return `
        ${testMode ? `<p class="fine">${TEST_MODE_LINE}</p>` : ""}
        <p><a class="btn btn-1" href="/katalog/bestellen?angebot=${o.id}" rel="nofollow">Bestellen</a></p>`;
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
        <p class="fine">${REWORK_LINE}</p>${buy ? buyLink(o, buy.testMode) : ""}
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

/**
 * The sentence under the email field, word for word from Recht (HAN-26, 2026-09-29). It says
 * nothing about sending the texts to that address, because today nobody does.
 */
export const PRIVACY_SENTENCE =
  "Wir speichern Ihre Angaben und Ihre E-Mail-Adresse, um Ihre Bestellung zu bearbeiten und Sie dazu zu erreichen. " +
  "Die Adresse geht an unseren Zahlungsdienst Stripe. Werbung schicken wir Ihnen nicht. " +
  'Mehr dazu in der <a href="/datenschutz">Datenschutzerklärung</a>.';

/** The five characters that can end an HTML text node or an attribute. */
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** One field of the order page, with what was typed if the server sent the page back. */
function renderField(f: OfferField, value: string, style: string): string {
  if (f.kind === "choice") {
    const options = f.options
      .map((o) => `<option${o === value ? " selected" : ""}>${esc(o)}</option>`)
      .join("");
    return `<label for="${f.name}">${f.label}
          <select id="${f.name}" name="${f.name}" required style="${style}"><option value="">Bitte wählen</option>${options}</select>
        </label>`;
  }
  const limits = `minlength="${f.min}" maxlength="${f.max}" required`;
  return f.kind === "text"
    ? `<label for="${f.name}">${f.label}
          <textarea id="${f.name}" name="${f.name}" rows="6" ${limits} style="${style}">${esc(value)}</textarea>
        </label>`
    : `<label for="${f.name}">${f.label}
          <input id="${f.name}" name="${f.name}" type="text" ${limits} value="${esc(value)}" style="${style}">
        </label>`;
}

/**
 * The order page, `/katalog/bestellen?angebot=<id>` (Goal 21): the offer, its required fields, an
 * email field, and the button to Stripe.
 *
 * Every field is `required` with its minimum and maximum (HAN-25, condition 6; HAN-24), so the
 * browser stops an empty or short field and the person keeps what they typed. The server checks
 * again anyway, including the two-word rule the browser cannot check. When it refuses, this page
 * comes back with `error` and with what was typed, rather than a bare 400 that loses the text.
 * The email pattern repeats EMAIL_PATTERN from src/checkout, because a browser accepts `a@b`
 * without a dot and the server does not.
 */
export function renderOrderPage(
  o: Offer,
  opts: { testMode: boolean; error?: string; values?: Readonly<Record<string, string>>; email?: string },
): string {
  const style = "display:block;width:100%;margin-top:.4rem;font:inherit;padding:.6rem;box-sizing:border-box";
  const fields = o.fields.map((f) => renderField(f, opts.values?.[f.name] ?? "", style)).join("\n        ");
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Bestellen</p>
      <h1 class="ph">${o.name}</h1>
      <p class="offer-price">${euro(o.priceCents)}</p>
      <p>${o.delivers}</p>${opts.error ? `\n      <p role="alert"><strong>${esc(opts.error)}</strong></p>` : ""}
      <form method="post" action="/katalog/kaufen" style="margin-top:1.6rem;display:grid;gap:1.2rem">
        <input type="hidden" name="angebot" value="${o.id}">
        ${fields}
        <label for="email">Ihre E-Mail-Adresse
          <input id="email" name="email" type="email" required autocomplete="email" maxlength="254"
            pattern="[^@\\s]+@[^@\\s]+\\.[^@\\s]+" value="${esc(opts.email ?? "")}" style="${style}">
        </label>
        <p class="fine">${PRIVACY_SENTENCE}</p>
        ${opts.testMode ? `<p class="fine">${TEST_MODE_LINE}</p>` : ""}
        <p><button type="submit" class="btn btn-1">Weiter zur Bezahlung</button></p>
      </form>
      <p class="fine"><a href="/katalog">Zurück zum Katalog</a></p>
    </div>
  </section>`;
}
