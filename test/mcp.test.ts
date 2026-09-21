import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BASE_URL,
  DEFAULT_PROTOCOL_VERSION,
  TOOLS,
  callTool,
  createClient,
  handleMessage,
  readBaseUrl,
  redact,
  serve,
  toolDefinitions,
  validateArgs,
} from "../mcp/server.mjs";

type StubAnswer = { status?: number; body?: unknown; text?: string };
type StubCall = { url: string; method: string; headers: Record<string, string>; body?: string };

/**
 * A fetch that never leaves this process. Every tool test runs against it, so the suite makes no
 * network calls and can still prove exactly which request a tool would make.
 */
function stubFetch(answers: StubAnswer[] = [{ status: 200, body: {} }]) {
  const calls: StubCall[] = [];
  const impl = async (url: string, init: Record<string, any> = {}) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body,
    });
    const answer = answers[calls.length - 1] ?? answers[answers.length - 1];
    const status = answer.status ?? 200;
    const text = answer.text ?? JSON.stringify(answer.body ?? {});
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  return { impl, calls };
}

function client(answers?: StubAnswer[], apiKey = "cnwy_k_testkey_0123456789") {
  const stub = stubFetch(answers);
  return {
    client: createClient({ baseUrl: "https://cp.test", apiKey, fetchImpl: stub.impl }),
    calls: stub.calls,
  };
}

async function text(promise: Promise<any>) {
  const answer = await promise;
  return { text: answer.content[0].text as string, isError: Boolean(answer.isError) };
}

describe("MCP protocol", () => {
  const ctx = { client: client().client };

  it("echoes a protocol version it knows and falls back for one it does not", async () => {
    const known = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }, ctx);
    expect(known.result.protocolVersion).toBe("2024-11-05");
    // Counter-check: an unknown version must not be echoed, or the client believes we speak it.
    const unknown = await handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, ctx);
    expect(unknown.result.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);
    expect(unknown.result.serverInfo.name).toBe("control-plane-bounties");
    expect(unknown.result.capabilities.tools).toBeTruthy();
  });

  it("answers requests and stays silent on notifications", async () => {
    const request = await handleMessage({ jsonrpc: "2.0", id: 7, method: "tools/list" }, ctx);
    expect(request.id).toBe(7);
    // A notification carries no id. An answer to one breaks clients that count open requests.
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBeNull();
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/cancelled", params: {} }, ctx)).toBeNull();
  });

  it("lists six tools with their schemas and nothing internal", async () => {
    const listed = (await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx)).result.tools;
    expect(listed.map((t: any) => t.name)).toEqual([
      "list_open_bounties",
      "submit_work",
      "read_my_submission",
      "read_my_submissions",
      "check_submission",
      "read_balance",
    ]);
    for (const tool of listed) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.description.length).toBeGreaterThan(40);
      // Counter-check: the request builder is ours and must not reach the client.
      expect(Object.keys(tool).sort()).toEqual(["description", "inputSchema", "name"]);
    }
    expect(toolDefinitions()).toHaveLength(TOOLS.length);
  });

  it("separates an unknown method from an unknown tool", async () => {
    const method = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/callx" }, ctx);
    expect(method.error.code).toBe(-32601);
    const tool = await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "buy_bounty" } }, ctx);
    expect(tool.error.code).toBe(-32602);
    // Counter-check: the known pair answers with a result, not an error.
    const good = await handleMessage({ jsonrpc: "2.0", id: 3, method: "ping" }, ctx);
    expect(good.error).toBeUndefined();
    expect(good.result).toEqual({});
  });

  it("rejects a message that is not a JSON-RPC object", async () => {
    expect((await handleMessage(null, ctx)).error.code).toBe(-32600);
    expect((await handleMessage([1, 2, 3], ctx)).error.code).toBe(-32600);
    expect((await handleMessage({ jsonrpc: "2.0", id: 4, method: 42 }, ctx)).error.code).toBe(-32600);
    // Counter-check: a well-formed one goes through.
    expect((await handleMessage({ jsonrpc: "2.0", id: 5, method: "ping" }, ctx)).result).toEqual({});
  });
});

describe("MCP stdio transport", () => {
  /** Feed lines in, collect the lines that come back out. */
  async function roundtrip(lines: string[]) {
    const input = new PassThrough();
    const output = new PassThrough();
    const collected: string[] = [];
    output.on("data", (chunk) => collected.push(chunk.toString()));
    const done = serve({ input, output, client: client().client });
    for (const line of lines) input.write(`${line}\n`);
    input.end();
    await done;
    return collected.join("").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }

  it("answers one line per request, in order, and writes nothing for a notification", async () => {
    const answers = await roundtrip([
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
      "",
      '{"jsonrpc":"2.0","method":"notifications/initialized"}',
      '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
    ]);
    // Two requests, two answers: the blank line and the notification produce nothing.
    expect(answers).toHaveLength(2);
    expect(answers.map((a) => a.id)).toEqual([1, 2]);
  });

  it("reports broken JSON and keeps reading the stream", async () => {
    const answers = await roundtrip(["this is not json", '{"jsonrpc":"2.0","id":9,"method":"ping"}']);
    expect(answers[0].error.code).toBe(-32700);
    expect(answers[0].id).toBeNull();
    // Counter-check: the line after the broken one is still served.
    expect(answers[1]).toMatchObject({ id: 9, result: {} });
  });
});

describe("Starting it without a build step", () => {
  it("speaks MCP straight from plain node, with protocol on stdout and diagnostics on stderr", async () => {
    const serverPath = fileURLToPath(new URL("../mcp/server.mjs", import.meta.url));
    const child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, CP_API_KEY: "", CP_URL: "https://cp.test" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (err += c.toString()));
    child.stdin.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
    child.stdin.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
    child.stdin.end();
    const code: number = await new Promise((resolve) => child.on("close", resolve));

    expect(code).toBe(0);
    const lines = out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(lines.map((l) => l.id)).toEqual([1, 2]);
    expect(lines[1].result.tools).toHaveLength(6);
    // Counter-check: the startup note goes to stderr. On stdout it would corrupt the protocol,
    // so every single line out there has to be a JSON-RPC message.
    expect(err).toContain("control-plane-bounties");
    for (const line of lines) expect(line.jsonrpc).toBe("2.0");
  }, 20_000);
});

describe("Base URL from the environment", () => {
  it("defaults to the service, strips a trailing slash, and refuses what it cannot call", () => {
    expect(readBaseUrl({})).toBe(DEFAULT_BASE_URL);
    expect(readBaseUrl({ CP_URL: "" })).toBe(DEFAULT_BASE_URL);
    expect(readBaseUrl({ CP_URL: "http://localhost:8402/" })).toBe("http://localhost:8402");
    expect(readBaseUrl({ CP_URL: "https://cp.example.com/base/" })).toBe("https://cp.example.com/base");
    // Counter-check: a scheme fetch cannot use must fail at startup, not at the first tool call.
    expect(() => readBaseUrl({ CP_URL: "ftp://cp.example.com" })).toThrow(/http or https/);
    expect(() => readBaseUrl({ CP_URL: "cp.example.com" })).toThrow(/not a URL/);
  });
});

describe("What each tool asks the control plane", () => {
  it("reads the open list without a key and passes limit only when it was given", async () => {
    const withLimit = client([{ status: 200, body: { open: [] } }]);
    await callTool(withLimit.client, "list_open_bounties", { limit: 5 });
    expect(withLimit.calls[0].url).toBe("https://cp.test/bounties.json?limit=5");
    expect(withLimit.calls[0].method).toBe("GET");
    // The list is public, so the key stays at home. Counter-check follows in the next test.
    expect(withLimit.calls[0].headers.authorization).toBeUndefined();

    const withoutLimit = client([{ status: 200, body: { open: [] } }]);
    await callTool(withoutLimit.client, "list_open_bounties", {});
    expect(withoutLimit.calls[0].url).toBe("https://cp.test/bounties.json");
  });

  it("submits with the key, the right path and exactly the two fields", async () => {
    const c = client([{ status: 201, body: { id: "s-1", bounty_id: "b-1" } }]);
    const answer = await text(callTool(c.client, "submit_work", { bounty_id: "b-1", body: "the work" }));
    expect(c.calls[0].method).toBe("POST");
    expect(c.calls[0].url).toBe("https://cp.test/v1/submissions");
    expect(c.calls[0].headers.authorization).toBe("cnwy_k_testkey_0123456789");
    expect(JSON.parse(c.calls[0].body!)).toEqual({ bounty_id: "b-1", body: "the work" });
    expect(answer.isError).toBe(false);
    expect(answer.text).toContain("s-1");
  });

  it("reads back one submission by query parameter", async () => {
    const c = client([{ status: 200, body: { bounty_id: "b-1", submissions: [] } }]);
    await callTool(c.client, "read_my_submission", { bounty_id: "b 1" });
    expect(c.calls[0].url).toBe("https://cp.test/v1/submissions?bounty_id=b+1");
    expect(c.calls[0].method).toBe("GET");
  });

  it("lists every outcome without needing a bounty id, and passes limit only when it was given", async () => {
    // The tool that closes journey B2 step 7. read_my_submission answers for one job whose id the
    // host must have kept; this one answers for all of them, which is what an agent needs to learn
    // it won without reading a balance that inference and grants also move.
    const bare = client([{ status: 200, body: { submissions: [] } }]);
    await callTool(bare.client, "read_my_submissions", {});
    expect(bare.calls[0].url).toBe("https://cp.test/v1/submissions/mine");
    expect(bare.calls[0].method).toBe("GET");
    expect(bare.calls[0].headers?.authorization, "an outcome belongs to one agent").toBeTruthy();

    const limited = client([{ status: 200, body: { submissions: [] } }]);
    await callTool(limited.client, "read_my_submissions", { limit: 5 });
    expect(limited.calls[0].url).toBe("https://cp.test/v1/submissions/mine?limit=5");
  });

  it("checks work as factual unless creative was asked for", async () => {
    const factual = client([{ status: 200, body: { findings: [], discarded: 0 } }]);
    await callTool(factual.client, "check_submission", { briefing: "b", submission: "s" });
    expect(JSON.parse(factual.calls[0].body!)).toEqual({ briefing: "b", submission: "s", kind: "factual" });

    const creative = client([{ status: 200, body: { findings: [] } }]);
    await callTool(creative.client, "check_submission", { briefing: "b", submission: "s", kind: "creative" });
    expect(JSON.parse(creative.calls[0].body!).kind).toBe("creative");
  });

  it("reads the balance from the endpoint that serves it", async () => {
    const c = client([{ status: 200, body: { balance_cents: 42 } }]);
    const answer = await text(callTool(c.client, "read_balance", {}));
    expect(c.calls[0].url).toBe("https://cp.test/v1/credits/balance");
    expect(answer.text).toContain("42");
  });
});

describe("When something is missing or goes wrong", () => {
  it("says so without calling anything when a tool needs a key and none is set", async () => {
    const keyless = client([{ status: 200, body: {} }], "");
    const answer = await text(callTool(keyless.client, "submit_work", { bounty_id: "b-1", body: "x" }));
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain("no_api_key");
    expect(answer.text).toContain("CP_API_KEY");
    expect(keyless.calls, "a call without a key would only produce a 401").toHaveLength(0);
    // Counter-check: the public list still works without a key, and it does call.
    const listed = await text(callTool(keyless.client, "list_open_bounties", {}));
    expect(listed.isError).toBe(false);
    expect(keyless.calls).toHaveLength(1);
  });

  it("hands an error status back as an error, with the body the service sent", async () => {
    const c = client([{ status: 409, body: { error: "already_submitted", message: "One attempt per agent." } }]);
    const answer = await text(callTool(c.client, "submit_work", { bounty_id: "b-1", body: "x" }));
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain("HTTP 409");
    expect(answer.text).toContain("already_submitted");
    // Counter-check: a 201 in the same shape is not an error.
    const ok = client([{ status: 201, body: { id: "s-1" } }]);
    expect((await text(callTool(ok.client, "submit_work", { bounty_id: "b-1", body: "x" }))).isError).toBe(false);
  });

  it("reports a dead connection instead of throwing out of the tool call", async () => {
    const dead = createClient({
      baseUrl: "https://cp.test",
      apiKey: "cnwy_k_x",
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });
    const answer = await text(callTool(dead, "read_balance", {}));
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain("network_error");
    expect(answer.text).toContain("ECONNREFUSED");
  });

  it("passes on an answer that is not JSON instead of pretending it was empty", async () => {
    const c = client([{ status: 502, text: "<html>Bad Gateway</html>" }]);
    const answer = await text(callTool(c.client, "read_balance", {}));
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain("Bad Gateway");
    // Counter-check: real JSON is parsed and reformatted, not passed through as a string.
    const good = client([{ status: 200, body: { balance_cents: 7 } }]);
    expect((await text(callTool(good.client, "read_balance", {}))).text).toContain('"balance_cents": 7');
  });

  it("never lets the API key reach the model, even when the service echoes it", async () => {
    const key = "cnwy_k_secret_abcdef";
    const stub = stubFetch([{ status: 401, body: { error: "Invalid API key", sent: key } }]);
    const c = createClient({ baseUrl: "https://cp.test", apiKey: key, fetchImpl: stub.impl });
    const answer = await text(callTool(c, "read_balance", {}));
    expect(answer.text, "an agent host shows tool output to a model and logs it").not.toContain(key);
    expect(answer.text).toContain("cnwy_k_[redacted]");
    // Counter-check: redaction only touches the key, and does nothing when there is none.
    expect(redact("a cnwy_k_secret_abcdef b", key)).toBe("a cnwy_k_[redacted] b");
    expect(redact("nothing secret here", key)).toBe("nothing secret here");
    expect(redact(`the key is ${key}`, "")).toBe(`the key is ${key}`);
  });
});

describe("Argument validation", () => {
  const submit = TOOLS.find((t: any) => t.name === "submit_work")!.inputSchema;
  const list = TOOLS.find((t: any) => t.name === "list_open_bounties")!.inputSchema;
  const check = TOOLS.find((t: any) => t.name === "check_submission")!.inputSchema;

  it("insists on the required fields and accepts a complete call", () => {
    expect(validateArgs(submit, { bounty_id: "b-1" })).toEqual(["body is required"]);
    expect(validateArgs(submit, {})).toEqual(["bounty_id is required", "body is required"]);
    expect(validateArgs(submit, { bounty_id: "b-1", body: "x" })).toEqual([]);
  });

  it("catches wrong types, empty strings, out-of-range numbers and unknown fields", () => {
    expect(validateArgs(submit, { bounty_id: 7, body: "x" })).toContain("bounty_id must be a string");
    expect(validateArgs(submit, { bounty_id: "", body: "x" })).toContain("bounty_id must not be empty");
    expect(validateArgs(submit, { bounty_id: "b", body: "x", price: 1 })).toContain("price is not a parameter of this tool");
    expect(validateArgs(list, { limit: 0 })).toContain("limit must be at least 1");
    expect(validateArgs(list, { limit: 101 })).toContain("limit must be at most 100");
    expect(validateArgs(list, { limit: 2.5 })).toContain("limit must be a whole number");
    expect(validateArgs(check, { briefing: "b", submission: "s", kind: "poetic" })).toContain(
      "kind must be one of factual, creative",
    );
    expect(validateArgs(check, { briefing: "b", submission: "x".repeat(20_001) })[0]).toMatch(/limited to 20000/);
    expect(validateArgs(submit, "not an object" as any)).toEqual(["arguments must be an object"]);
    // Counter-check: everything the schema allows passes.
    expect(validateArgs(list, { limit: 100 })).toEqual([]);
    expect(validateArgs(list, {})).toEqual([]);
    expect(validateArgs(check, { briefing: "b", submission: "s", kind: "creative" })).toEqual([]);
  });

  it("refuses bad arguments before it calls the service", async () => {
    const c = client([{ status: 201, body: {} }]);
    const answer = await text(callTool(c.client, "submit_work", { bounty_id: "b-1" }));
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain("body is required");
    expect(c.calls, "a call the service would reject anyway costs a round trip").toHaveLength(0);
    // Counter-check: with the missing field it goes out.
    await callTool(c.client, "submit_work", { bounty_id: "b-1", body: "x" });
    expect(c.calls).toHaveLength(1);
  });
});
