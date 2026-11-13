/**
 * The page a person opens on their phone, /h/{code} (goals/konto/02), built 1:1 after the approved SOLL pictures
 * docs/soll/handoff-<state>-<width>.png and their sources docs/soll/src/handoff-<state>.html.
 *
 * Three states: `freigabe` shows what is approved and three numbers as buttons in a form that works without JavaScript;
 * `erledigt` sends the person back to the terminal; `ungueltig` says the code no longer works and, in one line, why.
 *
 * The page carries the start page's stylesheet, passed in by the app from src/public/index.html, and a second <style> with the
 * two blocks it adds (docs/soll/README.md, "Handoff /h/{code}"). No script, no font, no picture and no style of another service.
 * Each heading is a bare h1 element: the goal changes the first one to prove that the comparison with the picture notices.
 */
import { esc } from "./market.js";

/** Atomic USDC (6 decimals) as dollars and cents, in bigint all the way: `5000000n` is `$5.00`. */
export function usd(atomic: bigint): string {
  const cents = atomic / 10_000n;
  return `$${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export type HandoffPage =
  | { state: "freigabe"; automatonName: string; dailyLimitUsdc: bigint; amountUsdc: bigint; choices: number[] }
  | { state: "erledigt" }
  | { state: "ungueltig"; reason: "expired" | "used" | "wrong" | "unknown" };

/** The one line under the heading of `ungueltig`. The SOLL picture shows `expired`. */
const REASONS = {
  expired: "It ran out after 10 minutes.",
  used: "It was already used.",
  wrong: "A wrong number was tapped, so it was closed.",
  unknown: "There is no such code.",
} as const;

const TITLES = {
  freigabe: "Approve on your phone | PostYourPrice",
  erledigt: "Approved | PostYourPrice",
  ungueltig: "Nothing was approved | PostYourPrice",
} as const;

const ICON =
  `<link rel="icon" href='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%230a0b09"/><circle cx="16" cy="12" r="5.5" fill="none" stroke="%237ee0b0" stroke-width="2.5"/><rect x="7" y="21" width="18" height="3.5" rx="1.75" fill="%237ee0b0"/></svg>'>`;

/** The two blocks this page adds to the start page's stylesheet, as in the SOLL sources. */
const OWN_STYLE = `<style>
/* /h/{code}: the three blocks this page adds to the start page's stylesheet (docs/soll/README.md). */
.grant { margin-block: var(--s-6) var(--s-4); }
.choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-3); margin-block: var(--s-4) var(--s-6); }
.choices .btn { height: 76px; justify-content: center; background: var(--panel); color: var(--fg);
                border-color: var(--line-2); font: 600 2rem/1 var(--mono); font-variant-numeric: tabular-nums; cursor: pointer; }
.choices .btn:hover { border-color: var(--accent); }
</style>`;

function body(page: HandoffPage): string {
  if (page.state === "freigabe") {
    const name = esc(page.automatonName);
    const buttons = page.choices
      .map((n) => `      <button class="btn" type="submit" name="pick" value="${n}">${n}</button>`)
      .join("\n");
    return `<section class="hero">
  <div class="wrap narrow" data-soll="freigabe">
    <p class="eyebrow">Approve on your phone</p>
    <h1>Allow ${name} to spend up to ${usd(page.dailyLimitUsdc)} a day?</h1>
    <div class="stats grant">
      <div><span class="n">${usd(page.dailyLimitUsdc)}</span><span class="l">Daily limit for ${name}</span></div>
      <div><span class="n">${usd(page.amountUsdc)}</span><span class="l">First payment</span></div>
    </div>
    <p class="sub">Tap the number shown in your terminal.</p>
    <form method="post" class="choices">
${buttons}
    </form>
    <p class="fine">Did not start this yourself? Close this page and nothing happens. The code works once, for 10 minutes.</p>
  </div>
</section>
`;
  }
  if (page.state === "erledigt") {
    return `<section class="hero">
  <div class="wrap narrow">
    <div class="hero-text">
      <p class="eyebrow">Approved</p>
      <h1>Done. Go back to your terminal.</h1>
      <p class="sub">Your terminal already has the answer and goes on from here. You can close this page.</p>
    </div>
  </div>
</section>
`;
  }
  return `<section class="hero">
  <div class="wrap narrow">
    <div class="hero-text">
      <p class="eyebrow">Nothing was approved</p>
      <h1>This code no longer works.</h1>
      <p class="sub">${REASONS[page.reason]}</p>
      <p class="fine">Start again in your terminal to get a new code.</p>
    </div>
  </div>
</section>
`;
}

/** The whole document. `indexStyle` is the <style> block of src/public/index.html. */
export function renderHandoffPage(page: HandoffPage, indexStyle: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${TITLES[page.state]}</title>
${ICON}
${indexStyle}
${OWN_STYLE}
</head>
<body>
<header class="bar"><div class="wrap narrow">
  <span class="brand">
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="currentColor" opacity=".12"/><circle cx="16" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="7" y="21" width="18" height="3.5" rx="1.75" fill="currentColor"/></svg>
    PostYourPrice
  </span>
</div></header>
<main>
${body(page)}</main>
<footer><div class="wrap narrow">
  PostYourPrice, Matthias Hippe, San-Francisco-Straße 1, 20457 Hamburg, Germany.
  <a href="/terms">The fine print</a>, the <a href="/terms#impressum">Impressum</a> and <a href="/datenschutz">Datenschutz</a>.
</div></footer>
</body>
</html>
`;
}
