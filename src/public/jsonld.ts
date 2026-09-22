/**
 * Structured data for the pages, so that a crawler reads what a reader sees.
 *
 * Googlebot came for the first time on 2026-09-22 at 17:56 UTC, fetched robots.txt, the landing
 * page twice and `/v1/status` with the landing page as referrer, which means it rendered. What it
 * found was eight pages of prose with no machine-readable claim on any of them.
 *
 * **It works under the production CSP, and that was measured before it was written.** The policy
 * is `script-src 'sha256-…'` with one pinned hash, and `deploy/**` is not touched without a human,
 * so a second hash was not available. Under that exact policy in headless Chrome: an inline
 * `<script>` does not run (the control paragraph stays at JS-BLOCKIERT) while a
 * `<script type="application/ld+json">` block sits complete in the DOM, because a data block is
 * never executed and never needs to be. Without the policy the same file runs its script and reads
 * the same block back out. Both directions, one file, so the conclusion is not a guess about how
 * CSP treats a script type.
 *
 * The sharper half of that measurement is the console. One file under a policy that allows no
 * script at all, carrying a data block and an executable one: Chrome reports "Executing inline
 * script violates the following Content Security Policy directive" for the executable one and says
 * **nothing** about the data block. The rendered production page reports nothing at all. A
 * violation is what a renderer would act on, and there is none, which is why a rendering crawler
 * reads this and does not discard it.
 *
 * **Every statement here has to stand on the page it describes.** Structured data that claims more
 * than the page shows is what Google calls spammy structured markup, and it is also just untrue,
 * which this project cannot afford on the surface that asks for trust. That is why `howToFrom`
 * reads its steps out of the rendered HTML instead of keeping a second list beside it: a step
 * renamed on the page renames itself here, and a step deleted disappears here.
 */

const SITE = "https://cp.hippe.eu";

/** The operator, exactly as the footer and /terms#impressum name them. */
export function organization(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": `${SITE}/#operator`,
    name: "Handsel",
    url: SITE,
    description:
      "A market where a buyer posts a job with a price, several agents each deliver finished work, " +
      "and the buyer pays one of them or none.",
    founder: { "@type": "Person", name: "Matthias Hippe" },
    address: {
      "@type": "PostalAddress",
      streetAddress: "San-Francisco-Straße 1",
      postalCode: "20457",
      addressLocality: "Hamburg",
      addressCountry: "DE",
    },
  };
}

/** One page, tied to the operator. `path` is the canonical path, with its leading slash. */
export function webPage(title: string, description: string, path: string): Record<string, unknown> {
  return {
    "@type": "WebPage",
    "@id": `${SITE}${path}`,
    url: `${SITE}${path}`,
    name: title,
    description,
    isPartOf: { "@id": `${SITE}/#website` },
    publisher: { "@id": `${SITE}/#operator` },
    inLanguage: "en",
  };
}

export function webSite(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": `${SITE}/#website`,
    url: SITE,
    name: "Handsel",
    publisher: { "@id": `${SITE}/#operator` },
    inLanguage: "en",
  };
}

/**
 * The steps of a how-to, taken out of the page's own markup.
 *
 * `/post` numbers its steps as `<b>1. Check your brief, before you have an account</b>`, and that
 * bold line is the heading a reader sees. Reading it here means the markup cannot drift from the
 * page, which is the failure mode of every hand-kept copy.
 *
 * Returns null when the page has no such steps, because a HowTo with no steps is invalid and a
 * silent empty list would pass a schema check while saying nothing.
 */
export function howToFrom(
  html: string,
  name: string,
  description: string,
  path: string,
): Record<string, unknown> | null {
  const steps: { n: number; text: string }[] = [];
  const re = /<b>\s*(\d+)\.\s+([^<]{3,120}?)\s*<\/b>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    steps.push({ n: Number(m[1]), text: m[2].replace(/\s+/g, " ").trim() });
  }
  if (steps.length < 2) return null;
  steps.sort((a, b) => a.n - b.n);
  return {
    "@type": "HowTo",
    "@id": `${SITE}${path}#howto`,
    name,
    description,
    step: steps.map((s) => ({
      "@type": "HowToStep",
      position: s.n,
      name: s.text,
      url: `${SITE}${path}`,
    })),
  };
}

/**
 * A published measurement, so that it is findable as data and not only as a page.
 *
 * `/x402` and `/receipts` both publish numbers this service measured itself and both offer the CSV
 * or JSON behind them. Google indexes `Dataset` separately from web results, which is the one
 * search surface where a small site with real data competes with a large one without.
 *
 * `license` is the CC0 line the footer carries on every page. `creator` is the operator, because
 * nobody else measured it.
 */
export function dataset(
  name: string,
  description: string,
  path: string,
  distributions: { url: string; format: string }[],
): Record<string, unknown> {
  return {
    "@type": "Dataset",
    "@id": `${SITE}${path}#dataset`,
    name,
    description,
    url: `${SITE}${path}`,
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    creator: { "@id": `${SITE}/#operator` },
    isAccessibleForFree: true,
    distribution: distributions.map((d) => ({
      "@type": "DataDownload",
      contentUrl: `${SITE}${d.url}`,
      encodingFormat: d.format,
    })),
  };
}

/**
 * The graph as one script block.
 *
 * `<` is escaped to `<` throughout. A submission, a brief or a job title can contain the six
 * characters `</script` and would otherwise end the block early and drop the rest of the page's
 * head into the body. JSON.stringify does not do this on its own.
 */
export function block(...nodes: Record<string, unknown>[]): string {
  const graph = { "@context": "https://schema.org", "@graph": nodes.filter(Boolean) };
  const json = JSON.stringify(graph).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}
