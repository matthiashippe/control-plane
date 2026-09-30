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
  /**
   * Wofuer man es braucht, in einer halben Zeile. Steht als Zeile unter dem Titel, damit jemand,
   * der den Titel nicht versteht, nach vier Woertern weiss, ob er richtig ist.
   */
  readonly fuer: string;
  /**
   * Was man bekommt, in drei Zeilen. Am 30.09.2026 stand das als ein Absatz von 240 Zeichen unter
   * jedem Angebot; ein Mensch ueberspringt einen Absatz und liest drei Haken. Jede Zeile ist eine
   * Zusage, die der Code haelt: die Zahl der Fassungen, die Zahl der Runden, das Format.
   */
  readonly punkte: readonly string[];
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
    fuer: "Für Geburtstag, Hochzeit oder Jubiläum",
    punkte: [
      "Drei fertige Fassungen, aus denen Sie eine wählen",
      "So lang, wie Sie sie brauchen: kurz oder ausführlich",
      "Dreimal sagen, was anders werden soll, ohne Aufpreis",
    ],
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
    fuer: "Für eine bestimmte Stelle, aus der Anzeige geschrieben",
    punkte: [
      "Drei fertige Fassungen, aus denen Sie eine wählen",
      "Geschrieben aus der Stellenanzeige und Ihrem Werdegang",
      "Dreimal sagen, was anders werden soll, ohne Aufpreis",
    ],
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
    fuer: "Für Aushang, Faltblatt oder Internetseite",
    punkte: [
      "Drei fertige Fassungen, aus denen Sie eine wählen",
      "Für Ihren Unterricht, Ihren Laden oder Ihre Praxis",
      "Dreimal sagen, was anders werden soll, ohne Aufpreis",
    ],
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
function buyLink(o: Offer): string {
  return `<a class="btn btn-1" href="/katalog/bestellen?angebot=${o.id}" rel="nofollow">${o.name} bestellen</a>`;
}

/**
 * Was fuer jedes Angebot gilt, einmal ueber dem Raster statt unter jeder Karte.
 *
 * Am 30.09.2026 stand `TEST_MODE_LINE` und `REWORK_LINE` unter jedem der drei Angebote, also
 * sechsmal dasselbe auf einer Seite. Wiederholung liest sich nicht als Zusage, sondern als
 * Kleingedrucktes, und drei Karten mit identischem Fuss sehen aus wie ein Formularausdruck.
 */
const PROMISES: readonly string[] = [
  "Drei Fassungen zur Auswahl",
  "Nachbessern kostet nichts extra",
  "Kein Konto, kein Passwort",
];

/**
 * `buy` is absent while the card path is off, and then there is no button: a button that answers
 * "not switched on" is worse than none.
 */
export function renderCatalog(offers: readonly Offer[] = OFFERS, buy?: { testMode: boolean }): string {
  const cards = offers
    .map(
      (o, i) => `
        <article class="card">
          <div class="card-head">
            <div>
              <h3>${o.name}</h3>
              <p class="price-note" style="margin-top:.3rem">${o.fuer}</p>
            </div>
            <p class="price">${euro(o.priceCents)}</p>
          </div>
          <ul class="feats">${o.punkte.map((t) => `
            <li>${t}</li>`).join("")}
          </ul>
          <div class="card-foot">${buy ? `
            ${buyLink(o)}` : ""}
          </div>
        </article>${
        // One mark after each offer. On a 390 px phone the first card already reaches past the
        // first screen, so every one of these is below the fold there; see test/catalog-page.test.ts.
        mark(`katalog-${i + 1}`)
      }`,
    )
    .join("");
  const ab = offers.length ? euro(Math.min(...offers.map((o) => o.priceCents))) : "";
  return `
  <section>
    <div class="wrap">
      <p class="kicker">Katalog</p>
      <h1 class="ph">Texte, die wir für Sie schreiben</h1>
      <p class="sub prose">Sie sagen uns, worum es geht, und bekommen drei fertige Fassungen zur Auswahl.
        Ab ${ab}.</p>
      <ul class="promises">${PROMISES.map((t) => `
        <li><span class="dot"></span>${t}</li>`).join("")}
      </ul>${
        buy?.testMode
          ? `
      <p class="banner"><b>${TEST_MODE_LINE}</b> Sie können alles ausprobieren, ohne dass etwas berechnet wird.</p>`
          : ""
      }
      ${mark("katalog-top")}
      <div class="grid-cards three">${cards}
      </div>
      <p class="fine prose" style="margin-top:var(--s-8);color:var(--dim)">${DELIVERY_SENTENCE}</p>
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
  opts: {
    testMode: boolean;
    error?: string;
    values?: Readonly<Record<string, string>>;
    email?: string;
    /** The transcript of a finished conversation (HAN-77), shown above the filled form. */
    transcript?: readonly ConversationTurn[];
    note?: string | null;
  },
): string {
  const style = "display:block;width:100%;margin-top:.4rem;font:inherit;padding:.6rem;box-sizing:border-box";
  const fields = o.fields.map((f) => renderField(f, opts.values?.[f.name] ?? "", style)).join("\n        ");
  const top = opts.transcript
    ? `${renderTranscript(opts.transcript)}${opts.note ? `\n      <p role="status"><strong>${esc(opts.note)}</strong></p>` : ""}`
    : conversationStart(o, style);
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Bestellen</p>
      <h1 class="ph">${o.name}</h1>
      <p class="offer-price">${euro(o.priceCents)}</p>
      <p>${o.delivers}</p>
      ${top}${opts.error ? `\n      <p role="alert"><strong>${esc(opts.error)}</strong></p>` : ""}
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

/** One line of a conversation, as src/checkout/conversation.ts stores it. */
export interface ConversationTurn {
  who: "we" | "they";
  text: string;
}

/**
 * The first sentence of the conversation per offer, word for word from Gestalt (HAN-78). "Eine Frage
 * auf einmal" holds because every reply carries at most one question (src/checkout/conversation.ts).
 */
export const CONVERSATION_INVITES: Readonly<Record<string, string>> = {
  "rede-zum-fest":
    "Schreiben Sie einfach, wofür Sie die Rede brauchen, so wie Sie es einem Bekannten erzählen würden. Wenn uns etwas fehlt, fragen wir nach, immer nur eine Frage auf einmal.",
  "anschreiben-bewerbung":
    "Fügen Sie die Stellenanzeige ein, auf die Sie sich bewerben, und schreiben Sie dazu, was Sie mitbringen. Wenn uns etwas fehlt, fragen wir nach, immer nur eine Frage auf einmal.",
  "text-ueber-ihr-angebot":
    "Schreiben Sie in Ihren Worten, was Sie anbieten und für wen, etwa Ihren Unterricht oder Ihren Laden. Wenn uns etwas fehlt, fragen wir nach, immer nur eine Frage auf einmal.",
};

/** Under the invitation, small. True while the form stands below the conversation on the same page. */
export const CONVERSATION_FINE = "Die Fragen stellt eine KI. Wer lieber selbst ausfüllt, nimmt das Formular darunter.";

/**
 * The way into the conversation, above the form on the order page (HAN-77). The form stays below
 * it: whoever wants to type, types; whoever wants to talk, talks. A plain POST and no script,
 * because the CSP in deploy/Caddyfile allows exactly one inline script by hash.
 */
function conversationStart(o: Offer, style: string): string {
  return `<form method="post" action="/katalog/gespraech" style="margin-top:1.6rem;display:grid;gap:.8rem">
        <input type="hidden" name="angebot" value="${o.id}">
        <label for="nachricht">${CONVERSATION_INVITES[o.id] ?? ""}
          <textarea id="nachricht" name="nachricht" rows="4" required maxlength="8000" style="${style}"></textarea>
        </label>
        <p class="fine">${CONVERSATION_FINE}</p>
        <p><button type="submit" class="btn btn-2">Losschicken</button></p>
      </form>`;
}

function renderTranscript(turns: readonly ConversationTurn[]): string {
  const lines = turns
    .map((t) => `<p class="turn"><strong>${t.who === "we" ? "Wir" : "Sie"}:</strong> ${esc(t.text).replace(/\n/g, "<br>")}</p>`)
    .join("\n        ");
  return `<div class="conversation" style="margin-top:1.6rem;display:grid;gap:.6rem">
        ${lines}
      </div>`;
}

/**
 * The conversation while it still has a question (HAN-77): the transcript and a field for the
 * answer. The conversation id goes in the body, never in the address (blocklist 7).
 */
export function renderConversation(
  o: Offer,
  c: { id: string; turns: readonly ConversationTurn[]; question: string; note: string | null },
): string {
  const style = "display:block;width:100%;margin-top:.4rem;font:inherit;padding:.6rem;box-sizing:border-box";
  // The question stands above the answer field, so it is not repeated as the last line.
  const shown = c.turns.at(-1)?.text === c.question ? c.turns.slice(0, -1) : c.turns;
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Bestellen</p>
      <h1 class="ph">${o.name}</h1>
      <p class="offer-price">${euro(o.priceCents)}</p>
      ${renderTranscript(shown)}
      <form method="post" action="/katalog/gespraech" style="margin-top:1.2rem;display:grid;gap:.8rem">
        <input type="hidden" name="angebot" value="${o.id}">
        <input type="hidden" name="gespraech" value="${esc(c.id)}">
        <label for="nachricht">${esc(c.question)}
          <textarea id="nachricht" name="nachricht" rows="4" required maxlength="8000" autofocus style="${style}"></textarea>
        </label>
        <p><button type="submit" class="btn btn-1">Antworten</button></p>
      </form>
      <p class="fine"><a href="/katalog/bestellen?angebot=${o.id}" rel="nofollow">Lieber das Formular</a></p>
    </div>
  </section>`;
}
