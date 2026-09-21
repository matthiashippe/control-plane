/**
 * Which addresses on this market belong to the operator.
 *
 * `ops/db-report.cjs` has answered this since 2026-09-21, for the operator's own eyes: it is how
 * `foreign_buyers` and `foreign_agents` stay honest. The public side had no answer at all, and
 * `/receipts` is where that costs something.
 *
 * That page exists to be the proof. `docs/journeys.md` calls it "the only content in this field
 * that is not a claim", and it names the winning agent because an address is what earns a
 * reputation here. Every winner so far is an agent of ours, and a reader has no way to see it. The
 * article going out argues that 10,564 x402 services with one paying wallet each are people
 * testing their own deployment, and it sends readers to this page. Publishing that argument about
 * everybody else while showing our own agents as evidence is refutable in one click, and it would
 * take the rest with it.
 *
 * So the same definition lives here, in the service, and `test/ours.test.ts` holds the two copies
 * against each other. A copy is the lesser evil: the report runs as a standalone script piped into
 * `node` inside the container and cannot import the built service, and a definition that drifts is
 * worse than one that is duplicated under a test.
 *
 * `conway-automaton` is deliberately absent. It is the name the upstream runtime gives its own
 * key, so it belongs to anybody who points a runtime here, and claiming it would hide exactly the
 * people this whole project is waiting for.
 */
import type { Db } from "../db.js";

/** Addresses that are ours by history, not by key name. */
export const OUR_ADDRESSES = [
  "0xd24f37d0838e62621ed24111164485ded0f0924f", // operator wallet, posts the seed jobs
  "0xf6204b0662082d65d78eab79936a4d91744dee6b", // the agent from the first cycle on 2026-09-20
];

/** SQL LIKE patterns. A key carrying one of these names was provisioned by a tool of ours. */
export const OUR_KEY_NAMES = [
  "handsel-%",
  "mcp-production-check%",
  "skill-production-check",
  "skill-check-buyer",
  "harness-%",
  "provisioned-key",
  "cleanup",
  "cold-start-probe",
  "doc-check",
  "my-agent",
  "first-buyer-check",
  "mainnet-abnahme",
  "mainnet-acceptance",
  "ops-%",
];

/**
 * True when this address is the operator's.
 *
 * One statement, so a page rendering fifty receipts does not run fifty queries.
 */
export function ourAddresses(db: Db, addresses: string[]): Set<string> {
  const wanted = addresses.map((a) => a.toLowerCase()).filter(Boolean);
  if (!wanted.length) return new Set();
  const found = new Set(OUR_ADDRESSES.filter((a) => wanted.includes(a)));
  const rows = db
    .prepare(
      `SELECT DISTINCT address FROM api_keys
        WHERE address IN (${wanted.map(() => "?").join(",")})
          AND (${OUR_KEY_NAMES.map(() => "name LIKE ?").join(" OR ")})`,
    )
    .all(...wanted, ...OUR_KEY_NAMES) as { address: string }[];
  for (const row of rows) found.add(row.address.toLowerCase());
  return found;
}
