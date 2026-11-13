import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { EXEC_EARLY_MS } from "../src/sandbox/service.js";
import { closeWorlds, sandboxWorld } from "./sandbox-world.js";

const LIVE_SH = join(__dirname, "..", "ops", "live.sh");

/**
 * ops/live.sh is the release manager's live check (LOOP.md, Release). Its selftest proves every
 * check against planted data in both directions without network; running it here keeps it from
 * rotting between rollouts, when nobody calls it.
 */
/**
 * The selftest starts some sixty node processes and took 58 s alone at load 108 on the code-host (audit 2026-11-13, line 146),
 * so a 60 s limit cut it off mid-run. It runs without blocking the worker, which spawnSync did for as long as the
 * selftest ran, past vitest's fixed 60 s worker RPC timer. Patience, not a threshold: nothing asserts the duration.
 */
const runSelftest = () =>
  new Promise<{ stdout: string; status: number | null }>((resolve) => {
    const child = spawn("bash", [LIVE_SH, "--selftest"], { stdio: ["ignore", "pipe", "ignore"], timeout: 240_000 });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.on("close", (status) => resolve({ stdout, status }));
  });

describe("ops/live.sh", () => {
  it("passes its own selftest without network", async () => {
    const run = await runSelftest();
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
    expect(run.stdout).toMatch(/planted sandbox '[^']*bg=ok[^']*': OK sandbox: .*background exec ok/);
    for (const bg of ["start-notrunning", "start-504", "noexit", "exit-124", "wrong"]) {
      expect(run.stdout).toMatch(new RegExp(`planted sandbox '[^']*bg=${bg}[^']*': FAIL sandbox: background exec `));
    }
    expect(run.stdout).toContain(
      "planted sandbox 'client_key=ok ctl=200 create=201 exec=ok files=ok delete=200 ledger=1': FAIL sandbox: background exec did not run",
    );
    expect(run.stdout.trim().split("\n").at(-1)).toBe("LIVE SELFTEST OK");
    expect(run.status).toBe(0);
  }, 300_000);
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

/**
 * The background step of the check `sandbox` (goals/sandbox/05, point 10) against the real answer of the handler: the
 * answer to a command that still runs, as the service gives it after EXEC_EARLY_MS, goes through
 * `ops/live.sh --judge sandbox-bg`, which must find both files the live check then reads; the answer to a held command
 * must not pass for one. The rebuilt sandboxd runs `sleep N` on the faked clock of vitest, so nothing waits for real.
 */
describe("ops/live.sh check sandbox, background exec", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await closeWorlds();
  });

  function judgeBg(status: number, json: unknown): string {
    const run = spawnSync("bash", [LIVE_SH, "--judge", "sandbox-bg", String(status)], {
      input: JSON.stringify(json),
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(run.status).toBe(0);
    return run.stdout.trim();
  }

  async function world() {
    const started: string[] = [];
    const w = await sandboxWorld({
      respond: async (cmd, args) => {
        if (cmd !== "docker" || args[0] !== "exec" || !args.includes("-lc")) return undefined;
        const command = args[args.length - 1];
        started.push(command);
        const sleep = /sleep ([0-9]+)/.exec(command);
        if (sleep) await new Promise((r) => setTimeout(r, Number(sleep[1]) * 1000));
        return { code: 0, stdout: /echo ok/.test(command) ? "ok\n" : "", stderr: "" };
      },
    });
    return { ...w, started };
  }

  it("finds exit_code_file and output_file in the answer to sleep 25 with timeout 120000", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const w = await world();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", {})).json.id as string;
    let res: { status: number; json: any } | null = null;
    void a
      .call("POST", `/v1/sandboxes/${id}/exec`, { command: "sleep 25; echo bg-ok", timeout: 120000 }, { "Idempotency-Key": "live-check-bg-1" })
      .then((r) => (res = r));
    for (let i = 0; i < 5000 && w.started.length === 0; i++) await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(EXEC_EARLY_MS);
    for (let i = 0; i < 5000 && !res; i++) await new Promise((r) => setImmediate(r));
    expect(res!.status).toBe(200);
    expect(res!.json.running).toBe(true);
    expect(judgeBg(res!.status, res!.json)).toMatch(/^files \/root\/\.exec\/[0-9a-f]{12}\.exit \/root\/\.exec\/[0-9a-f]{12}\.out$/);
  });

  it("does not take the answer to a held echo ok, a 504 or a body without files for a background run", async () => {
    const w = await world();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", {})).json.id as string;
    const held = await a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "echo ok", timeout: 30000 }, { "Idempotency-Key": "live-check-2" });
    expect(held.status).toBe(200);
    expect(judgeBg(held.status, held.json)).toBe("notrunning");
    expect(judgeBg(504, { error: "gateway_timeout" })).toBe("504");
    expect(judgeBg(200, { running: true, exit_code: -1, exit_code_file: "/etc/passwd", output_file: "/root/.exec/a.out" })).toBe("nofiles");
  });
});
