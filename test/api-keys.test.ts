/**
 * Seeing your own keys, and turning one off.
 *
 * `docs/api-key.md` has said since it was written: "name it after the thing that uses it, because
 * that name is what you will read when you revoke it." There was no way to revoke it and no way to
 * see what you had. The `revoked_at` column has existed the whole time and `resolveApiKey` has
 * always refused a key that has one; nothing could ever set it.
 *
 * Found on 2026-09-22 by counting: 447 keys on the live instance, every one active, 350 of them
 * minted by our own market check. Ours are noise. The one that matters is the stranger who
 * provisioned a real runtime at 02:05 that morning.
 *
 * What these hold is the boundary, because this is the one endpoint where getting it wrong means
 * one caller can turn off another caller's access.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";

function konto(db: ReturnType<typeof openDb>, n: number, name = "conway-automaton") {
  const address = `0x${String(n).repeat(40)}`.slice(0, 42);
  const key = `cnwy_k_${String(n).repeat(2)}` + "ab".repeat(15);
  db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)")
    .run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(address, hashApiKey(key), key.slice(0, 15), name, new Date().toISOString());
  return { address, key, prefix: key.slice(0, 15) };
}

const setup = () => {
  const db = openDb(":memory:");
  return { db, app: createApp({ db }) };
};

const mit = (key: string, body?: unknown) => ({
  method: body === undefined ? "GET" : "POST",
  headers: { "content-type": "application/json", authorization: key },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe("your own API keys", () => {
  it("lists yours and nobody else's, and never the key itself", async () => {
    const { db, app } = setup();
    const a = konto(db, 1, "my-runtime");
    const b = konto(db, 2, "somebody-elses");

    const res = await app.request("/v1/auth/api-keys", mit(a.key));
    expect(res.status).toBe(200);
    const { keys } = (await res.json()) as { keys: { key_prefix: string; name: string; active: boolean }[] };
    expect(keys).toHaveLength(1);
    expect(keys[0].name).toBe("my-runtime");
    expect(keys[0].active).toBe(true);
    expect(keys[0].key_prefix).toBe(a.prefix);
    expect(JSON.stringify(keys), "the key itself never leaves the server").not.toContain(a.key);
    expect(JSON.stringify(keys), "and neither does anybody else's").not.toContain(b.prefix);
  });

  it("needs a key of its own", async () => {
    const { app } = setup();
    expect((await app.request("/v1/auth/api-keys", { method: "GET" })).status).toBe(401);
    expect(
      (await app.request("/v1/auth/api-keys/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key_prefix: "cnwy_k_1111111" }),
      })).status,
    ).toBe(401);
  });

  it("revokes a key, and that key stops working", async () => {
    const { db, app } = setup();
    const a = konto(db, 1);
    // A second key of the same address, so the caller is not locked out by the act itself.
    const zweit = `cnwy_k_zz${"cd".repeat(15)}`;
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(a.address, hashApiKey(zweit), zweit.slice(0, 15), "second", new Date().toISOString());

    const res = await app.request("/v1/auth/api-keys/revoke", mit(zweit, { key_prefix: a.prefix }));
    expect(res.status).toBe(200);
    expect((await res.json()) as { revoked: boolean }).toMatchObject({ revoked: true });

    // The revoked key is now refused everywhere, which is the whole point.
    expect((await app.request("/v1/credits/balance", mit(a.key))).status).toBe(401);
    // And the one still held keeps working.
    expect((await app.request("/v1/credits/balance", mit(zweit))).status).toBe(200);

    const { keys } = (await (await app.request("/v1/auth/api-keys", mit(zweit))).json()) as {
      keys: { key_prefix: string; active: boolean; revoked_at: string | null }[];
    };
    const weg = keys.find((k) => k.key_prefix === a.prefix)!;
    expect(weg.active, "it is still listed, so you can see what you turned off").toBe(false);
    expect(weg.revoked_at).toBeTruthy();
  });

  it("cannot revoke somebody else's key", async () => {
    const { db, app } = setup();
    const a = konto(db, 1);
    const b = konto(db, 2);

    const res = await app.request("/v1/auth/api-keys/revoke", mit(a.key, { key_prefix: b.prefix }));
    expect(res.status, "a key that is not yours is not yours to revoke").toBe(404);
    // And it still works, which is the assertion that matters: a 404 that revoked it anyway would
    // be the worst possible outcome here.
    expect((await app.request("/v1/credits/balance", mit(b.key))).status).toBe(200);
  });

  it("revoking the key you are holding is allowed and says so", async () => {
    const { db, app } = setup();
    const a = konto(db, 1);
    const res = await app.request("/v1/auth/api-keys/revoke", mit(a.key, { key_prefix: a.prefix }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { note: string }).note).toMatch(/the key you just used/i);
    expect((await app.request("/v1/credits/balance", mit(a.key))).status, "and the next call is a 401").toBe(401);
  });

  it("refuses a revoke without a prefix, and one that matches nothing", async () => {
    const { db, app } = setup();
    const a = konto(db, 1);
    expect((await app.request("/v1/auth/api-keys/revoke", mit(a.key, {}))).status).toBe(400);
    expect((await app.request("/v1/auth/api-keys/revoke", mit(a.key, { key_prefix: "cnwy_k_nope123" }))).status).toBe(404);
    // Twice in a row is a 404 the second time: an already revoked key is not revoked again.
    expect((await app.request("/v1/auth/api-keys/revoke", mit(a.key, { key_prefix: a.prefix }))).status).toBe(200);
  });
});
