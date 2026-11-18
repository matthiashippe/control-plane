/**
 * The name a handoff shows lives in the column `display_name` (goals/konto/12, Punkt 2). Until konto 12 the same value sat in
 * `automaton_name`, also for the step limit, where it is the name of the account. A database written before konto 12 has to read
 * its rows unchanged under the new name, and a fresh one never knows the old column.
 *
 * Imports only openDb from src/db.ts, because the check of Punkt 2 also runs this file against the merge base.
 */
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";

/** The table handoffs exactly as the rebuild of konto 05 in src/db.ts writes it on dev before konto 12. */
const KONTO05_HANDOFFS = `
  CREATE TABLE handoffs (
    code                TEXT PRIMARY KEY,
    poll_hash           TEXT NOT NULL UNIQUE,
    automaton_name      TEXT NOT NULL,
    daily_limit_usdc    TEXT NOT NULL,
    amount_usdc         TEXT NOT NULL,
    match               INTEGER NOT NULL CHECK (match BETWEEN 10 AND 99),
    choices             TEXT NOT NULL,
    state               TEXT NOT NULL CHECK (state IN ('pending', 'matched', 'done', 'burned', 'expired')),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    step                TEXT NOT NULL DEFAULT 'confirm' CHECK (step IN ('confirm', 'konto', 'limit', 'deposit', 'payout')),
    account             TEXT,
    api_key             TEXT,
    previous_limit_usdc TEXT
  );
`;

const COLUMNS = [
  "code",
  "poll_hash",
  "display_name",
  "daily_limit_usdc",
  "amount_usdc",
  "match",
  "choices",
  "state",
  "created_at",
  "updated_at",
  "step",
  "account",
  "api_key",
  "previous_limit_usdc",
];

const columnsOf = (db: { prepare: (sql: string) => { all: () => unknown[] } }) =>
  (db.prepare("PRAGMA table_info(handoffs)").all() as { name: string }[]).map((c) => c.name);

describe("the name a handoff shows is display_name", () => {
  it("reads a row of the schema before konto 12 unchanged as display_name", () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "handoff-display-name-")), "cp.db");
    const old = new Database(file);
    old.exec(KONTO05_HANDOFFS);
    const row = {
      code: "ABCD-EFGH",
      poll_hash: "a".repeat(64),
      automaton_name: "Atlas",
      daily_limit_usdc: "9000000",
      amount_usdc: "0",
      match: 42,
      choices: "17,42,88",
      state: "matched",
      created_at: 1_763_400_000_000,
      updated_at: 1_763_400_060_000,
      step: "limit",
      account: "0x" + "1".repeat(40),
      api_key: null,
      previous_limit_usdc: "5000000",
    };
    old
      .prepare(
        `INSERT INTO handoffs (code, poll_hash, automaton_name, daily_limit_usdc, amount_usdc, match, choices, state, created_at,
           updated_at, step, account, api_key, previous_limit_usdc)
         VALUES (@code, @poll_hash, @automaton_name, @daily_limit_usdc, @amount_usdc, @match, @choices, @state, @created_at,
           @updated_at, @step, @account, @api_key, @previous_limit_usdc)`,
      )
      .run(row);
    old.close();

    const db = openDb(file);
    const { automaton_name, ...rest } = row;
    expect(db.prepare("SELECT * FROM handoffs").all()).toEqual([{ ...rest, display_name: automaton_name }]);
    expect(columnsOf(db)).toEqual(COLUMNS);
    expect(columnsOf(db)).not.toContain("automaton_name");
    db.close();
    // A second start finds the new column and changes nothing.
    const again = openDb(file);
    expect(again.prepare("SELECT display_name FROM handoffs").all()).toEqual([{ display_name: "Atlas" }]);
    again.close();
  });

  it("creates a fresh database with display_name and without automaton_name", () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "handoff-display-name-")), "cp.db");
    const db = openDb(file);
    expect(columnsOf(db)).toEqual(COLUMNS);
    expect(columnsOf(db)).not.toContain("automaton_name");
    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'handoffs'").get() as { sql: string }).sql;
    expect(sql).toContain("'payout'");
    db.close();
  });
});
