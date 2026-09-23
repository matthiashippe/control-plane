import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { prefersHtml } from "../src/public/apipage.js";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

function app() {
  return createApp({ db: openDb(":memory:") });
}

describe("A person who opens an API path in a browser", () => {
  it("gets a page instead of an error object, with the same status", async () => {
    const res = await app().request("/v1/credits/balance", { headers: { accept: BROWSER } });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toMatch(/Your browser cannot carry your key/);
    expect(html).toMatch(/curl -s https:\/\/cp\.hippe\.eu\/v1\/credits\/balance/);
  });

  /**
   * The half that must not break. Every runtime, every script and every curl reads this answer,
   * and a page where an object was expected breaks all of them at once for the sake of one reader.
   */
  it("changes nothing for a caller that did not ask for a page", async () => {
    const a = app();
    for (const headers of [
      {},
      { accept: "*/*" },
      { accept: "application/json" },
      { accept: "application/json, text/plain, */*" },
      { accept: "" },
      { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    ]) {
      const res = await a.request("/v1/credits/balance", { headers });
      expect(res.status, JSON.stringify(headers)).toBe(401);
      expect(res.headers.get("content-type"), JSON.stringify(headers)).toMatch(/application\/json/);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("Invalid API key");
      expect(body.message).toMatch(/cnwy_k_/);
    }
  });

  it("gives the machine the object when both are asked for at the same quality", async () => {
    const res = await app().request("/v1/credits/balance", { headers: { accept: "application/json, text/html" } });
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("answers the question the path was about", async () => {
    const a = app();
    const credits = await (await a.request("/v1/credits/history", { headers: { accept: BROWSER } })).text();
    expect(credits).toMatch(/what your agent has left/i);
    const jobs = await (await a.request("/v1/submissions/mine", { headers: { accept: BROWSER } })).text();
    expect(jobs).toMatch(/href="\/jobs"/);
    expect(jobs).not.toMatch(/what your agent has left/i);
  });

  it("names the standing starter offer, and says the other thing when the pool is dry", async () => {
    const db = openDb(":memory:");
    const a = createApp({ db });
    const voll = await (await a.request("/v1/credits/balance", { headers: { accept: BROWSER } })).text();
    expect(voll).toMatch(/reads its balance three times over more than a minute is handed 15 cents/);

    // Empty the pool the way the service itself would, through the ledger starterOffer() reads.
    const drain = "0x" + "1".repeat(40);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(
      drain, new Date().toISOString(),
    );
    db.prepare(
      "INSERT INTO ledger (address, kind, delta_mc, ref, meta, created_at) VALUES (?, 'grant', 500000, 'drain', '{}', ?)",
    ).run(drain, new Date().toISOString());
    const leer = await (await a.request("/v1/credits/balance", { headers: { accept: BROWSER } })).text();
    expect(leer).toMatch(/starter pool is used up/);
    expect(leer).not.toMatch(/is handed 15 cents/);
  });

  it("does not link anywhere that answers with this same page", async () => {
    const html = await (await app().request("/v1/credits/balance", { headers: { accept: BROWSER } })).text();
    // Every href in the body must be a page a person can actually read. A link promising "the list
    // of your keys" that lands on this very explanation is a loop, and it was one until it was seen
    // in a screenshot rather than in a test.
    const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.filter((h) => h.startsWith("/v1/"))).toEqual([]);
  });

  it("offers no way to read a balance without a key", async () => {
    const html = await (await app().request("/v1/credits/balance", { headers: { accept: BROWSER } })).text();
    expect(html).not.toMatch(/enter your address/i);
    expect(html).not.toMatch(/<form/i);
    expect(html).toMatch(/sits on every block explorer/);
  });

  it("carries the same skin as every other page", async () => {
    const html = await (await app().request("/v1/credits/balance", { headers: { accept: BROWSER } })).text();
    expect(html).toMatch(/href="\/terms"/);
    expect(html).toMatch(/Impressum/);
  });

  /**
   * The skin, yes. The claim to be a document, no.
   *
   * Until 2026-09-23 this file asserted structured data here too, under the heading "the same
   * skin and structured data as every other page", with no reason given for the second half. The
   * page() shell emits a canonical link pointing at the /v1/ path and a JSON-LD block declaring
   * WebPage, WebSite, Organization and PostalAddress, and a 401 inherited all of it. Every one of
   * those says "this is a document at this address" about something that is a refusal.
   *
   * It is not hypothetical. On 2026-09-22 at 23:20 UTC Googlebot fetched /v1/credits/history and
   * got exactly this HTML. The X-Robots-Tag kept it out of the index and still does, so nothing
   * was published; what was wrong is the claim itself, in the half no human reviews.
   *
   * The assertion is therefore reversed rather than dropped, and the reason is here so the next
   * person who finds a 401 without structured data knows it is deliberate.
   */
  it("does not describe itself as a document, because it is a refusal", async () => {
    const html = await (await app().request("/v1/credits/balance", { headers: { accept: BROWSER } })).text();
    expect(html, "a refusal must not carry a WebPage node").not.toMatch(/<script type="application\/ld\+json">/);
    expect(html, "nor a canonical URL for a path that serves no document").not.toMatch(/<link rel="canonical"/);
    expect(html, "and it says so in the markup, not only in the header").toMatch(
      /<meta name="robots" content="noindex">/,
    );
  });

  it("leaves a real page with both, which is the other half of the same rule", async () => {
    const html = await (await app().request("/check", { headers: { accept: BROWSER } })).text();
    expect(html, "a real page still carries its structured data").toMatch(/<script type="application\/ld\+json">/);
    expect(html, "and its canonical URL").toMatch(/<link rel="canonical"/);
    expect(html, "and is not told to stay out of the index").not.toMatch(/name="robots" content="noindex"/);
  });

  it("tells a crawler not to index a page that only exists under a 401", async () => {
    const res = await app().request("/v1/credits/balance", { headers: { accept: BROWSER } });
    expect(res.headers.get("x-robots-tag"), "a 401 page has no business in a search result").toBe("noindex");
    // And the JSON answer, which no crawler renders, does not need the header.
    const json = await app().request("/v1/credits/balance");
    expect(json.headers.get("x-robots-tag")).toBeNull();
  });

  it("does not turn a page's own error into a page", async () => {
    // Only /v1/ paths. A 404 on a page stays what it was.
    const res = await app().request("/gibtsnicht", { headers: { accept: BROWSER } });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toMatch(/Your browser cannot carry your key/);
  });
});

describe("prefersHtml", () => {
  it("says yes only to a caller that explicitly asked for a page", () => {
    expect(prefersHtml(BROWSER)).toBe(true);
    expect(prefersHtml("text/html")).toBe(true);
    expect(prefersHtml("application/xhtml+xml")).toBe(true);
    expect(prefersHtml("text/html;q=0.9,application/json;q=0.8")).toBe(true);
  });

  it("says no to everything a program sends", () => {
    expect(prefersHtml(undefined)).toBe(false);
    expect(prefersHtml("")).toBe(false);
    expect(prefersHtml("*/*")).toBe(false);
    expect(prefersHtml("application/json")).toBe(false);
    expect(prefersHtml("application/json, text/plain, */*")).toBe(false);
    expect(prefersHtml("application/json, text/html")).toBe(false);
    expect(prefersHtml("text/html;q=0,application/json")).toBe(false);
    expect(prefersHtml("text/html;q=0.5,application/json;q=0.9")).toBe(false);
  });
});
