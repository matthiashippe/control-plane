import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import { openDb } from "../src/db.js";
import { resolveApiKey, hashApiKey } from "../src/auth/siwe.js";
import { mintKeylessIdentity, isKeylessAddress, KEYLESS_PREFIX } from "../src/auth/keyless.js";
import {
  claimStarter,
  grantedTodayMc,
  poolLeftTodayMc,
  starterAvailableMc,
  BUYER_GRANT_MC,
  POOL_DAILY_MC_DEFAULT,
  StarterError,
} from "../src/credits/starter.js";

const db = () => openDb(":memory:");

describe("an account for somebody without a wallet", () => {
  it("mints a handle that opens with its key and nothing else", () => {
    const d = db();
    const { address, key } = mintKeylessIdentity(d);
    expect(resolveApiKey(d, key)).toBe(address);
    expect(resolveApiKey(d, "cnwy_k_" + "0".repeat(32))).toBeNull();
  });

  it("makes a handle that is not an Ethereum address and cannot be mistaken for one", () => {
    const { address } = mintKeylessIdentity(db());
    expect(isAddress(address)).toBe(false);
    expect(address.startsWith("0x")).toBe(false);
    expect(isKeylessAddress(address)).toBe(true);
    expect(isKeylessAddress("0x" + "a".repeat(40))).toBe(false);
    expect(address).toMatch(new RegExp(`^${KEYLESS_PREFIX}[0-9a-f]{40}$`));
  });

  it("never takes over a handle, because it accepts none", () => {
    const d = db();
    const a = mintKeylessIdentity(d);
    const b = mintKeylessIdentity(d);
    expect(a.address).not.toBe(b.address);
    expect(a.key).not.toBe(b.key);
  });

  it("stores the hash and not the key, so the one return value is the only copy", () => {
    const d = db();
    const { key, keyPrefix } = mintKeylessIdentity(d);
    const row = d.prepare("SELECT key_hash, key_prefix FROM api_keys").get() as {
      key_hash: string;
      key_prefix: string;
    };
    expect(row.key_hash).toBe(hashApiKey(key));
    expect(row.key_hash).not.toContain(key);
    expect(key.startsWith(row.key_prefix)).toBe(true);
  });

  it("hands out no credit by itself", () => {
    const d = db();
    const { address } = mintKeylessIdentity(d);
    const w = d.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as {
      balance_mc: number;
    };
    expect(w.balance_mc).toBe(0);
    expect(grantedTodayMc(d)).toBe(0);
  });
});

describe("the pool survives identities being free", () => {
  // Two buyer grants fit in a day at 50,000 each; the third is what this exists to refuse.
  it("gives the day's budget away and then stops", () => {
    const d = db();
    const minted = [0, 1, 2].map(() => mintKeylessIdentity(d).address);
    claimStarter(d, minted[0], BUYER_GRANT_MC);
    claimStarter(d, minted[1], BUYER_GRANT_MC);
    expect(grantedTodayMc(d)).toBe(2 * BUYER_GRANT_MC);
    expect(poolLeftTodayMc(d)).toBe(0);
    expect(starterAvailableMc(d, minted[2], BUYER_GRANT_MC)).toBe(0);
    try {
      claimStarter(d, minted[2], BUYER_GRANT_MC);
      throw new Error("the third grant went through");
    } catch (e) {
      expect(e).toBeInstanceOf(StarterError);
      expect((e as StarterError).code).toBe("pool_daily_limit");
      expect((e as StarterError).status).toBe(429);
    }
  });

  // The other direction: the limit is a day and not a total, so the same load passes tomorrow.
  it("counts the day and not the whole history", () => {
    const d = db();
    const gestern = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    for (const n of [0, 1, 2]) {
      const a = mintKeylessIdentity(d).address;
      d.prepare(
        "INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?, 'grant', ?, ?, ?)",
      ).run(a, BUYER_GRANT_MC, `starter:${n}`, gestern);
    }
    expect(grantedTodayMc(d)).toBe(0);
    expect(starterAvailableMc(d, mintKeylessIdentity(d).address, BUYER_GRANT_MC)).toBe(
      BUYER_GRANT_MC,
    );
  });

  // A grant that was handed back gave nobody anything. Holding the day against it would refuse a
  // newcomer for a giveaway that did not happen.
  it("does not hold a returned grant against the day", () => {
    const d = db();
    const a = mintKeylessIdentity(d).address;
    claimStarter(d, a, BUYER_GRANT_MC);
    d.prepare(
      "INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?, 'grant_returned', ?, ?, ?)",
    ).run(a, -BUYER_GRANT_MC, "back", new Date().toISOString());
    expect(grantedTodayMc(d)).toBe(0);
    expect(poolLeftTodayMc(d)).toBe(POOL_DAILY_MC_DEFAULT);
  });

  // The knob itself, in both directions. Seven test files raise this ceiling to spend the whole
  // pool, and a knob that quietly did nothing would leave those files testing the cap instead of
  // what they say they test, with everything still green.
  it("lifts the day's ceiling only when the knob is set, and puts it back", () => {
    const d = db();
    const a = [0, 1, 2].map(() => mintKeylessIdentity(d).address);
    claimStarter(d, a[0], BUYER_GRANT_MC);
    claimStarter(d, a[1], BUYER_GRANT_MC);
    expect(starterAvailableMc(d, a[2], BUYER_GRANT_MC)).toBe(0);
    process.env.CP_POOL_DAILY_MC = "500000";
    try {
      expect(starterAvailableMc(d, a[2], BUYER_GRANT_MC)).toBe(BUYER_GRANT_MC);
      expect(claimStarter(d, a[2], BUYER_GRANT_MC).granted_cents).toBe(50);
    } finally {
      delete process.env.CP_POOL_DAILY_MC;
    }
    expect(starterAvailableMc(d, mintKeylessIdentity(d).address, BUYER_GRANT_MC)).toBe(0);
  });
});
