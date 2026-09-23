/**
 * The page somebody lands on when they arrive from a Conway issue with a broken automaton.
 *
 * Built out of a measurement on 2026-09-21: a user commented on issue #379 at 17:51:20 UTC and a
 * browser fetched the landing page at 17:52:34. Earlier the same day another arrival carried a
 * github.com referrer and did the same. Both left after one page. That channel is the only one
 * this project has ever proved, and it was pointing at a page that opens by selling a job market.
 *
 * What these hold is the one property the page exists for and would silently lose in an edit: the
 * reader is told how to stop paying before they are told what we sell. A page that reverses that
 * order still renders, still passes every other check, and is no longer worth arriving at.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { mcToCents, openDb } from "../src/db.js";
import { GRANT_MC } from "../src/credits/starter.js";

const page = async (path: string): Promise<string> =>
  (await createApp({ db: openDb(":memory:") }).request(path)).text();

describe("/fix", () => {
  it("tells them how to stop paying before it mentions what we sell", async () => {
    const html = await page("/fix");
    const stopSection = html.indexOf("Stop it buying");
    const freeRoutes = html.indexOf("without paying anybody");
    // Not the bare host: it is in the canonical link and the og:url in every <head>, so anchoring
    // on it made the test read "we sell before anything else" on a page that does not.
    const whatWeSell = html.indexOf("Or point it at this control plane");
    expect(stopSection, "the section about stopping the spending is gone").toBeGreaterThan(-1);
    expect(freeRoutes, "the two free routes are gone").toBeGreaterThan(-1);
    expect(whatWeSell, "the section about what we sell is gone").toBeGreaterThan(-1);
    expect(stopSection, "what we sell comes before the reader is told how to stop paying").toBeLessThan(whatWeSell);
    expect(freeRoutes, "what we sell comes before the free routes").toBeLessThan(whatWeSell);
  });

  it("carries the error the reader just saw, in the words their console used", async () => {
    const html = await page("/fix");
    // Both spellings: the endpoint answers 500 for some callers and 401 for others, and the
    // reader recognises the page by whichever one is on their screen. They are also what somebody
    // pastes into a search engine, which is how this page is meant to be found at all.
    expect(html).toContain("Database error");
    expect(html).toContain("Invalid or expired nonce");
    expect(html).toContain("/v1/auth/verify");
  });

  it("says the starter credit the service actually grants", async () => {
    const html = await page("/fix");
    // Derived, not typed. A page promising ten free answers at a grant that has changed would be
    // the second time this project shipped a number that drifted away from the code behind it.
    expect(html).toContain(`${mcToCents(GRANT_MC)} cents of starter credit`);
  });

  it("is reachable from the landing page, or nobody without the URL can get to it", async () => {
    // Until Matthias releases the issue answers, the only other way in is a link on the page the
    // traffic already lands on. Two rebuilds of that page in one day have already left /llms.txt
    // and og.png behind, so the link is pinned by the rule and not by its wording: somewhere in
    // the section written for a stranded automaton, something points here.
    const html = await page("/");
    const section = html.indexOf('id="agents"');
    expect(section, "the section for a stranded automaton is gone").toBeGreaterThan(-1);
    expect(html.slice(section, section + 1200), "nothing in that section links to /fix")
      .toContain('href="/fix"');
  });

  it("is in the sitemap and in llms.txt, because neither is maintained by hand", async () => {
    expect(await page("/sitemap.xml")).toContain("https://cp.hippe.eu/fix");
    expect(await page("/llms.txt")).toContain("/fix:");
  });

  it("names the inferenceModel trap the way the long version does", async () => {
    const html = await page("/fix");
    // Two of the three surfaces this trap appears on said the router reads the nested field "not
    // the top-level one the setup wizard writes", which reads as the wizard writing a field the
    // router ignores. src/setup/configure.ts at the pinned revision assigns the chosen model to
    // both, so the trap is a hand-edited automaton.json and not the wizard.
    // docs/without-control-plane.md had it right and nothing held the short version against it.
    // Checked as the presence of the correct half rather than the absence of the wrong wording,
    // so a rewrite has to keep the fact rather than avoid a phrase.
    expect(html, "the page no longer says which field the router reads").toContain("modelStrategy");
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text, "the page has to say the wizard copies the value down, or it blames the wizard")
      .toMatch(/wizard copies the top-level value down/i);
  });

  it("claims a daily measurement only for the half that is measured daily", async () => {
    const html = await page("/fix");
    // The page showed both lines under "measured on every run of our daily scan". The daily scan
    // (ops/conway-money-series.sh) only calls GET /pay/5/<address>, so half of that sentence was a
    // measurement nobody takes, on the page that exists to be trusted by somebody whose wallet is
    // draining.
    //
    // The replacement said "measured by hand on 21 September", and this test held it there. By
    // 2026-09-22 that was false in the other direction: harness/e2e/provisionierung.ts signs a
    // SIWE message against api.conway.tech, ops/conway-zustand.sh runs it, and check-all.sh runs
    // that on every cycle. The page was underselling its own evidence with a date that ages by a
    // day every day. So what is required now is that each half names its own source and that only
    // the daily one claims to be daily.
    //
    // Reworded on 2026-09-23 so the two error strings sit next to each other, and the requirement
    // stayed: name the source per half, and let only the daily half say daily. It is asserted on
    // what the sentence means rather than on the phrase "second is", which is what broke when the
    // sentence changed while remaining correct.
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text, "the daily claim has to name what is actually daily")
      .toMatch(/payment line is checked every day/i);
    expect(text, "and the sign-up half must not borrow that claim")
      .not.toMatch(/sign-up[^.]*checked every day|every day[^.]*auth\/verify/i);
    expect(text, "the sign-up half has to name where its answer comes from")
      .toMatch(/our own attempt with a\s+freshly generated wallet gets on every check we run/i);
    // Both wordings, said to be one problem. A reader who searched for the 401 and finds a page
    // about a 500 concludes it is a different bug and leaves.
    expect(text).toMatch(/401 Invalid or expired nonce/i);
    expect(text).toMatch(/500 Database error/i);
    expect(text, "and the page has to say they are the same endpoint")
      .toMatch(/Same endpoint, same outcome/i);
  });

  // The two lines a search result shows. The body carried both error strings for days while the
  // title and description carried neither, and the wording people type is the 401.
  it("puts the searched wording where a search result can show it", async () => {
    const html = await page("/fix");
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    const description = html.match(/<meta name="description" content="([^"]*)/)?.[1] ?? "";
    expect(title).toMatch(/Invalid or expired nonce/i);
    expect(title.length, "a title much over 70 characters is cut off in a result").toBeLessThan(75);
    expect(description).toMatch(/nonce/i);
  });

  it("warns that the same runtime buys here too, before it touches the free credit", async () => {
    const html = await page("/fix");
    // Step 1 tells the reader their runtime keeps buying $5 tiers at Conway. The same
    // bootstrapTopup runs against this service: credits under $5 and 5 USDC in the wallet is all
    // it asks, so a fresh wallet with USDC buys on its first start, before the 15 cent grant is
    // ever drawn. Promising they can see whether it thinks before deciding anything was true of
    // the API path and not of the runtime path, on the page a stranded operator arrives at.
    //
    // Found on 2026-09-22, hours after the first stranger provisioned a real runtime here.
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text, "the page has to say the runtime buys here on its first start")
      .toMatch(/buys the \$5 tier here on its first start/i);
    expect(text, "and name the way out, which is the same one as in step 1")
      .toMatch(/move the USDC out first/i);
  });

  /**
   * The one place the page shows detail knowledge has to be right on both routes it offers.
   *
   * It said "then the runtime keeps routing to `gpt-5-mini`". The nested default is `gpt-5.2`;
   * `gpt-5-mini` is the low-compute and critical model, and the router puts the critical one first
   * only at tier `critical` or `dead`. That makes the sentence right for the Ollama route, where
   * the reader has no balance, and wrong for the other route on the same page, which writes a
   * balance into the SQLite file. An adversarial read found it on 2026-09-22 (B7).
   *
   * `ops/upstream-claims.py` checks both constants and both candidate orders against the pinned
   * revision. This checks that the page carries what that claim establishes.
   */
  it("names both default models, and which tier picks each", async () => {
    const text = await page("/fix");
    expect(text).toContain("gpt-5.2");
    expect(text).toContain("gpt-5-mini");
    const sentence = text.slice(text.indexOf("keeps routing"), text.indexOf("keeps routing") + 400);
    expect(sentence, "naming only the small model is right on one of the two routes this page offers")
      .toMatch(/critical/);
  });

  it("does not claim the payment endpoint is broken, because it is not", async () => {
    const html = await page("/fix");
    // The whole argument of the page rests on exactly one asymmetry: sign-up fails, paying works.
    // A sentence that blurs the two turns the page into "Conway is down", which is both wrong and
    // useless to somebody whose wallet is still draining.
    const paymentRoute = html.indexOf("402, a payable demand");
    expect(paymentRoute, "the working payment endpoint is no longer shown next to the broken sign-up")
      .toBeGreaterThan(-1);
  });
});
