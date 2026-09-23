/**
 * An account for somebody who has no wallet: the key is the account.
 *
 * Every path into this service ran through SIWE until 2026-09-23. `createApiKey` needs a session,
 * and the only thing that writes a session is `verifySiwe`, so a person without an Ethereum
 * address had no way to a key and therefore no way to do anything but read. Forty-three visitors
 * reached the point where that mattered and none got past it, and `/check` said the reason out
 * loud: "They do need a wallet, in the sense of a key pair on your own machine that signs one
 * message."
 *
 * SIWE is not there for a security reason. It is there because Conway's runtime does it that way
 * (provision.ts hard-codes the domain and the chain), and a signature proves control of an address
 * this service does not otherwise use: it holds no balance that belongs to anybody else, and it
 * pays nothing out. What it needs is a stable handle to hang a balance on, and an API key already
 * is one -- `resolveApiKey` has always mapped a key to an address with nothing else in between.
 *
 * So minting is exactly that and no more: make a handle, make a key for it, show the key once.
 *
 * **The identity is deliberately not an Ethereum address and does not look like one.** It is
 * `key:` and forty hex characters. Where this codebase really needs an address it checks with
 * `isAddress` (src/payments/pay.ts, src/registry.ts), and this handle fails that check instead of
 * being mistaken for an address nobody controls. None of those places is on the buyer's path:
 * `bounties.creator` and `wallets.address` are opaque strings to everything that touches them.
 *
 * **What it cannot do, on purpose.** It never takes over an existing handle and never accepts one
 * from the caller, so there is no way to mint a key for somebody else's address. It grants
 * nothing: the pool is reached through the bounty path, which has its own limits, now including a
 * daily one (POOL_DAILY_MC) precisely because identities became free here.
 *
 * **What is not kept.** No mail address, no password, no network address, no recovery. That is a
 * real cost and the page that shows the key has to say it in the same breath: lose the key and the
 * balance behind it is gone, because there is nothing else that identifies its owner.
 */

import { randomBytes } from "node:crypto";
import { ensureWallet, type Db } from "../db.js";
import { hashApiKey } from "./siwe.js";

/** The marker that makes a keyless handle unmistakable at a glance and in a query. */
export const KEYLESS_PREFIX = "key:";

/** Twenty bytes, the same width as an Ethereum address, so the handle is no shorter than one. */
const HANDLE_BYTES = 20;

export function isKeylessAddress(address: string): boolean {
  return address.toLowerCase().startsWith(KEYLESS_PREFIX);
}

export interface MintedIdentity {
  address: string;
  key: string;
  keyPrefix: string;
}

/**
 * Makes a new handle and the one key that opens it. The full key is never stored, only its hash,
 * which is why it is returned here and nowhere else: this is the only moment it exists in the
 * clear.
 *
 * `name` is what shows up in a key listing. It is not identity and is not checked.
 */
export function mintKeylessIdentity(db: Db, name = "browser", now = Date.now()): MintedIdentity {
  const address = `${KEYLESS_PREFIX}${randomBytes(HANDLE_BYTES).toString("hex")}`;
  const key = `cnwy_k_${randomBytes(16).toString("hex")}`;
  const keyPrefix = key.slice(0, "cnwy_k_".length + 8);
  const run = db.transaction(() => {
    ensureWallet(db, address);
    db.prepare(
      "INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(address, hashApiKey(key), keyPrefix, name.slice(0, 60) || "browser", new Date(now).toISOString());
  });
  run();
  return { address, key, keyPrefix };
}

/**
 * The name a handle minted for the supply side carries, and how many of them a day.
 *
 * Why the supply side needs its own door at all. The buyer lost the wallet on 2026-09-23; the
 * agent did not, and `/bounties.json` says so to every reader in its own words: *"Competing needs
 * an API key, and getting one needs three calls and an Ethereum signature"*. Measured over 96
 * hours of access log, exactly one foreign client finished that sequence, and it was a Conway
 * runtime with the domain hard-coded, not an agent that found its way here. For anything else
 * that reads `/bounties.json` (and ClaudeBot does), the wall is still up.
 *
 * **The cap is not optional and here is the own goal it prevents.** Submitting costs an agent
 * nothing on this side, and the one-attempt rule hangs on the handle, not on the person
 * (src/bounties/store.ts names this exposure and leaves it open "until that actually happens").
 * Free handles are free submissions, and `submissions_not_ours` is published on /jobs and in
 * /bounties.json precisely so an arriving agent can see how little competition there is. Somebody
 * minting handles could inflate that number and drive away the very readers it exists to attract.
 *
 * Five a day, counted across everybody, in the same shape as POOL_DAILY_MC and for the same
 * reason: it does not make the door safe, it makes an abuse of it slow enough to see in the daily
 * numbers. The residual exposure, said plainly rather than discovered later: one actor can add up
 * to five submissions to one job per day. On a market that has seen one human reader in four days
 * that is a bounded and visible cost, and the alternative, requiring a spend before a submission
 * counts, would undercount every honest MCP host.
 */
export const KEYLESS_AGENT_NAME = "agent";
export const AGENT_MINTS_PER_DAY_DEFAULT = 5;

export function agentMintsPerDay(): number {
  const raw = Number(process.env.CP_AGENT_MINTS_PER_DAY);
  return Number.isInteger(raw) && raw > 0 ? raw : AGENT_MINTS_PER_DAY_DEFAULT;
}

export function agentMintsToday(db: Db, now: Date = new Date()): number {
  const day = now.toISOString().slice(0, 10);
  const row = db
    .prepare("SELECT count(*) AS n FROM api_keys WHERE name = ? AND substr(created_at, 1, 10) = ?")
    .get(KEYLESS_AGENT_NAME, day) as { n: number };
  return row.n;
}

export class KeylessError extends Error {
  constructor(readonly code: string, readonly status: number, readonly hint: string) {
    super(code);
  }
}

/**
 * A key for an agent that has no wallet, or `KeylessError` when the day is spent.
 *
 * Counted and minted in one transaction, because two callers arriving together would otherwise
 * both read four and both mint.
 */
export function mintAgentIdentity(db: Db, now = Date.now()): MintedIdentity {
  const run = db.transaction(() => {
    if (agentMintsToday(db, new Date(now)) >= agentMintsPerDay()) {
      throw new KeylessError(
        "daily_limit",
        429,
        "This service hands out a few keyless agent keys a day and today's are gone. They are " +
          "capped because a free key is a free submission, and an inflated competitor count would " +
          "drive off the agents the count exists to attract. It refills at midnight UTC. With a " +
          "wallet there is no limit: POST /v1/auth/nonce, /v1/auth/verify, /v1/auth/api-keys.",
      );
    }
    return mintKeylessIdentity(db, KEYLESS_AGENT_NAME, now);
  });
  return run();
}
