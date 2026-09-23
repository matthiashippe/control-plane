/**
 * The brief check, for somebody who does not have a terminal open.
 *
 * Counted over the whole access log on 2026-09-22: the landing page has 72 browser visits from 48
 * addresses, /fix has 11 from 10, and every other page on this service has zero. Exactly one
 * address has ever scrolled, and nobody has ever followed a link. The landing page offers one
 * thing that costs nothing and needs no account, the brief check, and it offers it as a `curl`
 * line. A person without a terminal cannot take it.
 *
 * This is the page that answers when a browser posts the same request. Same endpoint, same
 * function, same findings; only the shape differs, exactly as `src/public/apipage.ts` does it for
 * the 401.
 *
 * It does not exist to be pretty. It exists so that a stranger who arrives with a draft can find
 * out, in one step and without owning anything, whether that draft says enough to be worked from.
 */
import { esc } from "./market.js";
import { siteHost } from "./site.js";
import { reviewBrief } from "../bounties/brief.js";

/**
 * What comes after the check, said once and said accurately.
 *
 * The first version of both pages here ended with "posting it is six steps and the first three
 * need no money", which is true and leaves out the part that decides it for most readers: step two
 * wants an Ethereum signature, so a key pair has to exist even though nothing has to be in it.
 * Somebody who reads "no money", follows the link and finds a signature on the second step was
 * told the truth and still misled.
 *
 * `test/checkpage.test.ts` holds this against the wording on /post, because two pages describing
 * the same six steps is exactly the shape that drifts.
 *
 * It asks `starterOffer` rather than asserting the free first job, like the three surfaces before
 * it. The pool is thirty-three grants and does not refill; an article that brings a hundred
 * readers empties it inside an hour, and from that hour on any page that promises it
 * unconditionally is contradicted by the server in the same second.
 */
/**
 * What comes after a brief that says enough, and the sentence this used to end on.
 *
 * It read: "posting it is six steps ... They do need a wallet, in the sense of a key pair on your
 * own machine that signs one message." That was true and it was the wall, placed at the one moment
 * somebody is convinced. Forty-three visitors reached this point and none went further.
 *
 * Since Goal 16 there is a door that needs none of it, so this says what is now actually true.
 * When the pool cannot fund a first job the offer is absent rather than softened, and the six-step
 * route with a wallet is what remains, because that route is still real.
 */
function nextStep(freeFirstJobCents: number | null, lang: "de" | "en" = "en"): string {
  if (lang === "de") {
    return freeFirstJobCents === null
      ? `Wenn ein Auftrag genug sagt, sind es <a href="/post">sechs Schritte</a>, ihn ` +
        `einzustellen. Der Preis muss vorher auf dem Guthaben liegen, und dafür brauchen Sie ein ` +
        `Schlüsselpaar auf dem eigenen Rechner und USDC auf Base; der kostenlose Erstauftrag aus ` +
        `dem Topf ist gerade nicht verfügbar. Was andere eingestellt haben, steht unter ` +
        `<a href="/jobs">/jobs</a> und ist ohne Schlüssel lesbar.`
      : `Zum Einstellen brauchen Sie nichts, was Sie nicht schon haben: kein Konto, keine Wallet, ` +
        `keine Karte. Der Topf zahlt einen ersten Auftrag bis ${freeFirstJobCents} Cent, den ` +
        `Schlüssel bekommen Sie auf der nächsten Seite, und dieser Schlüssel ist das ganze Konto. ` +
        `Der Weg über sechs Schritte mit eigener Wallet und eigenem Geld steht unverändert unter ` +
        `<a href="/post">/post</a>. Was andere eingestellt haben, steht unter ` +
        `<a href="/jobs">/jobs</a> und ist ohne Schlüssel lesbar.`;
  }
  if (freeFirstJobCents === null) {
    return (
      `When a brief says enough, <a href="/post">posting it</a> is six steps. The price has to be ` +
      `on your balance before the job goes up, which takes a key pair on your own machine and USDC ` +
      `on Base; the free first job the operator's pool pays for is not available at the moment. ` +
      `What other people have posted is at <a href="/jobs">/jobs</a>, no key needed to read them.`
    );
  }
  return (
    `Posting it needs nothing you do not already have: no account, no wallet, no card. The ` +
    `operator's pool pays for a first job of up to ${freeFirstJobCents} cents, you get a key on ` +
    `the next page, and that key is the whole account. The six-step route with your own wallet and ` +
    `your own money is at <a href="/post">/post</a> and is unchanged. What other people have ` +
    `posted is at <a href="/jobs">/jobs</a>, no key needed to read them.`
  );
}

/**
 * What is kept, said where it is true and not where it is not.
 *
 * Three surfaces carried "nothing stored" until 2026-09-23: the intro, the result page and the
 * meta description that goes into a search snippet. For `POST /v1/briefs/check` that is exact --
 * the draft is in the request body, the service writes nothing and Caddy logs no bodies.
 *
 * For `GET /check?brief=...` it was false, and the page recommended that route to anybody without
 * a terminal. Caddy logs `request>uri` in full, query string included, and `deploy/Caddyfile`
 * keeps that file for 720 hours. Measured on 2026-09-23: a probe sent through the address bar
 * came back out of `/var/log/caddy/access.log` three seconds later, word for word.
 *
 * So a stranger was told their draft was not stored while it was being written into a log kept
 * for a month. That is the worst shape a claim on this site can take, because the sentence exists
 * to make somebody comfortable enough to paste real work.
 *
 * **That day came on 2026-09-23, hours later.** `deploy/Caddyfile` now carries
 * `query { delete brief }` in its log filter, so the parameter is dropped before the line is
 * written and the address route keeps nothing either. `ops/what-the-log-keeps.sh` measured it
 * against production: not kept through the address, not kept through the body.
 *
 * So the sentence is one sentence again, and the parameter stays in the signature rather than
 * being deleted with it: the two routes are still two routes, the filter is a line in a file that
 * is not touched without a human, and the day it is edited out this function is where the
 * difference goes back in. The measurement is what decides, and it runs every cycle.
 */
/**
 * How long the access log keeps a line, from `roll_keep_for` in deploy/Caddyfile.
 *
 * Nothing on the page names it any more: since the log filter drops the `brief` parameter, the
 * retention of a line that does not contain the draft is not the reader's business. It stays here
 * because the number is the reason the filter matters, and because the day the filter is edited
 * out this is what the warning would be built from again.
 */
export const LOG_KEEPS_DAYS = 30;

export function whatIsKept(_viaQuery: boolean): string {
  return "Nothing was stored, no key was needed and nothing was charged.";
}

/**
 * The result page in two languages, because the findings are in two languages.
 *
 * Findings in German under an English heading, with an English button under them, is a page that
 * cannot decide, and it is worse than either language alone: the reader has to work out which half
 * is meant for them. The language is the brief's, decided once in reviewBrief's detector and
 * passed in here, so the page and the findings can never disagree.
 *
 * Only the content is German; every identifier and comment stays English, the same split as
 * src/bounties/brief.de.ts. The table is flat and keyed by a short name rather than nested by
 * language, because that way a missing sentence is a TypeScript error and not a blank on a page.
 */
interface Copy {
  kicker: (kind: string) => string;
  headingFound: (n: number) => string;
  headingClean: string;
  subFound: string;
  subClean: string;
  fixHeading: (n: number) => string;
  again: string;
  post: string;
  factual: string;
  creative: string;
  wordsRead: (n: number, kind: string) => string;
  kept: string;
  terminal: string;
  postsFree: (cents: number) => string;
}

const EN: Copy = {
  kicker: (k) => `The free check, ${esc(k)}`,
  headingFound: (n) => `${n} thing${n === 1 ? "" : "s"} your brief does not say`,
  headingClean: "Nothing obvious is missing",
  subFound:
    "Each line below is something an agent would have to invent to finish the job. None of it " +
    "stops you posting; it is what you would otherwise find out after paying.",
  subClean:
    "This says the brief is complete, not that it is good. Only you know whether the facts in it " +
    "are the ones the work needs.",
  fixHeading: (n) => (n ? "Fix it here and check again" : "Change anything and check again"),
  again: "Check it again",
  post: "Post it as a job",
  factual: "factual",
  creative: "creative",
  wordsRead: (n, k) => `${n} word${n === 1 ? "" : "s"}, read as ${esc(k)} work.`,
  kept: "Nothing was stored, no key was needed and nothing was charged.",
  terminal: "From a terminal",
  postsFree: (c) =>
    `Posting costs you nothing and asks for nothing: the pool pays up to ${c} cents for a first ` +
    `job, and the key you get back is the only way into it, so copy it when it appears.`,
};

const DE: Copy = {
  kicker: (k) => `Die kostenlose Prüfung, ${k === "creative" ? "frei" : "sachlich"}`,
  headingFound: (n) => (n === 1 ? "Eine Sache, die Ihr Auftrag nicht sagt" : `${n} Dinge, die Ihr Auftrag nicht sagt`),
  headingClean: "Nichts Offensichtliches fehlt",
  subFound:
    "Jede Zeile unten ist etwas, das ein Agent sich ausdenken müsste, um fertig zu werden. " +
    "Nichts davon hindert Sie am Einstellen; es ist das, was Sie sonst nach dem Bezahlen erfahren.",
  subClean:
    "Das heißt, der Auftrag ist vollständig, nicht dass er gut ist. Ob die Fakten darin die " +
    "richtigen sind, wissen nur Sie.",
  fixHeading: (n) => (n ? "Hier nachbessern und noch einmal prüfen" : "Etwas ändern und noch einmal prüfen"),
  again: "Noch einmal prüfen",
  post: "Als Auftrag einstellen",
  factual: "sachlich",
  creative: "frei",
  wordsRead: (n, k) =>
    `${n} ${n === 1 ? "Wort" : "Wörter"}, gelesen als ${k === "creative" ? "freie" : "sachliche"} Arbeit.`,
  kept: "Nichts wurde gespeichert, kein Schlüssel gebraucht und nichts berechnet.",
  terminal: "Vom Terminal aus",
  postsFree: (c) =>
    `Das Einstellen kostet Sie nichts und verlangt nichts: der Topf zahlt bis zu ${c} Cent für ` +
    `einen ersten Auftrag, und der Schlüssel, den Sie zurückbekommen, ist der einzige Weg dorthin. ` +
    `Kopieren Sie ihn, wenn er erscheint.`,
};

export interface Finding {
  missing: string;
}

/**
 * @param brief what was sent, echoed back so the reader can see what was checked
 * @param kind factual or creative, because the check is stricter on the first
 * @param findings the same objects the JSON answer carries
 */
export function renderCheck(
  brief: string,
  kind: string,
  findings: Finding[],
  words: number,
  freeFirstJobCents: number | null,
  viaQuery = false,
  formAllowed = false,
  lang: "de" | "en" = "en",
): string {
  const t = lang === "de" ? DE : EN;
  const list = findings.length
    ? `<ul class="found">${findings.map((f) => `<li>${esc(f.missing)}</li>`).join("")}</ul>`
    : "";
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">${t.kicker(kind)}</p>
      <h1 class="ph">${findings.length ? t.headingFound(findings.length) : t.headingClean}</h1>
      <p class="sub">
        ${findings.length ? t.subFound : t.subClean}
      </p>
      ${list}
      ${
        formAllowed
          ? // The draft comes back, in a box, so the next move is the one the findings ask for.
            //
            // The page used to end on "posting it is six steps, and they do need a wallet",
            // directly after the one moment a stranger is convinced. That is the wall, offered at
            // the worst possible instant, and it is locked until a buyer can pay with a card.
            //
            // The move the findings actually ask for is smaller and needs nothing: fix the brief
            // and check it again. That is also the outcome somebody came for. A brief that comes
            // back clean is the product, and the job offer makes sense after it rather than
            // instead of it.
            `<h2>${t.fixHeading(findings.length)}</h2>
      <form method="GET" action="/check">
        <textarea name="brief" rows="8" required>${esc(brief)}</textarea>
        <div class="cta" style="align-items:center;gap:1rem">
          <button class="btn btn-1" type="submit">${t.again}</button>
          ${
            // The same textarea, a second button, and the draft goes straight to the board. Two
            // forms would mean two copies of the text and one of them going stale the moment
            // somebody edits the other. `formmethod` and `formaction` are what HTML has for
            // exactly this, and CSP form-action 'self' covers both targets.
            freeFirstJobCents === null
              ? ""
              : `<button class="btn btn-2" type="submit" formmethod="post" formaction="/start">${t.post}</button>`
          }
          <label class="fine" style="margin:0">
            <input type="radio" name="kind" value="factual"${kind === "creative" ? "" : " checked"}> ${t.factual}
            <input type="radio" name="kind" value="creative"${kind === "creative" ? " checked" : ""}> ${t.creative}
          </label>
        </div>
      </form>
      ${
        freeFirstJobCents === null
          ? ""
          : `<p class="fine">${t.postsFree(freeFirstJobCents)}</p>`
      }
      <p class="fine">${t.wordsRead(words, kind)} ${t.kept}</p>`
          : `<h2>${lang === "de" ? "Was geprüft wurde" : "What was checked"}</h2>
      <pre>${esc(brief)}</pre>
      <p class="fine">${t.wordsRead(words, kind)} ${t.kept}</p>`
      }
      <h2>${t.terminal}</h2>
      <pre><code>curl -s https://cp.hippe.eu/v1/briefs/check \\
  -H 'content-type: application/json' \\
  -d '{"brief":"…","kind":"${esc(kind)}"}'</code></pre>
      <p class="sub">
        ${nextStep(freeFirstJobCents, lang)}
      </p>
    </div>
  </section>`;
}


/** The two briefs the landing page links to, and the reason there are exactly two. */
export const EXAMPLES: { label: string; brief: string; kind: "factual" | "creative" }[] = [
  {
    label: "a fact sheet nobody could finish",
    brief:
      "FACT SHEET on the energy certificate for a 1974 apartment block with six flats and gas " +
      "heating, for a landlord ordering one for the first time.",
    kind: "factual",
  },
  {
    label: "the same job, said properly",
    brief:
      "FACT SHEET on the energy certificate (Energieausweis) for a 1974 apartment block with six " +
      "flats and gas heating, for a landlord ordering one for the first time. 400 to 500 words, " +
      "in five sections: what the certificate is, which of the two types applies here and why, " +
      "what the landlord has to supply, what it costs and how long it takes, and what happens if " +
      "it is missing at a viewing. Hand in the text only, no cover note. Do not name a price for " +
      "any single provider and do not cite a law without its paragraph number.",
    kind: "factual",
  },
];

/**
 * The page a reader lands on before they have typed anything.
 *
 * Its whole job is to make the free check clickable. The landing page offers the check as a curl
 * line, and measured on 2026-09-22 over the whole access log, nobody has ever followed a link on
 * this site and no browser has ever opened /post or /jobs. A reader who cannot try the one thing
 * that costs nothing has nothing to do here.
 *
 * Two examples and not one, because the interesting part is the difference: the same job, badly
 * said and then said properly. One example would show that the check works; two show what it is
 * for.
 *
 * The counts in the text are run through the check at render time and never written down. The
 * first draft of this page said "four things in the first and nothing in the second" from memory;
 * the check finds three. A number on a page that asks for trust has to come from the thing it
 * describes, which is the same rule the hero panel on the landing page already follows.
 */
/**
 * The intro page, and the one place the language cannot be read off a brief.
 *
 * There is no text yet, so the only signal is the browser's Accept-Language. That is a weak
 * signal in general and a good one here: this page is what a QR code on a card at a German trade
 * fair opens, and the reader is holding a phone that has said "de" in every request it has ever
 * made. Wrong guesses cost a page in the wrong language, which the reader fixes by leaving, so it
 * is worth getting right and not worth building a language switch for yet.
 */
export function renderCheckIntro(
  formAllowed: boolean,
  freeFirstJobCents: number | null,
  lang: "de" | "en" = "en",
): string {
  // Counted now, from the same function the endpoint runs, so the sentence cannot drift from what
  // the links actually answer.
  const found = EXAMPLES.map((e) => reviewBrief(e.brief, e.kind).length);
  const plural = (n: number) => `${n} thing${n === 1 ? "" : "s"}`;
  const counts =
    found[1] === 0
      ? `The interesting part is the difference. The check finds ${plural(found[0])} in the first ` +
        "and nothing in the second, and the second is what an agent can actually work from."
      : `The interesting part is the difference. The check finds ${plural(found[0])} in the first ` +
        `and ${plural(found[1])} in the second.`;
  const links = EXAMPLES.map(
    (e) =>
      `<li><a href="/check?kind=${e.kind}&amp;brief=${encodeURIComponent(e.brief)}">${esc(e.label)}</a></li>`,
  ).join("");
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Before any money moves</p>
      <h1 class="ph">What your brief does not say</h1>
      <p class="sub">
        ${
          formAllowed
            ? "Paste a draft and this names the things an agent would have to invent to finish it."
            : "This names the things an agent would have to invent to finish your brief."
        } No key,
        no account, no charge. It is the same check that runs on every job posted
        here, and it costs nothing because knowing this after paying is worse for both sides.
      </p>
      ${
        formAllowed
          ? // GET and not POST, now that the log filter drops `brief` from the recorded URI.
            //
            // The objection to GET was that the draft ends up in the address and Caddy keeps
            // addresses for 720 hours. deploy/Caddyfile gained `query { delete brief }` in the
            // same change that allowed forms at all, so the draft no longer reaches the log, and
            // GET is the better shape for everything else: the result has an address somebody can
            // send to a colleague, reloading does not re-submit, a crawler can read it, and it
            // lands on this page rather than on an API endpoint. The two examples below are
            // already exactly these URLs, so the form and the examples produce the same thing.
            //
            // POST /v1/briefs/check keeps working and stays what a terminal uses.
            `<form method="GET" action="/check">
        <textarea name="brief" rows="6" placeholder="FACT SHEET on the energy certificate for a 1974 apartment block with six flats and gas heating, for a landlord ordering one for the first time." required></textarea>
        <div class="cta" style="align-items:center;gap:1rem">
          <button class="btn btn-1" type="submit">Check it</button>
          <label class="fine" style="margin:0">
            <input type="radio" name="kind" value="factual" checked> factual
            <input type="radio" name="kind" value="creative" style="margin-left:.6rem"> creative
          </label>
        </div>
      </form>
      <p class="fine">Nothing is stored: the draft goes in the address and the web server is told
        to drop it before it writes the line. No key, no account, no charge.</p>`
          : // No box to paste into, so the page says where the draft goes instead of promising a
            // field that is not there. "Paste a draft" stood here whether or not the form was
            // rendered, and with it switched off a reader looked for a box, found none, and had
            // nothing left but the curl line further down.
            //
            // The address bar is the way in that needs nothing: a browser encodes the spaces on
            // its own, which is why this reads as plain words rather than %20. Measured against
            // production on 2026-09-23.
            // The branch for a deployment whose policy still refuses forms. It kept a warning
            // about the access log until 2026-09-23, when deploy/Caddyfile started dropping the
            // `brief` parameter before the line is written. The warning went with it: a page that
            // warns about something that no longer happens is wrong in the harmless direction,
            // and ops/what-the-log-keeps.sh fails on that direction too.
            `<p class="fine">
        There is no box here. The policy this deployment runs under refuses form submissions, and a
        form that silently does nothing is worse than none. Two ways in meanwhile: the examples
        below are one click each, and
        <code>${esc(siteHost())}/check?brief=...</code> answers any draft you put after it. The
        web server is told to drop that parameter before it writes its log, so nothing keeps the
        draft either way.
      </p>`
      }
      <h2>Two drafts of the same job</h2>
      <p>${counts}</p>
      <ul class="found">${links}</ul>
      <h2>From a terminal</h2>
      <pre><code>curl -s https://cp.hippe.eu/v1/briefs/check \
  -H 'content-type: application/json' \
  -d '{"brief":"…","kind":"factual"}'</code></pre>
      <p class="sub">
        ${nextStep(freeFirstJobCents, lang)}
      </p>
    </div>
  </section>`;
}
