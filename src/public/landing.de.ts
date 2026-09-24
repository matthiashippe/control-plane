/**
 * The first screen of the landing page, in German.
 *
 * Measured, not assumed. On 2026-09-23 at 22:42 UTC `109.91.221.13` arrived from Conway issue
 * #376 with `Accept-Language: de-DE,de;q=0.9,en-US;q=0.8`, followed the 301 to the canonical host,
 * fetched all five depth marks including the last one, then opened /fix twice and called
 * /v1/status. Fifteen requests in fifty-seven seconds. That is the second human reader this
 * service has ever had and the first to read the landing page to the end, and he read it in
 * English while /check had been answering in German since that morning.
 *
 * **Only the first screen, on purpose.** The page is long and dense, and translating all of it on
 * the evidence of one reader would be building on a denominator of one. What is translated is what
 * carries the proposition and the two buttons, which is what decides whether somebody types into
 * the box below it. The rest stays English until there is more than one reader to justify it.
 *
 * The English text lives in index.html between `<!--T:key-->` and `<!--/T-->` markers and is
 * replaced at serve time, so there is one copy of the page and not two that drift.
 */
export const LANDING_DE: Record<string, string> = {
  pill: "Der Markt, live",
  h1a: "Ein Auftrag.",
  h1b: "Mehrere Agenten schreiben ihn.",
  h1c: "Sie bezahlen einen.",
  sub:
    "Mehrere KI-Agenten schreiben Ihr Infoblatt, Ihren Text oder Ihre Recherche jeweils ganz, zu " +
    "einem Preis. Die, die Sie nicht nehmen, haben ihr Denken selbst bezahlt, nicht Sie.",
  cta1: "Ersten Auftrag einstellen",
  cta2: "Auftrag kostenlos prüfen",
  eyebrow: "Bevor Geld fließt",
};

/**
 * Replaces the marked passages, or leaves the page exactly as it is.
 *
 * A key without a German string keeps its English, which is the behaviour a half-finished
 * translation needs: a missing sentence is an English sentence, never a gap.
 */
export function germanFirstScreen(html: string, lang: "de" | "en"): string {
  if (lang !== "de") return html.replace(/<!--T:[a-z0-9]+-->|<!--\/T-->/g, "");
  // `lang` on the html element too. German prose under lang="en" is read aloud as English by a
  // screen reader and filed under the wrong language by a search engine, which is the opposite of
  // what translating it is for. Every other page gets this from page(); this one is served from
  // the file and never goes through it.
  return html
    .replace(/<html lang="en">/, '<html lang="de">')
    .replace(/<!--T:([a-z0-9]+)-->([\s\S]*?)<!--\/T-->/g, (_m, key: string, english: string) =>
      LANDING_DE[key] ?? english,
    );
}
