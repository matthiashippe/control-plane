/**
 * The README is the landing page of the only channel that has ever brought a person here.
 *
 * Two people arrived on 2026-09-22, both through an answer in the Conway issue tracker, and
 * anybody who follows that trail one step further lands on this file. It pointed at
 * /bounties.json, which is JSON, and at two documents. It did not mention the one thing on this
 * service that costs nothing and needs no account.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

const readme = () => readFileSync("README.md", "utf8");

describe("README.md", () => {
  it("offers the free check, which is the only door that needs nothing", () => {
    const text = readme();
    expect(text, "the page a reader can click").toContain("cp.hippe.eu/check");
    expect(text, "and the call for whoever has a terminal").toContain("/v1/briefs/check");
  });

  it("makes the same promise the page makes, word for word", async () => {
    const html = await (await createApp({ db: openDb(":memory:") }).request("/")).text();
    const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(h1).toBeTruthy();
    // The README leads with the same sentence as the landing page. If one moves, so does the other.
    expect(readme(), `the README no longer leads with "${h1}"`).toContain(h1!);
  });

  /**
   * Markdown links only, not every URL in the file. A first version matched the URL inside the
   * curl example too and demanded that GET /v1/briefs/check answer under 400; it answers 405,
   * correctly, because it takes POST. An address in a code block is an instruction, not a link.
   */
  it("links nothing on this service that does not answer", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const paths = [...readme().matchAll(/\]\(https:\/\/cp\.hippe\.eu(\/[a-z0-9/._-]*)\)/g)].map((m) => m[1]);
    expect(paths.length, "the README links nothing on the service at all").toBeGreaterThan(1);
    for (const path of new Set(paths)) {
      const res = await app.request(path);
      expect(res.status, `README links ${path} and it answers ${res.status}`).toBeLessThan(400);
    }
  });

  it("shows the keyless call with the method that actually works", async () => {
    const app = createApp({ db: openDb(":memory:") });
    // The README shows a POST. A GET on the same path has to be refused, or the example is a
    // suggestion rather than the call.
    expect(readme()).toMatch(/curl[\s\S]{0,120}\/v1\/briefs\/check/);
    expect((await app.request("/v1/briefs/check")).status, "GET on a POST path").toBe(405);
    const res = await app.request("/v1/briefs/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief: "FACT SHEET on a roof", kind: "factual" }),
    });
    expect(res.status, "the call the README prints has to work as printed").toBe(200);
  });
});
