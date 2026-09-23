/**
 * Adversarial pass over the money path (2026-09-21).
 *
 * Everything here is written from the attacker's side: a sequence of API calls that an ordinary
 * client would never make, aimed at the two invariants this service lives on.
 *
 *   1. No wallet ends up with credit nobody paid for. Credit is destroyed when it buys something
 *      real, and inference is real: the operator pays a provider for it in cash.
 *   2. The sum over `ledger.delta_mc` equals `wallets.balance_mc`, per address and in total.
 *
 * The tests hold a provider call open on purpose. That await is the only place in this service
 * where two requests from the same address interleave, and every reservation bug has to live
 * inside it.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger, MC_PER_CENT, type Db } from "../src/db.js";
import { Catalog, costMc } from "../src/inference/proxy.js";
import {
  estimateTokens,
  ProviderUnavailableError,
  type ChatProvider,
  type ChatMessage,
  type ChatResponse,
  type ModelSpec,
} from "../src/inference/provider.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { claimStarter, poolLeftMc, GRANT_MC } from "../src/credits/starter.js";
import { releaseExpired } from "../src/bounties/store.js";

// This file spends the whole pool to test what the pages say when it is empty, which is more
// than one day allows since 2026-09-23. The day's ceiling is lifted here on purpose and named,
// rather than the cap being left out of reach of the tests that would notice it.
process.env.CP_POOL_DAILY_MC = "500000";

const SPEC: ModelSpec = { id: "gated-1", provider: "gated", inputPerMillion: 1, outputPerMillion: 2, contextWindow: 128_000 };
const MAX_TOKENS = 32_768;
const MESSAGES: ChatMessage[] = [{ role: "user", content: "Say something long." }];
const PROMPT_TOKENS = estimateTokens(MESSAGES);
/** What the proxy reserves before the call, and what the call really costs: the two are equal here. */
const CALL_MC = costMc(SPEC, { prompt_tokens: PROMPT_TOKENS, completion_tokens: MAX_TOKENS });

/**
 * A provider that stops inside the call until the test lets it go. That is the window an attacker
 * has: the reservation is already made, the answer is already being bought, and the wallet is
 * reachable by a second request.
 */
class GatedProvider implements ChatProvider {
  readonly id = "gated";
  calls = 0;
  private open!: () => void;
  private entered!: () => void;
  readonly inFlight = new Promise<void>((resolve) => {
    this.entered = resolve;
  });
  private readonly gate = new Promise<void>((resolve) => {
    this.open = resolve;
  });

  models(): ModelSpec[] {
    return [SPEC];
  }

  async chat(): Promise<ChatResponse> {
    this.calls += 1;
    this.entered();
    await this.gate;
    return {
      id: `chatcmpl-gated-${this.calls}`,
      object: "chat.completion",
      created: 0,
      model: SPEC.id,
      choices: [{ index: 0, message: { role: "assistant", content: "done" }, finish_reason: "stop" }],
      usage: { prompt_tokens: PROMPT_TOKENS, completion_tokens: MAX_TOKENS, total_tokens: PROMPT_TOKENS + MAX_TOKENS },
    };
  }

  let_go(): void {
    this.open();
  }
}

/** Real grants to real addresses until nothing is left, so a stated balance is the whole truth. */
function emptyStarterPool(db: Db) {
  while (poolLeftMc(db) >= GRANT_MC) claimStarter(db, privateKeyToAccount(generatePrivateKey()).address.toLowerCase());
}

function setup(balanceMc: number) {
  const db = openDb(":memory:");
  const provider = new GatedProvider();
  const app = createApp({ db, catalog: new Catalog([provider]), pay: { payTo: "0x" + "1".repeat(40) } as never });
  emptyStarterPool(db);
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "ab".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: "seed" });

  const call = (path: string, method: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", authorization: key },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  return {
    db, app, provider, address,
    chat: () => call("/v1/chat/completions", "POST", { model: SPEC.id, messages: MESSAGES, max_tokens: MAX_TOKENS, stream: false }),
    postBounty: (priceCents: number) =>
      call("/v1/bounties", "POST", {
        brief: "Write a listing description for a two bedroom flat in Hamburg.",
        kind: "factual",
        price_cents: priceCents,
        deadline: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    cancel: (id: string) => call("/v1/bounties/cancel", "POST", { id }),
    balance: () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc,
    reserved: () => (db.prepare("SELECT reserved_mc FROM wallets WHERE address = ?").get(address) as { reserved_mc: number }).reserved_mc,
    charged: () =>
      -((db.prepare("SELECT coalesce(sum(delta_mc), 0) AS s FROM ledger WHERE address = ? AND kind = 'inference'").get(address) as { s: number }).s),
  };
}

/** Both books, side by side. The only number that may ever differ from the other is none. */
function booksAgree(db: Db): void {
  const rows = db
    .prepare(
      `SELECT w.address, w.balance_mc, coalesce((SELECT sum(delta_mc) FROM ledger l WHERE l.address = w.address), 0) AS ledger_mc
         FROM wallets w`,
    )
    .all() as { address: string; balance_mc: number; ledger_mc: number }[];
  for (const r of rows) {
    expect(r.ledger_mc, `ledger sum vs balance for ${r.address}`).toBe(r.balance_mc);
  }
}

describe("a bounty posted while an inference is in flight", () => {
  it("cannot spend the credit that call has reserved", async () => {
    // 12 cents in the wallet, about 8.5 of which the call in flight has reserved. What is left is
    // three and a bit, so a 12 cent bounty is not payable, however it is dressed up.
    const s = setup(12 * MC_PER_CENT);
    expect(CALL_MC).toBeLessThan(12 * MC_PER_CENT);

    const inference = s.chat();
    await s.provider.inFlight;
    expect(s.reserved()).toBe(CALL_MC);

    const res = await s.postBounty(12);
    expect(res.status, "a bounty must not be payable out of reserved credit").toBe(402);

    s.provider.let_go();
    await inference;
    booksAgree(s.db);
  });

  it("leaves the buyer paying for the call instead of getting it for free", async () => {
    const s = setup(12 * MC_PER_CENT);

    const inference = s.chat();
    await s.provider.inFlight;
    const bounty = await s.postBounty(12);
    const posted = bounty.status === 201 ? ((await bounty.json()) as { id: string }).id : null;

    s.provider.let_go();
    expect((await inference).status).toBe(200);

    if (posted) await s.cancel(posted);

    // The provider was called once and that call costs the operator real money. Whatever the
    // buyer does with bounties around it, the call has to be paid for out of this wallet.
    expect(s.provider.calls).toBe(1);
    expect(s.charged(), "the call in flight has to be charged in full").toBe(CALL_MC);
    expect(s.balance()).toBe(12 * MC_PER_CENT - CALL_MC);
    expect(s.reserved()).toBe(0);
    booksAgree(s.db);
  });
});

/**
 * A second setup, without the inference path: what a plain market instance does with money.
 *
 * `pay` is left unset on purpose in the first test below. An instance that sells no credits still
 * runs the market, and `feeTo` is derived from `pay.payTo`, so on such an instance an award books
 * no brokerage fee at all. The same holds for every job this service awarded before the fee
 * existed on 2026-09-20.
 */
function market(opts: { payTo?: string; catalog?: Catalog } = {}) {
  const db = openDb(":memory:");
  const app = createApp({
    db,
    ...(opts.payTo ? { pay: { payTo: opts.payTo } as never } : {}),
    ...(opts.catalog ? { catalog: opts.catalog } : {}),
  });
  const account = (n: number, balanceMc: number) => {
    const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const key = `cnwy_k_${String(n).repeat(2)}` + "cd".repeat(15);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
    );
    if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: `seed-${n}` });
    return {
      address,
      call: (path: string, method: string, body?: unknown) =>
        app.request(path, {
          method,
          headers: { "content-type": "application/json", authorization: key },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      balance: () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc,
    };
  };
  return { db, app, account };
}

const brief = (priceCents: number) => ({
  brief: "Write a fact sheet for developers, 90 words, paragraph only.",
  kind: "factual",
  price_cents: priceCents,
  deadline: new Date(Date.now() + 3_600_000).toISOString(),
});

describe("the public receipt", () => {
  it("states the money that actually moved, not the fee the price would imply", async () => {
    // No operator address, so awardBounty books no fee. The receipt is read by somebody deciding
    // whether this market is real, and it is the one place where they cannot check the number
    // against their own balance.
    const m = market();
    const buyer = m.account(1, 500_000);
    const agent = m.account(2, 0);

    const { id } = (await (await buyer.call("/v1/bounties", "POST", brief(150))).json()) as { id: string };
    const sub = (await (await agent.call("/v1/submissions", "POST", { bounty_id: id, body: "The work." })).json()) as { id: string };
    expect((await buyer.call("/v1/bounties/award", "POST", { bounty_id: id, submission_id: sub.id })).status).toBe(200);

    const paidOut = agent.balance();
    const body = (await (await m.app.request("/receipts.json")).json()) as {
      receipts: { price_cents: number; fee_cents: number; award_cents: number }[];
    };
    expect(body.receipts).toHaveLength(1);
    expect(body.receipts[0].award_cents * MC_PER_CENT, "award_cents is what the winner received").toBe(paidOut);
    expect(body.receipts[0].fee_cents, "no fee was taken, so none may be claimed").toBe(0);
    booksAgree(m.db);
  });

  it("still reports the fee when one was really taken", async () => {
    const operator = "0x" + "1".repeat(40);
    const m = market({ payTo: operator });
    const buyer = m.account(1, 500_000);
    const agent = m.account(2, 0);

    const { id } = (await (await buyer.call("/v1/bounties", "POST", brief(150))).json()) as { id: string };
    const sub = (await (await agent.call("/v1/submissions", "POST", { bounty_id: id, body: "The work." })).json()) as { id: string };
    await buyer.call("/v1/bounties/award", "POST", { bounty_id: id, submission_id: sub.id });

    const body = (await (await m.app.request("/receipts.json")).json()) as {
      receipts: { price_cents: number; fee_cents: number; award_cents: number }[];
    };
    expect(body.receipts[0].price_cents).toBe(150);
    expect(body.receipts[0].fee_cents).toBe(15);
    expect(body.receipts[0].award_cents * MC_PER_CENT).toBe(agent.balance());
    booksAgree(m.db);
  });
});

describe("the guard behind the starter grant", () => {
  /**
   * `migrate()` creates two unique indexes in one try block: one against a second credit for the
   * same x402 nonce, one against a second grant for the same address. The first cannot be created
   * on a database that already carries duplicate topup refs, which is precisely the state the bug
   * it guards against produces, and that failure took the grant index with it. Two bugs that have
   * nothing to do with each other, wired together so that one disables the other's defence.
   */
  it("is created even when the topup index cannot be", () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-grant-index-"));
    const path = join(dir, "cp.db");
    try {
      const first = openDb(path);
      // A database from before both indexes, which since collected a duplicate credit.
      first.exec("DROP INDEX IF EXISTS ledger_topup_ref");
      first.exec("DROP INDEX IF EXISTS ledger_grant_once");
      const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
      first.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
      for (const i of [1, 2]) {
        first
          .prepare("INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?, 'topup', 100, 'same-nonce', ?)")
          .run(address, `2026-09-0${i}T00:00:00.000Z`);
      }
      first.close();

      const db = openDb(path);
      const index = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'ledger_grant_once'")
        .get() as { name: string } | undefined;
      expect(index?.name, "the grant index must not depend on the topup index succeeding").toBe("ledger_grant_once");

      // And it has to do its job: a second grant row for the same address is refused by the
      // database, not only by the check in front of the insert.
      postLedger(db, { address, kind: "grant", deltaMc: GRANT_MC, ref: `starter:${address}` });
      expect(() => postLedger(db, { address, kind: "grant", deltaMc: GRANT_MC, ref: `starter:${address}` })).toThrow(/UNIQUE/);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Answers at once. For sequences where the point is the bookkeeping, not the window. */
class InstantProvider implements ChatProvider {
  readonly id = "instant";
  calls = 0;
  models(): ModelSpec[] {
    return [SPEC];
  }
  async chat(): Promise<ChatResponse> {
    this.calls += 1;
    return {
      id: `chatcmpl-instant-${this.calls}`,
      object: "chat.completion",
      created: 0,
      model: SPEC.id,
      choices: [{ index: 0, message: { role: "assistant", content: "done" }, finish_reason: "stop" }],
      usage: { prompt_tokens: PROMPT_TOKENS, completion_tokens: 40, total_tokens: PROMPT_TOKENS + 40 },
    };
  }
}

describe("the starter credit, taken through every door at once", () => {
  /**
   * Since 2026-09-21 the grant fires from three places: the endpoint built for it, the inference
   * path when a call cannot pay for itself, and the buyer path when a bounty cannot. Three doors
   * into the same pool, and the rule they all have to keep is one grant per address, ever.
   */
  it("gives one address exactly one grant, whichever doors it walks through", async () => {
    const db = openDb(":memory:");
    const provider = new InstantProvider();
    const app = createApp({ db, catalog: new Catalog([provider]), pay: { payTo: "0x" + "1".repeat(40) } as never });
    const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const key = "cnwy_k_" + "ef".repeat(16);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
    );
    const call = (path: string, method: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json", authorization: key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    // Door one: a call that cannot pay for itself.
    await call("/v1/chat/completions", "POST", { model: SPEC.id, messages: MESSAGES, max_tokens: 40, stream: false });
    // Door two: a bounty that cannot be paid for. One cent, so the grant covers it.
    await call("/v1/bounties", "POST", brief(1));
    // Door three: the endpoint built for it.
    const claimed = await call("/v1/credits/starter", "POST");
    expect(claimed.status, "the third door has to say the grant is gone, not hand out a second").toBe(409);

    const grants = db.prepare("SELECT delta_mc FROM ledger WHERE kind = 'grant' AND address = ?").all(address) as { delta_mc: number }[];
    expect(grants).toHaveLength(1);
    expect(grants[0].delta_mc).toBe(GRANT_MC);
    expect(provider.calls, "the inference itself went through on the grant").toBe(1);
    booksAgree(db);
  });
});

describe("a full run through the market", () => {
  /**
   * The question this whole file exists for, stated as arithmetic: across every wallet, credit can
   * only ever have come from a topup or a grant, and can only ever have left through an inference
   * charge. Everything the bounty market does is a move between two accounts of the same system,
   * so `bounty_hold`, `bounty_release`, `bounty_award` and `bounty_fee` have to add up to zero.
   *
   * A wallet holding credit nobody paid for shows up here as a gap, whatever route produced it.
   */
  it("leaves no credit behind that nobody paid for", async () => {
    const operator = "0x" + "1".repeat(40);
    const provider = new InstantProvider();
    const m = market({ payTo: operator, catalog: new Catalog([provider]) });

    const buyer = m.account(1, 300_000);
    const winner = m.account(2, 0);
    const loser = m.account(3, 0);

    // Posted, competed for, awarded.
    const { id: awarded } = (await (await buyer.call("/v1/bounties", "POST", brief(150))).json()) as { id: string };
    const sub = (await (await winner.call("/v1/submissions", "POST", { bounty_id: awarded, body: "The winning work." })).json()) as { id: string };
    await loser.call("/v1/submissions", "POST", { bounty_id: awarded, body: "The other work." });
    await buyer.call("/v1/bounties/award", "POST", { bounty_id: awarded, submission_id: sub.id });

    // Posted and taken back.
    const { id: cancelled } = (await (await buyer.call("/v1/bounties", "POST", brief(50))).json()) as { id: string };
    await buyer.call("/v1/bounties/cancel", "POST", { id: cancelled });

    // Posted and left to run out.
    await buyer.call("/v1/bounties", "POST", brief(30));
    expect(releaseExpired(m.db, new Date(Date.now() + 2 * 3_600_000))).toBe(1);

    // The winner spends what it earned on thinking, and takes its grant on the way.
    for (const who of [winner, loser]) {
      const res = await who.call("/v1/chat/completions", "POST", { model: SPEC.id, messages: MESSAGES, max_tokens: 40, stream: false });
      expect(res.status).toBe(200);
    }

    booksAgree(m.db);

    const sum = (sql: string) => (m.db.prepare(sql).get() as { s: number }).s;
    const paidIn = sum("SELECT coalesce(sum(delta_mc), 0) AS s FROM ledger WHERE kind IN ('topup', 'grant')");
    const spent = sum("SELECT coalesce(sum(delta_mc), 0) AS s FROM ledger WHERE kind = 'inference'");
    const market_moves = sum(
      "SELECT coalesce(sum(delta_mc), 0) AS s FROM ledger WHERE kind IN ('bounty_hold', 'bounty_release', 'bounty_award', 'bounty_fee')",
    );
    const held = sum("SELECT coalesce(sum(balance_mc), 0) AS s FROM wallets");

    expect(market_moves, "the market only moves credit, it never makes or destroys any").toBe(0);
    expect(held, "every cent in a wallet came from a topup or a grant and left only through inference").toBe(paidIn + spent);
    expect(spent, "the calls really were charged").toBeLessThan(0);
    expect(provider.calls).toBe(2);
  });
});

/** Refuses every call. The reservation has to survive that without taking the credit with it. */
class BrokenProvider implements ChatProvider {
  readonly id = "broken";
  models(): ModelSpec[] {
    return [SPEC];
  }
  async chat(): Promise<ChatResponse> {
    throw new ProviderUnavailableError("broken", 502, "upstream is down");
  }
}

describe("the other side of holding money back", () => {
  /**
   * The counter-test to the fix above, and the one that matters more in practice: a rule that
   * refuses to spend reserved credit is only safe if reservations reliably disappear. A provider
   * outage is the common case, and if it left the reservation standing, the buyer's money would be
   * locked until the next deploy while `/v1/credits/balance` still showed it.
   */
  it("gives a failed call its reservation straight back, so the credit is spendable again", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, catalog: new Catalog([new BrokenProvider()]), pay: { payTo: "0x" + "1".repeat(40) } as never });
    emptyStarterPool(db);
    const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const key = "cnwy_k_" + "1f".repeat(16);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
    );
    postLedger(db, { address, kind: "topup", deltaMc: 12 * MC_PER_CENT, ref: "seed" });
    const call = (path: string, method: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json", authorization: key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    const failed = await call("/v1/chat/completions", "POST", { model: SPEC.id, messages: MESSAGES, max_tokens: MAX_TOKENS, stream: false });
    expect(failed.status).toBe(503);
    expect((db.prepare("SELECT reserved_mc FROM wallets WHERE address = ?").get(address) as { reserved_mc: number }).reserved_mc).toBe(0);

    // And the whole balance is postable again, which is what the reservation rule must not cost.
    expect((await call("/v1/bounties", "POST", brief(12))).status).toBe(201);
    booksAgree(db);
  });
});

describe("what the reservation does not cover", () => {
  /**
   * Known and left standing, written down so it is not rediscovered as a surprise.
   *
   * The reservation is built on `estimateTokens`, four characters to a token. When the provider
   * reports more prompt tokens than that (any text a tokenizer does not split at four bytes), the
   * charge is capped at what the wallet holds and the rest is written off as `uncollected_mc`. The
   * wallet ends at zero rather than negative, which is the documented trade, and the operator
   * carries the difference for a call it has already paid for upstream.
   *
   * Not fixed here. The fix is a more conservative estimate, that is a change to what every honest
   * call reserves, and it needs a measurement against a real tokenizer rather than a guess. This
   * test pins the behaviour so a change to it is deliberate.
   */
  it("writes off what a cheap estimate did not cover, and never takes the wallet negative", async () => {
    class GreedyProvider implements ChatProvider {
      readonly id = "greedy";
      models(): ModelSpec[] {
        return [SPEC];
      }
      async chat(): Promise<ChatResponse> {
        return {
          id: "chatcmpl-greedy",
          object: "chat.completion",
          created: 0,
          model: SPEC.id,
          // Four times the estimate, which is what a prompt of non-ASCII text costs in reality.
          choices: [{ index: 0, message: { role: "assistant", content: "done" }, finish_reason: "stop" }],
          usage: { prompt_tokens: PROMPT_TOKENS * 4, completion_tokens: MAX_TOKENS * 4, total_tokens: 0 },
        };
      }
    }
    const db = openDb(":memory:");
    const app = createApp({ db, catalog: new Catalog([new GreedyProvider()]) });
    emptyStarterPool(db);
    const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const key = "cnwy_k_" + "2f".repeat(16);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
    );
    postLedger(db, { address, kind: "topup", deltaMc: CALL_MC, ref: "seed" });

    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({ model: SPEC.id, messages: MESSAGES, max_tokens: MAX_TOKENS, stream: false }),
    });
    expect(res.status).toBe(200);

    const row = db.prepare("SELECT delta_mc, meta FROM ledger WHERE kind = 'inference' AND address = ?").get(address) as {
      delta_mc: number;
      meta: string;
    };
    const meta = JSON.parse(row.meta) as { cost_mc: number; uncollected_mc: number };
    expect(-row.delta_mc, "it takes everything the wallet has").toBe(CALL_MC);
    expect(meta.cost_mc, "and the call was worth about four times that").toBeGreaterThan(CALL_MC * 3);
    expect(meta.uncollected_mc, "the difference is the operator's, and it is written down").toBe(meta.cost_mc - CALL_MC);
    expect((db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc).toBe(0);
    booksAgree(db);
  });
});
