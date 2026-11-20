/**
 * kunden 06: the starter credit on the call a runtime makes before it first thinks.
 *
 * The runtime at pin d8f8168 reads GET /v1/credits/balance right after its key (src/index.ts:349, before
 * bootstrapTopup) and again at the top of its loop (src/agent/loop.ts:956), and only then calls
 * /v1/chat/completions. Measured on 2026-11-20 (docs/kunden/startgutschrift.md): of nine new foreign runtimes in
 * four weeks three went without a grant, one of them after reading its empty balance once. So the first read of an
 * empty balance by a key named `conway-automaton` that came in over SIWE is where the grant goes now.
 *
 * Every case runs against createApp with openDb, through the real SIWE route where the key matters, and carries its
 * counter-proof in the same file: the address that must not get a grant sits next to one that must.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app.js";
import { openDb, MC_PER_CENT } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { mintKeylessIdentity } from "../src/auth/keyless.js";
import { OUR_ADDRESSES } from "../src/bounties/ours.js";
import { GRANT_MC, POOL_MC } from "../src/credits/starter.js";
import { MockProvider } from "../src/inference/mock.js";
import { Catalog } from "../src/inference/proxy.js";

type Db = ReturnType<typeof openDb>;
type App = ReturnType<typeof createApp>;

function grants(db: Db, address: string): number {
  return (db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = 'grant' AND address = ?").get(address.toLowerCase()) as { n: number }).n;
}

function balanceMc(db: Db, address: string): number {
  return (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address.toLowerCase()) as { balance_mc: number }).balance_mc;
}

/** The runtime's own provisioning: nonce, verify, api-keys, as src/identity/provision.ts at the pin does it. */
async function provision(app: App, name?: string, pk = generatePrivateKey()) {
  const account = privateKeyToAccount(pk);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const { nonce } = (await (await post("/v1/auth/nonce", {})).json()) as { nonce: string };
  const message = createSiweMessage({
    domain: "conway.tech",
    address: account.address,
    statement: "Sign in to Conway as an Automaton to provision an API key.",
    uri: "https://cp.test/v1/auth/verify",
    version: "1",
    chainId: 8453,
    nonce,
    issuedAt: new Date(),
  });
  const verify = await post("/v1/auth/verify", { message, signature: await account.signMessage({ message }) });
  expect(verify.status).toBe(200);
  const { access_token } = (await verify.json()) as { access_token: string };
  const keys = await post("/v1/auth/api-keys", name === undefined ? {} : { name }, { authorization: `Bearer ${access_token}` });
  expect(keys.status).toBe(200);
  const { key } = (await keys.json()) as { key: string };
  return { address: account.address.toLowerCase(), key };
}

const read = (app: App, key: string) => app.request("/v1/credits/balance", { headers: { authorization: key } });

describe("The starter credit on the first balance read of a new runtime", () => {
  it("grants on the first call: a SIWE key named conway-automaton with nothing on it gets one grant row", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const r = await provision(app);
    expect(balanceMc(db, r.address)).toBe(0);
    const res = await read(app, r.key);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.balance_cents).toBe(GRANT_MC / MC_PER_CENT);
    expect(body.granted_cents).toBe(GRANT_MC / MC_PER_CENT);
    expect(body.hint).toEqual(expect.any(String));
    expect(Object.keys(body)[0], "balance_cents keeps its place").toBe("balance_cents");
    expect(body.starter_available_cents, "no second offer next to the grant").toBeUndefined();
    expect(grants(db, r.address)).toBe(1);
    expect(balanceMc(db, r.address)).toBe(GRANT_MC);
  });

  it("grants on the first call with the key name the runtime sends itself", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const r = await provision(app, "conway-automaton");
    await read(app, r.key);
    expect(grants(db, r.address)).toBe(1);
    // Counter-proof: a key with any other name is no new runtime, and its first read grants nothing.
    const other = await provision(app, "my-runtime");
    const body = (await (await read(app, other.key)).json()) as Record<string, unknown>;
    expect(body.balance_cents).toBe(0);
    expect(body.granted_cents).toBeUndefined();
    expect(grants(db, other.address)).toBe(0);
  });

  it("grants once: the second read adds no second row, even with the balance spent to zero", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const r = await provision(app);
    await read(app, r.key);
    db.prepare("UPDATE wallets SET balance_mc = 0 WHERE address = ?").run(r.address);
    const second = (await (await read(app, r.key)).json()) as Record<string, unknown>;
    expect(second.granted_cents).toBeUndefined();
    expect(second.balance_cents).toBe(0);
    expect(grants(db, r.address)).toBe(1);
  });

  it("does not grant on a read with money on the balance", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const r = await provision(app);
    db.prepare("UPDATE wallets SET balance_mc = ? WHERE address = ?").run(50 * MC_PER_CENT, r.address);
    const body = (await (await read(app, r.key)).json()) as Record<string, unknown>;
    expect(body.granted_cents).toBeUndefined();
    expect(grants(db, r.address)).toBe(0);
  });

  it("never grants ours: an address on OURS and an address with a key named after OUR_KEY_NAMES get nothing", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    // An address on OURS with a conway-automaton key, planted the way SIWE writes it.
    const ours = OUR_ADDRESSES.find((a) => a.startsWith("0x"))!;
    const key = "cnwy_k_" + "a7".repeat(16);
    db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(ours, new Date().toISOString());
    db.prepare("UPDATE wallets SET balance_mc = 0 WHERE address = ?").run(ours);
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      ours, hashApiKey(key), key.slice(0, 15), "conway-automaton", new Date().toISOString(),
    );
    const onList = (await (await read(app, key)).json()) as Record<string, unknown>;
    expect(onList.granted_cents).toBeUndefined();
    expect(grants(db, ours)).toBe(0);
    // A wallet of ours by key name: it signs in twice, once for an ops- key and once for the runtime's key.
    const pk = generatePrivateKey();
    await provision(app, "ops-selftest", pk);
    const byName = await provision(app, undefined, pk);
    const second = (await (await read(app, byName.key)).json()) as Record<string, unknown>;
    expect(second.granted_cents).toBeUndefined();
    expect(grants(db, byName.address)).toBe(0);
    // Counter-proof: the same shape without the ops- key is a stranger and gets its grant.
    const stranger = await provision(app);
    await read(app, stranger.key);
    expect(grants(db, stranger.address)).toBe(1);
  });

  it("does not grant while intake closed, and does when it is open", async () => {
    const closedProvider = new MockProvider();
    Object.defineProperty(closedProvider, "resale", { value: false });
    const db = openDb(":memory:");
    const app = createApp({ db, catalog: new Catalog([closedProvider]) });
    const r = await provision(app);
    const body = (await (await read(app, r.key)).json()) as Record<string, unknown>;
    expect(body.granted_cents).toBeUndefined();
    expect(grants(db, r.address)).toBe(0);
    // Counter-proof: the same catalogue sold whole is open intake, and the first read grants.
    const openDb2 = openDb(":memory:");
    const open = createApp({ db: openDb2, catalog: new Catalog([new MockProvider()]) });
    const o = await provision(open);
    await read(open, o.key);
    expect(grants(openDb2, o.address)).toBe(1);
  });

  it("does not grant from an empty pool, and does from one with a grant left", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    // The pool spent down to less than one grant, on an address that is not the runtime's.
    const drain = "0x" + "9d".repeat(20);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(drain, "2026-09-01T00:00:00.000Z");
    db.prepare(
      "INSERT INTO ledger (address, kind, delta_mc, ref, meta, created_at) VALUES (?, 'grant', ?, 'starter:drain', '{}', '2026-09-01T00:00:00.000Z')",
    ).run(drain, POOL_MC - GRANT_MC + 1);
    const r = await provision(app);
    const body = (await (await read(app, r.key)).json()) as Record<string, unknown>;
    expect(body.granted_cents).toBeUndefined();
    expect(grants(db, r.address)).toBe(0);
    // Counter-proof: one millicent more in the pool and the same read grants.
    db.prepare("UPDATE ledger SET delta_mc = ? WHERE ref = 'starter:drain'").run(POOL_MC - GRANT_MC);
    const again = await provision(app);
    await read(app, again.key);
    expect(grants(db, again.address)).toBe(1);
  });

  it("does not grant to a keyless sign-in, even with a key named conway-automaton", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const keyless = mintKeylessIdentity(db, "conway-automaton");
    const body = (await (await read(app, keyless.key)).json()) as Record<string, unknown>;
    expect(body.granted_cents).toBeUndefined();
    expect(grants(db, keyless.address)).toBe(0);
    // Counter-proof: the same name over SIWE is a new runtime and gets its grant.
    const r = await provision(app, "conway-automaton");
    await read(app, r.key);
    expect(grants(db, r.address)).toBe(1);
  });
});
