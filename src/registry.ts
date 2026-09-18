/**
 * `POST /v1/automatons/register` (docs/protocol.md, Abschnitt Registry).
 *
 * Die Runtime ruft es genau einmal beim ersten Start. Wir rechnen den Payload-Hash nach, prüfen
 * die EIP-712-Signatur gegen `automaton_address` und verlangen, dass diese Adresse die Wallet des
 * API-Keys ist. Doppelte IDs mit anderer Adresse sind ein Konflikt (409), dieselbe Adresse ist
 * idempotent.
 */

import { isAddress, keccak256, toHex, verifyTypedData, type Address, type Hex } from "viem";
import type { Db } from "./db.js";

export interface RegisterBody {
  automaton_id: string;
  automaton_address: string;
  creator_address: string;
  name: string;
  bio?: string;
  nonce: string;
  signature: string;
  payload_hash: string;
  genesis_prompt_hash?: string;
  chain_type?: string;
}

export interface RegisterResult {
  status: number;
  body: Record<string, unknown>;
}

const REGISTER_DOMAIN = { name: "AIWS Automaton", version: "1", chainId: 8453 } as const;
const REGISTER_TYPES = {
  Register: [
    { name: "automatonId", type: "string" },
    { name: "nonce", type: "string" },
    { name: "payloadHash", type: "bytes32" },
  ],
} as const;

/** Exakt wie `canonicalizePayload` + `hashIdentityPayload` im Runtime-Client. */
export function hashRegisterPayload(payload: Record<string, string>): Hex {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(payload).sort()) sorted[key] = payload[key];
  return keccak256(toHex(JSON.stringify(sorted)));
}

interface AutomatonRow {
  automaton_id: string;
  address: string;
  creator_address: string;
  name: string;
  bio: string;
  genesis_prompt_hash: string | null;
  registered_at: string;
}

function describe(row: AutomatonRow): Record<string, unknown> {
  return {
    automaton_id: row.automaton_id,
    automaton_address: row.address,
    creator_address: row.creator_address,
    name: row.name,
    bio: row.bio,
    genesis_prompt_hash: row.genesis_prompt_hash,
    registered_at: row.registered_at,
  };
}

export async function handleRegister(db: Db, keyAddress: Address, raw: unknown): Promise<RegisterResult> {
  if (typeof raw !== "object" || raw === null) return { status: 400, body: { error: "invalid_body" } };
  const b = raw as Partial<RegisterBody>;
  if (b.chain_type && b.chain_type !== "evm") return { status: 400, body: { error: `chain_type ${b.chain_type} not supported` } };
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const automatonId = str(b.automaton_id);
  const automatonAddress = str(b.automaton_address);
  const creatorAddress = str(b.creator_address);
  const name = str(b.name);
  const bio = str(b.bio) ?? "";
  const nonce = str(b.nonce);
  const signature = str(b.signature);
  const payloadHash = str(b.payload_hash);
  const genesisPromptHash = str(b.genesis_prompt_hash);
  if (!automatonId || !automatonAddress || !creatorAddress || !name || !nonce || !signature || !payloadHash) {
    return { status: 400, body: { error: "missing_fields" } };
  }
  if (!isAddress(automatonAddress) || !isAddress(creatorAddress)) return { status: 400, body: { error: "invalid_address" } };

  const payload: Record<string, string> = {
    automaton_id: automatonId,
    automaton_address: automatonAddress,
    creator_address: creatorAddress,
    name,
    bio,
  };
  if (genesisPromptHash) payload.genesis_prompt_hash = genesisPromptHash;
  const expectedHash = hashRegisterPayload(payload);
  if (expectedHash.toLowerCase() !== payloadHash.toLowerCase()) {
    return { status: 400, body: { error: "payload_hash_mismatch" } };
  }

  let ok = false;
  try {
    ok = await verifyTypedData({
      address: automatonAddress as Address,
      domain: REGISTER_DOMAIN,
      types: REGISTER_TYPES,
      primaryType: "Register",
      message: { automatonId, nonce, payloadHash: expectedHash },
      signature: signature as Hex,
    });
  } catch {
    ok = false;
  }
  if (!ok) return { status: 401, body: { error: "invalid_signature" } };

  if (automatonAddress.toLowerCase() !== keyAddress.toLowerCase()) {
    return { status: 403, body: { error: "address_mismatch", message: "automaton_address must be the wallet of the API key" } };
  }

  const address = automatonAddress.toLowerCase();
  const existing = db.prepare("SELECT * FROM automatons WHERE automaton_id = ?").get(automatonId) as AutomatonRow | undefined;
  if (existing) {
    if (existing.address !== address) return { status: 409, body: { error: "automaton_id_conflict" } };
    return { status: 200, body: { automaton: describe(existing) } };
  }

  const row: AutomatonRow = {
    automaton_id: automatonId,
    address,
    creator_address: creatorAddress.toLowerCase(),
    name,
    bio,
    genesis_prompt_hash: genesisPromptHash ?? null,
    registered_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO automatons (automaton_id, address, creator_address, name, bio, genesis_prompt_hash, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(row.automaton_id, row.address, row.creator_address, row.name, row.bio, row.genesis_prompt_hash, row.registered_at);
  return { status: 200, body: { automaton: describe(row) } };
}
