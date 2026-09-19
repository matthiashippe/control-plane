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

/** Baut den Register-Body exakt wie `registerAutomaton` im Runtime-Client (src/conway/client.ts). */
async function buildRegister(params: {
  signer: Account;
  automatonId?: string;
  automatonAddress?: string;
  creatorAddress?: string;
  name?: string;
  bio?: string;
  genesisPrompt?: string;
  /** Roher Wert statt keccak(genesisPrompt): nötig, um die Längenprüfung selbst zu treffen. */
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
  it("hashRegisterPayload entspricht dem Runtime-Client (sortierte Keys, keccak256 des JSON)", () => {
    const payload = { name: "n", automaton_id: "a", bio: "", creator_address: "0xc", automaton_address: "0xa" };
    const expected = keccak256(toHex(JSON.stringify({ automaton_address: "0xa", automaton_id: "a", bio: "", creator_address: "0xc", name: "n" })));
    expect(hashRegisterPayload(payload)).toBe(expected);
  });

  it("registriert einen Automaton mit gültiger Signatur und liefert { automaton }", async () => {
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

  it("lehnt einen manipulierten Payload-Hash mit 400 ab", async () => {
    const { post, account } = setup();
    const { body } = await buildRegister({ signer: account });
    body.name = "Tampered";
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("payload_hash_mismatch");
  });

  it("lehnt eine fremde Signatur mit 401 ab", async () => {
    const { post, account } = setup();
    const other = privateKeyToAccount(generatePrivateKey());
    const { body } = await buildRegister({ signer: other, automatonAddress: account.address });
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(401);
    const fehler = (await res.json()) as { error: string; message: string; docs: string };
    expect(fehler.error).toBe("invalid_signature");
    expect(fehler.message, "die Meldung nennt Domain und Typ, gegen die geprüft wird").toContain("AIWS Automaton");
    expect(fehler.message).toContain("Register(string automatonId, string nonce, bytes32 payloadHash)");
    expect(fehler.docs).toContain("docs/errors.md#registration");
  });

  it("lehnt eine automaton_address ab, die nicht die Wallet des API-Keys ist (403)", async () => {
    const { post } = setup();
    const other = privateKeyToAccount(generatePrivateKey());
    const { body } = await buildRegister({ signer: other });
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(403);
    const fehler = (await res.json()) as { error: string; message: string };
    expect(fehler.error).toBe("address_mismatch");
    expect(fehler.message).toContain("automaton_address must be the wallet of the API key");
    expect(fehler.message, "und der Weg dahin").toContain("automaton --provision");
  });

  it("ist idempotent für dieselbe ID und Adresse, 409 für dieselbe ID mit anderer Adresse", async () => {
    const first = setup();
    const { body, automatonId } = await buildRegister({ signer: first.account });
    expect((await first.post("/v1/automatons/register", body)).status).toBe(200);
    const again = await first.post("/v1/automatons/register", body);
    expect(again.status).toBe(200);
    expect(first.db.prepare("SELECT count(*) AS n FROM automatons").get()).toEqual({ n: 1 });

    // Zweite Wallet mit eigenem Key auf derselben DB, gleiche automaton_id.
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
    const konflikt = (await res.json()) as { error: string; message: string };
    expect(konflikt.error).toBe("automaton_id_conflict");
    expect(konflikt.message, "sagt, dass IDs nicht umgehängt werden und was stattdessen geht").toMatch(
      /different wallet/,
    );
    expect(konflikt.message).toMatch(/Pick a new automaton_id/);
  });

  it("liefert /v1/credits/pricing im Format, das der Runtime-Client mappt", async () => {
    const { app, key } = setup();
    const res = await app.request("/v1/credits/pricing", { headers: { authorization: key } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tiers: unknown[]; topup_tiers_usd: number[] };
    expect(Array.isArray(body.tiers)).toBe(true);
    expect(body.topup_tiers_usd).toEqual([5, 25, 100, 500, 1000, 2500]);
  });

  it("antwortet auf Transfers mit 501 (Phase-1-Entscheidung), auf beiden Pfaden", async () => {
    const { post } = setup();
    for (const path of ["/v1/credits/transfer", "/v1/credits/transfers"]) {
      const res = await post(path, { to_address: "0x000000000000000000000000000000000000dEaD", amount_cents: 100 });
      expect(res.status).toBe(501);
      expect(((await res.json()) as { error: string }).error).toBe("not_implemented");
    }
  });
});

describe("Grenzen bei der Registrierung", () => {
  it("weist überlange Felder ab, damit niemand die Platte füllt", async () => {
    // Sicherheitsfund 19.09.2026: Ein kostenlos erzeugter API-Key konnte über `bio` 90 MiB in
    // 21 Sekunden schreiben. Eine volle Platte heißt, dass SQLite nicht mehr schreibt und auch
    // Gutschriften ausfallen.
    const { post, account } = setup();

    const zuLang = await buildRegister({ signer: account, bio: "x".repeat(2001) });
    const res = await post("/v1/automatons/register", zuLang.body);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string };
    expect(body.error).toBe("field_too_long");
    expect(body.field).toBe("bio");

    const grenze = await buildRegister({ signer: account, bio: "x".repeat(2000) });
    const ok = await post("/v1/automatons/register", grenze.body);
    expect(ok.status, "genau auf der Grenze muss es noch durchgehen").toBe(200);
  });

  it("deckelt auch genesis_prompt_hash, nicht nur bio", async () => {
    // Die erste Fassung der Längenprüfung vergaß dieses Feld, und damit blieb der ganze Angriff
    // offen: 950 KB je Registrierung waren weiterhin möglich. Der Payload-Hash wird hier über den
    // langen Wert mitberechnet und die Signatur passt, sonst würde `payload_hash_mismatch` den
    // Test grün färben, ohne dass die Längenprüfung je greift.
    const { post, account } = setup();
    const { body } = await buildRegister({ signer: account, genesisPromptHashRaw: "0x" + "a".repeat(950_000) });
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(400);
    const fehler = (await res.json()) as { error: string; field?: string };
    expect(fehler.error).toBe("field_too_long");
    expect(fehler.field).toBe("genesis_prompt_hash");
  });

  it("schreibt nach abgewiesenen Registrierungen nichts in die Datenbank", async () => {
    const { post, account, db } = setup();
    for (const feld of ["bio", "name", "genesis_prompt_hash"] as const) {
      const { body } = await buildRegister({ signer: account });
      (body as Record<string, unknown>)[feld] = "x".repeat(900_000);
      await post("/v1/automatons/register", body);
    }
    const zeilen = (db.prepare("SELECT count(*) AS n FROM automatons").get() as { n: number }).n;
    expect(zeilen, "kein abgewiesener Versuch darf eine Zeile hinterlassen").toBe(0);
  });

  it("begrenzt die Zahl der Automatons je Wallet", async () => {
    const { post, account } = setup();
    for (let i = 0; i < 25; i++) {
      const { body } = await buildRegister({ signer: account });
      const res = await post("/v1/automatons/register", body);
      expect(res.status, `Registrierung ${i + 1} muss durchgehen`).toBe(200);
    }
    const { body } = await buildRegister({ signer: account });
    const res = await post("/v1/automatons/register", body);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe("too_many_automatons");
  });
});
