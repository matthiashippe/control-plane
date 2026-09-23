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
