/**
 * A way back to the old image survives the migration (goals/betrieb/06). Step 8 of "Was rollout.sh tut" in deploy/README.md names
 * the commands that undo a column rename of src/db.ts before the old image starts again. This file holds the guard: every
 * `RENAME COLUMN a TO b` in src/db.ts needs `RENAME COLUMN b TO a` in step 8, every `DROP COLUMN x` needs `ADD COLUMN x` there.
 * It also proves the documented statement itself: the old image writes a handoff after it, and the next start of the new image
 * renames the column forward again without losing a row.
 *
 * Imports only openDb from src/db.ts and reads src/db.ts and deploy/README.md as text. No network, no port.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";

const DB_SOURCE = readFileSync(new URL("../src/db.ts", import.meta.url), "utf8");
const README = readFileSync(new URL("../deploy/README.md", import.meta.url), "utf8");

/** The text of step 8: from the line starting with "8. " up to the line starting with "9. ". */
function step8Of(readme: string): string {
  const lines = readme.split("\n");
  const start = lines.findIndex((line) => line.startsWith("8. "));
  if (start < 0) return "";
  const end = lines.findIndex((line, i) => i > start && line.startsWith("9. "));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

/** A keyword in any letter case, an identifier exactly. */
const keyword = (word: string) =>
  word
    .split("")
    .map((ch) => `[${ch.toLowerCase()}${ch.toUpperCase()}]`)
    .join("");
const RENAME = `${keyword("rename")}\\s+${keyword("column")}`;
const TO = keyword("to");
const DROP = `${keyword("drop")}\\s+${keyword("column")}`;
const ADD = `${keyword("add")}\\s+${keyword("column")}`;

/** The column renames and drops of a migration source that the text of step 8 gives no way back for. */
function missingWaysBack(dbSource: string, step8: string): string[] {
  const missing: string[] = [];
  for (const [, from, to] of dbSource.matchAll(new RegExp(`\\b${RENAME}\\s+(\\w+)\\s+${TO}\\s+(\\w+)`, "g"))) {
    if (!new RegExp(`\\b${RENAME}\\s+${to}\\s+${TO}\\s+${from}\\b`).test(step8)) missing.push(`RENAME COLUMN ${from} TO ${to}`);
  }
  for (const [, column] of dbSource.matchAll(new RegExp(`\\b${DROP}\\s+(\\w+)`, "g"))) {
    if (!new RegExp(`\\b${ADD}\\s+${column}\\b`).test(step8)) missing.push(`DROP COLUMN ${column}`);
  }
  return missing;
}

/** The statement step 8 documents for the way back of display_name, taken from the text and not copied into this test. */
function documentedRenameBack(step8: string): string {
  const statements = step8.match(new RegExp(`${keyword("alter")}\\s+${keyword("table")}\\s+\\w+\\s+${RENAME}\\s+\\w+\\s+${TO}\\s+\\w+`, "g")) ?? [];
  const back = statements.find((s) => /\bdisplay_name\b/.test(s) && /\bautomaton_name\b/.test(s));
  if (!back) throw new Error("step 8 of deploy/README.md names no rename of display_name back to automaton_name");
  return back;
}

const columnsOf = (db: { prepare: (sql: string) => { all: () => unknown[] } }) =>
  (db.prepare("PRAGMA table_info(handoffs)").all() as { name: string }[]).map((c) => c.name);

/** A handoff as the old image (before konto 12) writes it, with the name in automaton_name. */
const OLD_ROW = {
  code: "WXYZ-QRST",
  poll_hash: "b".repeat(64),
  automaton_name: "Atlas",
  daily_limit_usdc: "9000000",
  amount_usdc: "0",
  match: 42,
  choices: "17,42,88",
  state: "pending",
  created_at: 1_763_800_000_000,
  updated_at: 1_763_800_000_000,
  step: "confirm",
  account: null,
  api_key: null,
  previous_limit_usdc: null,
};

describe("a way back to the old image survives the migration", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "rollback-schema-"));
  const file = path.join(dir, "cp.db");

  it("documents a way back for every column rename and drop in src/db.ts", () => {
    const step8 = step8Of(README);
    expect(step8).toMatch(/^8\. /);
    expect(missingWaysBack(DB_SOURCE, step8)).toEqual([]);
  });

  it("fails a column rename without a way back in deploy/README.md", () => {
    const source = 'db.exec("ALTER TABLE things RENAME COLUMN a TO b");';
    expect(missingWaysBack(source, "8. **Rollback.** Tag back and start the old image.")).toEqual(["RENAME COLUMN a TO b"]);
    expect(missingWaysBack(source, "8. Before the start: `ALTER TABLE things rename column b to a`.")).toEqual([]);
  });

  it("fails a column drop without a way back in deploy/README.md", () => {
    const source = 'db.exec("ALTER TABLE things DROP COLUMN x");';
    expect(missingWaysBack(source, "8. **Rollback.** Tag back and start the old image.")).toEqual(["DROP COLUMN x"]);
    expect(missingWaysBack(source, "8. Before the start: `ALTER TABLE things ADD COLUMN x TEXT`.")).toEqual([]);
  });

  it("lets the old image write a handoff after the documented rename", () => {
    const fresh = openDb(file);
    expect(columnsOf(fresh)).toContain("display_name");
    fresh.close();

    // The way back of step 8, run like the script there: only while PRAGMA table_info(handoffs) shows display_name.
    const db = new Database(file);
    if (columnsOf(db).includes("display_name")) db.exec(documentedRenameBack(step8Of(README)));
    expect(columnsOf(db)).toContain("automaton_name");
    expect(columnsOf(db)).not.toContain("display_name");

    // The old image writes and reads the name in automaton_name.
    db.prepare(
      `INSERT INTO handoffs (code, poll_hash, automaton_name, daily_limit_usdc, amount_usdc, match, choices, state, created_at,
         updated_at, step, account, api_key, previous_limit_usdc)
       VALUES (@code, @poll_hash, @automaton_name, @daily_limit_usdc, @amount_usdc, @match, @choices, @state, @created_at,
         @updated_at, @step, @account, @api_key, @previous_limit_usdc)`,
    ).run(OLD_ROW);
    expect(db.prepare("SELECT automaton_name FROM handoffs WHERE code = ?").all(OLD_ROW.code)).toEqual([
      { automaton_name: "Atlas" },
    ]);
    db.close();
  });

  it("renames the column forward again on the next start without losing a row", () => {
    const db = openDb(file);
    expect(columnsOf(db)).toContain("display_name");
    expect(columnsOf(db)).not.toContain("automaton_name");
    const { automaton_name, ...rest } = OLD_ROW;
    expect(db.prepare("SELECT * FROM handoffs").all()).toEqual([{ ...rest, display_name: automaton_name }]);
    db.close();
  });
});
