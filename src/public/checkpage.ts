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
