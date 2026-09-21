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

const page = async (pfad: string): Promise<string> =>
  (await createApp({ db: openDb(":memory:") }).request(pfad)).text();

describe("/fix", () => {
  it("tells them how to stop paying before it mentions what we sell", async () => {
    const html = await page("/fix");
    const stopp = html.indexOf("Stop it buying");
    const frei = html.indexOf("without paying anybody");
    // Not the bare host: it is in the canonical link and the og:url in every <head>, so anchoring
    // on it made the test read "we sell before anything else" on a page that does not.
    const unser = html.indexOf("Or point it at this control plane");
    expect(stopp, "the section about stopping the spending is gone").toBeGreaterThan(-1);
    expect(frei, "the two free routes are gone").toBeGreaterThan(-1);
    expect(unser, "the section about what we sell is gone").toBeGreaterThan(-1);
    expect(stopp, "what we sell comes before the reader is told how to stop paying").toBeLessThan(unser);
    expect(frei, "what we sell comes before the free routes").toBeLessThan(unser);
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
    const abschnitt = html.indexOf('id="agents"');
    expect(abschnitt, "the section for a stranded automaton is gone").toBeGreaterThan(-1);
    expect(html.slice(abschnitt, abschnitt + 1200), "nothing in that section links to /fix")
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
    // (ops/conway-money-series.sh) only calls GET /pay/5/<address>; nothing anywhere signs a SIWE
    // message against api.conway.tech, and the repo series carries no field for it. So half of
    // that sentence was a measurement nobody takes, on the page that exists to be trusted by
    // somebody whose wallet is draining.
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text, "the daily claim has to name what is actually daily")
      .toMatch(/second is\s+checked every day/i);
    expect(text, "and the other half has to carry its own source")
      .toMatch(/measured by hand on 21 September/i);
  });

  it("does not claim the payment endpoint is broken, because it is not", async () => {
    const html = await page("/fix");
    // The whole argument of the page rests on exactly one asymmetry: sign-up fails, paying works.
    // A sentence that blurs the two turns the page into "Conway is down", which is both wrong and
    // useless to somebody whose wallet is still draining.
    const zahlweg = html.indexOf("402, a payable demand");
    expect(zahlweg, "the working payment endpoint is no longer shown next to the broken sign-up")
      .toBeGreaterThan(-1);
  });
});
