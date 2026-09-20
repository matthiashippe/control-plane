/**
 * SIWE provisioning: nonce -> verify (access_token) -> api-keys (cnwy_k_...).
 *
 * The runtime client (provision.ts) hard-codes domain "conway.tech" and chainId 8453; the uri is
 * "<conwayApiUrl>/v1/auth/verify" and therefore differs per deployment. Domain, chainId, nonce and
 * signature are checked; the uri is not.
 */

import { createHash, randomBytes } from "node:crypto";
import { verifyMessage, type Address } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { ensureWallet, type Db } from "../db.js";

export interface SiweConfig {
  /** Expected SIWE domain, default "conway.tech" (the client hard-codes it). */
  domain: string;
  chainId: number;
  /** Lifetime of a nonce in ms. */
  nonceTtlMs: number;
  /** Lifetime of an access_token in ms. */
  sessionTtlMs: number;
}

export const DEFAULT_SIWE_CONFIG: SiweConfig = {
  domain: "conway.tech",
  chainId: 8453,
  nonceTtlMs: 10 * 60 * 1000,
  sessionTtlMs: 10 * 60 * 1000,
};

/**
 * `message` is the wording Conway serves today and ends up unchanged in the `error` field. `hint`
 * is the sentence for the human in front of it and goes into the body as `message`
 * (src/errors.ts).
 */
export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function issueNonce(db: Db, now = Date.now()): string {
  // 16 bytes are enough; alphanumeric, as SIWE demands (at least 8 characters).
  const nonce = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO siwe_nonces (nonce, issued_at) VALUES (?, ?)").run(nonce, now);
  return nonce;
}

export interface VerifyInput {
  message: string;
  signature: string;
  chainType?: string;
}

/**
 * Checks message and signature, consumes the nonce and issues an access_token. The wording of the
 * errors follows what Conway serves today ("Invalid or expired nonce").
 */
export async function verifySiwe(
  db: Db,
  input: VerifyInput,
  cfg: SiweConfig = DEFAULT_SIWE_CONFIG,
  now = Date.now(),
): Promise<{ accessToken: string; address: Address }> {
  if (input.chainType && input.chainType !== "evm") {
    throw new AuthError(
      400,
      `chain_type ${input.chainType} not supported`,
      "This control plane provisions EVM wallets only. Send chain_type \"evm\" or leave it out; " +
        "Solana automatons cannot be provisioned here and cannot pay with x402.",
    );
  }
  if (typeof input.message !== "string" || typeof input.signature !== "string") {
    throw new AuthError(
      400,
      "message and signature are required",
      "POST a JSON body with the SIWE message as sent by the runtime and its EIP-191 signature: " +
        '{ "message": "<siwe text>", "signature": "0x..." }.',
    );
  }

  const parsed = parseSiweMessage(input.message);
  if (!parsed.address || !parsed.nonce || !parsed.domain || parsed.chainId === undefined) {
    throw new AuthError(
      400,
      "Malformed SIWE message",
      "The message must be a SIWE text carrying address, domain, chainId and nonce. " +
        "The runtime builds it for you with `automaton --provision`.",
    );
  }
  if (parsed.domain !== cfg.domain) {
    throw new AuthError(
      401,
      `Invalid domain: expected ${cfg.domain}`,
      `Sign a SIWE message whose domain is exactly ${cfg.domain}. The runtime hard-codes that ` +
        "domain, so this normally only happens when a message is signed by hand.",
    );
  }
  if (parsed.chainId !== cfg.chainId) {
    throw new AuthError(
      401,
      `Invalid chainId: expected ${cfg.chainId}`,
      `The SIWE message must state chainId ${cfg.chainId} (Base). Credits are bought in USDC on ` +
        "Base, so provisioning is tied to the same chain.",
    );
  }
  if (parsed.expirationTime && parsed.expirationTime.getTime() < now) {
    throw new AuthError(
      401,
      "Message expired",
      "The expirationTime in the SIWE message has passed. Fetch a fresh nonce from " +
        "POST /v1/auth/nonce and sign again.",
    );
  }

  const nonceRow = db
    .prepare("SELECT issued_at, consumed_at FROM siwe_nonces WHERE nonce = ?")
    .get(parsed.nonce) as { issued_at: number; consumed_at: number | null } | undefined;
  if (!nonceRow || nonceRow.consumed_at !== null || now - nonceRow.issued_at > cfg.nonceTtlMs) {
    throw new AuthError(
      401,
      "Invalid or expired nonce",
      "Every nonce from POST /v1/auth/nonce is good for ten minutes and exactly one verify. " +
        "Fetch a new one and sign a new message.",
    );
  }

  let ok = false;
  try {
    ok = await verifyMessage({
      address: parsed.address,
      message: input.message,
      signature: input.signature as `0x${string}`,
    });
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new AuthError(
      401,
      "Invalid signature",
      "The signature does not recover to the address in the SIWE message. Sign the message text " +
        "verbatim (EIP-191 personal_sign) with the key of that address.",
    );
  }

  const address = parsed.address.toLowerCase() as Address;
  const accessToken = randomBytes(32).toString("base64url");
  const consume = db.transaction(() => {
    const res = db
      .prepare("UPDATE siwe_nonces SET consumed_at = ? WHERE nonce = ? AND consumed_at IS NULL")
      .run(now, parsed.nonce);
    if (res.changes !== 1) {
      throw new AuthError(
        401,
        "Invalid or expired nonce",
        "This nonce was used by another request while yours was in flight. " +
          "Fetch a new one from POST /v1/auth/nonce and sign a new message.",
      );
    }
    ensureWallet(db, address);
    db.prepare("INSERT INTO sessions (token, address, expires_at) VALUES (?, ?, ?)").run(
      accessToken,
      address,
      now + cfg.sessionTtlMs,
    );
  });
  consume();

  return { accessToken, address };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Issues an API key for the session. The full key is never stored. */
export function createApiKey(
  db: Db,
  accessToken: string,
  name: string,
  now = Date.now(),
): { key: string; keyPrefix: string; address: Address } {
  const session = db
    .prepare("SELECT address, expires_at FROM sessions WHERE token = ?")
    .get(accessToken) as { address: Address; expires_at: number } | undefined;
  if (!session || session.expires_at < now) {
    throw new AuthError(
      401,
      "Invalid or expired access token",
      "The access_token from POST /v1/auth/verify lives ten minutes and is sent as " +
        "`Authorization: Bearer <access_token>`. Run nonce and verify again to get a fresh one.",
    );
  }
  const key = `cnwy_k_${randomBytes(16).toString("hex")}`;
  const keyPrefix = key.slice(0, "cnwy_k_".length + 8);
  db.prepare(
    "INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(session.address, hashApiKey(key), keyPrefix, name || "conway-automaton", new Date(now).toISOString());
  return { key, keyPrefix, address: session.address };
}

/** Resolves an API key (raw from the Authorization header) to its wallet address. */
export function resolveApiKey(db: Db, rawKey: string | undefined): Address | null {
  if (!rawKey) return null;
  const key = rawKey.startsWith("Bearer ") ? rawKey.slice(7) : rawKey;
  if (!key.startsWith("cnwy_k_")) return null;
  const row = db
    .prepare("SELECT address FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .get(hashApiKey(key)) as { address: Address } | undefined;
  return row?.address ?? null;
}
