/**
 * One page per error text a Conway operator types into a search box (goals/reichweite/01).
 *
 * `/fix` is the long guide and stays as it is. These pages are a way in for one search each: the
 * exact text the automaton prints as the heading and in the title, the cause in two sentences, the
 * one line that keeps it running, and a link to `/fix` for every further step. Built 1:1 after the
 * approved pictures docs/soll/errors-<slug>-<width>.png; ops/soll-live-errors.mjs renders these
 * pages and ops/soll-errors.mjs compares them with the pictures pixel by pixel.
 *
 * The causes say only what `/fix` already shows: sign-up of a fresh wallet at api.conway.tech has
 * not completed since July 2026 (Conway issue #339), the 401 names the nonce although the nonce is
 * not what expired, and the payment endpoint keeps taking USDC while the credits never arrive, so
 * the runtime buys again. No figure without a measurement, no customer.
 *
 * The slugs are the addresses reichweite 02 links from the Conway issues; renaming one breaks those
 * links. ops/error-pages-arrivals.mjs reads the slugs and their order from this file.
 */
import { esc } from "./market.js";

export type ErrorPage = {
  /** The address under /errors/. */
  slug: string;
  /** The error text, character for character as the runtime and the Conway issues print it. */
  heading: string;
  /** The <title>: what a search result shows first. */
  title: string;
  /** The meta description: the cause in one sentence and the one line. */
  description: string;
  /** Two sentences on what is broken at Conway. */
  cause: string;
};

const page = ({ slug, heading, cause }: Pick<ErrorPage, "slug" | "heading" | "cause">): ErrorPage => ({
  slug,
  heading,
  title: `Conway automaton: ${heading} | automatonhost.com`,
  description: `${cause.split(". ")[0]}. Set conwayApiUrl to https://automatonhost.com and run automaton --provision to keep it running.`,
  cause,
});

export const ERROR_PAGES: readonly ErrorPage[] = Object.freeze([
  page({
    slug: "verify-500-database-error",
    heading: '/v1/auth/verify returns 500 {"error":"Database error"}',
    cause: "Sign-up at api.conway.tech does not complete for a fresh wallet, and has not since July 2026 (Conway issue #339). The fault is on Conway's side: your automaton never gets its API key, so it cannot think.",
  }),
  page({
    slug: "invalid-or-expired-nonce",
    heading: '/v1/auth/verify returns 401 {"error":"Invalid or expired nonce"}',
    cause: "The 401 says your nonce expired, and it did not: sign-up at api.conway.tech has not completed for a fresh wallet since July 2026 (Conway issue #339). Asking for a new nonce changes nothing.",
  }),
  page({
    slug: "credits-never-granted",
    heading: "x402 top-up paid on-chain, but credits never granted",
    cause: "Conway's payment endpoint still takes your USDC, but the credits never arrive, because sign-up for a fresh wallet does not complete (Conway issue #339). The runtime sees no credits and buys again, every five minutes while the wallet holds 5 USDC.",
  }),
]);

export function findErrorPage(slug: string): ErrorPage | undefined {
  return ERROR_PAGES.find((p) => p.slug === slug);
}

/** The body of one error page, inside the frame of page() in src/app.ts. */
export function renderErrorPage(p: ErrorPage): string {
  return `
  <section>
    <div class="wrap narrow" data-soll="fix">
      <p class="kicker">Conway automaton error</p>
      <h1 class="ph">${esc(p.heading)}</h1>
      <p class="sub">${esc(p.cause)}</p>
      <div class="demo">
        <p class="eyebrow">One line, one command</p>
        <div class="code"><pre><code><span class="pr">~/.automaton/automaton.json</span>
{ "conwayApiUrl":
  "https://automatonhost.com" }</code></pre>
        <pre><code><span class="pr">$</span> automaton --provision</code></pre></div>
        <p class="fine">With USDC in its wallet, the first start tops up $5 of credit here. <a href="/fix">Every step on one page</a>.</p>
      </div>
    </div>
    <div class="wrap narrow">
      <p class="fine" style="margin-top:var(--s-8)">automatonhost.com is an independent service that works with the unchanged Conway automaton runtime. It is not part of Conway.</p>
    </div>
  </section>`;
}

/** The body of the answer to an unknown slug: what exists instead. */
export function renderErrorPageMissing(): string {
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Conway automaton error</p>
      <h1 class="ph">There is no page for this error</h1>
      <p class="sub">The pages that exist: ${ERROR_PAGES.map((p) => `<a href="/errors/${p.slug}">${esc(p.heading)}</a>`).join(", ")}. <a href="/fix">Every step on one page</a>.</p>
    </div>
  </section>`;
}
