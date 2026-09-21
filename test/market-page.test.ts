/**
 * The market on the landing page: that it is there, and that it cannot be used as a weapon.
 *
 * Two things are being guarded here and only one of them is the feature. A brief is arbitrary text
 * from anybody who can post a job, and until 2026-09-21 it only ever appeared inside JSON, where
 * the encoder handles it. Rendering it into HTML makes it an injection vector, so the escaping
 * test matters more than the rendering test.
 *
 * The second guard is the inline script. It is covered by a CSP hash that lives in the Caddyfile,
 * and `deploy/**` is not touched without a human, so any change to that script silently breaks the
 * site's security headers at the next deploy. The server renders into the body; the test proves it
 * stayed out of the script.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { esc } from "../src/public/market.js";

function buyer(db: ReturnType<typeof openDb>, app: ReturnType<typeof createApp>, n = 1) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${String(n).repeat(2)}` + "7b".repeat(15);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: `seed-${n}` });
  return {
    address,
    call: (path: string, method: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json", authorization: key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db, pay: { payTo: "0x" + "1".repeat(40) } as never });
  return { db, app, page: async () => (await app.request("/")).text() };
}

const inAnHour = () => new Date(Date.now() + 3600e3).toISOString();

describe("The market on the landing page", () => {
  it("shows an open job with what it pays, so a visitor sees the market instead of reading about it", async () => {
    const { app, db, page } = setup();
    await buyer(db, app).call("/v1/bounties", "POST", {
      brief: "Write a fact sheet about service charges in Dubai Marina. 90 words. Deliver the paragraph only. Do not use the word powerful.",
      kind: "factual",
      price_cents: 150,
      deadline: inAnHour(),
    });

    const html = await page();
    expect(html).toContain("The market right now");
    expect(html).toContain("Write a fact sheet about service charges");
    expect(html).toContain("150 ¢");
    expect(html, "the agent's share after the 10 per cent commission").toContain("135 ¢");
  });

  it("escapes a brief, because a brief is written by somebody else", async () => {
    const { app, db, page } = setup();
    const attack = `<script>alert('x')</script><img src=x onerror="alert(1)">`;
    await buyer(db, app).call("/v1/bounties", "POST", {
      brief: `${attack} and then ninety words about it.`,
      kind: "creative",
      price_cents: 20,
      deadline: inAnHour(),
    });

    const html = await page();
    expect(html, "the tag must never reach the browser as a tag").not.toContain("<script>alert");
    expect(html).not.toContain("onerror=\"alert");
    expect(html).toContain(esc("<script>alert('x')</script>").slice(0, 30));
  });

  it("names the winner and never the buyer", async () => {
    const { app, db, page } = setup();
    const b = buyer(db, app, 1);
    const agent = buyer(db, app, 2);
    const posted = await b.call("/v1/bounties", "POST", { brief: "A job that gets paid out.", kind: "factual", price_cents: 200, deadline: inAnHour() });
    const { id } = (await posted.json()) as { id: string };
    const sub = await agent.call("/v1/submissions", "POST", { bounty_id: id, body: "Finished work." });
    const s = (await sub.json()) as { id: string };
    await b.call("/v1/bounties/award", "POST", { bounty_id: id, submission_id: s.id });

    const html = await page();
    expect(html).toContain("A job that gets paid out.");
    expect(html, "the commission on 200 cents").toContain("20 ¢");
    expect(html).toContain(agent.address.slice(0, 6));
    expect(html, "the open list hides the buyer and so does the page").not.toContain(b.address);
  });

  it("says plainly that nothing is there instead of showing an empty table", async () => {
    const { page } = setup();
    const html = await page();
    expect(html).toContain("Nothing is open right now.");
    expect(html).toContain("Nothing has been awarded yet.");
  });

  it("leaves the inline script byte for byte as it is on disk", async () => {
    // The CSP hash for this script lives in the Caddyfile, which is not touched without a human.
    // A single character added here would break the security headers at the next deploy, and the
    // smoke test would catch it only after the site was already serving without them.
    const { page } = setup();
    const onDisk = /<script>[\s\S]*?<\/script>/.exec(readFileSync("src/public/index.html", "utf-8"));
    const served = /<script>[\s\S]*?<\/script>/.exec(await page());
    expect(onDisk, "the page has to have exactly one inline script").not.toBeNull();
    expect(served![0]).toBe(onDisk![0]);
  });

  it("leaves no placeholder behind when the page is served", async () => {
    const { page } = setup();
    expect(await page()).not.toContain("<!--MARKET-->");
  });
});
