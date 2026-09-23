/**
 * The one place that knows what this service is called from outside.
 *
 * Until 2026-09-23 the address was written out in twenty places across src/: the canonical link,
 * the OpenGraph card, the sitemap, the JSON-LD, and every curl example on every page. Changing it
 * meant finding all of them, and the ones in prose would have been found last, by a reader.
 *
 * A domain is about to be bought, so the cost of that is no longer hypothetical. With this, the
 * move is one environment variable on the VM and a deploy.
 *
 * Read at call time, not at import: the tests set the variable per case, and a value captured
 * when the module first loaded would ignore them.
 */
const FALLBACK = "https://cp.hippe.eu";

export function siteOrigin(): string {
  const set = process.env.CP_PUBLIC_URL;
  if (!set) return FALLBACK;
  const trimmed = set.trim().replace(/\/+$/, "");
  // A value that is not an absolute http(s) origin would poison every canonical link and every
  // curl example at once, which is worse than ignoring it.
  return /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(trimmed) ? trimmed : FALLBACK;
}

/** The host on its own, for the places that print an address without a scheme. */
export function siteHost(): string {
  return siteOrigin().replace(/^https?:\/\//, "");
}

/**
 * Rewrite every mention of the built-in address in a finished page.
 *
 * The curl examples are the reason this exists. They sit in prose on /post, /jobs, /check and the
 * landing page, they are the thing a visitor copies, and they are the last place anybody would
 * look after a domain move. A page assembled from a dozen template strings cannot be audited by
 * eye; replacing once, at the door, can.
 *
 * A no-op while CP_PUBLIC_URL is unset, which is every test that does not set it.
 */
export function withOrigin(html: string): string {
  const origin = siteOrigin();
  if (origin === FALLBACK) return html;
  return html.split(FALLBACK).join(origin).split("cp.hippe.eu").join(siteHost());
}
