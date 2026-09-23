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
  // The keyless handle `ops/keyless-walk.sh` minted on 2026-09-23 at 15:00 UTC, walking Goal 16's
  // path against production for the first time. It is not an Ethereum address and never was: the
  // keyless door mints `key:` plus forty hex (src/auth/keyless.ts). It belongs here for the same
  // reason the fee address does, and more urgently, because a handle minted by our own probe would
  // otherwise appear as the first foreign buyer this project has ever had.
  "key:99e4d0eec698925fed5ac8099adf2f2263f1fe51",
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

/**
 * The market's own numbers, split into ours and everybody else's, for anybody to read.
 *
 * Written on 2026-09-23 while drafting an answer to Conway issue #335, which asks for publicly
 * verifiable evidence that any of this pays for itself and rightly complains that nobody shows
 * their books. The draft answered with figures out of this database: foreign volume 0, foreign
 * buyers 0, one award and both sides of it ours. Then the obvious objection landed on the draft
 * itself. **None of those numbers were on any page.** Asking somebody for an auditable wallet
 * address while handing them figures only I can see is the thing the issue is complaining about.
 *
 * So they are published. `/terms` already promises that nothing here counts our own jobs as
 * somebody else's demand, and until now that promise was kept in a report only the operator runs.
 *
 * Two things this deliberately does not do. It does not count a job whose buyer never put money in
 * (the same `topup` condition ops/db-report.cjs uses): a job the starter pool paid for is real
 * activity and is not somebody choosing to spend. And it is a rolling 30 days rather than a total,
 * because a total can only grow and therefore can never report a decline.
 */
export interface MarketSplit {
  awarded_30d: { total: number; not_ours: number };
  volume_30d_cents: { total: number; not_ours: number };
  commission_30d_cents: { total: number; not_ours: number };
  buyers: { total: number; not_ours: number };
  agents: { total: number; not_ours: number };
}

export function marketSplit(db: Db): MarketSplit {
  const awarded = db
    .prepare(
      `SELECT b.id, b.creator, b.price_mc,
              (SELECT coalesce(sum(l.delta_mc), 0) FROM ledger l
                WHERE l.kind = 'bounty_fee' AND l.ref = 'bounty-fee:' || b.id) AS fee_mc,
              EXISTS (SELECT 1 FROM ledger t WHERE t.address = b.creator AND t.kind = 'topup') AS funded
         FROM bounties b
        WHERE b.status = 'awarded' AND b.closed_at > datetime('now', '-30 day')`,
    )
    .all() as { id: string; creator: string; price_mc: number; fee_mc: number; funded: number }[];

  const buyers = (db.prepare("SELECT DISTINCT address FROM ledger WHERE kind = 'bounty_hold'").all() as {
    address: string;
  }[]).map((r) => r.address);
  const agents = (db.prepare("SELECT DISTINCT agent FROM submissions").all() as {
    agent: string;
  }[]).map((r) => r.agent);

  const known = ourAddresses(db, [...awarded.map((a) => a.creator), ...buyers, ...agents]);
  const foreign = (a: (typeof awarded)[number]) => !known.has(a.creator.toLowerCase()) && a.funded === 1;
  const cents = (mc: number) => Math.floor(mc / 1000);
  const split = <T>(all: T[], isOurs: (x: T) => boolean) => ({
    total: all.length,
    not_ours: all.filter((x) => !isOurs(x)).length,
  });

  return {
    awarded_30d: { total: awarded.length, not_ours: awarded.filter(foreign).length },
    volume_30d_cents: {
      total: cents(awarded.reduce((n, a) => n + a.price_mc, 0)),
      not_ours: cents(awarded.filter(foreign).reduce((n, a) => n + a.price_mc, 0)),
    },
    commission_30d_cents: {
      total: cents(awarded.reduce((n, a) => n + a.fee_mc, 0)),
      not_ours: cents(awarded.filter(foreign).reduce((n, a) => n + a.fee_mc, 0)),
    },
    buyers: split(buyers, (a) => known.has(a.toLowerCase())),
    agents: split(agents, (a) => known.has(a.toLowerCase())),
  };
}
