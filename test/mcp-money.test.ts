import { describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAutomatonTools, createClient, handleMessage } from "../mcp/server.mjs";

/*
 * The money tools of mcp/server.mjs (goals/konto/05, point 13): deposit, payout and
 * set_payout_rule, plus balance and payout rule in automaton_status. Driven through tools/call
 * against a stub fetch, a fake clock and a sleep that only moves that clock. No network, no port.
 */

// Invented key and poll secret, assembled at runtime so that no literal here looks like a real one.
const KEY = "cnwy_k_" + "m".repeat(20) + "Y4";
const POLL = "poll-" + "q".repeat(30) + "-z";
const BASE = "https://cp.test";
const BLOCKED = /handoff|token|wallet|smart|permission|sepolia|turnkey|\berc|allowance|liquidation|on-?ramp|\bkyc|forwarder|spender|usdc/i;
const NO_DESTINATION = ["to", "destination", "address", "iban"];

type Call = { method: string; path: string; headers: Record<string, string>; body?: string };
type Handler = (call: Call, n: number) => Response | Promise<Response>;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

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
    match: "42",
    expires_at: "2026-11-16T12:10:00.000Z",
    poll_token: POLL,
  };
}

function keyFileWith(key: string) {
  const path = join(mkdtempSync(join(tmpdir(), "cp-mcp-money-")), "api-key");
  writeFileSync(path, `${key}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

const AUTOMATONS = () => json(200, { automatons: [{ id: "a-1", name: "Atlas", created_at: "2026-11-16T00:00:00Z" }] });

function harness(routes: Record<string, Handler>) {
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
    env: {},
    fetchImpl,
    keyFile: keyFileWith(KEY),
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
  const bodies = () => calls.filter((c) => c.body !== undefined).map((c) => JSON.parse(c.body!));
  return { tools, calls, callsTo, bodies, call, logs, texts };
}

describe("Money tools in mcp/server.mjs", () => {
  it("tools/list names deposit, payout and set_payout_rule next to the old tools, in plain words, without a destination", async () => {
    const h = harness({});
    const listed = (await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { client: createClient({ baseUrl: BASE }), automaton: h.tools }))
      .result.tools;
    const names = listed.map((t: any) => t.name);
    expect(names).toEqual([
      "list_open_bounties",
      "submit_work",
      "read_my_submission",
      "read_my_submissions",
      "check_submission",
      "read_balance",
      "start_automaton",
      "automaton_status",
      "automaton_logs",
      "set_daily_limit",
      "stop_automaton",
      "deposit",
      "payout",
      "set_payout_rule",
    ]);
    for (const name of ["deposit", "payout", "set_payout_rule"]) {
      const tool = listed.find((t: any) => t.name === name);
      expect(tool.inputSchema.additionalProperties, name).toBe(false);
      for (const field of NO_DESTINATION) expect(Object.keys(tool.inputSchema.properties), `${name} takes ${field}`).not.toContain(field);
      expect(JSON.stringify(tool).match(BLOCKED)?.[0], `${name} speaks of`).toBeUndefined();
      expect(JSON.stringify(tool)).not.toMatch(/[\u2013\u2014]/);
    }
    expect(listed.find((t: any) => t.name === "payout").description).toMatch(/bank account/);
    // Counter-check: the word filter does catch a word nobody may show.
    expect(BLOCKED.test("Sign the spend permission for USDC")).toBe(true);
  });

  it("deposit makes exactly one POST /v1/handoff with step deposit and answers with qr, url and match", async () => {
    const h = harness({
      "GET /v1/automatons": AUTOMATONS,
      "POST /v1/handoff": () => json(201, handoffAnswer("DEPO")),
      "GET /v1/handoff/DEPO": () => sse([{ state: "pending" }, { state: "matched" }, { state: "done" }]),
      "GET /v1/automatons/a-1": () => json(200, { id: "a-1", name: "Atlas", status: "running", turns: 2 }),
      "GET /v1/konto/payout": () => json(200, { account: "0x" + "1".repeat(40), balance_usd: "0.00", payout_ready: false, bank_last4: null, rule: null }),
    });
    const dep = await h.call("deposit", { amount_usd: "20.00" });
    expect(dep.isError).toBe(false);
    const posts = h.callsTo("POST", "/v1/handoff");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].body!)).toEqual({ automaton_name: "Atlas", step: "deposit", amount_usd: "20.00" });
    expect(posts[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(dep.json).toMatchObject({ status: "waiting_for_phone", url: `${BASE}/h/DEPO`, match: "42", amount_usd: "20.00" });
    expect(dep.json.qr).toBe(handoffAnswer("DEPO").qr);
    expect(dep.all, "the raw code follows the JSON so it can be shown unchanged").toContain("QR-OF-DEPO\n█");
    expect(dep.all).not.toContain(POLL);

    await h.tools.settled();
    expect(h.callsTo("GET", "/v1/handoff/DEPO")[0].headers.authorization).toBe(`Bearer ${POLL}`);
    const status = await h.call("automaton_status", {});
    expect(status.json.deposit).toMatchObject({ status: "done", amount_usd: "20.00" });
    expect(h.callsTo("POST", "/v1/handoff"), "following the stream opens no second code").toHaveLength(1);
  });

  it("payout with the second permission in place makes exactly one POST /v1/konto/payout and no phone step", async () => {
    const h = harness({
      "POST /v1/konto/payout": () => json(200, { state: "sent", tx: "0x" + "ab".repeat(32), amount_usd: "10.00", bank_last4: "3000" }),
    });
    const paid = await h.call("payout", { amount_usd: "10.00" });
    expect(paid.isError).toBe(false);
    expect(paid.json).toMatchObject({ status: "sent", amount_usd: "10.00", bank_account: "ending 3000" });
    expect(paid.json.message).toContain("ending 3000");
    const posts = h.callsTo("POST", "/v1/konto/payout");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].body!)).toEqual({ amount_usd: "10.00" });
    expect(posts[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(h.calls.filter((c) => c.path.startsWith("/v1/handoff"))).toHaveLength(0);
    expect(h.calls).toHaveLength(1);
    // all: true goes the same way with the same one call.
    await h.call("payout", { all: true });
    expect(JSON.parse(h.callsTo("POST", "/v1/konto/payout")[1].body!)).toEqual({ all: true });
    expect(h.calls.filter((c) => c.path.startsWith("/v1/handoff"))).toHaveLength(0);
  });

  it("payout on 202 pending says the money is on its way and must not be paid again, without claiming it was sent", async () => {
    const h = harness({
      "POST /v1/konto/payout": () => json(202, { state: "pending", tx: "0x" + "ef".repeat(32), amount_usd: "10.00" }),
    });
    const paid = await h.call("payout", { amount_usd: "10.00" });
    expect(paid.isError).toBe(false);
    expect(paid.json).toMatchObject({ status: "pending", amount_usd: "10.00" });
    expect(paid.json.message).toContain("not arrived yet");
    expect(paid.json.message).toContain("Do not pay it again");
    expect(paid.json.message).not.toMatch(/^Sent/);
    expect(paid.all).not.toMatch(BLOCKED);
    expect(h.callsTo("POST", "/v1/konto/payout")).toHaveLength(1);
    expect(h.calls.filter((c) => c.path.startsWith("/v1/handoff"))).toHaveLength(0);
  });

  it("payout on 409 payout_needs_phone makes a POST /v1/handoff with step payout, answers with qr and pays after done", async () => {
    const h = harness({
      "GET /v1/automatons": AUTOMATONS,
      "POST /v1/konto/payout": (_c, n) =>
        n === 1
          ? json(409, { error: "payout_needs_phone" })
          : json(200, { state: "sent", tx: "0x" + "cd".repeat(32), amount_usd: "10.00", bank_last4: "3000" }),
      "POST /v1/handoff": () => json(201, handoffAnswer("PAYO")),
      "GET /v1/handoff/PAYO": () => sse([{ state: "pending" }, { state: "matched" }, { state: "done", bank_last4: "3000" }]),
      "GET /v1/automatons/a-1": () => json(200, { id: "a-1", name: "Atlas", status: "running", turns: 4 }),
      "GET /v1/konto/payout": () => json(503, { error: "konto_unavailable" }),
    });
    const first = await h.call("payout", { amount_usd: "10.00" });
    expect(first.isError).toBe(false);
    const handoffs = h.callsTo("POST", "/v1/handoff");
    expect(handoffs).toHaveLength(1);
    expect(JSON.parse(handoffs[0].body!)).toEqual({ automaton_name: "Atlas", step: "payout" });
    expect(handoffs[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(first.json).toMatchObject({ status: "waiting_for_phone", url: `${BASE}/h/PAYO`, match: "42" });
    expect(first.json.qr).toBe(handoffAnswer("PAYO").qr);
    expect(first.all).toContain("QR-OF-PAYO\n█");
    expect(first.json.message).toMatch(/Bridge/);
    expect(first.json.message).toMatch(/IBAN/);
    expect(first.json.message).toMatch(/passkey/);
    expect(first.json.message).toMatch(/bank account/);
    expect(h.callsTo("POST", "/v1/konto/payout"), "nothing is sent before the phone step is done").toHaveLength(1);

    await h.tools.settled();
    const posts = h.callsTo("POST", "/v1/konto/payout");
    expect(posts, "after done the same payout is asked for again").toHaveLength(2);
    expect(JSON.parse(posts[1].body!)).toEqual(JSON.parse(posts[0].body!));
    const status = await h.call("automaton_status", {});
    expect(status.isError, "a 503 of the money part does not break the status").toBe(false);
    expect(status.json).toMatchObject({ id: "a-1", status: "running" });
    expect(status.json.payout).toMatchObject({ status: "sent", amount_usd: "10.00", bank_account: "ending 3000" });
    expect(h.callsTo("POST", "/v1/handoff")).toHaveLength(1);
  });

  it("no call of the money tools carries to, destination, address or iban, and such an argument is refused", async () => {
    const h = harness({
      "GET /v1/automatons": AUTOMATONS,
      "POST /v1/handoff": (_c, n) => json(201, handoffAnswer(n === 1 ? "DEPO" : "PAYO")),
      "GET /v1/handoff/DEPO": () => sse([{ state: "done" }]),
      "GET /v1/handoff/PAYO": () => sse([{ state: "done", bank_last4: "3000" }]),
      "POST /v1/konto/payout": (_c, n) => (n === 1 ? json(409, { error: "payout_needs_phone" }) : json(200, { state: "sent", amount_usd: "5.00", bank_last4: "3000" })),
      "POST /v1/konto/payout-rule": () => json(200, { rule: { keep_usd: "20.00", weekday: "friday" } }),
    });
    for (const field of NO_DESTINATION) {
      const value = field === "iban" ? "DE89 3704 0044 0532 0130 00" : "0x" + "9".repeat(40);
      for (const [tool, args] of [
        ["deposit", { amount_usd: "20.00" }],
        ["payout", { amount_usd: "5.00" }],
        ["payout", { all: true }],
        ["set_payout_rule", { keep_usd: "20.00", weekday: "friday" }],
      ] as const) {
        const refused = await h.call(tool, { ...args, [field]: value });
        expect(refused.isError, `${tool} with ${field}`).toBe(true);
        expect(refused.json.error).toBe("invalid_arguments");
      }
    }
    expect(h.calls, "a refused argument makes no call at all").toHaveLength(0);

    await h.call("deposit", { amount_usd: "20.00" });
    await h.call("payout", { amount_usd: "5.00" });
    await h.call("set_payout_rule", { keep_usd: "20.00", weekday: "friday" });
    await h.tools.settled();
    expect(h.callsTo("POST", "/v1/handoff")).toHaveLength(2);
    expect(h.callsTo("POST", "/v1/konto/payout")).toHaveLength(2);
    const bodies = h.bodies();
    expect(bodies).toHaveLength(5);
    for (const body of bodies) {
      for (const field of [...NO_DESTINATION, "wallet_address"]) expect(Object.keys(body), JSON.stringify(body)).not.toContain(field);
    }
    for (const c of h.calls) expect(c.path).not.toMatch(/iban|DE89/i);
  });

  it("set_payout_rule sends keep_usd and weekday, and off: true alone", async () => {
    const h = harness({
      "POST /v1/konto/payout-rule": (c) => {
        const body = JSON.parse(c.body!);
        return json(200, { rule: body.off ? null : { keep_usd: body.keep_usd, weekday: body.weekday } });
      },
    });
    const set = await h.call("set_payout_rule", { keep_usd: "20.00", weekday: "monday" });
    expect(set.isError).toBe(false);
    const posts = h.callsTo("POST", "/v1/konto/payout-rule");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].body!)).toEqual({ keep_usd: "20.00", weekday: "monday" });
    expect(posts[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(set.json).toMatchObject({ status: "done", payout_rule: { keep_usd: "20.00", weekday: "monday" } });

    await h.call("set_payout_rule", { keep_usd: "0", weekday: "sunday" });
    expect(JSON.parse(h.callsTo("POST", "/v1/konto/payout-rule")[1].body!)).toEqual({ keep_usd: "0.00", weekday: "sunday" });
    const off = await h.call("set_payout_rule", { off: true });
    expect(JSON.parse(h.callsTo("POST", "/v1/konto/payout-rule")[2].body!)).toEqual({ off: true });
    expect(off.json.payout_rule).toBe("no payout rule");

    for (const bad of [{ keep_usd: "20.00", weekday: "Monday" }, { keep_usd: "20.00" }, { weekday: "monday" }, { off: true, weekday: "monday" }, { off: false }]) {
      const refused = await h.call("set_payout_rule", bad);
      expect(refused.json.error, JSON.stringify(bad)).toBe("invalid_arguments");
    }
    expect(h.calls).toHaveLength(3);
  });

  it("automaton_status shows balance_usd and the payout rule, or no payout rule, and survives a 404 there", async () => {
    let money: Response = json(200, { account: "0x" + "2".repeat(40), balance_usd: "30.00", payout_ready: true, bank_last4: "3000", rule: { keep_usd: "20.00", weekday: "monday" } });
    const h = harness({
      "GET /v1/automatons": AUTOMATONS,
      "GET /v1/automatons/a-1": () => json(200, { id: "a-1", name: "Atlas", status: "running", turns: 7 }),
      "GET /v1/konto/payout": () => money,
    });
    const withRule = await h.call("automaton_status", {});
    expect(withRule.isError).toBe(false);
    expect(withRule.json).toMatchObject({
      id: "a-1",
      status: "running",
      turns: 7,
      balance_usd: "30.00",
      payout_rule: { keep_usd: "20.00", weekday: "monday" },
      bank_account: "ending 3000",
    });
    expect(h.callsTo("GET", "/v1/konto/payout")[0].headers.authorization).toBe(`Bearer ${KEY}`);

    money = json(200, { account: "0x" + "2".repeat(40), balance_usd: "12.50", payout_ready: false, bank_last4: null, rule: null });
    const noRule = await h.call("automaton_status", {});
    expect(noRule.json).toMatchObject({ balance_usd: "12.50", payout_rule: "no payout rule" });

    money = json(404, { error: "no_account" });
    const without = await h.call("automaton_status", {});
    expect(without.isError).toBe(false);
    expect(without.json).toMatchObject({ id: "a-1", status: "running", turns: 7 });
    expect(without.json).not.toHaveProperty("balance_usd");
  });

  it("never puts the key in a tool result or a stderr line of the money tools, even when the service echoes it", async () => {
    const h = harness({
      "GET /v1/automatons": () => json(200, { automatons: [{ id: "a-1", name: "Atlas", created_at: "2026-11-16T00:00:00Z", note: KEY }] }),
      "POST /v1/handoff": (_c, n) => json(201, { ...handoffAnswer(n === 1 ? "DEPO" : "PAYO"), echoed: KEY }),
      "GET /v1/handoff/DEPO": () => sse([{ state: "done", api_key: KEY }]),
      "GET /v1/handoff/PAYO": () => sse([{ state: "done", bank_last4: "3000" }]),
      "POST /v1/konto/payout": (_c, n) =>
        n === 1 ? json(409, { error: "payout_needs_phone", message: `no second signature for ${KEY}` }) : json(500, { error: "boom", message: `failed for ${KEY}` }),
      "POST /v1/konto/payout-rule": () => json(400, { error: "invalid_rule", message: `bad rule for ${KEY}` }),
      "GET /v1/automatons/a-1": () => json(200, { id: "a-1", status: "running", note: KEY }),
      "GET /v1/konto/payout": () => json(200, { balance_usd: "1.00", rule: null, account: KEY }),
    });
    await h.call("deposit", { amount_usd: "20.00" });
    await h.call("payout", { all: true });
    await h.tools.settled();
    await h.call("set_payout_rule", { keep_usd: "1.00", weekday: "tuesday" });
    await h.call("automaton_status", {});
    expect(h.texts.length).toBeGreaterThan(4);
    expect(h.logs.length, "something was logged, so the check below has lines to look at").toBeGreaterThan(0);
    for (const line of [...h.texts, ...h.logs]) {
      expect(line).not.toContain(KEY);
      expect(line).not.toContain(POLL);
    }
    expect(h.texts.join("\n")).toContain("cnwy_k_[redacted]");
    // Counter-check: the key did go out, as a header, which is the only place it belongs.
    expect(h.calls.every((c) => c.headers.authorization === `Bearer ${KEY}` || c.headers.authorization === `Bearer ${POLL}`)).toBe(true);
  });

  it("refuses amounts like 5.001, -1, abc or a number with invalid_arguments and makes no call", async () => {
    const h = harness({
      "GET /v1/automatons": AUTOMATONS,
      "POST /v1/handoff": () => json(201, handoffAnswer("DEPO")),
      "GET /v1/handoff/DEPO": () => sse([{ state: "expired" }]),
      "POST /v1/konto/payout": () => json(200, { state: "sent", amount_usd: "1.00", bank_last4: "3000" }),
      "POST /v1/konto/payout-rule": () => json(200, { rule: { keep_usd: "1.00", weekday: "monday" } }),
    });
    for (const bad of ["5.001", "-1", "abc", "0", "0.00", "", "1e3", " 5", "12345678", 5, 5.5]) {
      for (const [tool, args] of [
        ["deposit", { amount_usd: bad }],
        ["payout", { amount_usd: bad }],
        ["set_payout_rule", { keep_usd: bad, weekday: "monday" }],
      ] as const) {
        if (tool === "set_payout_rule" && (bad === "0" || bad === "0.00")) continue;
        const refused = await h.call(tool, args);
        expect(refused.isError, `${tool} with ${JSON.stringify(bad)}`).toBe(true);
        expect(refused.json.error, `${tool} with ${JSON.stringify(bad)}`).toBe("invalid_arguments");
      }
    }
    for (const bad of [{}, { all: false }, { amount_usd: "5.00", all: true }, { all: "true" }]) {
      const refused = await h.call("payout", bad);
      expect(refused.json.error, JSON.stringify(bad)).toBe("invalid_arguments");
    }
    expect(h.calls).toHaveLength(0);
    // Counter-check: the good forms do make the call, and keep_usd may be zero.
    await h.call("deposit", { amount_usd: "1234567.89" });
    await h.call("payout", { amount_usd: "1" });
    await h.call("set_payout_rule", { keep_usd: "0", weekday: "monday" });
    await h.tools.settled();
    expect(JSON.parse(h.callsTo("POST", "/v1/handoff")[0].body!).amount_usd).toBe("1234567.89");
    expect(JSON.parse(h.callsTo("POST", "/v1/konto/payout")[0].body!)).toEqual({ amount_usd: "1.00" });
    expect(h.callsTo("POST", "/v1/konto/payout-rule")).toHaveLength(1);
  });
});
