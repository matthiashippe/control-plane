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
    for (const bg of ["start-notrunning", "start-504", "start-nowait", "start-waitnotlast", "wait-still", "wait-first", "wait-slow-30000", "wait-status-504", "wait-exit-124", "wait-wrong"]) {
      expect(run.stdout).toMatch(new RegExp(`planted sandbox '[^']*bg=${bg}[^']*': FAIL sandbox: background exec `));
    }
    // The background step through the real bg_live (goals/sandbox/09, points 4 and 8): wait_command from the answer to
    // sleep 50, called with exec and no timeout, at most three times, each call under 30000 ms, the first one a full
    // wait that says still running, in both directions.
    expect(run.stdout).toContain("planted background step ok: bg=ok waits=2");
    expect(run.stdout).toContain("planted background step still: bg=ok waits=3");
    expect(run.stdout).toMatch(/^planted background still: OK sandbox: .*background exec ok/m);
    for (const [name, tok, waits, reason] of [
      ["first", "wait-first", 1, "ended on the first call"],
      ["thrice", "wait-still", 3, "still said running after three calls"],
      ["504", "wait-status-504", 1, "answered 504, expected 200"],
      ["slow", "wait-slow-30000", 1, "took 30000 ms, not under 30000"],
      ["slow2", "wait-slow-30000", 2, "took 30000 ms, not under 30000"],
      ["exit124", "wait-exit-124", 2, "reported exit code 124, expected 0"],
      ["nobgok", "wait-wrong", 2, "reported the end without bg-ok in stdout"],
      ["nowait", "start-nowait", 0, "missing in the answer"],
      ["notlast", "start-waitnotlast", 0, "is not the last line of stdout"],
      ["otherexit", "start-nowait", 0, "missing in the answer"],
    ] as const) {
      expect(run.stdout).toContain(`planted background step ${name}: bg=${tok} waits=${waits}`);
      expect(run.stdout).toContain(`planted background ${name}: FAIL sandbox: background exec wait_command ${reason}`);
    }
    expect(run.stdout).toContain("planted background step held: bg=start-notrunning waits=0");
    // The longest call of wait_command (goals/hosting/02, point 3): bg_live gives it with the token, the result line and the
    // line OK sandbox: carry it as bg_max_ms, from BG_WARN_MS (27000) on with a warning, OK either way.
    expect(run.stdout).toContain("planted background step ok: bg=ok waits=2 bg_max_ms=25000");
    expect(run.stdout).toContain("planted background step slow2: bg=wait-slow-30000 waits=2 bg_max_ms=30000");
    expect(run.stdout).toContain("planted background step held: bg=start-notrunning waits=0 bg_max_ms=0");
    expect(run.stdout).toMatch(/^planted background ok: OK sandbox: .*background exec ok.*, bg_max_ms=25000$/m);
    expect(run.stdout).toMatch(/^planted sandbox bg_max_ms=26999: OK sandbox: .*, bg_max_ms=26999$/m);
    expect(run.stdout).not.toMatch(/^planted sandbox bg_max_ms=26999: .*warning/m);
    expect(run.stdout).toMatch(/^planted sandbox bg_max_ms=27000: OK sandbox: .*, bg_max_ms=27000, warning: .*27000 ms/m);
    expect(run.stdout).toMatch(/^planted sandbox bg_max_ms=29999: OK sandbox: .*, bg_max_ms=29999, warning: /m);
    expect(readFileSync(LIVE_SH, "utf8")).toMatch(/^BG_WARN_MS=27000$/m);
    expect(readFileSync(LIVE_SH, "utf8")).toContain("bg=$bg bg_max_ms=$bg_max files=$files");
    expect(run.stdout).not.toContain("sent another body");
    expect(run.stdout).toContain(
      "planted sandbox 'client_key=ok ctl=200 create=201 exec=ok files=ok delete=200 ledger=1': FAIL sandbox: background exec did not run",
    );
    // The exposed port of the check `sandbox` (goals/sandbox/07, point 8): judged in both directions, and the live step
    // itself gives each failure its own token and gives the port back once ports/expose answered 2xx.
    expect(run.stdout).toMatch(/planted sandbox '[^']*port=ok[^']*': OK sandbox: .*exposed port ok/);
    for (const port of ["expose_409", "expose_none", "no_url", "bad_url", "server_504", "fetch_failed", "unexpose_404"]) {
      expect(run.stdout).toMatch(new RegExp(`planted sandbox '[^']*port=${port}[^']*': FAIL sandbox: exposed port`));
    }
    expect(run.stdout).toContain(
      "planted sandbox 'client_key=ok ctl=200 create=201 exec=ok bg=ok files=ok delete=200 ledger=1': FAIL sandbox: exposed port",
    );
    expect(run.stdout).toContain("planted port step ok: port=ok unexposed=yes");
    expect(run.stdout).toContain("planted port step late: port=ok unexposed=yes fetches=3");
    expect(run.stdout).toMatch(/planted port step never: port=fetch_failed unexposed=yes fetches=([2-9]|1[0-2])\n/);
    expect(run.stdout).toContain("planted port step 409: port=expose_409 unexposed=no fetches=0");
    expect(run.stdout).toContain("planted port step nourl: port=no_url unexposed=yes fetches=0");
    expect(run.stdout).toContain("planted port step payurl: port=bad_url unexposed=yes fetches=0");
    expect(run.stdout).toContain("planted port step server: port=server_504 unexposed=yes fetches=0");
    expect(run.stdout).toContain("planted port step unexpose: port=unexpose_404 unexposed=yes");
    // The check `automaton` (goals/sandbox/08, point 8): through the real automaton_live in both directions, each planted
    // failure with its own FAIL automaton line, and the DELETE once the create answered with an id.
    expect(run.stdout).toContain("planted automaton step ok: automaton=ok deleted=yes");
    expect(run.stdout).toMatch(/^planted automaton ok: OK automaton: automaton=ok, /m);
    expect(run.stdout).toContain("planted automaton step 404: automaton=create_404 deleted=no");
    expect(run.stdout).toContain("planted automaton 404: FAIL automaton: POST /v1/automatons answered 404 (not rolled out yet)");
    expect(run.stdout).toContain("planted automaton step noturn: automaton=timeout deleted=yes");
    expect(run.stdout).toContain("planted automaton noturn: FAIL automaton: no status running with a turn within 180 s");
    for (const leak of ["leak-own", "leak-automaton", "leak-other"]) {
      expect(run.stdout).toContain(`planted automaton step ${leak}: automaton=logs_leak deleted=yes`);
      expect(run.stdout).toContain(`planted automaton ${leak}: FAIL automaton: the log holds an API key`);
    }
    expect(run.stdout).toContain("planted automaton step notrevoked: automaton=revoked_200 deleted=yes");
    expect(run.stdout).toMatch(/^planted automaton notrevoked: FAIL automaton: .* after the DELETE, expected 401$/m);
    expect(run.stdout).toContain("planted automaton step keyrejected: automaton=key_rejected_401 deleted=yes");
    for (const name of ["402", "failed", "keyrejected", "deletebad", "nokey"]) {
      expect(run.stdout).toMatch(new RegExp(`^planted automaton ${name}: FAIL automaton: `, "m"));
    }
    expect(run.stdout).not.toContain("printed the key of the automaton");
    expect(run.stdout).toMatch(/^planted sandbox-wait new-key: OK sandbox-wait: created [0-9]+ s after a new client key/m);
    expect(run.stdout).toContain("planted sandbox-wait old-key: OK sandbox-wait: created at once");
    expect(run.stdout).toMatch(/^planted sandbox-wait no-wait: FAIL sandbox-wait: created 0 s after a new client key/m);
    expect(run.stdout).toMatch(/^planted sandbox-wait short: FAIL sandbox-wait: created 60 s after a new client key/m);
    expect(run.stdout).toContain("planted key-cleanup term-search: OK key-cleanup: TMPDIR empty after kill -TERM");
    expect(run.stdout).toContain("planted key-cleanup term-sandbox: OK key-cleanup: TMPDIR empty after kill -TERM");
    expect(run.stdout).toMatch(/^planted key-cleanup leftover: FAIL key-cleanup: 1 files left/m);
    expect(run.stdout).toContain(
      "planted key-cleanup kill-sweep: OK key-cleanup: the next run deleted the folder of the run stopped with kill -KILL",
    );
    expect(run.stdout).toContain("planted key-cleanup foreign: OK key-cleanup: a foreign file and the folder of a living run stayed");
    expect(run.stdout).toMatch(/^planted key-cleanup kill-sweep-kept: FAIL key-cleanup: 1 folders .* still in TMPDIR/m);
    expect(run.stdout).toMatch(/^planted key-cleanup kill-sweep-none: FAIL key-cleanup: .* left no folder/m);
    expect(run.stdout).toContain("planted key-cleanup foreign-gone: FAIL key-cleanup: the next run deleted a foreign file in TMPDIR");
    expect(run.stdout).toContain(
      "planted key-cleanup foreign-living: FAIL key-cleanup: the next run deleted the folder of a run whose process lives",
    );
    // The check `hosts` (goals/umzug/01, point 6): every host of the service and www.automatonhost.com, before and after
    // the switch of the canonical host, in both directions.
    expect(run.stdout).toContain("planted hosts step before: OK hosts: canonical postyourprice.com, ");
    expect(run.stdout).toContain("planted hosts step after: OK hosts: canonical automatonhost.com, ");
    expect(run.stdout).toContain("planted hosts step silent: FAIL hosts: cp.hippe.eu /health no answer");
    expect(run.stdout).toContain(
      "planted hosts step two-canonical: FAIL hosts: postyourprice.com / answered 200 next to automatonhost.com, two canonical hosts",
    );
    expect(run.stdout).toContain(
      "planted hosts step foreign-301: FAIL hosts: cp.hippe.eu / answered 301 to https://example.com/, expected https://postyourprice.com/",
    );
    expect(run.stdout).toContain(
      "planted hosts step health-301: FAIL hosts: automatonhost.com /health answered 301 to https://postyourprice.com/health, expected 200 without a redirect",
    );
    expect(run.stdout).toMatch(/^planted hosts step live: OK hosts: canonical postyourprice\.com, /m);
    expect(run.stdout).toContain("planted hosts step live-silent: FAIL hosts: cp.hippe.eu /health no answer");
    expect(run.stdout.trim().split("\n").at(-1)).toBe("LIVE SELFTEST OK");
    expect(run.status).toBe(0);
  }, 300_000);
});

/**
 * The check `hosts` (goals/umzug/01, point 6) through `ops/live.sh --judge hosts`: one measured line per request on stdin,
 * `<host> <path> <status> <Location or ->`, as hosts_live prints them. Fast, so a broken judge shows here without the
 * minute the selftest takes.
 */
describe("ops/live.sh check hosts", () => {
  const HOSTS = ["automatonhost.com", "postyourprice.com", "cp.hippe.eu"];

  function measured(canonical: string, changes: Record<string, string> = {}): string {
    const lines = new Map<string, string>();
    for (const h of HOSTS) {
      lines.set(`${h} /health`, "200 -");
      lines.set(`${h} /`, h === canonical ? "200 -" : `301 https://${canonical}/`);
    }
    lines.set("www.automatonhost.com /health", "308 https://automatonhost.com/health");
    for (const [k, v] of Object.entries(changes)) lines.set(k, v);
    return [...lines].map(([k, v]) => `${k} ${v}`).join("\n") + "\n";
  }

  function judgeHosts(input: string): string {
    const run = spawnSync("bash", [LIVE_SH, "--judge", "hosts"], { input, encoding: "utf8", timeout: 30_000 });
    expect(run.status).toBe(0);
    return run.stdout.trim();
  }

  it("hosts: before the switch, canonical postyourprice.com, is OK", () => {
    expect(judgeHosts(measured("postyourprice.com"))).toMatch(/^OK hosts: canonical postyourprice\.com, /);
  });

  it("hosts: after the switch, canonical automatonhost.com, is OK", () => {
    expect(judgeHosts(measured("automatonhost.com"))).toMatch(/^OK hosts: canonical automatonhost\.com, /);
  });

  it("hosts: a host without an answer is FAIL", () => {
    const got = judgeHosts(measured("postyourprice.com", { "automatonhost.com /health": "000 -", "automatonhost.com /": "000 -" }));
    expect(got).toBe("FAIL hosts: automatonhost.com /health no answer");
  });

  it("hosts: two hosts answering 200 on / is FAIL", () => {
    const got = judgeHosts(measured("postyourprice.com", { "cp.hippe.eu /": "200 -" }));
    expect(got).toBe("FAIL hosts: cp.hippe.eu / answered 200 next to postyourprice.com, two canonical hosts");
  });

  it("hosts: a 301 to a foreign host is FAIL", () => {
    const got = judgeHosts(measured("automatonhost.com", { "postyourprice.com /": "301 https://example.com/" }));
    expect(got).toBe("FAIL hosts: postyourprice.com / answered 301 to https://example.com/, expected https://automatonhost.com/");
  });

  it("hosts: a redirect of /health is FAIL", () => {
    const got = judgeHosts(measured("automatonhost.com", { "cp.hippe.eu /health": "301 https://automatonhost.com/health" }));
    expect(got).toMatch(/^FAIL hosts: cp\.hippe\.eu \/health answered 301 /);
  });

  it("hosts: www.automatonhost.com without its 308 to the apex is FAIL", () => {
    const got = judgeHosts(measured("automatonhost.com", { "www.automatonhost.com /health": "200 -" }));
    expect(got).toMatch(/^FAIL hosts: www\.automatonhost\.com \/health answered 200, /);
  });

  it("hosts: live mode runs the check and counts its FAIL", () => {
    expect(readFileSync(LIVE_SH, "utf8")).toMatch(/^\s*say "\$\(judge_hosts "\$\(hosts_live\)"\)"$/m);
  });
});

/**
 * After a new client key the check `sandbox` waits CLIENT_KEY_WAIT_S before it creates (goals/domains/03), because the
 * service answers POST /v1/sandboxes with 501 at once for RECHECK_MS after its last failed call to sandboxd. Both numbers
 * are read from their files, so a longer RECHECK_MS cannot make the live check falsely red again unnoticed.
 */
describe("ops/live.sh wait after a new client key", () => {
  it("waits longer than RECHECK_MS of src/sandbox/service.ts", () => {
    const wait = readFileSync(LIVE_SH, "utf8").match(/^CLIENT_KEY_WAIT_S=([0-9]+)$/m);
    if (!wait) throw new Error("ops/live.sh has no CLIENT_KEY_WAIT_S");
    const recheck = readFileSync(join(__dirname, "..", "src", "sandbox", "service.ts"), "utf8").match(/const RECHECK_MS = ([0-9_]+);/);
    if (!recheck) throw new Error("src/sandbox/service.ts has no RECHECK_MS");
    const waitS = Number(wait[1]);
    const recheckMs = Number(recheck[1].replace(/_/g, ""));
    expect(recheckMs).toBeGreaterThan(0);
    expect(waitS).toBeGreaterThan(recheckMs / 1000);
  });
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

  it("finds wait_command, the last line of stdout, in the answer to sleep 50 with timeout 120000", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const w = await world();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", {})).json.id as string;
    let res: { status: number; json: any } | null = null;
    void a
      .call("POST", `/v1/sandboxes/${id}/exec`, { command: "sleep 50; echo bg-ok", timeout: 120000 }, { "Idempotency-Key": "live-check-bg-1" })
      .then((r) => (res = r));
    for (let i = 0; i < 5000 && w.started.length === 0; i++) await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(EXEC_EARLY_MS);
    for (let i = 0; i < 5000 && !res; i++) await new Promise((r) => setImmediate(r));
    expect(res!.status).toBe(200);
    expect(res!.json.running).toBe(true);
    expect(judgeBg(res!.status, res!.json)).toMatch(/^wait \/root\/\.exec\/[0-9a-f]{12}\.exit$/);
    // The answer before goals/sandbox/09 named the files only; the check does not take it.
    const { wait_command: _w, ...before } = res!.json;
    expect(judgeBg(200, { ...before, stdout: String(before.stdout).split("\n")[0] })).toBe("nowait");
    expect(judgeBg(200, { ...res!.json, stdout: `${res!.json.stdout}\nmore` })).toBe("waitnotlast");
    await vi.advanceTimersByTimeAsync(120_000);
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
