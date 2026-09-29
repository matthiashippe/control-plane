/**
 * The commission a bounty was posted under, and why it now lives on the row.
 *
 * `feeMc()` read the `FEE_PERCENT` constant at AWARD time, so moving the figure would have
 * silently changed the payout of every job already on the board. `/bounties.json` publishes
 * `award_cents` per open job and the pages promise "the winner is credited the price minus the
 * fee". An agent that read 135 and was then paid 120 would have been told one number and given
 * another, which is not a pricing change but a broken promise, and it is the reason the
 * commission could not be moved at all.
 *
 * Since 2026-09-29 the rate is written onto the bounty when it is posted. These cases hold the
 * property that makes the figure safe to change: a bounty pays what it promised, whatever the
 * constant says later.
 */
import { describe, expect, it } from "vitest";
import { openDb, postLedger } from "../src/db.js";
import { createBounty, submitWork, awardBounty, getBounty, feeMc, FEE_PERCENT } from "../src/bounties/store.js";

const BUYER = "0x" + "b".repeat(40);
const AGENT = "0x" + "a".repeat(40);
const FEE_TO = "0x" + "f".repeat(40);

function setup() {
  const db = openDb(":memory:");
  for (const a of [BUYER, AGENT, FEE_TO]) {
    db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(a, new Date().toISOString());
  }
  postLedger(db, { address: BUYER, kind: "topup", deltaMc: 1_000_000, ref: "seed" });
  return db;
}

const auftrag = (db: ReturnType<typeof openDb>) =>
  createBounty(db, {
    creator: BUYER,
    kind: "factual",
    brief: "A brief long enough to read like one, with a deliverable and a deadline in it.",
    priceMc: 150_000,
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
  });

describe("the commission is fixed when the bounty is posted", () => {
  it("writes today's rate onto the row", () => {
    const db = setup();
    const b = auftrag(db);
    expect(getBounty(db, b.id)?.fee_percent).toBe(FEE_PERCENT);
  });

  /** The case the whole change exists for. */
  it("pays what the bounty promised, even after the constant moves", () => {
    const db = setup();
    const b = auftrag(db);
    const versprochen = b.price_mc - feeMc(b.price_mc, getBounty(db, b.id)!.fee_percent);

    // The constant moves to 20 after the job is already on the board.
    db.prepare("UPDATE bounties SET fee_percent = 10 WHERE id = ?").run(b.id);
    const s = submitWork(db, { bountyId: b.id, agent: AGENT, body: "work" });
    awardBounty(db, { bountyId: b.id, submissionId: s.id, who: BUYER, feeTo: FEE_TO });

    const gutschrift = (db.prepare(
      "SELECT delta_mc FROM ledger WHERE address = ? AND kind = 'bounty_award'",
    ).get(AGENT) as { delta_mc: number }).delta_mc;
    expect(gutschrift).toBe(versprochen);
    expect(gutschrift).toBe(135_000);
  });

  it("a bounty posted at 20 per cent pays 20 per cent, not the constant", () => {
    const db = setup();
    const b = auftrag(db);
    db.prepare("UPDATE bounties SET fee_percent = 20 WHERE id = ?").run(b.id);
    const s = submitWork(db, { bountyId: b.id, agent: AGENT, body: "work" });
    awardBounty(db, { bountyId: b.id, submissionId: s.id, who: BUYER, feeTo: FEE_TO });
    const gutschrift = (db.prepare(
      "SELECT delta_mc FROM ledger WHERE address = ? AND kind = 'bounty_award'",
    ).get(AGENT) as { delta_mc: number }).delta_mc;
    expect(gutschrift, "150 c at 20 per cent leaves 120 c").toBe(120_000);
  });

  /**
   * And the counter-proof, because a rate on the row is worth nothing if the published figure
   * still comes from the constant: what the board promises has to match what the award pays.
   */
  it("what /bounties.json promises is what the award pays", async () => {
    const { createApp } = await import("../src/app.js");
    const db = setup();
    const b = auftrag(db);
    db.prepare("UPDATE bounties SET fee_percent = 20 WHERE id = ?").run(b.id);
    const app = createApp({
      db,
      pay: {
        payTo: FEE_TO as `0x${string}`,
        network: "base",
        chainId: 8453,
        usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
        maxTimeoutSeconds: 300,
        tiers: [1, 5],
      },
    });
    const board = (await (await app.request("/bounties.json")).json()) as { open: { id: string; award_cents: number; fee_percent: number }[] };
    const zeile = board.open.find((x) => x.id === b.id)!;
    const versprochen = zeile.award_cents;
    // Und die Prozentzahl daneben muss dieselbe sein, sonst sagt das Brett zweierlei.
    expect(zeile.fee_percent, "the board's percentage is the bounty's own").toBe(20);

    const s = submitWork(db, { bountyId: b.id, agent: AGENT, body: "work" });
    awardBounty(db, { bountyId: b.id, submissionId: s.id, who: BUYER, feeTo: FEE_TO });
    const gutschrift = (db.prepare(
      "SELECT delta_mc FROM ledger WHERE address = ? AND kind = 'bounty_award'",
    ).get(AGENT) as { delta_mc: number }).delta_mc;
    expect(Math.floor(gutschrift / 1000)).toBe(versprochen);
  });
});
