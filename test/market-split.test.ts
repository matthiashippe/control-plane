import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { marketSplit, OUR_ADDRESSES } from "../src/bounties/ours.js";

/**
 * The market's books, published so somebody else can check them.
 *
 * Conway issue #335 asks for publicly verifiable evidence and complains that everybody quotes
 * revenue nobody can audit. The honest version of an answer to it needs these numbers on a page,
 * not in a report only the operator runs, and needs them to be wrong in neither direction: an
 * award between two of our own addresses must never read as demand, and a real stranger's award
 * must never be filed away as ours.
 */
function seed(
  db: ReturnType<typeof openDb>,
  opts: { creator: string; agent: string; keyName?: string; funded: boolean; priceCents: number },
) {
  const now = new Date().toISOString();
  for (const a of [opts.creator, opts.agent]) {
    db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(a, now);
  }
  if (opts.keyName) {
    db.prepare(
      "INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(opts.creator, hashApiKey(`k-${opts.creator}`), "cnwy_k_0", opts.keyName, now);
  }
  if (opts.funded) {
    db.prepare(
      "INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?, 'topup', 1, ?, ?)",
    ).run(opts.creator, `t:${opts.creator}`, now);
  }
  const id = `b-${opts.creator}-${opts.priceCents}`;
  db.prepare(
    "INSERT INTO bounties (id, creator, kind, brief, price_mc, deadline, status, created_at, closed_at) " +
      "VALUES (?, ?, 'factual', 'brief', ?, ?, 'awarded', ?, ?)",
  ).run(id, opts.creator, opts.priceCents * 1000, now, now, now);
  db.prepare(
    "INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?, 'bounty_hold', ?, ?, ?)",
  ).run(opts.creator, -opts.priceCents * 1000, `bounty:${id}`, now);
  db.prepare(
    "INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?, 'bounty_fee', ?, ?, ?)",
  ).run(opts.creator, opts.priceCents * 100, `bounty-fee:${id}`, now);
  db.prepare(
    "INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES (?, ?, ?, 'work', ?)",
  ).run(`s-${id}`, id, opts.agent, now);
  return id;
}

const stranger = (n: number) => "0x" + String(n).repeat(40).slice(0, 40);

describe("the market's books, ours and everybody else's", () => {
  it("counts an empty market as empty rather than as nothing", () => {
    const m = marketSplit(openDb(":memory:"));
    expect(m.awarded_30d).toEqual({ total: 0, not_ours: 0 });
    expect(m.volume_30d_cents).toEqual({ total: 0, not_ours: 0 });
    expect(m.buyers).toEqual({ total: 0, not_ours: 0 });
  });

  it("never reads our own award as somebody else's demand", () => {
    const db = openDb(":memory:");
    seed(db, { creator: OUR_ADDRESSES[0], agent: OUR_ADDRESSES[1], funded: true, priceCents: 200 });
    const m = marketSplit(db);
    expect(m.awarded_30d).toEqual({ total: 1, not_ours: 0 });
    expect(m.volume_30d_cents).toEqual({ total: 200, not_ours: 0 });
    expect(m.commission_30d_cents.not_ours).toBe(0);
    expect(m.buyers.not_ours, "the buyer is ours by address").toBe(0);
    expect(m.agents.not_ours).toBe(0);
  });

  // The other direction, and the one that matters: the day a stranger really awards, this has to
  // say so. A counter that can only report zero is the failure this file exists against.
  it("says so the moment a stranger funds and awards one", () => {
    const db = openDb(":memory:");
    seed(db, { creator: OUR_ADDRESSES[0], agent: OUR_ADDRESSES[1], funded: true, priceCents: 200 });
    seed(db, { creator: stranger(7), agent: stranger(8), funded: true, priceCents: 150 });
    const m = marketSplit(db);
    expect(m.awarded_30d).toEqual({ total: 2, not_ours: 1 });
    expect(m.volume_30d_cents).toEqual({ total: 350, not_ours: 150 });
    expect(m.commission_30d_cents).toEqual({ total: 35, not_ours: 15 });
    expect(m.buyers).toEqual({ total: 2, not_ours: 1 });
    expect(m.agents).toEqual({ total: 2, not_ours: 1 });
  });

  // A job the starter pool paid for is real activity and is not somebody choosing to spend. Same
  // condition ops/db-report.cjs uses, and the reason the two numbers are allowed to disagree.
  it("does not count a job whose buyer never put money in", () => {
    const db = openDb(":memory:");
    seed(db, { creator: stranger(3), agent: stranger(4), funded: false, priceCents: 50 });
    const m = marketSplit(db);
    expect(m.awarded_30d, "counted as activity").toEqual({ total: 1, not_ours: 0 });
    expect(m.volume_30d_cents.not_ours, "and not as demand").toBe(0);
    expect(m.buyers.not_ours, "the buyer is still a stranger, that much is true").toBe(1);
  });

  it("recognises a tool of ours by its key name, not only by address", () => {
    const db = openDb(":memory:");
    seed(db, { creator: stranger(5), agent: stranger(6), keyName: "ops-probe", funded: true, priceCents: 90 });
    const m = marketSplit(db);
    expect(m.volume_30d_cents.not_ours).toBe(0);
    expect(m.buyers.not_ours).toBe(0);
  });

  it("leaves out an award older than the window, because a total can never report a decline", () => {
    const db = openDb(":memory:");
    const id = seed(db, { creator: stranger(7), agent: stranger(8), funded: true, priceCents: 150 });
    db.prepare("UPDATE bounties SET closed_at = datetime('now','-40 day') WHERE id = ?").run(id);
    expect(marketSplit(db).awarded_30d).toEqual({ total: 0, not_ours: 0 });
  });

  it("publishes it, because a number the operator alone can see proves nothing", async () => {
    const db = openDb(":memory:");
    seed(db, { creator: stranger(7), agent: stranger(8), funded: true, priceCents: 150 });
    const res = await createApp({ db }).request("/v1/status");
    const body = (await res.json()) as { market: ReturnType<typeof marketSplit> };
    expect(body.market.volume_30d_cents).toEqual({ total: 150, not_ours: 150 });
    expect(body.market.buyers.not_ours).toBe(1);
  });
});
