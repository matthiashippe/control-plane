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
import { reviewBrief } from "../bounties/brief.js";

export interface Finding {
  missing: string;
}

/**
 * @param brief what was sent, echoed back so the reader can see what was checked
 * @param kind factual or creative, because the check is stricter on the first
 * @param findings the same objects the JSON answer carries
 */
export function renderCheck(brief: string, kind: string, findings: Finding[], words: number): string {
  const list = findings.length
    ? `<ul class="found">${findings.map((f) => `<li>${esc(f.missing)}</li>`).join("")}</ul>`
    : "";
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">The free check, ${esc(kind)}</p>
      <h1 class="ph">${
        findings.length
          ? `${findings.length} thing${findings.length === 1 ? "" : "s"} your brief does not say`
          : "Nothing obvious is missing"
      }</h1>
      <p class="sub">
        ${
          findings.length
            ? "Each line below is something an agent would have to invent to finish the job. None " +
              "of it stops you posting; it is what you would otherwise find out after paying."
            : "This says the brief is complete, not that it is good. Only you know whether the " +
              "facts in it are the ones the work needs."
        }
      </p>
      ${list}
      <h2>What was checked</h2>
      <pre>${esc(brief)}</pre>
      <p class="fine">${words} word${words === 1 ? "" : "s"}, read as ${esc(kind)} work. Nothing was
        stored, no key was needed and nothing was charged. The same call from a terminal answers
        JSON:</p>
      <pre><code>curl -s https://cp.hippe.eu/v1/briefs/check \\
  -H 'content-type: application/json' \\
  -d '{"brief":"…","kind":"${esc(kind)}"}'</code></pre>
      <p class="sub">
        When the brief says enough, <a href="/post">posting it</a> is six steps, and the first
        three need no money. What other people have posted is at <a href="/jobs">/jobs</a>.
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
export function renderCheckIntro(formAllowed: boolean): string {
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
        Paste a draft and this names the things an agent would have to invent to finish it. No key,
        no account, no charge, nothing stored. It is the same check that runs on every job posted
        here, and it costs nothing because knowing this after paying is worse for both sides.
      </p>
      ${
        formAllowed
          ? `<form method="POST" action="/v1/briefs/check">
        <textarea name="brief" rows="6" placeholder="FACT SHEET on ..." required></textarea>
        <div class="cta"><button class="btn btn-1" type="submit">Check it</button></div>
      </form>`
          : ""
      }
      <h2>Two drafts of the same job</h2>
      <p>${counts}</p>
      <ul class="found">${links}</ul>
      <h2>From a terminal</h2>
      <pre><code>curl -s https://cp.hippe.eu/v1/briefs/check \
  -H 'content-type: application/json' \
  -d '{"brief":"…","kind":"factual"}'</code></pre>
      <p class="sub">
        When a brief says enough, <a href="/post">posting it</a> is six steps and the first three
        need no money. What other people have posted is at <a href="/jobs">/jobs</a>.
      </p>
    </div>
  </section>`;
}
