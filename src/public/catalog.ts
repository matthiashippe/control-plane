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
   * Was man bekommt, in Haken statt als Absatz. Am 30.09.2026 stand das als ein Absatz von 240
   * Zeichen unter jedem Angebot; ein Mensch ueberspringt einen Absatz und liest Haken. Jede Zeile
   * ist eine Zusage, die der Code haelt. "Drei fertige Fassungen" stand bis HAN-93 als erste Zeile
   * auf jeder Karte und steht jetzt einmal ueber dem Raster (PROMISES), weil es fuer alle gilt.
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
      "Im Ton, den Sie angeben: herzlich, heiter oder ruhig",
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
      "Auf die Stelle bezogen, nicht als Vorlage zum Ausfüllen",
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
      "Passend für Aushang, Faltblatt oder Internetseite",
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
  return `<a class="btn btn-1" href="/katalog/bestellen?angebot=${o.id}" rel="nofollow">Bestellen<span class="vh"> ${o.name}</span></a>`;
}

/**
 * Was fuer jedes Angebot gilt, einmal ueber dem Raster statt unter jeder Karte.
 *
 * Am 30.09.2026 stand `TEST_MODE_LINE` und `REWORK_LINE` unter jedem der drei Angebote, also
 * sechsmal dasselbe auf einer Seite. Wiederholung liest sich nicht als Zusage, sondern als
 * Kleingedrucktes, und drei Karten mit identischem Fuss sehen aus wie ein Formularausdruck.
 */
export /**
 * Zwei Faenge aus der ersten echten Lieferung dieses Dienstes, Zeile 1 in `deliveries`,
 * geschrieben am 30.09.2026 um 00:34 UTC fuer die Bestellung "Text ueber Ihr Angebot".
 *
 * Sie stehen hier, weil niemand Text kauft, ohne Text gesehen zu haben. Der Katalog hatte bis
 * heute Morgen nichts anzusehen: drei Ueberschriften und drei Preise.
 *
 * Woertlich uebernommen und nur am Satzende gekuerzt. Die dritte Fassung fehlt, weil sie den
 * Namen eines internen Tickets im Text traegt ("Café HAN-70"), was ein Fehler der Kette ist und
 * als eigener Befund an den CTO ging. Ein Beispiel, das einen Fehler zeigt, waere ehrlich und
 * trotzdem falsch: es zeigt nicht, was ein Kaeufer bekommt, sondern was schiefging.
 */
const SAMPLE: readonly string[] = [
  "Morgens, wenn die ersten Pendler aus der Bahn kommen, liegt schon der Duft frisch gerösteter " +
    "Bohnen in der Luft: In unserem kleinen Café in Hamburg rösten wir direkt vor Ort in der " +
    "eigenen Rösterei. Wer es eilig hat, bekommt seinen Kaffee schnell auf die Hand.",
  "Guten Morgen, liebe Nachbarn und Pendler! Brauchen Sie einen freundlichen Ort für den ersten " +
    "Kaffee des Tages oder ein kleines Stück Glück zum Wochenende? Bei uns im kleinen Café mit " +
    "eigener Rösterei in Hamburg duftet es morgens frisch geröstet.",
];

const PROMISES: readonly string[] = [
  "Drei fertige Fassungen zur Auswahl",
  "Kein Konto, kein Passwort",
  "Bezahlen mit Karte",
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
              <p class="price-note">${o.fuer}</p>
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
      <p class="sub prose">Sie sagen uns, worum es geht, und wir schreiben den Text. Ab ${ab}.</p>
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
      <h2 style="margin-top:var(--s-16)">So sieht eine Lieferung aus</h2>
      <p class="sub prose" style="margin-top:var(--s-3)">Zwei von drei Fassungen für dieselbe
        Bestellung: ein Text über ein Café mit eigener Rösterei. Beide sind wirklich so
        ausgeliefert worden, gekürzt auf den Anfang.</p>
      <div class="sample">${SAMPLE.map((t, i) => `
        <figure>
          <figcaption>Fassung ${i + 1}</figcaption>
          <p>${t}</p>
        </figure>`).join("")}
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
function renderField(f: OfferField, value: string): string {
  if (f.kind === "choice") {
    const options = f.options
      .map((o) => `<option${o === value ? " selected" : ""}>${esc(o)}</option>`)
      .join("");
    return `<label for="${f.name}">${f.label}
          <select id="${f.name}" name="${f.name}" required><option value="">Bitte wählen</option>${options}</select>
        </label>`;
  }
  const limits = `minlength="${f.min}" maxlength="${f.max}" required`;
  return f.kind === "text"
    ? `<label for="${f.name}">${f.label}
          <textarea id="${f.name}" name="${f.name}" rows="6" ${limits}>${esc(value)}</textarea>
        </label>`
    : `<label for="${f.name}">${f.label}
          <input id="${f.name}" name="${f.name}" type="text" ${limits} value="${esc(value)}">
        </label>`;
}

/** A banner that stands once over everything on the page, while payments are in test mode. */
const testBanner = (testMode: boolean): string =>
  testMode ? `\n      <p class="banner"><b>${TEST_MODE_LINE}</b> Sie können alles ausprobieren, ohne dass etwas berechnet wird.</p>` : "";

/**
 * The top of every step of one order: the name and the price on one line, what it is for, what
 * holds for every offer, and the test-mode banner. The same on the order page and in the
 * conversation, so a person sees at each step what they are buying and for how much.
 */
function orderHead(o: Offer, testMode: boolean): string {
  return `<p class="kicker">Bestellen</p>
      <div class="order-head">
        <h1 class="ph">${o.name}</h1>
        <p class="price">${euro(o.priceCents)}</p>
      </div>
      <p class="price-note">${o.fuer}</p>
      <ul class="promises">${PROMISES.map((t) => `
        <li><span class="dot"></span>${t}</li>`).join("")}
      </ul>${testBanner(testMode)}`;
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
 *
 * One first action (HAN-93). Until 2026-09-30 the conversation and the whole form stood one under
 * the other, each with its own button, and the first field a person saw was the fifth thing on the
 * page. Now the conversation is the first field and the form is folded under it. After a finished
 * conversation, or when the server sent the form back with an error, the form is the next step and
 * stands open.
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
  const fields = o.fields.map((f) => renderField(f, opts.values?.[f.name] ?? "")).join("\n        ");
  const error = opts.error ? `\n        <p class="banner" role="alert"><b>${esc(opts.error)}</b></p>` : "";
  const form = `<form method="post" action="/katalog/kaufen">
        <input type="hidden" name="angebot" value="${o.id}">${error}
        ${fields}
        <label for="email">Ihre E-Mail-Adresse
          <input id="email" name="email" type="email" required autocomplete="email" maxlength="254"
            pattern="[^@\\s]+@[^@\\s]+\\.[^@\\s]+" value="${esc(opts.email ?? "")}">
        </label>
        <p class="fine">${PRIVACY_SENTENCE}</p>
        <p><button type="submit" class="btn btn-1">Weiter zur Bezahlung</button></p>
      </form>`;
  const open = Boolean(opts.transcript || opts.error);
  const body = opts.transcript
    ? `${renderTranscript(opts.transcript)}${opts.note ? `\n      <p class="banner" role="status"><b>${esc(opts.note)}</b></p>` : ""}
      <div class="ask">
      ${form}
      </div>`
    : `${conversationStart(o)}
      <details class="self"${open ? " open" : ""}>
        <summary>${SELF_FILL}</summary>
      ${form}
      </details>`;
  return `
  <section class="shop">
    <div class="wrap narrow">
      ${orderHead(o, opts.testMode)}
      ${body}
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

/** Under the invitation, small. The way to the form is the fold below it (SELF_FILL), so it is not said twice. */
export const CONVERSATION_FINE = "Die Fragen stellt eine KI.";


/** The fold that holds the form under the conversation. */
export const SELF_FILL = "Lieber alles selbst in ein Formular eintragen";

/**
 * The way into the conversation, the first field on the order page (HAN-77, HAN-93). A plain POST
 * and no script, because the CSP in deploy/Caddyfile allows exactly one inline script by hash.
 */
function conversationStart(o: Offer): string {
  return `<form class="ask" method="post" action="/katalog/gespraech">
        <input type="hidden" name="angebot" value="${o.id}">
        <label for="nachricht">${CONVERSATION_INVITES[o.id] ?? ""}
          <textarea id="nachricht" name="nachricht" rows="5" required maxlength="8000"></textarea>
        </label>
        <p><button type="submit" class="btn btn-1">Losschicken</button></p>
        <p class="fine">${CONVERSATION_FINE}</p>
      </form>`;
}

function renderTranscript(turns: readonly ConversationTurn[]): string {
  const lines = turns
    .map(
      (t) =>
        `<p class="turn ${t.who}"><span class="by">${t.who === "we" ? "Wir" : "Sie"}</span>${esc(t.text).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n        ");
  return `<div class="conversation">
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
  testMode = false,
): string {
  // The question stands above the answer field, so it is not repeated as the last line.
  const shown = c.turns.at(-1)?.text === c.question ? c.turns.slice(0, -1) : c.turns;
  return `
  <section class="shop">
    <div class="wrap narrow">
      ${orderHead(o, testMode)}
      ${renderTranscript(shown)}
      <form class="ask" method="post" action="/katalog/gespraech">
        <input type="hidden" name="angebot" value="${o.id}">
        <input type="hidden" name="gespraech" value="${esc(c.id)}">
        <label for="nachricht">${esc(c.question)}
          <textarea id="nachricht" name="nachricht" rows="4" required maxlength="8000" autofocus></textarea>
        </label>
        <p><button type="submit" class="btn btn-1">Antworten</button></p>
      </form>
      <p class="fine"><a href="/katalog/bestellen?angebot=${o.id}" rel="nofollow">${SELF_FILL}</a></p>
    </div>
  </section>`;
}
