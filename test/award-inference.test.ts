import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { MockProvider, MOCK_MODEL } from "../src/inference/mock.js";
import { Catalog } from "../src/inference/proxy.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { claimStarter, GRANT_MC } from "../src/credits/starter.js";

// goals/kunden/08: does an accepted submission pay for inference today? This file pins down what the
// code does, not what it should do. The customer is modelled on customer 1 of docs/kunden: a foreign
// wallet whose starter credit is spent and whose balance is zero, so every call to
// /v1/chat/completions ends in 402 and points at the board.

const IN_ONE_HOUR = () => new Date(Date.now() + 3_600_000).toISOString();

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db, catalog: new Catalog([new MockProvider()]) });
  const account = (n: number, seedMc: number) => {
    const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const key = `cnwy_k_${String(n).repeat(2)}` + "cd".repeat(15);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address, hashApiKey(key), key.slice(0, 15), "conway-automaton", new Date().toISOString(),
    );
    if (seedMc > 0) postLedger(db, { address, kind: "topup", deltaMc: seedMc, ref: `seed-${n}` });
    const call = (path: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: key },
        body: JSON.stringify(body),
      });
    const balance = () =>
      (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
    const rows = (kind: string) =>
      (db.prepare("SELECT count(*) AS n FROM ledger WHERE address = ? AND kind = ?").get(address, kind) as { n: number }).n;
    return { address, call, balance, rows };
  };
  // The customer took its starter credit long ago and spent it: balance zero, no second grant.
  const customer = account(1, 0);
  claimStarter(db, customer.address);
  postLedger(db, { address: customer.address, kind: "inference", deltaMc: -GRANT_MC, ref: "spent-starter" });
  // Another automaton with credit posts the work.
  const buyer = account(2, 500_000);
  const chat = () =>
    customer.call("/v1/chat/completions", {
      model: MOCK_MODEL.id,
      messages: [{ role: "user", content: "One useful turn." }],
      max_tokens: 64,
      stream: false,
    });
  return { db, customer, buyer, chat };
}

describe("award and inference (goals/kunden/08)", () => {
  it("no award no inference: a foreign wallet with zero balance gets 402 on /v1/chat/completions", async () => {
    const { customer, buyer, chat } = setup();
    expect(customer.balance()).toBe(0);
    // A job is open, so the 402 points the customer at the board, as it does in production.
    const posted = await buyer.call("/v1/bounties", { brief: "Summarise a page.", kind: "factual", price_cents: 200, deadline: IN_ONE_HOUR() });
    expect(posted.status).toBe(201);

    const res = await chat();
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; details: { open_bounties?: number; bounties_url?: string } };
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
    expect(body.details.open_bounties).toBe(1);
    expect(body.details.bounties_url).toMatch(/\/bounties\.json$/);
    expect(customer.rows("inference")).toBe(1); // only the spent starter, nothing charged for the 402
    expect(customer.balance()).toBe(0);
  });

  it("award then inference: the award lands as bounty_award on the balance and the next chat call is answered and charged", async () => {
    const { customer, buyer, chat } = setup();
    const posted = await buyer.call("/v1/bounties", { brief: "Summarise a page.", kind: "factual", price_cents: 200, deadline: IN_ONE_HOUR() });
    expect(posted.status).toBe(201);
    const bountyId = ((await posted.json()) as { id: string }).id;

    const submitted = await customer.call("/v1/submissions", { bounty_id: bountyId, body: "The page in three sentences." });
    expect(submitted.status).toBe(201);
    const submissionId = ((await submitted.json()) as { id: string }).id;

    // Before the award the customer still cannot think.
    expect((await chat()).status).toBe(402);

    const awarded = await buyer.call("/v1/bounties/award", { bounty_id: bountyId, submission_id: submissionId });
    expect(awarded.status).toBe(200);
    expect(customer.rows("bounty_award")).toBe(1);
    const afterAward = customer.balance();
    expect(afterAward).toBeGreaterThan(0);

    const res = await chat();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    expect(body.choices.length).toBeGreaterThan(0);
    // The answer is paid out of the award: one more inference row, a lower balance.
    expect(customer.rows("inference")).toBe(2);
    expect(customer.balance()).toBeLessThan(afterAward);
  });
});
