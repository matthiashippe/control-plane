import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, MC_PER_CENT } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { claimStarter, poolLeftMc, GRANT_MC, POOL_MC, StarterError } from "../src/credits/starter.js";

function account(db: ReturnType<typeof openDb>, app: ReturnType<typeof createApp>, n: number) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${String(n % 10).repeat(2)}` + "ab".repeat(15);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  return {
    address,
    claim: () => app.request("/v1/credits/starter", { method: "POST", headers: { authorization: key } }),
    noKey: () => app.request("/v1/credits/starter", { method: "POST" }),
    read: () => app.request("/v1/credits/balance", { headers: { authorization: key } }),
    balance: () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc,
  };
}

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db });
  return { db, app, a: account(db, app, 1), b: account(db, app, 2) };
}

describe("The starter credit", () => {
  it("gives a fresh address enough to attempt a bounty, without any USDC", async () => {
    const { a } = setup();
    expect(a.balance()).toBe(0);
    const res = await a.claim();
    expect(res.status).toBe(201);
    const body = (await res.json()) as { granted_cents: number; pool_left_cents: number };
    expect(body.granted_cents).toBe(GRANT_MC / MC_PER_CENT);
    expect(a.balance()).toBe(GRANT_MC);
    expect(body.pool_left_cents).toBe((POOL_MC - GRANT_MC) / MC_PER_CENT);
  });

  it("hands it out once per address and never again", async () => {
    const { a } = setup();
    await a.claim();
    const after = a.balance();
    const second = await a.claim();
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe("already_claimed");
    expect(a.balance(), "a second claim must not pay a second time").toBe(after);
  });

  it("is enforced by the database and not by the check in front of it", () => {
    const { db, a } = setup();
    claimStarter(db, a.address);
    // Going around the endpoint entirely: the unique index has to refuse this, otherwise two
    // simultaneous requests would both pass the check and grant twice.
    expect(() =>
      db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?, 'grant', ?, ?, ?)")
        .run(a.address, GRANT_MC, "starter:again", new Date().toISOString()),
    ).toThrow(/UNIQUE/);
  });

  it("stops when the pool is used up, instead of giving away what it does not have", () => {
    const { db } = setup();
    const many = Math.floor(POOL_MC / GRANT_MC);
    for (let i = 0; i < many; i++) claimStarter(db, `0x${String(i).padStart(40, "0")}`);
    expect(poolLeftMc(db)).toBeLessThan(GRANT_MC);
    let thrown: StarterError | null = null;
    try {
      claimStarter(db, "0x" + "f".repeat(40));
    } catch (e) {
      thrown = e as StarterError;
    }
    expect(thrown?.code).toBe("pool_empty");
    expect(thrown?.status).toBe(409);
  });

  it("never lets the pool go negative, even at the last grant", () => {
    const { db } = setup();
    const many = Math.floor(POOL_MC / GRANT_MC);
    for (let i = 0; i < many; i++) claimStarter(db, `0x${String(i).padStart(40, "0")}`);
    const granted = (db.prepare("SELECT coalesce(sum(delta_mc),0) AS s FROM ledger WHERE kind = 'grant'").get() as { s: number }).s;
    expect(granted).toBeLessThanOrEqual(POOL_MC);
  });

  it("keeps ledger and balances in step", async () => {
    const { db, a, b } = setup();
    await a.claim();
    await b.claim();
    const ledger = (db.prepare("SELECT coalesce(sum(delta_mc),0) AS s FROM ledger").get() as { s: number }).s;
    const balances = (db.prepare("SELECT coalesce(sum(balance_mc),0) AS s FROM wallets").get() as { s: number }).s;
    expect(ledger).toBe(balances);
    expect(balances).toBe(2 * GRANT_MC);
  });

  it("needs an API key, because the key is what proves a wallet", async () => {
    const { a } = setup();
    expect((await a.noKey()).status).toBe(401);
  });

  /**
   * The endpoint a newcomer actually polls has to mention the credit waiting for them.
   *
   * On 2026-09-22 a stranger who had arrived through our answer in Conway issue #390 provisioned a
   * runtime and then asked /v1/credits/balance twenty-eight times in thirteen minutes. Every answer
   * was `{"balance_cents":0}` and nothing more, the grant was one POST away, and they left. So the
   * three properties that make the answer useful are pinned: the invitation is there while a grant
   * is available, it names the route, and it is gone once the grant is taken, because inviting
   * somebody to claim what they already have is its own kind of wrong answer.
   */
  it("tells an address with nothing that a starter credit is waiting, and stops once it is taken", async () => {
    const { a } = setup();
    type Antwort = { balance_cents: number; starter_available_cents?: number; hint?: string };
    const leer = (await (await a.read()).json()) as Antwort;
    expect(leer.balance_cents).toBe(0);
    expect(leer.starter_available_cents).toBe(GRANT_MC / MC_PER_CENT);
    expect(leer.hint).toContain("POST /v1/credits/starter");

    await a.claim();
    const voll = (await (await a.read()).json()) as Antwort;
    expect(voll.balance_cents).toBe(GRANT_MC / MC_PER_CENT);
    expect(voll.starter_available_cents, "the grant is taken, so the invitation goes").toBeUndefined();
    expect(voll.hint).toBeUndefined();
  });

  it("does not invite anybody to claim from an empty pool", async () => {
    const { db, a } = setup();
    const viele = Math.floor(POOL_MC / GRANT_MC);
    for (let i = 0; i < viele; i++) claimStarter(db, `0x${String(i).padStart(40, "0")}`);
    const antwort = (await (await a.read()).json()) as { balance_cents: number; hint?: string };
    expect(antwort.balance_cents).toBe(0);
    expect(antwort.hint, "a promise the pool cannot keep is worse than silence").toBeUndefined();
  });

  it("says in /v1/status how much is left, so the promise can be checked", async () => {
    const { app, a } = setup();
    const before = (await (await app.request("/v1/status")).json()) as { starter_pool_left_cents: number; starter_credit_cents: number };
    expect(before.starter_credit_cents).toBe(GRANT_MC / MC_PER_CENT);
    await a.claim();
    const after = (await (await app.request("/v1/status")).json()) as { starter_pool_left_cents: number };
    expect(after.starter_pool_left_cents).toBe(before.starter_pool_left_cents - GRANT_MC / MC_PER_CENT);
  });
});
