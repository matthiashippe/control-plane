/**
 * The fine print, whole, on one page.
 *
 * It used to be spread across the landing page: a price section, six collapsed paragraphs, an
 * imprint folded into the last one. That is the worst of both, because it competes with the
 * argument for somebody who is deciding, and it hides from somebody who is checking.
 *
 * What these tests hold is the checking side. Every duty that used to sit on the landing page has
 * to be on this one, in a shape somebody can read without opening anything, and the page has to be
 * reachable from every other page on the site.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { FEE_PERCENT } from "../src/bounties/store.js";
import { MARKUP } from "../src/inference/proxy.js";

const page = async (pfad: string): Promise<string> =>
  (await createApp({ db: openDb(":memory:") }).request(pfad)).text();

describe("/terms", () => {
  it("names who is liable, with a serviceable address", async () => {
    const html = await page("/terms");
    expect(html).toContain("Matthias Hippe");
    expect(html).toMatch(/San-Francisco-Stra(ß|&szlig;)e 1/);
    expect(html).toContain("20457 Hamburg");
    expect(html, "the anchor other pages point at").toContain('id="impressum"');
    expect(html, "the duty is German and is quoted in German").toMatch(/§ 5 DDG/);
    expect(html, "and the broadcasting one that goes with it").toMatch(/§ 18 Abs. 2 MStV/);
    expect(html, "consumer dispute resolution").toContain("ec.europa.eu/consumers/odr");
  });

  it("promises no money back, anywhere on the page", async () => {
    const html = (await page("/terms")).toLowerCase();
    // The regulatory line. A page about money is exactly where a well-meant promise of repayment
    // slips in, so the whole page is checked rather than one sentence.
    expect(html).not.toMatch(/refund|pay ?out|cash out|redeem your|withdraw|money back|reimburs|compensat/);
    expect(html).toContain("not redeemable for money");
    expect(html).toContain("not transferable and not redeemable");
  });

  it("states the shutdown clause in full", async () => {
    const html = await page("/terms");
    expect(html).toMatch(/at least two weeks/);
    expect(html, "what happens to the remainder").toMatch(/is gone/);
    expect(html, "and how people are told").toMatch(/by e-mail to every address that/);
  });

  it("says how to get help without promising a response time", async () => {
    const html = await page("/terms");
    expect(html).toContain("github.com/matthiashippe/control-plane/issues");
    expect(html).toMatch(/mailto:[^"]+@/);
    expect(html).toContain("docs/errors.md");
    expect(html).toMatch(/no\s+guaranteed response time/i);
    expect(html, "no on-call service either").not.toMatch(
      /within \d+\s*(minutes?|hours?|business days?|days?)|24\/7|round the clock/i,
    );
    expect(html).toMatch(/no SLA/);
  });

  /**
   * The sentence that makes the rest credible. A paid service that hides the free way around it is
   * selling on ignorance, and this one has said the opposite from the start.
   */
  it("links the free routes that need none of this", async () => {
    const html = await page("/terms");
    expect(html).toContain("without-control-plane.md");
    expect(html, "and says plainly what to do if it works").toMatch(/If Ollama works for you, use Ollama/);
  });

  /**
   * Checked in the source, not in the output, because the output cannot tell the two apart.
   *
   * The first version of this test compared the rendered page against `${FEE_PERCENT} per cent`.
   * It passed with the number typed into the HTML (both sides read 10) and it passed with the
   * constant moved to 12 (both sides moved together). Three deliberate breakages, three passes: it
   * verified nothing at all. What actually has to be true is that the page interpolates rather
   * than spells, and only the source says that.
   */
  it("takes its numbers from the code and not from a typist", async () => {
    const { readFileSync } = await import("node:fs");
    const quelle = readFileSync(new URL("../src/public/terms.ts", import.meta.url), "utf-8");
    const koerper = quelle.slice(quelle.indexOf("export function renderTerms"));

    expect(koerper, "the commission has to come from the store module").toContain("${FEE_PERCENT} per cent commission");
    expect(koerper, "and the markup from the inference proxy").toContain("purchase cost times ${MARKUP}");
    expect(koerper, `${FEE_PERCENT} is typed into the page and will be stale the day the fee moves`)
      .not.toMatch(new RegExp(`${FEE_PERCENT}\\s*per cent`));
    expect(koerper, `${MARKUP} is typed into the page and will be stale the day the markup moves`)
      .not.toMatch(new RegExp(`times\\s*${MARKUP}`));

    // And the sentences still have to reach the reader.
    const html = await page("/terms");
    expect(html).toContain(`${FEE_PERCENT} per cent commission`);
    expect(html).toContain(`purchase cost times ${MARKUP}`);
  });

  it("tells an agent what it agrees to by competing, including the cut-off", async () => {
    const html = await page("/terms");
    expect(html, "the cancel-after-reading hole, stated rather than hidden").toMatch(
      /read every submission and then award nothing/,
    );
    expect(html).toContain("21 September 2026");
  });

  it("is reachable from every page and is in the sitemap and llms.txt", async () => {
    for (const pfad of ["/post", "/jobs", "/receipts", "/x402", "/conway", "/terms"]) {
      const html = await page(pfad);
      expect(html, `${pfad} has no link to the fine print`).toContain('href="/terms"');
      expect(html, `${pfad} has no link to the imprint`).toContain('href="/terms#impressum"');
    }
    expect(await page("/sitemap.xml")).toContain("https://cp.hippe.eu/terms");
    expect(await page("/llms.txt")).toContain("/terms:");
  });

  it("folds nothing away: no details element on the page", async () => {
    const html = await page("/terms");
    const koerper = html.slice(html.indexOf("<main>"), html.indexOf("</main>"));
    expect(koerper, "a duty behind a disclosure triangle is a duty somebody has to guess at")
      .not.toContain("<details");
  });
});
