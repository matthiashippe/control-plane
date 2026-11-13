import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";

const LIVE_SH = join(__dirname, "..", "ops", "live.sh");

/**
 * ops/live.sh is the release manager's live check (LOOP.md, Release). Its selftest proves every
 * check against planted data in both directions without network; running it here keeps it from
 * rotting between rollouts, when nobody calls it.
 */
describe("ops/live.sh", () => {
  it("passes its own selftest without network", () => {
    const run = spawnSync("bash", [LIVE_SH, "--selftest"], { encoding: "utf8", timeout: 60_000 });
    expect(run.stdout).toContain("planted none: FAIL");
    expect(run.stdout).toContain("planted double: FAIL");
    expect(run.stdout).toContain("planted single: OK");
    expect(run.stdout).toContain("planted domains 401: OK domains: /v1/domains/search 401 without a key");
    expect(run.stdout).toContain("planted domains 404: FAIL domains: /v1/domains/search answered 404, the route is missing");
    expect(run.stdout).toContain("planted domains 200: FAIL");
    expect(run.stdout).toContain("planted domains-search ok: OK domains-search");
    expect(run.stdout).toContain("planted domains-search taken: FAIL domains-search");
    expect(run.stdout).toContain("planted domains-search nokey: FAIL domains-search");
    expect(run.stdout).toContain("planted timeout-quote long: OK timeout-quote: since 2026-11-12T09:00:00.000Z: ");
    expect(run.stdout).toContain("openai/gpt-5.2 1/2 (50.0 %)");
    expect(run.stdout).toContain("planted timeout-quote answer '': FAIL");
    expect(run.stdout.trim().split("\n").at(-1)).toBe("LIVE SELFTEST OK");
    expect(run.status).toBe(0);
  }, 120_000);
});

/**
 * The judge of the check `domains-search` against the real answer of the handler, so it does not
 * live on a copied body: the app with a key created here answers the same path the live check
 * calls (DOMAINS_PATH in ops/live.sh), and that answer goes through `ops/live.sh --judge`.
 */
describe("ops/live.sh check domains-search", () => {
  const domainsPath = (() => {
    const m = readFileSync(LIVE_SH, "utf8").match(/^DOMAINS_PATH="([^"]+)"$/m);
    if (!m) throw new Error("ops/live.sh has no DOMAINS_PATH");
    return m[1];
  })();

  function setup() {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const address = "0x" + "34".repeat(20);
    const key = "cnwy_k_" + "e1".repeat(16);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address,
      hashApiKey(key),
      key.slice(0, 15),
      "test",
      new Date().toISOString(),
    );
    return { app, key };
  }

  async function judge(res: Response): Promise<string> {
    const body = await res.text();
    const run = spawnSync("bash", [LIVE_SH, "--judge", "domains-search", String(res.status)], {
      input: body,
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(run.status).toBe(0);
    return run.stdout.trim();
  }

  it("domains-search: the handler's answer with a key is OK", async () => {
    const { app, key } = setup();
    const res = await app.request(domainsPath, { headers: { Authorization: key } });
    const got = await judge(res);
    expect(got).toMatch(/^OK domains-search: /);
  });

  it("domains-search: the handler's answer without a key is FAIL", async () => {
    const { app } = setup();
    const res = await app.request(domainsPath);
    expect(res.status).toBe(401);
    const got = await judge(res);
    expect(got).toMatch(/^FAIL domains-search: /);
  });

  it("domains-search: the answer of POST /v1/domains/register with a key is FAIL", async () => {
    const { app, key } = setup();
    const res = await app.request("/v1/domains/register", {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "livecheck.com", years: 1 }),
    });
    expect(res.status).toBe(501);
    const got = await judge(res);
    expect(got).toMatch(/^FAIL domains-search: /);
  });
});
