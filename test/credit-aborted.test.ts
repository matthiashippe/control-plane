/**
 * The credit for the five calls of 2026-11-10 that were charged although the client had already
 * given up (abrechnung 01). One ledger row on the wallet of the five charges, over exactly their
 * sum, pointing at the five refs, and never twice: it runs on every start of the service.
 *
 * The wallets here are made up (repeated digits); the refs and the sum are the measured ones,
 * because the batch only books when it finds exactly those.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, postLedger, type Db } from "../src/db.js";
import { ABORTED_2026_11_10, creditAbortedCharges } from "../src/credits/aborted.js";
import { hashApiKey } from "../src/auth/siwe.js";

const CUSTOMER = "0x1111111111111111111111111111111111111111";
const STRANGER = "0x2222222222222222222222222222222222222222";
// A made-up split of the measured total; only the sum is real.
const SPLIT = [10_000, 10_000, 10_000, 10_000, ABORTED_2026_11_10.totalMc - 40_000];
// The two shorter aborts (22.8 s and 18.5 s) that the first version of the batch left out.
const SHORT_ABORTS = ["gen-1794287765-SupdXvMT0JLDL224yBtY", "gen-1794287878-doiF42ITx3lfTwxRWfqU"];

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function freshFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-credit-aborted-"));
  dirs.push(dir);
  return path.join(dir, "cp.db");
}

/** The state of production on 2026-11-10 in miniature: five charged aborts and a stranger's call. */
function seed(db: Db, opts: { refs?: readonly string[]; addresses?: string[] } = {}) {
  const refs = opts.refs ?? ABORTED_2026_11_10.refs;
  postLedger(db, { address: CUSTOMER, kind: "topup", deltaMc: 500_000, ref: "nonce-customer" });
  postLedger(db, { address: STRANGER, kind: "topup", deltaMc: 500_000, ref: "nonce-stranger" });
  refs.forEach((ref, i) => {
    const address = opts.addresses?.[i] ?? CUSTOMER;
    postLedger(db, { address, kind: "inference", deltaMc: -SPLIT[i], ref, meta: { model: "openai/gpt-5.2" } });
  });
  postLedger(db, { address: STRANGER, kind: "inference", deltaMc: -7_000, ref: "gen-1794288300-strangerCallXXXXXXXXX" });
}

const refunds = (db: Db) =>
  db.prepare("SELECT address, delta_mc, ref, meta FROM ledger WHERE kind = 'refund'").all() as {
    address: string;
    delta_mc: number;
    ref: string;
    meta: string;
  }[];

function booksAgree(db: Db) {
  const rows = db
    .prepare(
      `SELECT w.address, w.balance_mc, coalesce((SELECT sum(delta_mc) FROM ledger l WHERE l.address = w.address), 0) AS ledger_mc
         FROM wallets w`,
    )
    .all() as { address: string; balance_mc: number; ledger_mc: number }[];
  for (const r of rows) expect(r.balance_mc, `balance of ${r.address} equals its ledger`).toBe(r.ledger_mc);
}

describe("credit for the charges of 2026-11-10 whose answers never arrived", () => {
  it("names all five charged aborts of 2026-11-10, the two short ones included", () => {
    expect(ABORTED_2026_11_10.refs).toHaveLength(5);
    expect(new Set(ABORTED_2026_11_10.refs).size).toBe(5);
    for (const ref of SHORT_ABORTS) expect(ABORTED_2026_11_10.refs).toContain(ref);
    expect(ABORTED_2026_11_10.totalMc).toBe(79_229);
  });

  it("credits exactly once over the sum of the five, even when the step runs twice", () => {
    const file = freshFile();
    const db = openDb(file);
    seed(db);
    expect(refunds(db), "nothing before the step").toHaveLength(0);

    expect(creditAbortedCharges(db)).toEqual({ credited: true, deltaMc: ABORTED_2026_11_10.totalMc });
    expect(creditAbortedCharges(db)).toEqual({ credited: false, reason: "already_credited" });
    db.close();
    // And the way production runs it: on start, twice, as after two rollouts.
    openDb(file).close();
    const again = openDb(file);

    const rows = refunds(again);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe(CUSTOMER);
    expect(rows[0].delta_mc).toBe(SPLIT.reduce((a, b) => a + b, 0));
    expect(rows[0].delta_mc).toBe(79_229);
    expect(rows[0].ref).toBe(ABORTED_2026_11_10.key);
    expect(JSON.parse(rows[0].meta).refs).toEqual([...ABORTED_2026_11_10.refs]);
    again.close();
  });

  it("runs on start: a database with the five charges gets the credit when the service opens it", () => {
    const file = freshFile();
    const db = openDb(file);
    seed(db);
    db.close();

    const started = openDb(file);
    expect(refunds(started)).toHaveLength(1);
    const stranger = started.prepare("SELECT count(*) AS n FROM ledger WHERE address = ? AND kind = 'refund'").get(STRANGER) as { n: number };
    expect(stranger.n, "the stranger's call is not touched").toBe(0);
    started.close();
  });

  it("keeps balance equal to the sum of the ledger for every wallet", () => {
    const db = openDb(":memory:");
    seed(db);
    const before = (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(CUSTOMER) as { balance_mc: number }).balance_mc;
    creditAbortedCharges(db);
    creditAbortedCharges(db);
    booksAgree(db);
    const after = (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(CUSTOMER) as { balance_mc: number }).balance_mc;
    expect(after - before).toBe(ABORTED_2026_11_10.totalMc);
    const strangerBalance = (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(STRANGER) as { balance_mc: number }).balance_mc;
    expect(strangerBalance).toBe(500_000 - 7_000);
  });

  it("credits nothing when the five charges are missing or are not the measured ones", () => {
    const none = openDb(":memory:");
    postLedger(none, { address: STRANGER, kind: "topup", deltaMc: 500_000, ref: "nonce-stranger" });
    expect(creditAbortedCharges(none)).toEqual({ credited: false, reason: "charges_missing" });
    expect(refunds(none)).toHaveLength(0);

    // Only the three long ones, as the first version of the batch assumed: not the measured state.
    const three = openDb(":memory:");
    seed(three, { refs: ABORTED_2026_11_10.refs.filter((r) => !SHORT_ABORTS.includes(r)) });
    expect(creditAbortedCharges(three)).toEqual({ credited: false, reason: "charges_missing" });
    expect(refunds(three)).toHaveLength(0);

    const split = openDb(":memory:");
    seed(split, { addresses: [CUSTOMER, CUSTOMER, CUSTOMER, CUSTOMER, STRANGER] });
    expect(creditAbortedCharges(split)).toEqual({ credited: false, reason: "several_addresses" });
    expect(refunds(split)).toHaveLength(0);

    const other = openDb(":memory:");
    seed(other);
    expect(creditAbortedCharges(other, { ...ABORTED_2026_11_10, totalMc: ABORTED_2026_11_10.totalMc + 1 })).toEqual({
      credited: false,
      reason: "sum_mismatch",
    });
    expect(refunds(other)).toHaveLength(0);
  });

  it("refuses a second refund row for the same batch at the database level", () => {
    const db = openDb(":memory:");
    seed(db);
    creditAbortedCharges(db);
    expect(() =>
      postLedger(db, { address: CUSTOMER, kind: "refund", deltaMc: 1, ref: ABORTED_2026_11_10.key }),
    ).toThrow(/UNIQUE/);
    expect(refunds(db)).toHaveLength(1);
  });

  it("GET /v1/credits/history answers with the refund row", async () => {
    const db = openDb(":memory:");
    seed(db);
    creditAbortedCharges(db);
    const key = "cnwy_k_" + "ef".repeat(16);
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      CUSTOMER,
      hashApiKey(key),
      key.slice(0, 15),
      "test",
      new Date().toISOString(),
    );
    const app = createApp({ db });
    const res = await app.request("/v1/credits/history", { headers: { authorization: key } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { balance_cents: number; entries: Array<Record<string, unknown>> };
    const refund = body.entries.find((e) => e.kind === "refund");
    expect(refund, "the refund is in the history").toBeDefined();
    expect(refund?.cents).toBe(Math.floor(ABORTED_2026_11_10.totalMc / 1000));
    expect(refund?.refs).toEqual([...ABORTED_2026_11_10.refs]);
    expect(refund?.reason).toBe("client_aborted_before_answer");
    expect(body.entries[0].kind, "newest first").toBe("refund");
    const balance = (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(CUSTOMER) as { balance_mc: number }).balance_mc;
    expect(body.balance_cents).toBe(Math.floor(balance / 1000));
  });
});
