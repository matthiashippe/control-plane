/**
 * The receipt a person can read, and the line it still must not cross.
 *
 * `/receipts.json` is the parser's answer. This is the one a link points at, and it shows the work
 * itself, which means every rule about what may be published applies here too and has to be
 * guarded here too: work handed in before the rule existed stays withheld, and so does its author.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";

function konto(db: ReturnType<typeof openDb>, app: ReturnType<typeof createApp>, n: number, balanceMc: number) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${String(n).repeat(2)}` + "3d".repeat(15);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: `seed-${n}` });
  return {
    address,
    call: (path: string, body?: unknown) =>
      app.request(path, { method: "POST", headers: { "content-type": "application/json", authorization: key }, body: JSON.stringify(body ?? {}) }),
  };
}

async function markt(submittedAt: string) {
  const db = openDb(":memory:");
  const app = createApp({ db, pay: { payTo: "0x" + "1".repeat(40) } as never });
  const buyer = konto(db, app, 1, 500_000);
  const agent = konto(db, app, 2, 50_000);
  const posted = await buyer.call("/v1/bounties", {
    brief: "FACT SHEET for developers.\n\nA second paragraph of the brief.",
    kind: "factual",
    price_cents: 200,
    deadline: new Date(Date.now() + 3600e3).toISOString(),
  });
  const { id } = (await posted.json()) as { id: string };
  const sub = await agent.call("/v1/submissions", { bounty_id: id, body: "THE WINNING WORK, in full." });
  const s = (await sub.json()) as { id: string };
  db.prepare("UPDATE submissions SET created_at = ? WHERE id = ?").run(submittedAt, s.id);
  await buyer.call("/v1/bounties/award", { bounty_id: id, submission_id: s.id });
  return { db, app, agent, buyer, id, page: async () => (await app.request("/receipts")).text() };
}

describe("/receipts", () => {
  it("shows the work that won, when the rule covers it", async () => {
    const { page, agent, buyer, id } = await markt("2026-09-22T10:00:00.000Z");
    const html = await page();

    expect(html).toContain("THE WINNING WORK, in full.");
    expect(html, "the brief belongs next to the work it bought").toContain("A second paragraph of the brief.");
    expect(html).toContain("180 ¢");
    expect(html, "the commission, and that it came off the winner").toContain("20 ¢");
    expect(html).toContain(agent.address.slice(0, 6));
    expect(html, "the buyer is never named").not.toContain(buyer.address);
    expect(html, "a receipt needs an address of its own").toContain(`id="${id}"`);
  });

  it("withholds the work and the author when it was handed in before the rule", async () => {
    const { page, agent } = await markt("2026-09-20T10:00:00.000Z");
    const html = await page();

    expect(html, "nobody told this agent its work would be read").not.toContain("THE WINNING WORK");
    expect(html, "and nobody told it that it would be named either").not.toContain(agent.address.slice(0, 6));
    expect(html, "that somebody competed still has to be visible").toContain("1 agent competed");
    expect(html).toContain("author withheld");
  });

  it("says so plainly when nothing has been paid out", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const html = await (await app.request("/receipts")).text();
    expect(html).toContain("Nothing has been paid out yet");
    expect(html, "a dead end is worse than a pointer").toContain("/jobs");
  });

  it("is named in the sitemap, with the other three", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const res = await app.request("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    const xml = await res.text();
    for (const pfad of ["/", "/jobs", "/receipts", "/x402"]) {
      expect(xml).toContain(`https://cp.hippe.eu${pfad}<`);
    }
    expect(await (await app.request("/robots.txt")).text()).toContain("Sitemap: https://cp.hippe.eu/sitemap.xml");
  });
});
