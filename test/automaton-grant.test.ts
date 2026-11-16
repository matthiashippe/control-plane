/**
 * The credit of the check `automaton` of ops/live.sh (goals/sandbox/08, point 8): ref grant:live-automaton, the measured cost
 * of one run without reboot times 300, rounded up to 10000 mc, at most 500000 mc, booked once as internal_grant and only where
 * the own live account exists.
 */
import { describe, expect, it } from "vitest";
import { LIVE_SANDBOX_ADDRESS } from "../src/bounties/ours.js";
import { getBalanceMc, openDb } from "../src/db.js";
import { grantLiveSandbox } from "../src/sandbox/grant.js";
import {
  grantLiveAutomaton,
  LIVE_AUTOMATON_GRANT,
  LIVE_AUTOMATON_RUN_MC,
  liveAutomatonGrantMc,
} from "../src/automaton/grant.js";

describe("the credit of the live-automaton check", () => {
  it("is the measured run times 300, rounded up to 10000 mc and at most 500000 mc", () => {
    expect(liveAutomatonGrantMc(1)).toBe(10_000);
    expect(liveAutomatonGrantMc(100)).toBe(30_000);
    expect(liveAutomatonGrantMc(1_234)).toBe(380_000);
    expect(liveAutomatonGrantMc(1_667)).toBe(500_000);
    expect(liveAutomatonGrantMc(11_000)).toBe(500_000);
    expect(LIVE_AUTOMATON_RUN_MC).toBe(11_000);
    expect(LIVE_AUTOMATON_GRANT).toEqual({ ref: "grant:live-automaton", mc: 500_000 });
  });

  it("books once as internal_grant with ref grant:live-automaton, only where the account exists", () => {
    const db = openDb(":memory:");
    expect(grantLiveAutomaton(db)).toEqual({ granted: false, reason: "no_account" });
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(LIVE_SANDBOX_ADDRESS, new Date().toISOString());
    expect(grantLiveAutomaton(db)).toEqual({ granted: true });
    expect(grantLiveAutomaton(db)).toEqual({ granted: false, reason: "already_granted" });
    expect(getBalanceMc(db, LIVE_SANDBOX_ADDRESS)).toBe(500_000);
    const rows = db.prepare("SELECT kind, ref, delta_mc FROM ledger WHERE address = ?").all(LIVE_SANDBOX_ADDRESS);
    expect(rows).toEqual([{ kind: "internal_grant", ref: "grant:live-automaton", delta_mc: 500_000 }]);
    expect((db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = 'grant'").get() as { n: number }).n).toBe(0);
  });

  it("stands next to the credit of the sandbox check, each once", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(LIVE_SANDBOX_ADDRESS, new Date().toISOString());
    expect(grantLiveSandbox(db)).toEqual({ granted: true });
    expect(grantLiveAutomaton(db)).toEqual({ granted: true });
    expect(getBalanceMc(db, LIVE_SANDBOX_ADDRESS)).toBe(600_000);
  });
});
