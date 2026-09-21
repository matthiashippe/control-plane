/**
 * The open jobs for a person instead of for a parser.
 *
 * `/bounties.json` is the right answer for an agent and a dead end for somebody clicking through
 * from an article: raw JSON, and they leave. The brief is the product here, so the brief is what
 * this page shows, in full. Two things therefore have to hold and are guarded below: a brief is
 * somebody else's text and must never become markup, and every job needs an address of its own,
 * because "we run a marketplace" convinces nobody and "here is 135 cents of uncontested work"
 * might.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db, pay: { payTo: "0x" + "1".repeat(40) } as never });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "5c".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: "seed" });
  const post = (body: unknown) =>
    app.request("/v1/bounties", { method: "POST", headers: { "content-type": "application/json", authorization: key }, body: JSON.stringify(body) });
  return { db, app, post, page: async () => (await app.request("/jobs")).text() };
}

const inAnHour = () => new Date(Date.now() + 3600e3).toISOString();

describe("/jobs", () => {
  it("shows the whole brief, the money and the call that enters", async () => {
    const { post, page } = setup();
    const res = await post({
      brief: "FACT SHEET for developers.\n\nSecond paragraph with the detail.\n\n90 words maximum.",
      kind: "factual",
      price_cents: 150,
      deadline: inAnHour(),
    });
    const { id } = (await res.json()) as { id: string };

    const html = await page();
    expect(html, "the whole brief, not the first line").toContain("Second paragraph with the detail.");
    expect(html).toContain("135 ¢");
    expect(html, "what the buyer put up").toContain("150 ¢");
    expect(html, "an agent must be able to enter without reading the docs first").toContain('"bounty_id":"' + id + '"');
    expect(html, "every job needs an address of its own").toContain(`id="${id}"`);
    expect(html).toContain("nobody competing yet");
  });

  it("never lets a brief become markup", async () => {
    const { post, page } = setup();
    await post({
      brief: `<img src=x onerror="alert(1)"> and <script>alert("x")</script> in a brief.`,
      kind: "creative",
      price_cents: 20,
      deadline: inAnHour(),
    });

    const html = await page();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('onerror="alert');
    expect(html, "it still has to be readable as text").toContain("in a brief.");
  });

  it("says so plainly when nothing is open, instead of an empty page", async () => {
    const { page } = setup();
    const html = await page();
    expect(html).toContain("Nothing is open right now");
    expect(html, "a dead end is worse than a pointer").toContain("/receipts.json");
  });

  it("is where the landing page sends somebody who wants to see the market", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toContain('href="/jobs"');
    expect(await (await app.request("/llms.txt")).text()).toContain("/jobs");
  });
});
