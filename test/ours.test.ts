/**
 * The service and the report have to mean the same thing by "ours".
 *
 * `ops/db-report.cjs` decides who is a stranger for the operator's own numbers. Since 2026-09-21
 * `/receipts` decides the same thing in public, because a page whose whole job is proof cannot
 * show our own agents as evidence without saying so.
 *
 * Two copies, because the report runs as a standalone script piped into `node` inside the
 * container and cannot import the built service. A copy under a test is the lesser evil; a copy
 * that drifts would mean the page and the scoreboard disagree about who is a stranger, and the
 * scoreboard is what the whole plan is measured against.
 *
 * The rule this pins is exact equality, not "the service knows at least as much". A name only the
 * report knows would mark an agent of ours as a stranger on the public page; a name only the
 * service knows would do the opposite to the number the plan hangs on.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { openDb } from "../src/db.js";
import { OUR_ADDRESSES, OUR_KEY_NAMES, ourAddresses } from "../src/bounties/ours.js";

/**
 * Reads a spelled-out JS array literal out of the report, without running it.
 *
 * Comments are stripped first. Both lists carry a paragraph of reasoning between their entries,
 * and those paragraphs quote names in double quotes, so the first version of this read sixteen
 * patterns out of a list of fourteen. That is the same mistake that once dropped every CSS rule
 * following a comment: take the comments out before parsing what is left, not after.
 */
function listeAusReport(name: string): string[] {
  const quelle = readFileSync("ops/db-report.cjs", "utf-8")
    .split("\n")
    .filter((zeile) => !zeile.trimStart().startsWith("//"))
    .join("\n");
  const anfang = quelle.indexOf(`const ${name} = [`);
  expect(anfang, `${name} is not in ops/db-report.cjs any more`).toBeGreaterThan(-1);
  const ende = quelle.indexOf("];", anfang);
  // Trailing comments on the same line as an entry would still be inside the slice.
  return [...quelle.slice(anfang, ende).replace(/\/\/[^\n]*/g, "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('"ours" means the same in the service as in the report', () => {
  it("has the same key name patterns on both sides", () => {
    expect([...OUR_KEY_NAMES].sort()).toEqual(listeAusReport("OUR_KEY_NAMES").sort());
  });

  it("has the same hardcoded addresses on both sides", () => {
    expect([...OUR_ADDRESSES].sort()).toEqual(listeAusReport("OURS").sort());
  });

  it("finds an address by its key name and not only by the list", () => {
    const db = openDb(":memory:");
    const seed = "0x7777777777777777777777777777777777777777";
    const fremd = "0x8888888888888888888888888888888888888888";
    for (const [address, name] of [[seed, "ops-seed-vera"], [fremd, "conway-automaton"]]) {
      db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)")
        .run(address, new Date().toISOString());
      db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(address, `hash-${name}`, "cnwy_k_xxxxxxx", name, new Date().toISOString());
    }
    const gefunden = ourAddresses(db, [seed, fremd, OUR_ADDRESSES[0]]);
    expect(gefunden.has(seed), "a seed agent is ours by its key name").toBe(true);
    expect(gefunden.has(OUR_ADDRESSES[0]), "the operator wallet is ours by the list").toBe(true);
    // The counter-check. `conway-automaton` is what a real runtime names its key, and claiming it
    // would hide the first stranger who ever arrives.
    expect(gefunden.has(fremd), "a real runtime's key name is not ours to claim").toBe(false);
  });

  it("asks nothing when there is nothing to ask about", () => {
    expect(ourAddresses(openDb(":memory:"), []).size).toBe(0);
  });
});
