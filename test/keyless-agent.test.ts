import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { resolveApiKey } from "../src/auth/siwe.js";
import {
  mintAgentIdentity,
  agentMintsToday,
  agentMintsPerDay,
  AGENT_MINTS_PER_DAY_DEFAULT,
  KEYLESS_AGENT_NAME,
  KeylessError,
  mintKeylessIdentity,
} from "../src/auth/keyless.js";

/**
 * A key for an agent that has no wallet.
 *
 * `/bounties.json` told every reader for days that competing needs three calls and an Ethereum
 * signature. Over 96 hours of access log exactly one foreign client finished that sequence, and it
 * was a Conway runtime with this domain configured rather than an agent that found its way here.
 * This is the same door the buyer got, on the supply side.
 *
 * The cap is the half that matters and is tested hardest: submitting costs an agent nothing and
 * the one-attempt rule hangs on the handle, so free handles are free submissions, and
 * `submissions_not_ours` is published precisely so an arriving agent can see how little
 * competition there is.
 */
const app = () => {
  const db = openDb(":memory:");
  return { db, app: createApp({ db }) };
};

afterEach(() => {
  delete process.env.CP_AGENT_MINTS_PER_DAY;
});

describe("one call to a key, for an agent with no wallet", () => {
  it("hands out a key that opens its own handle", async () => {
    const { db, app: a } = app();
    const res = await a.request("/v1/auth/keyless", { method: "POST" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string; address: string; key_prefix: string };
    expect(body.address.startsWith("key:")).toBe(true);
    expect(resolveApiKey(db, body.key)).toBe(body.address);
    expect(body.key.startsWith(body.key_prefix)).toBe(true);
  });

  it("hands out no credit with it", async () => {
    const { db, app: a } = app();
    const body = (await (await a.request("/v1/auth/keyless", { method: "POST" })).json()) as {
      address: string;
    };
    const w = db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(body.address) as {
      balance_mc: number;
    };
    expect(w.balance_mc, "identity only; the starter credit is claimed the usual way").toBe(0);
  });

  it("is a POST and says so to a GET, instead of asking for a key", async () => {
    const { app: a } = app();
    const res = await a.request("/v1/auth/keyless");
    expect(res.status).toBe(405);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("method_not_allowed");
    expect(body.message, "a method mistake must not read as a key mistake").toMatch(/not the key/i);
  });

  it("needs no key itself, which is the whole point", async () => {
    const { app: a } = app();
    const res = await a.request("/v1/auth/keyless", { method: "POST" });
    expect(res.status).not.toBe(401);
  });
});

describe("the cap, which is what keeps it from being an own goal", () => {
  it("stops at the day's number and names the route that has no limit", () => {
    const { db } = app();
    for (let i = 0; i < AGENT_MINTS_PER_DAY_DEFAULT; i++) mintAgentIdentity(db);
    expect(agentMintsToday(db)).toBe(AGENT_MINTS_PER_DAY_DEFAULT);
    try {
      mintAgentIdentity(db);
      throw new Error("one too many went through");
    } catch (e) {
      expect(e).toBeInstanceOf(KeylessError);
      expect((e as KeylessError).status).toBe(429);
      expect((e as KeylessError).hint, "a wallet has no limit and the message has to say so").toMatch(
        /v1\/auth\/nonce/,
      );
    }
  });

  it("answers 429 over HTTP rather than failing like a broken route", async () => {
    process.env.CP_AGENT_MINTS_PER_DAY = "1";
    const { app: a } = app();
    expect((await a.request("/v1/auth/keyless", { method: "POST" })).status).toBe(201);
    const res = await a.request("/v1/auth/keyless", { method: "POST" });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe("daily_limit");
  });

  it("counts the day and not the whole history", () => {
    const { db } = app();
    for (let i = 0; i < AGENT_MINTS_PER_DAY_DEFAULT; i++) {
      db.prepare(
        "INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)",
      ).run(`key:${"e".repeat(39)}${i}`, new Date().toISOString());
      db.prepare(
        "INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(
        `key:${"e".repeat(39)}${i}`,
        `h${i}`,
        "cnwy_k_0",
        KEYLESS_AGENT_NAME,
        new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
      );
    }
    expect(agentMintsToday(db), "yesterday's do not count against today").toBe(0);
    expect(() => mintAgentIdentity(db)).not.toThrow();
  });

  it("does not count the buyer's door against the agent's", () => {
    // The browser form mints with a different name, and a buyer posting a job must never use up
    // an agent's key for the day.
    const { db } = app();
    process.env.CP_AGENT_MINTS_PER_DAY = "1";
    mintKeylessIdentity(db, "browser");
    expect(agentMintsToday(db)).toBe(0);
    expect(() => mintAgentIdentity(db)).not.toThrow();
  });

  it("takes the knob in both directions, so a test cannot quietly disable the cap", () => {
    expect(agentMintsPerDay()).toBe(AGENT_MINTS_PER_DAY_DEFAULT);
    process.env.CP_AGENT_MINTS_PER_DAY = "2";
    expect(agentMintsPerDay()).toBe(2);
    process.env.CP_AGENT_MINTS_PER_DAY = "nonsense";
    expect(agentMintsPerDay(), "a broken value falls back rather than removing the cap").toBe(
      AGENT_MINTS_PER_DAY_DEFAULT,
    );
  });
});
