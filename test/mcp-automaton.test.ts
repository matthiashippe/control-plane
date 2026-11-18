import { describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAutomatonTools,
  createClient,
  handleMessage,
  parseUsd,
  raiseNeedsPhone,
} from "../mcp/server.mjs";

/*
 * The five automaton tools of mcp/server.mjs (goals/konto/04, point 7), driven through tools/call
 * against a stub fetch, a fake clock and a sleep that only moves that clock. No network, no port.
 */

// Invented keys, assembled at runtime so that no literal in this file looks like a real one.
const KEY = "cnwy_k_" + "t".repeat(20) + "Z9";
const ENV_KEY = "cnwy_k_" + "e".repeat(20) + "Q7";
const POLL = "poll-" + "p".repeat(30) + "-x";
const BASE = "https://cp.test";

type Call = { method: string; path: string; headers: Record<string, string>; body?: string };
type Handler = (call: Call, n: number) => Response | Promise<Response>;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A Server-Sent Events answer as the control plane writes it, with a keep-alive comment in front. */
function sse(states: Record<string, unknown>[]) {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(": keep-alive\n\n"));
        for (const s of states) c.enqueue(enc.encode(`event: state\ndata: ${JSON.stringify(s)}\n\n`));
        c.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

function handoffAnswer(code: string) {
  return {
    code,
    url: `${BASE}/h/${code}`,
    qr: `QR-OF-${code}\n█▀▄█`,
    match: code === "ABCD" ? "42" : "17",
    expires_at: "2026-11-16T12:10:00.000Z",
    poll_token: POLL,
  };
}

function tempKeyFile(name = "api-key") {
  return join(mkdtempSync(join(tmpdir(), "cp-mcp-key-")), "sub", name);
}

function keyFileWith(key: string, mode = 0o600) {
  const path = join(mkdtempSync(join(tmpdir(), "cp-mcp-key-")), "api-key");
  writeFileSync(path, `${key}\n`, { mode });
  chmodSync(path, mode);
  return path;
}

function harness({ routes, env = {}, keyFile = tempKeyFile() }: { routes: Record<string, Handler>; env?: Record<string, string>; keyFile?: string }) {
  const calls: Call[] = [];
  const counts: Record<string, number> = {};
  let clock = 0;
  const fetchImpl = async (url: string, init: Record<string, any> = {}) => {
    const u = new URL(url);
    const call: Call = { method: init.method ?? "GET", path: u.pathname, headers: init.headers ?? {}, body: init.body };
    calls.push(call);
    const route = `${call.method} ${call.path}`;
    counts[route] = (counts[route] ?? 0) + 1;
    const handler = routes[route];
    if (!handler) return json(404, { error: "not_found_in_stub", route });
    return handler(call, counts[route]);
  };
  const logs: string[] = [];
  const texts: string[] = [];
  const tools = createAutomatonTools({
    baseUrl: BASE,
    env,
    fetchImpl,
    keyFile,
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
    log: (line: string) => logs.push(line),
  });
  const ctx = { client: createClient({ baseUrl: BASE, fetchImpl }), automaton: tools };
  async function call(name: string, args: unknown) {
    const answer = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, ctx);
    const content = answer.result.content.map((c: any) => c.text as string);
    texts.push(...content);
    return { json: JSON.parse(content[0]), isError: Boolean(answer.result.isError), all: content.join("\n") };
  }
  const callsTo = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);
  return { tools, calls, callsTo, call, logs, texts, keyFile, clock: () => clock };
}

const START = { genesis_prompt: "Write one short poem a day and sell it.", name: "Atlas", daily_limit_usd: "5.00" };

describe("Automaton tools in mcp/server.mjs", () => {
  it("lists the five automaton tools next to the six bounty tools", async () => {
    const h = harness({ routes: {} });
    const listed = (await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { client: createClient({ baseUrl: BASE }), automaton: h.tools }))
      .result.tools.map((t: any) => t.name);
    expect(listed).toHaveLength(14);
    expect(listed.slice(0, 6)).toEqual([
      "list_open_bounties",
      "submit_work",
      "read_my_submission",
      "read_my_submissions",
      "check_submission",
      "read_balance",
    ]);
    expect(listed.slice(6, 11)).toEqual(["start_automaton", "automaton_status", "automaton_logs", "set_daily_limit", "stop_automaton"]);
  });

  it("start_automaton without a key makes one konto request without amount_usdc and answers with qr, url and match only", async () => {
    const h = harness({
      routes: {
        "POST /v1/handoff": () => json(201, handoffAnswer("ABCD")),
        "GET /v1/handoff/ABCD": () => sse([{ state: "pending" }, { state: "expired" }]),
      },
    });
    const answer = await h.call("start_automaton", START);
    expect(answer.isError).toBe(false);
    const posts = h.callsTo("POST", "/v1/handoff");
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0].body!);
    expect(body).toEqual({ automaton_name: "Atlas", daily_limit_usdc: "5000000", step: "konto" });
    expect(body).not.toHaveProperty("amount_usdc");
    expect(posts[0].headers.authorization, "the first request has no account yet").toBeUndefined();
    expect(answer.json).toMatchObject({ status: "waiting_for_phone", url: `${BASE}/h/ABCD`, match: "42" });
    expect(answer.json.qr).toBe(handoffAnswer("ABCD").qr);
    expect(answer.all, "the raw code follows the JSON so it can be shown unchanged").toContain("QR-OF-ABCD\n█");
    expect(answer.json).not.toHaveProperty("poll_token");
    expect(answer.all).not.toContain(POLL);
    expect(answer.all).not.toContain("poll_token");
    await h.tools.settled();
  });

  it("after done keeps the key in CP_KEY_FILE with mode 0600, starts with it and reports running", async () => {
    const h = harness({
      routes: {
        "POST /v1/handoff": () => json(201, handoffAnswer("ABCD")),
        "GET /v1/handoff/ABCD": () =>
          sse([{ state: "pending" }, { state: "matched" }, { state: "done", account: "0x" + "1".repeat(40), api_key: KEY }]),
        "POST /v1/automatons": () => json(201, { id: "a-1", name: "Atlas", status: "starting", sandbox_id: "s-1", created_at: "2026-11-16T12:00:00Z" }),
        "GET /v1/automatons/a-1": () => json(200, { id: "a-1", name: "Atlas", status: "running", turns: 1 }),
      },
    });
    await h.call("start_automaton", START);
    await h.tools.settled();

    expect(readFileSync(h.keyFile, "utf8").trim()).toBe(KEY);
    expect(statSync(h.keyFile).mode & 0o777).toBe(0o600);
    expect(statSync(join(h.keyFile, "..")).mode & 0o777).toBe(0o700);

    const starts = h.callsTo("POST", "/v1/automatons");
    expect(starts).toHaveLength(1);
    expect(starts[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(starts[0].headers["idempotency-key"]).toBeTruthy();
    expect(JSON.parse(starts[0].body!)).toEqual({ name: "Atlas", genesis_prompt: START.genesis_prompt });
    expect(h.callsTo("GET", "/v1/handoff/ABCD")[0].headers.authorization).toBe(`Bearer ${POLL}`);

    const status = await h.call("automaton_status", {});
    expect(status.json).toMatchObject({ id: "a-1", status: "running", turns: 1 });
    // A second start reads the key from the file and needs no phone.
    await h.call("start_automaton", { ...START, name: "Nova" });
    expect(h.callsTo("POST", "/v1/handoff")).toHaveLength(1);
  });

  it("never puts the key in a tool result or a stderr line, even when the service echoes it", async () => {
    const h = harness({
      routes: {
        "POST /v1/handoff": () => json(201, handoffAnswer("ABCD")),
        "GET /v1/handoff/ABCD": () => sse([{ state: "matched" }, { state: "done", account: "0x" + "2".repeat(40), api_key: KEY }]),
        "POST /v1/automatons": () => json(201, { id: "a-2", status: "starting", echoed: KEY }),
        "GET /v1/automatons/a-2": () => json(200, { id: "a-2", status: "running", turns: 3, note: `called with ${KEY}` }),
        "GET /v1/automatons/a-2/logs": () => json(200, { lines: [`boot with ${KEY}`] }),
        "POST /v1/automatons/a-2/stop": () => json(500, { error: "boom", message: `stop failed for ${KEY}` }),
      },
    });
    await h.call("start_automaton", START);
    await h.tools.settled();
    await h.call("automaton_status", {});
    await h.call("automaton_logs", {});
    await h.call("stop_automaton", {});
    expect(h.texts.length).toBeGreaterThan(3);
    expect(h.logs.length, "something was logged, so the check below has lines to look at").toBeGreaterThan(0);
    for (const line of [...h.texts, ...h.logs]) {
      expect(line).not.toContain(KEY);
      expect(line).not.toContain(POLL);
    }
    expect(h.texts.join("\n")).toContain("cnwy_k_[redacted]");
  });

  it("shows burned and expired in automaton_status and makes a new code on the next start_automaton", async () => {
    const h = harness({
      routes: {
        "POST /v1/handoff": (_c, n) => json(201, handoffAnswer(n === 1 ? "ABCD" : "EFGH")),
        "GET /v1/handoff/ABCD": () => sse([{ state: "pending" }, { state: "burned" }]),
        "GET /v1/handoff/EFGH": () => sse([{ state: "pending" }, { state: "expired" }]),
      },
    });
    await h.call("start_automaton", START);
    await h.tools.settled();
    const burned = await h.call("automaton_status", {});
    expect(burned.json).toMatchObject({ status: "failed", reason: "burned" });
    expect(burned.json.message).toContain("burned");

    const again = await h.call("start_automaton", START);
    expect(h.callsTo("POST", "/v1/handoff")).toHaveLength(2);
    expect(again.json.url).toBe(`${BASE}/h/EFGH`);
    expect(again.json.url).not.toBe(`${BASE}/h/ABCD`);
    await h.tools.settled();
    const expired = await h.call("automaton_status", {});
    expect(expired.json).toMatchObject({ status: "failed", reason: "expired" });
    expect(expired.all).toContain("expired");
    expect(h.callsTo("GET", "/v1/handoff/EFGH")).toHaveLength(1);
  });

  it("with a key already on this machine starts at once without any phone step, and CP_API_KEY wins over the file", async () => {
    const routes: Record<string, Handler> = {
      "POST /v1/automatons": () => json(201, { id: "a-3", name: "Atlas", status: "starting" }),
    };
    const fromFile = harness({ routes, keyFile: keyFileWith(KEY) });
    const answer = await fromFile.call("start_automaton", START);
    expect(answer.json).toMatchObject({ status: "starting", id: "a-3" });
    expect(fromFile.callsTo("POST", "/v1/handoff")).toHaveLength(0);
    expect(fromFile.callsTo("POST", "/v1/automatons")[0].headers.authorization).toBe(`Bearer ${KEY}`);

    const fromEnv = harness({ routes, env: { CP_API_KEY: ENV_KEY }, keyFile: keyFileWith(KEY) });
    await fromEnv.call("start_automaton", START);
    expect(fromEnv.callsTo("POST", "/v1/handoff")).toHaveLength(0);
    expect(fromEnv.callsTo("POST", "/v1/automatons")[0].headers.authorization).toBe(`Bearer ${ENV_KEY}`);
  });

  it("retries a start that answers 402 while reading the balance and gives up with failed after 90 seconds", async () => {
    const h = harness({
      routes: {
        "POST /v1/handoff": () => json(201, handoffAnswer("ABCD")),
        "GET /v1/handoff/ABCD": () => sse([{ state: "done", account: "0x" + "3".repeat(40), api_key: KEY }]),
        "POST /v1/automatons": () => json(402, { error: "INSUFFICIENT_CREDITS", details: {} }),
        "GET /v1/credits/balance": () => json(200, { balance_cents: 0 }),
      },
    });
    await h.call("start_automaton", START);
    await h.tools.settled();
    const starts = h.callsTo("POST", "/v1/automatons");
    expect(starts.length, "one attempt every 5 seconds over 90 seconds").toBeGreaterThan(10);
    expect(new Set(starts.map((c) => c.headers["idempotency-key"])).size, "a retry must not create a second automaton").toBe(1);
    expect(h.callsTo("GET", "/v1/credits/balance").length).toBeGreaterThan(0);
    expect(h.clock()).toBeGreaterThanOrEqual(90_000);
    expect(h.clock()).toBeLessThan(100_000);
    for (const c of h.calls) expect(c.body ?? "").not.toContain("amount_usdc");
    const status = await h.call("automaton_status", {});
    expect(status.json.status).toBe("failed");
    expect(status.json.message).toMatch(/90 seconds/);
  });

  it("refuses a name the server would refuse for an account (dot, other script, 33 characters) with invalid_arguments and makes no call", async () => {
    const h = harness({ routes: { "POST /v1/handoff": () => json(201, handoffAnswer("NAME")) } });
    for (const name of ["Atlas.v2", "\u00c4tlas", "-Atlas", "x".repeat(33)]) {
      const start = await h.call("start_automaton", { ...START, name });
      expect(start.isError, name).toBe(true);
      expect(start.json.error, name).toBe("invalid_arguments");
    }
    expect(h.calls, "no handoff for a name the server refuses").toHaveLength(0);
    // Counter-check: a name of 32 allowed characters goes out as automaton_name with step konto.
    await h.call("start_automaton", { ...START, name: "Atlas v2_b-1" + "x".repeat(20) });
    expect(JSON.parse(h.callsTo("POST", "/v1/handoff")[0].body!)).toMatchObject({ automaton_name: "Atlas v2_b-1" + "x".repeat(20), step: "konto" });
    await h.tools.settled?.();
  });

  it("refuses a key file that others can read with key_file_mode and makes no call", async () => {
    const path = keyFileWith(KEY, 0o644);
    const h = harness({
      routes: { "POST /v1/automatons": () => json(201, { id: "a-4", status: "starting" }) },
      keyFile: path,
    });
    const start = await h.call("start_automaton", START);
    expect(start.isError).toBe(true);
    expect(start.json.error).toBe("key_file_mode");
    expect(start.json.message).toContain("chmod 600");
    const limit = await h.call("set_daily_limit", { daily_limit_usd: "1.00" });
    expect(limit.json.error).toBe("key_file_mode");
    expect(h.calls, "neither a phone step nor a start with an unsafe key").toHaveLength(0);
    // Counter-check: the same file with mode 0600 is read and used.
    chmodSync(path, 0o600);
    await h.call("start_automaton", START);
    expect(h.callsTo("POST", "/v1/automatons")[0].headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it("set_daily_limit lower makes exactly one POST /v1/konto/limit and no phone step", async () => {
    const h = harness({
      routes: {
        "GET /v1/konto/limit": () => json(200, { account: "0x" + "4".repeat(40), daily_limit_usdc: "5000000", signed_limit_usdc: "5000000" }),
        "POST /v1/konto/limit": (c) => json(200, { daily_limit_usdc: JSON.parse(c.body!).daily_limit_usdc }),
      },
      keyFile: keyFileWith(KEY),
    });
    const lower = await h.call("set_daily_limit", { daily_limit_usd: "2.50" });
    expect(lower.isError).toBe(false);
    expect(lower.json).toMatchObject({ status: "done", daily_limit_usd: "2.50" });
    const posts = h.callsTo("POST", "/v1/konto/limit");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].body!)).toEqual({ daily_limit_usdc: "2500000" });
    expect(posts[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(h.calls.filter((c) => c.path.startsWith("/v1/handoff"))).toHaveLength(0);
    // Boundary: back up to exactly what the phone confirmed is not a raise.
    await h.call("set_daily_limit", { daily_limit_usd: "5" });
    expect(h.callsTo("POST", "/v1/konto/limit")).toHaveLength(2);
    expect(h.calls.filter((c) => c.path.startsWith("/v1/handoff"))).toHaveLength(0);
  });

  it("set_daily_limit higher makes one limit request on the phone and zero POST /v1/konto/limit", async () => {
    const h = harness({
      routes: {
        "GET /v1/konto/limit": () => json(200, { account: "0x" + "5".repeat(40), daily_limit_usdc: "5000000", signed_limit_usdc: "5000000" }),
        "GET /v1/automatons": () =>
          json(200, {
            automatons: [
              { id: "a-old", name: "Atlas", created_at: "2026-11-01T00:00:00Z" },
              { id: "a-new", name: "Nova", created_at: "2026-11-15T00:00:00Z" },
            ],
          }),
        "GET /v1/automatons/a-new": () => json(200, { id: "a-new", name: "Nova", status: "running", turns: 9 }),
        "POST /v1/handoff": () => json(201, handoffAnswer("LIMT")),
        "GET /v1/handoff/LIMT": () => sse([{ state: "pending" }, { state: "matched" }, { state: "done", daily_limit_usdc: "10000000" }]),
      },
      keyFile: keyFileWith(KEY),
    });
    expect(raiseNeedsPhone(10_000_000n, 5_000_000n)).toBe(true);
    expect(raiseNeedsPhone(5_000_000n, 5_000_000n)).toBe(false);

    const raise = await h.call("set_daily_limit", { daily_limit_usd: "10.00" });
    expect(raise.isError).toBe(false);
    const posts = h.callsTo("POST", "/v1/handoff");
    expect(posts).toHaveLength(1);
    expect(posts[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(posts[0].body!)).toEqual({ daily_limit_usdc: "10000000", step: "limit" });
    expect(h.callsTo("POST", "/v1/konto/limit"), "the terminal never raises the limit itself").toHaveLength(0);
    expect(raise.json).toMatchObject({ status: "waiting_for_phone", url: `${BASE}/h/LIMT`, match: "17", daily_limit_usd: "10.00" });
    expect(raise.json.qr).toBe(handoffAnswer("LIMT").qr);
    expect(raise.all).not.toContain(POLL);

    await h.tools.settled();
    const status = await h.call("automaton_status", {});
    expect(status.json.daily_limit_change).toMatchObject({ status: "done", daily_limit_usd: "10.00" });
    expect(h.callsTo("POST", "/v1/konto/limit")).toHaveLength(0);
  });

  it("automaton_logs shows the lines of the log without the key or a long hex secret", async () => {
    const hex = "ab".repeat(32);
    const h = harness({
      routes: {
        "GET /v1/automatons": () => json(200, { automatons: [{ id: "a-5", name: "Atlas", created_at: "2026-11-16T00:00:00Z" }] }),
        "GET /v1/automatons/a-5/logs": () => json(200, { lines: ["turn 1 finished", `key ${KEY} loaded`, `tx ${hex}`] }),
      },
      keyFile: keyFileWith(KEY),
    });
    const logs = await h.call("automaton_logs", {});
    expect(logs.isError).toBe(false);
    expect(logs.json.id).toBe("a-5");
    expect(logs.json.lines[0]).toBe("turn 1 finished");
    expect(logs.json.lines).toHaveLength(3);
    expect(logs.all).not.toContain(KEY);
    expect(logs.all).not.toContain(hex);
    expect(logs.json.lines[1]).toContain("[redacted]");
    expect(h.callsTo("GET", "/v1/automatons/a-5/logs")[0].headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it("stop_automaton calls the stop of the given automaton, and of the one started here without id", async () => {
    const h = harness({
      routes: {
        "POST /v1/automatons": () => json(201, { id: "a-7", name: "Atlas", status: "starting" }),
        "POST /v1/automatons/a-1/stop": () => json(200, { id: "a-1", status: "stopped" }),
        "POST /v1/automatons/a-7/stop": () => json(200, { id: "a-7", status: "stopped" }),
      },
      keyFile: keyFileWith(KEY),
    });
    const given = await h.call("stop_automaton", { id: "a-1" });
    expect(given.json).toMatchObject({ id: "a-1", status: "stopped" });
    expect(h.callsTo("POST", "/v1/automatons/a-1/stop")).toHaveLength(1);
    expect(h.callsTo("POST", "/v1/automatons/a-1/stop")[0].headers.authorization).toBe(`Bearer ${KEY}`);

    await h.call("start_automaton", START);
    const own = await h.call("stop_automaton", {});
    expect(own.json).toMatchObject({ id: "a-7", status: "stopped" });
    expect(h.callsTo("POST", "/v1/automatons/a-7/stop")).toHaveLength(1);
  });

  it("refuses amounts like 5.001, -1, abc, 0 or a number with invalid_arguments and makes no call", async () => {
    const h = harness({
      routes: {
        "GET /v1/konto/limit": () => json(200, { daily_limit_usdc: "5000000", signed_limit_usdc: "5000000" }),
        "POST /v1/konto/limit": () => json(200, { daily_limit_usdc: "1000000" }),
      },
      keyFile: keyFileWith(KEY),
    });
    for (const bad of ["5.001", "-1", "abc", "0", "0.00", "", "1e3", " 5", 5]) {
      const start = await h.call("start_automaton", { ...START, daily_limit_usd: bad });
      expect(start.isError, `start_automaton with ${JSON.stringify(bad)}`).toBe(true);
      expect(start.json.error).toBe("invalid_arguments");
      const limit = await h.call("set_daily_limit", { daily_limit_usd: bad });
      expect(limit.isError, `set_daily_limit with ${JSON.stringify(bad)}`).toBe(true);
      expect(limit.json.error).toBe("invalid_arguments");
    }
    expect(h.calls).toHaveLength(0);
    // Counter-check: the accepted forms convert exactly, and a good amount does make the call.
    expect(parseUsd("5")).toBe(5_000_000n);
    expect(parseUsd("5.0")).toBe(5_000_000n);
    expect(parseUsd("5.00")).toBe(5_000_000n);
    expect(parseUsd("0.50")).toBe(500_000n);
    expect(parseUsd("123456.78")).toBe(123_456_780_000n);
    await h.call("set_daily_limit", { daily_limit_usd: "1.00" });
    expect(h.callsTo("POST", "/v1/konto/limit")).toHaveLength(1);
  });
});
