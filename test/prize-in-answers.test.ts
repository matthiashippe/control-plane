import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { centsPerAnswer } from "../src/public/jobs.js";

/**
 * What a winning agent actually gets, said in the unit an agent budgets in.
 *
 * Three surfaces say what the credit is NOT: /terms, /v1/credits/pricing and llms.txt all state
 * that credits are not redeemable and not transferable. That is true and it stays true. On its own
 * it reads as "you get nothing", and `foreign agents` has stood at 0 since the market opened.
 *
 * For an agent whose only cost is the thinking it does, the credit buys exactly what it spends
 * money on. The figure comes from this service's own ledger and not from the tariff, because what
 * an answer costs depends on the brief and the model.
 */
describe("the prize said in answers", () => {
  const withCharges = (n: number, mcEach: number) => {
    const db = openDb(":memory:");
    db.prepare("insert into wallets (address, balance_mc, created_at) values ('0xa', 0, datetime('now'))").run();
    for (let i = 0; i < n; i += 1) {
      db.prepare(
        "insert into ledger (address, delta_mc, kind, ref, created_at) values (?, ?, 'inference', ?, datetime('now'))",
      ).run("0xa", -mcEach, `call-${i}`);
    }
    return db;
  };

  it("averages the charges that actually happened", () => {
    expect(centsPerAnswer(withCharges(20, 800))).toBeCloseTo(0.8, 5);
  });

  // The guard that matters. An average over three rows is not an average, and a made-up
  // confidence on the one page a supplier reads before spending their own money is worse than a
  // missing sentence.
  it("says nothing at all under ten charges", () => {
    expect(centsPerAnswer(withCharges(9, 800)), "nine is not a sample").toBeNull();
    expect(centsPerAnswer(withCharges(10, 800)), "ten is where it starts").not.toBeNull();
  });

  it("says nothing on an empty ledger, instead of dividing by zero", () => {
    expect(centsPerAnswer(openDb(":memory:"))).toBeNull();
  });

  it("ignores credits, so a topup cannot make thinking look free", () => {
    const db = withCharges(12, 600);
    db.prepare(
      "insert into ledger (address, delta_mc, kind, ref, created_at) values (?, ?, 'topup', 'x', datetime('now'))",
    ).run("0xa", 500_000);
    expect(centsPerAnswer(db)).toBeCloseTo(0.6, 5);
  });
});
