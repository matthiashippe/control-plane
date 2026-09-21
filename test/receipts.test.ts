/**
 * The public receipt, and the line it must not cross.
 *
 * Briefs were always declared public. Submissions never were: the only promise ever made about
 * them is that competitors cannot read each other *before* the decision, which says nothing about
 * after. So publishing work handed in under that silence would take something nobody offered, and
 * the tests that matter most here are the ones about what stays hidden.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger, MC_PER_CENT } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { PUBLICATION_FROM } from "../src/bounties/receipts.js";

function account(db: ReturnType<typeof openDb>, app: ReturnType<typeof createApp>, balanceMc: number, n: number) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${String(n).repeat(2)}` + "9a".repeat(15);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: `seed-${n}` });
  const call = (path: string, method: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", authorization: key },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { address, call };
}

/** A posted, submitted-to and awarded bounty, with control over when each submission was made. */
async function market(submittedAt: string[]) {
  const db = openDb(":memory:");
  const app = createApp({ db, pay: { payTo: "0x" + "1".repeat(40) } as never });
  const buyer = account(db, app, 500_000, 1);
  const agents = submittedAt.map((_, i) => account(db, app, 50_000, i + 2));

  const posted = await buyer.call("/v1/bounties", "POST", {
    brief: "Write a fact sheet for developers. 90 words. Deliver the paragraph only. Do not use the word powerful.",
    kind: "factual",
    price_cents: 150,
    deadline: new Date(Date.now() + 3600e3).toISOString(),
  });
  const { id } = (await posted.json()) as { id: string };

  const subIds: string[] = [];
  for (const [i, agent] of agents.entries()) {
    const res = await agent.call("/v1/submissions", "POST", { bounty_id: id, body: `Work from agent ${i}.` });
    const s = (await res.json()) as { id: string };
    subIds.push(s.id);
    // The only thing the test controls: when it counts as having been handed in.
    db.prepare("UPDATE submissions SET created_at = ? WHERE id = ?").run(submittedAt[i], s.id);
  }
  return { db, app, buyer, agents, id, subIds };
}

const BEFORE = "2026-09-20T10:00:00.000Z";
const AFTER = "2026-09-21T09:00:00.000Z";

describe("/receipts.json", () => {
  it("shows an awarded job with its brief, its money and who won", async () => {
    const { app, buyer, id, subIds } = await market([AFTER, AFTER]);
    await buyer.call("/v1/bounties/award", "POST", { bounty_id: id, submission_id: subIds[1] });

    const body = (await (await app.request("/receipts.json")).json()) as {
      awarded: number;
      publication_rule_from: string;
      receipts: { bounty_id: string; brief: string; price_cents: number; fee_cents: number; award_cents: number; competitors: number; entries: { agent: string; won: boolean; body: string | null }[] }[];
    };

    expect(body.awarded).toBe(1);
    expect(body.publication_rule_from).toBe(PUBLICATION_FROM);
    const r = body.receipts[0];
    expect(r.bounty_id).toBe(id);
    expect(r.brief).toContain("fact sheet");
    expect(r.price_cents).toBe(150);
    expect(r.fee_cents + r.award_cents, "the receipt has to add up to what the buyer paid").toBe(150);
    expect(r.competitors).toBe(2);
    expect(r.entries.filter((e) => e.won)).toHaveLength(1);
    expect(r.entries.find((e) => e.won)!.body).toBe("Work from agent 1.");
  });

  it("counts a submission made before the rule and withholds its text", async () => {
    const { app, buyer, id, subIds } = await market([BEFORE, AFTER]);
    await buyer.call("/v1/bounties/award", "POST", { bounty_id: id, submission_id: subIds[1] });

    const body = (await (await app.request("/receipts.json")).json()) as {
      receipts: { competitors: number; entries: { body: string | null; withheld: string | null; submitted_at: string }[] }[];
    };
    const entries = body.receipts[0].entries;

    expect(body.receipts[0].competitors, "hiding that it exists would falsify the one number a reader wants").toBe(2);
    const old = entries.find((e) => e.submitted_at === BEFORE)!;
    expect(old.body, "nothing told this agent its work would be read").toBeNull();
    expect(old.withheld).toContain(PUBLICATION_FROM);
    const fresh = entries.find((e) => e.submitted_at === AFTER)!;
    expect(fresh.body).toBe("Work from agent 1.");
    expect(fresh.withheld).toBeNull();
  });

  it("never names the buyer and always names the agent", async () => {
    const { app, buyer, agents, id, subIds } = await market([AFTER]);
    await buyer.call("/v1/bounties/award", "POST", { bounty_id: id, submission_id: subIds[0] });

    const text = await (await app.request("/receipts.json")).text();
    expect(text, "the open list hides the buyer and so does this").not.toContain(buyer.address);
    // The agent is named on purpose: an address is what earns a reputation here, and a receipt
    // that hides who did the work proves nothing.
    expect(text).toContain(agents[0].address);
  });

  it("holds only finished work: nothing open, nothing cancelled", async () => {
    const { app, buyer, id } = await market([AFTER]);

    let body = (await (await app.request("/receipts.json")).json()) as { awarded: number };
    expect(body.awarded, "an open job is a promise, not a record").toBe(0);

    await buyer.call("/v1/bounties/cancel", "POST", { id });
    body = (await (await app.request("/receipts.json")).json()) as { awarded: number };
    expect(body.awarded).toBe(0);
  });

  it("answers without a key, because the reader has not signed in and is deciding whether this is real", async () => {
    const { app } = await market([]);
    const res = await app.request("/receipts.json");
    expect(res.status).toBe(200);
    expect((await res.json() as { note: string }).note).toContain("buyer is not named");
  });
});
