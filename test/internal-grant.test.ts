/**
 * The shared internal credit (src/credits/internal-grant.ts): booked once per ref as internal_grant, only where the account
 * exists, with amount and reason as given. Uses its own refs, never the ones of the live checks.
 */
import { describe, expect, it } from "vitest";
import { getBalanceMc, openDb } from "../src/db.js";
import { grantInternal } from "../src/credits/internal-grant.js";

const ADDRESS = "0x00000000000000000000000000000000000000Aa";
const FIRST = { ref: "grant:test-internal-one", mc: 12_000, reason: "test: first internal credit" };
const SECOND = { ref: "grant:test-internal-two", mc: 3_000, reason: "test: second internal credit" };

function addAccount(db: ReturnType<typeof openDb>): void {
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(ADDRESS.toLowerCase(), new Date().toISOString());
}

function internalRows(db: ReturnType<typeof openDb>, ref: string): { address: string; delta_mc: number; meta: string }[] {
  return db.prepare("SELECT address, delta_mc, meta FROM ledger WHERE kind = 'internal_grant' AND ref = ?").all(ref) as {
    address: string;
    delta_mc: number;
    meta: string;
  }[];
}

describe("grantInternal", () => {
  it("answers no_account and books nothing where the account does not exist", () => {
    const db = openDb(":memory:");
    expect(grantInternal(db, FIRST, ADDRESS)).toEqual({ granted: false, reason: "no_account" });
    expect((db.prepare("SELECT count(*) AS n FROM ledger").get() as { n: number }).n).toBe(0);
  });

  it("books once per ref: the second call with the same ref answers already_granted and leaves one internal_grant row", () => {
    const db = openDb(":memory:");
    addAccount(db);
    expect(grantInternal(db, FIRST, ADDRESS)).toEqual({ granted: true });
    expect(grantInternal(db, FIRST, ADDRESS)).toEqual({ granted: false, reason: "already_granted" });
    const rows = internalRows(db, FIRST.ref);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.address).toBe(ADDRESS.toLowerCase());
    expect(rows[0]!.delta_mc).toBe(FIRST.mc);
    expect(JSON.parse(rows[0]!.meta)).toEqual({ reason: FIRST.reason });
    expect(getBalanceMc(db, ADDRESS)).toBe(FIRST.mc);
    expect((db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = 'grant'").get() as { n: number }).n).toBe(0);
  });

  it("books a second ref as its own row", () => {
    const db = openDb(":memory:");
    addAccount(db);
    expect(grantInternal(db, FIRST, ADDRESS)).toEqual({ granted: true });
    expect(grantInternal(db, SECOND, ADDRESS)).toEqual({ granted: true });
    expect(internalRows(db, FIRST.ref)).toHaveLength(1);
    expect(internalRows(db, SECOND.ref)).toHaveLength(1);
    expect(getBalanceMc(db, ADDRESS)).toBe(FIRST.mc + SECOND.mc);
  });
});
