/**
 * SIWE-Provisionierung: nonce -> verify (access_token) -> api-keys (cnwy_k_...).
 *
 * Der Runtime-Client (provision.ts) sendet Domain "conway.tech" und chainId 8453 fest; die uri
 * ist "<conwayApiUrl>/v1/auth/verify" und damit je Deployment anders. Geprüft werden Domain,
 * chainId, Nonce und Signatur; die uri wird nicht geprüft.
 */

import { createHash, randomBytes } from "node:crypto";
import { verifyMessage, type Address } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { ensureWallet, type Db } from "../db.js";

export interface SiweConfig {
  /** Erwartete SIWE-Domain, Default "conway.tech" (der Client hat sie fest verdrahtet). */
  domain: string;
  chainId: number;
  /** Lebensdauer einer Nonce in ms. */
  nonceTtlMs: number;
  /** Lebensdauer eines access_token in ms. */
  sessionTtlMs: number;
}

export const DEFAULT_SIWE_CONFIG: SiweConfig = {
  domain: "conway.tech",
  chainId: 8453,
  nonceTtlMs: 10 * 60 * 1000,
  sessionTtlMs: 10 * 60 * 1000,
};

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function issueNonce(db: Db, now = Date.now()): string {
  // 16 Bytes reichen; alphanumerisch, wie SIWE es verlangt (mindestens 8 Zeichen).
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
 * Prüft Message und Signatur, verbraucht die Nonce und gibt ein access_token aus.
 * Wortlaut der Fehler folgt dem, was Conway heute liefert ("Invalid or expired nonce").
 */
export async function verifySiwe(
  db: Db,
  input: VerifyInput,
  cfg: SiweConfig = DEFAULT_SIWE_CONFIG,
  now = Date.now(),
): Promise<{ accessToken: string; address: Address }> {
  if (input.chainType && input.chainType !== "evm") {
    throw new AuthError(400, `chain_type ${input.chainType} not supported`);
  }
  if (typeof input.message !== "string" || typeof input.signature !== "string") {
    throw new AuthError(400, "message and signature are required");
  }

  const parsed = parseSiweMessage(input.message);
  if (!parsed.address || !parsed.nonce || !parsed.domain || parsed.chainId === undefined) {
    throw new AuthError(400, "Malformed SIWE message");
  }
  if (parsed.domain !== cfg.domain) {
    throw new AuthError(401, `Invalid domain: expected ${cfg.domain}`);
  }
  if (parsed.chainId !== cfg.chainId) {
    throw new AuthError(401, `Invalid chainId: expected ${cfg.chainId}`);
  }
  if (parsed.expirationTime && parsed.expirationTime.getTime() < now) {
    throw new AuthError(401, "Message expired");
  }

  const nonceRow = db
    .prepare("SELECT issued_at, consumed_at FROM siwe_nonces WHERE nonce = ?")
    .get(parsed.nonce) as { issued_at: number; consumed_at: number | null } | undefined;
  if (!nonceRow || nonceRow.consumed_at !== null || now - nonceRow.issued_at > cfg.nonceTtlMs) {
    throw new AuthError(401, "Invalid or expired nonce");
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
    throw new AuthError(401, "Invalid signature");
  }

  const address = parsed.address.toLowerCase() as Address;
  const accessToken = randomBytes(32).toString("base64url");
  const consume = db.transaction(() => {
    const res = db
      .prepare("UPDATE siwe_nonces SET consumed_at = ? WHERE nonce = ? AND consumed_at IS NULL")
      .run(now, parsed.nonce);
    if (res.changes !== 1) throw new AuthError(401, "Invalid or expired nonce");
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

/** Stellt einen API-Key für die Session aus. Der volle Key wird nie gespeichert. */
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
    throw new AuthError(401, "Invalid or expired access token");
  }
  const key = `cnwy_k_${randomBytes(16).toString("hex")}`;
  const keyPrefix = key.slice(0, "cnwy_k_".length + 8);
  db.prepare(
    "INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(session.address, hashApiKey(key), keyPrefix, name || "conway-automaton", new Date(now).toISOString());
  return { key, keyPrefix, address: session.address };
}

/** Löst einen API-Key (roh aus dem Authorization-Header) zur Wallet-Adresse auf. */
export function resolveApiKey(db: Db, rawKey: string | undefined): Address | null {
  if (!rawKey) return null;
  const key = rawKey.startsWith("Bearer ") ? rawKey.slice(7) : rawKey;
  if (!key.startsWith("cnwy_k_")) return null;
  const row = db
    .prepare("SELECT address FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .get(hashApiKey(key)) as { address: Address } | undefined;
  return row?.address ?? null;
}
