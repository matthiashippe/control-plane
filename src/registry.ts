/**
 * `POST /v1/automatons/register` (docs/protocol.md, section Registry).
 *
 * The runtime calls it exactly once on its first start. We recompute the payload hash, check the
 * EIP-712 signature against `automaton_address` and require that this address is the wallet of the
 * API key. A duplicate ID with a different address is a conflict (409), the same address is
 * idempotent.
 */

import { isAddress, keccak256, toHex, verifyTypedData, type Address, type Hex } from "viem";
import type { Db } from "./db.js";
import { DOC } from "./errors.js";

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

/** Exactly like `canonicalizePayload` + `hashIdentityPayload` in the runtime client. */
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
  if (typeof raw !== "object" || raw === null) {
    return {
      status: 400,
      body: {
        error: "invalid_body",
        message:
          "The body must be a JSON object with the registration fields. The runtime sends it once " +
          "on its first start; see the docs if you are building the call yourself.",
        docs: DOC.registration,
      },
    };
  }
  const b = raw as Partial<RegisterBody>;
  if (b.chain_type && b.chain_type !== "evm") {
    return {
      status: 400,
      body: {
        error: `chain_type ${b.chain_type} not supported`,
        message:
          'Only EVM automatons can register here. Send chain_type "evm" or leave it out; Solana ' +
          "wallets can neither be provisioned nor pay with x402 on this control plane.",
        docs: DOC.registration,
      },
    };
  }
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
    const missing = Object.entries({
      automaton_id: automatonId,
      automaton_address: automatonAddress,
      creator_address: creatorAddress,
      name,
      nonce,
      signature,
      payload_hash: payloadHash,
    })
      .filter(([, value]) => !value)
      .map(([field]) => field);
    return {
      status: 400,
      body: {
        error: "missing_fields",
        message:
          `These fields are missing or empty: ${missing.join(", ")}. A registration needs ` +
          "automaton_id, automaton_address, creator_address, name, nonce, payload_hash and " +
          "signature; bio and genesis_prompt_hash are optional.",
        docs: DOC.registration,
      },
    };
  }
  if (!isAddress(automatonAddress) || !isAddress(creatorAddress)) {
    return {
      status: 400,
      body: {
        error: "invalid_address",
        message:
          "automaton_address and creator_address must both be EVM addresses (0x plus 40 hex " +
          "characters). The signature is checked against automaton_address, so a typo there ends " +
          "here and not later.",
        docs: DOC.registration,
      },
    };
  }

  // Without length caps a single key created for free can fill the disk: 100 registrations with
  // 900 KB of `bio` each produced 90 MiB in 21 seconds during the security review, and a full disk
  // means SQLite stops writing and credits fail too. Every field that is stored needs a cap. The
  // first version of this check forgot `genesis_prompt_hash`, which left the attack open: 950 KB
  // per registration, 25 registrations per wallet (counter-check 19.09.2026). A keccak hash is 66
  // characters long.
  const tooLong = Object.entries({
    automaton_id: [automatonId, 128],
    name: [name, 200],
    bio: [bio, 2000],
    nonce: [nonce, 128],
    genesis_prompt_hash: [genesisPromptHash ?? "", 66],
    creator_address: [creatorAddress, 42],
    signature: [signature, 132],
    payload_hash: [payloadHash, 66],
  } as Record<string, [string, number]>).find(([, [value, max]]) => value.length > max);
  if (tooLong) {
    return {
      status: 400,
      body: {
        error: "field_too_long",
        field: tooLong[0],
        max_length: tooLong[1][1],
        message:
          `The field ${tooLong[0]} is ${tooLong[1][0].length} characters long, the limit is ` +
          `${tooLong[1][1]}. Registration costs nothing and everything sent here is stored, so ` +
          "every field has a cap; shorten it and register again.",
        docs: DOC.registration,
      },
    };
  }

  // A wallet runs its own automatons, not a registration farm. The cap is generous enough for
  // every real use case and puts a lid on abuse.
  const AUTOMATONS_PER_WALLET = 25;
  const existingCount = (
    db.prepare("SELECT count(*) AS n FROM automatons WHERE address = ?").get(automatonAddress.toLowerCase()) as { n: number }
  ).n;
  if (existingCount >= AUTOMATONS_PER_WALLET) {
    return {
      status: 429,
      body: {
        error: "too_many_automatons",
        limit: AUTOMATONS_PER_WALLET,
        message:
          `This wallet has already registered ${AUTOMATONS_PER_WALLET} automatons, which is the cap ` +
          "per wallet. Registration is free, so the cap is what keeps a single key from filling " +
          "the disk. Each automaton has its own wallet and its own API key: register the next one " +
          "from that wallet. If you genuinely need more under one wallet, say so at " +
          "https://github.com/matthiashippe/control-plane/issues.",
        docs: DOC.registration,
      },
    };
  }

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
    return {
      status: 400,
      body: {
        error: "payload_hash_mismatch",
        message:
          "payload_hash does not match the fields in this request. It is the keccak256 of the JSON " +
          "of {automaton_id, automaton_address, creator_address, name, bio} plus " +
          "genesis_prompt_hash when present, with the keys sorted alphabetically and no extra " +
          "whitespace. The runtime computes it for you; hash the body you actually send.",
        docs: DOC.registration,
      },
    };
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
  if (!ok) {
    return {
      status: 401,
      body: {
        error: "invalid_signature",
        message:
          "The EIP-712 signature does not verify against automaton_address. Sign the type " +
          "Register(string automatonId, string nonce, bytes32 payloadHash) with the domain " +
          '{name: "AIWS Automaton", version: "1", chainId: 8453} using the automaton\'s own key, ' +
          "over the same nonce and payload_hash you send here.",
        docs: DOC.registration,
      },
    };
  }

  if (automatonAddress.toLowerCase() !== keyAddress.toLowerCase()) {
    return {
      status: 403,
      body: {
        error: "address_mismatch",
        message:
          "automaton_address must be the wallet of the API key used for this call. An automaton " +
          "registers itself: provision a key from its own wallet (`automaton --provision`) and " +
          "register with that key.",
        docs: DOC.registration,
      },
    };
  }

  const address = automatonAddress.toLowerCase();
  const existing = db.prepare("SELECT * FROM automatons WHERE automaton_id = ?").get(automatonId) as AutomatonRow | undefined;
  if (existing) {
    if (existing.address !== address) {
      return {
        status: 409,
        body: {
          error: "automaton_id_conflict",
          message:
            "This automaton_id already belongs to a different wallet, and identities are not " +
            "reassigned. Pick a new automaton_id (the runtime generates a UUID when it has none) " +
            "or register from the wallet that owns this one.",
          docs: DOC.registration,
        },
      };
    }
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
