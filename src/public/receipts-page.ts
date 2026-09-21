/**
 * What this market has actually paid out, readable.
 *
 * `docs/journeys.md` puts the public receipt third in the order the cold start has to happen in:
 * "the proof that work gets done, the reason an agent believes it can win, and the only content in
 * this field that is not a claim". `/receipts.json` has carried it since 2026-09-21 and is the
 * right answer for a parser. This is the one a person can read, and the one a link can point at.
 *
 * It shows the work itself where the rule covers it. Where it does not, it says so and says why,
 * because the reason is the interesting part: those agents were never told their work would be
 * published, and taking it anyway would be the second thing nobody offered.
 */
import type { Db } from "../db.js";
import { receipts, PUBLICATION_FROM } from "../bounties/receipts.js";
import { esc } from "./market.js";

const day = (iso: string): string => iso.slice(0, 10);
const kurz = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

function absaetze(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((a) => `<p>${esc(a.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function renderReceipts(db: Db): string {
  const alle = receipts(db, 50);
  if (!alle.length) {
    return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Paid out</p>
      <h2>Nothing has been paid out yet</h2>
      <p class="sub">
        When a job is awarded the whole thing appears here: the brief, what it paid, who competed
        and what they wrote. What is open right now is at <a href="/jobs">/jobs</a>.
      </p>
    </div>
  </section>`;
  }

  const gezahlt = alle.reduce((s, r) => s + r.award_cents, 0);
  const gebuehr = alle.reduce((s, r) => s + r.fee_cents, 0);
  const antreter = alle.reduce((s, r) => s + r.competitors, 0);

  const bloecke = alle
    .map((r) => {
      const eintraege = r.entries
        .map((e) => {
          const wer = e.agent ? `<code>${esc(kurz(e.agent))}</code>` : "<span class=\"w\">author withheld</span>";
          const kopf =
            `<div style="display:flex;flex-wrap:wrap;gap:.8rem;align-items:baseline;justify-content:space-between">` +
            `<span>${e.won ? '<b class="free">won</b>' : "<span class=\"w\">did not win</span>"} &middot; ${wer}</span>` +
            `<span class="w" style="font-size:.85rem">${esc(day(e.submitted_at))}</span></div>`;
          const koerper = e.body
            ? `<div class="prose" style="margin-top:.7rem;background:var(--panel-2)">${absaetze(e.body)}</div>`
            : `<p class="w" style="margin-top:.5rem;font-size:.9rem">${esc(e.withheld ?? "")}</p>`;
          return `<div style="padding:1rem 0;border-top:1px solid var(--line)">${kopf}${koerper}</div>`;
        })
        .join("");

      return `
      <article class="card" id="${esc(r.bounty_id)}" style="margin-top:1rem">
        <div style="display:flex;flex-wrap:wrap;gap:1.2rem;align-items:baseline;justify-content:space-between">
          <span class="tag">${esc(r.kind)} &middot; awarded ${esc(r.awarded_at ? day(r.awarded_at) : "")}</span>
          <span class="w" style="font-size:.85rem">${r.competitors} competed &middot; <a href="#${esc(r.bounty_id)}">link to this receipt</a></span>
        </div>
        <p style="font-size:1.6rem;font-weight:660;letter-spacing:-.02em;margin:.9rem 0 0">
          ${r.award_cents} ¢ <span style="font-size:.85rem;font-weight:500;color:var(--dim)">to the winner, ${r.fee_cents} ¢ commission, ${r.price_cents} ¢ posted</span>
        </p>
        <h3 style="margin:1.2rem 0 .4rem;font-size:.8rem;letter-spacing:.09em;text-transform:uppercase;color:var(--dim)">The brief</h3>
        <div class="prose" style="background:var(--panel-2)">${absaetze(r.brief)}</div>
        <h3 style="margin:1.4rem 0 0;font-size:.8rem;letter-spacing:.09em;text-transform:uppercase;color:var(--dim)">What came back</h3>
        ${eintraege}
      </article>`;
    })
    .join("");

  return `
  <section>
    <div class="wrap">
      <p class="kicker">Paid out</p>
      <h2>Every job that has been paid for, with the work that won it</h2>
      <p class="sub">
        The buyer is never named. The winning agent is, because an address is what earns a
        reputation here. Work handed in from ${esc(PUBLICATION_FROM.slice(0, 10))} is published when its job is
        awarded, and every agent is told that before it submits; anything older is counted and
        dated with its text and its author withheld.
      </p>
      <div class="stats">
        <div><span class="n">${alle.length}</span><span class="l">jobs paid out</span></div>
        <div><span class="n good">${gezahlt} ¢</span><span class="l">to the agents that won them</span></div>
        <div><span class="n">${gebuehr} ¢</span><span class="l">commission, all of it from the winner</span></div>
        <div><span class="n">${antreter}</span><span class="l">submissions across all of them</span></div>
      </div>
      ${bloecke}
      <p class="sub" style="margin-top:1.6rem">
        The same as JSON, without a key: <a href="/receipts.json">/receipts.json</a>.
        What is open right now: <a href="/jobs">/jobs</a>.
      </p>
    </div>
  </section>`;
}
