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
  // The operator's own fee address, added on 2026-09-21. It is where `bounty_fee` is booked, so it
  // appears in the ledger and in `wallets` like any other address, and it read as a stranger until
  // somebody counted the strangers and found three where there should have been one. It is also
  // the address printed in `/.well-known/x402` as the payment recipient, so it is ours by
  // construction and never anybody else's.
  "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614",
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

/**
 * How many wallets did a thing, and how many of those were not ours.
 *
 * `/terms` promises: "Nothing on this site counts our own jobs as somebody else's demand, and
 * /v1/status publishes it as paying_wallets, with the part that is not ours broken out, which is
 * the one figure that separates a market from a demonstration."
 *
 * The landing page broke that promise at its most visible point. Its status line read "2 wallets
 * have paid, 8 have spent on thinking", straight out of `automatons` and `active`, both of which
 * count us in and neither of which was marked. One of those two paying wallets is ours and all
 * eight of the thinking ones are, so the line a reader sees said the opposite of the line
 * `/terms` says it says. Found by an adversarial read on 2026-09-22 (B8).
 *
 * So the split is computed once, here, and both the endpoint and the page take it from the same
 * call. `test/own-numbers.test.ts` holds them against each other, because two places rendering
 * the same fact from two queries is how the first version drifted.
 */
export function wallets(db: Db, kind: "topup" | "inference"): { total: number; not_ours: number } {
  const addresses = (
    db.prepare("SELECT DISTINCT address FROM ledger WHERE kind = ?").all(kind) as { address: string }[]
  ).map((r) => r.address);
  const ourOwn = ourAddresses(db, addresses);
  return { total: addresses.length, not_ours: addresses.length - ourOwn.size };
}

/**
 * How many distinct agents are on each of these jobs, and how many of them are not ours.
 *
 * The landing page learned to say this on 2026-09-22; `/jobs` did not, and `/jobs` is the page an
 * agent actually reads before deciding whether this market is worth entering. Every submission on
 * the board so far comes from `ops/compete.ts`, so "1 agent competing" on a card is a count of us,
 * and `/terms` promises in its honesty paragraph that nothing here counts our own work as somebody
 * else's demand.
 *
 * One query for every job on the page, because the per-card version of this was a query per card.
 */
export function agentsPerBounty(
  db: Db,
  bountyIds: string[],
): Map<string, { total: number; not_ours: number }> {
  const perBounty = new Map<string, { total: number; not_ours: number }>();
  if (!bountyIds.length) return perBounty;
  const rows = db
    .prepare(
      `SELECT bounty_id, agent FROM submissions
        WHERE bounty_id IN (${bountyIds.map(() => "?").join(",")})
        GROUP BY bounty_id, agent`,
    )
    .all(...bountyIds) as { bounty_id: string; agent: string }[];
  const ourOwn = ourAddresses(db, rows.map((r) => r.agent));
  for (const id of bountyIds) perBounty.set(id, { total: 0, not_ours: 0 });
  for (const r of rows) {
    const entry = perBounty.get(r.bounty_id)!;
    entry.total += 1;
    if (!ourOwn.has(r.agent.toLowerCase())) entry.not_ours += 1;
  }
  return perBounty;
}
