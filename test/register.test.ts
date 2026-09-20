import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { keccak256, toHex } from "viem";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { hashRegisterPayload } from "../src/registry.js";

type Account = ReturnType<typeof privateKeyToAccount>;

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db });
  const account = privateKeyToAccount(generatePrivateKey());
  const key = "cnwy_k_" + "cd".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(account.address.toLowerCase(), new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    account.address.toLowerCase(),
    hashApiKey(key),
    key.slice(0, 15),
    "test",
    new Date().toISOString(),
  );
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", authorization: key }, body: JSON.stringify(body) });
  return { db, app, account, key, post };
}

/** Builds the register body exactly like `registerAutomaton` in the runtime client (src/conway/client.ts). */
async function buildRegister(params: {
  signer: Account;
  automatonId?: string;
  automatonAddress?: string;
  creatorAddress?: string;
  name?: string;
  bio?: string;
  genesisPrompt?: string;
  /** A raw value instead of keccak(genesisPrompt): needed to hit the length check itself. */
  genesisPromptHashRaw?: string;
}) {
  const automatonId = params.automatonId ?? crypto.randomUUID();
  const automatonAddress = params.automatonAddress ?? params.signer.address;
  const creatorAddress = params.creatorAddress ?? "0x000000000000000000000000000000000000dEaD";
  const name = params.name ?? "Harness";
  const bio = params.bio ?? "";
  const nonce = crypto.randomUUID();
  const payload: Record<string, string> = { automaton_id: automatonId, automaton_address: automatonAddress, creator_address: creatorAddress, name, bio };
  const genesisPromptHash = params.genesisPromptHashRaw ?? (params.genesisPrompt ? keccak256(toHex(params.genesisPrompt)) : undefined);
  if (genesisPromptHash) payload.genesis_prompt_hash = genesisPromptHash;
  const payloadHash = hashRegisterPayload(payload);
  const signature = await params.signer.signTypedData({
    domain: { name: "AIWS Automaton", version: "1", chainId: 8453 },
    types: { Register: [{ name: "automatonId", type: "string" }, { name: "nonce", type: "string" }, { name: "payloadHash", type: "bytes32" }] },
    primaryType: "Register",
    message: { automatonId, nonce, payloadHash },
  });
  const body: Record<string, unknown> = { ...payload, nonce, signature, payload_hash: payloadHash };
  return { body, automatonId };
}

describe("Registry", () => {
  it("hashRegisterPayload matches the runtime client (sorted keys, keccak256 of the JSON)", () => {
    const payload = { name: "n", automaton_id: "a", bio: "", creator_address: "0xc", automaton_address: "0xa" };
    const expected = keccak256(toHex(JSON.stringify({ automaton_address: "0xa", automaton_id: "a", bio: "", creator_address: "0xc", name: "n" })));
    expect(hashRegisterPayload(payload)).toBe(expected);
  });

  it("registers an automaton with a valid signature and returns { automaton }", async () => {
    const { post, account, db } = setup();
    const { body, automatonId } = await buildRegister({ signer: account, genesisPrompt: "be useful" });
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { automaton: Record<string, unknown> };
    expect(json.automaton).toMatchObject({
      automaton_id: automatonId,
      automaton_address: account.address.toLowerCase(),
      creator_address: "0x000000000000000000000000000000000000dead",
      name: "Harness",
      genesis_prompt_hash: keccak256(toHex("be useful")),
    });
    expect(db.prepare("SELECT count(*) AS n FROM automatons").get()).toEqual({ n: 1 });
  });

  it("rejects a tampered payload hash with 400", async () => {
    const { post, account } = setup();
    const { body } = await buildRegister({ signer: account });
    body.name = "Tampered";
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("payload_hash_mismatch");
  });

  it("rejects a signature from somebody else with 401", async () => {
    const { post, account } = setup();
    const other = privateKeyToAccount(generatePrivateKey());
    const { body } = await buildRegister({ signer: other, automatonAddress: account.address });
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(401);
    const error = (await res.json()) as { error: string; message: string; docs: string };
    expect(error.error).toBe("invalid_signature");
    expect(error.message, "the message names the domain and type it is checked against").toContain("AIWS Automaton");
    expect(error.message).toContain("Register(string automatonId, string nonce, bytes32 payloadHash)");
    expect(error.docs).toContain("docs/errors.md#registration");
  });

  it("rejects an automaton_address that is not the wallet of the API key (403)", async () => {
    const { post } = setup();
    const other = privateKeyToAccount(generatePrivateKey());
    const { body } = await buildRegister({ signer: other });
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(403);
    const error = (await res.json()) as { error: string; message: string };
    expect(error.error).toBe("address_mismatch");
    expect(error.message).toContain("automaton_address must be the wallet of the API key");
    expect(error.message, "and the way to get there").toContain("automaton --provision");
  });

  it("is idempotent for the same ID and address, 409 for the same ID with a different address", async () => {
    const first = setup();
    const { body, automatonId } = await buildRegister({ signer: first.account });
    expect((await first.post("/v1/automatons/register", body)).status).toBe(200);
    const again = await first.post("/v1/automatons/register", body);
    expect(again.status).toBe(200);
    expect(first.db.prepare("SELECT count(*) AS n FROM automatons").get()).toEqual({ n: 1 });

    // A second wallet with its own key on the same DB, same automaton_id.
    const other = privateKeyToAccount(generatePrivateKey());
    const otherKey = "cnwy_k_" + "ef".repeat(16);
    first.db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(other.address.toLowerCase(), new Date().toISOString());
    first.db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      other.address.toLowerCase(),
      hashApiKey(otherKey),
      otherKey.slice(0, 15),
      "other",
      new Date().toISOString(),
    );
    const { body: conflict } = await buildRegister({ signer: other, automatonId });
    const res = await first.app.request("/v1/automatons/register", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: otherKey },
      body: JSON.stringify(conflict),
    });
    expect(res.status).toBe(409);
    const conflictBody = (await res.json()) as { error: string; message: string };
    expect(conflictBody.error).toBe("automaton_id_conflict");
    expect(conflictBody.message, "says that IDs are not reassigned and what works instead").toMatch(
      /different wallet/,
    );
    expect(conflictBody.message).toMatch(/Pick a new automaton_id/);
  });

  it("serves /v1/credits/pricing in the shape the runtime client maps", async () => {
    const { app, key } = setup();
    const res = await app.request("/v1/credits/pricing", { headers: { authorization: key } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tiers: unknown[]; topup_tiers_usd: number[] };
    expect(Array.isArray(body.tiers)).toBe(true);
    expect(body.topup_tiers_usd).toEqual([5, 25, 100, 500, 1000, 2500]);
  });

  it("answers transfers with 501 (the phase 1 decision), on both paths", async () => {
    const { post } = setup();
    for (const path of ["/v1/credits/transfer", "/v1/credits/transfers"]) {
      const res = await post(path, { to_address: "0x000000000000000000000000000000000000dEaD", amount_cents: 100 });
      expect(res.status).toBe(501);
      expect(((await res.json()) as { error: string }).error).toBe("not_implemented");
    }
  });
});

describe("limits on registration", () => {
  it("rejects over-long fields, so nobody fills the disk", async () => {
    // Security finding 19.09.2026: an API key created for free could write 90 MiB in 21 seconds
    // through `bio`. A full disk means SQLite stops writing and credits fail too.
    const { post, account } = setup();

    const tooLong = await buildRegister({ signer: account, bio: "x".repeat(2001) });
    const res = await post("/v1/automatons/register", tooLong.body);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string };
    expect(body.error).toBe("field_too_long");
    expect(body.field).toBe("bio");

    const atLimit = await buildRegister({ signer: account, bio: "x".repeat(2000) });
    const ok = await post("/v1/automatons/register", atLimit.body);
    expect(ok.status, "exactly on the limit it still has to pass").toBe(200);
  });

  it("caps genesis_prompt_hash too, not only bio", async () => {
    // The first version of the length check forgot this field, which left the whole attack open:
    // 950 KB per registration were still possible. The payload hash here is computed over the long
    // value and the signature matches, otherwise `payload_hash_mismatch` would colour the test
    // green without the length check ever taking hold.
    const { post, account } = setup();
    const { body } = await buildRegister({ signer: account, genesisPromptHashRaw: "0x" + "a".repeat(950_000) });
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(400);
    const error = (await res.json()) as { error: string; field?: string };
    expect(error.error).toBe("field_too_long");
    expect(error.field).toBe("genesis_prompt_hash");
  });

  it("writes nothing to the database after rejected registrations", async () => {
    const { post, account, db } = setup();
    for (const field of ["bio", "name", "genesis_prompt_hash"] as const) {
      const { body } = await buildRegister({ signer: account });
      (body as Record<string, unknown>)[field] = "x".repeat(900_000);
      await post("/v1/automatons/register", body);
    }
    const rows = (db.prepare("SELECT count(*) AS n FROM automatons").get() as { n: number }).n;
    expect(rows, "no rejected attempt may leave a row behind").toBe(0);
  });

  it("caps the number of automatons per wallet", async () => {
    const { post, account } = setup();
    for (let i = 0; i < 25; i++) {
      const { body } = await buildRegister({ signer: account });
      const res = await post("/v1/automatons/register", body);
      expect(res.status, `registration ${i + 1} has to pass`).toBe(200);
    }
    const { body } = await buildRegister({ signer: account });
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe("too_many_automatons");
  });
});
