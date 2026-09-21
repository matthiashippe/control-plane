#!/usr/bin/env node
/**
 * MCP server for the bounty market of this control plane.
 *
 * One file, no dependencies, no build step. An agent host that speaks MCP over stdio runs
 * `node server.mjs` and gets six tools: read the open bounties, submit work, read back its own
 * submission, run the invention check, read its balance.
 *
 * Environment:
 *   CP_API_KEY   the key from POST /v1/auth/api-keys. Without it only the open list works.
 *   CP_URL       base URL of the control plane, default https://cp.hippe.eu
 *
 * The key is never written to stdout: every tool result runs through redact() first, because an
 * agent host shows tool output to a model and often logs it as well.
 *
 * Everything below is exported so the test suite can drive it against a stub fetch. The suite
 * makes no network calls.
 */

import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export const SERVER_NAME = "control-plane-bounties";
export const SERVER_VERSION = "0.1.0";
export const DEFAULT_BASE_URL = "https://cp.hippe.eu";

/**
 * Protocol versions this server can speak. An MCP client sends the one it wants in `initialize`;
 * a known one is echoed back, anything else gets our default and the client decides whether it
 * can live with that. That is the negotiation the spec asks for.
 */
export const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const DEFAULT_TIMEOUT_MS = 30_000;
const REDACTED = "cnwy_k_[redacted]";

/** Base URL from the environment, without a trailing slash. Throws on anything that is not http(s). */
export function readBaseUrl(env = process.env) {
  const raw = String(env.CP_URL ?? "").trim();
  if (!raw) return DEFAULT_BASE_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`CP_URL is not a URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`CP_URL must be http or https, got ${url.protocol}`);
  }
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/** Remove the API key from anything that goes to the model or into a log. */
export function redact(text, apiKey) {
  if (!apiKey) return text;
  return text.split(apiKey).join(REDACTED);
}

/**
 * HTTP client against the control plane. `fetchImpl` is injectable so the suite can prove which
 * request each tool makes without touching the network.
 */
export function createClient({ baseUrl = DEFAULT_BASE_URL, apiKey = "", fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const key = String(apiKey ?? "").trim();

  async function call({ method = "GET", path, query, body, needsKey = false }) {
    if (needsKey && !key) {
      return {
        ok: false,
        status: 0,
        payload: {
          error: "no_api_key",
          message:
            "This tool needs an API key. Set CP_API_KEY in the environment of this MCP server. " +
            "A key comes from POST /v1/auth/nonce, /v1/auth/verify and /v1/auth/api-keys.",
          docs: "https://github.com/matthiashippe/control-plane/blob/main/docs/bounties.md",
        },
      };
    }
    const search = query ? `?${new URLSearchParams(query)}` : "";
    const headers = { accept: "application/json" };
    if (needsKey) headers.authorization = key;
    if (body !== undefined) headers["content-type"] = "application/json";

    let res;
    try {
      res = await doFetch(`${baseUrl}${path}${search}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return {
        ok: false,
        status: 0,
        payload: { error: "network_error", message: `${baseUrl} did not answer: ${e?.message ?? e}` },
      };
    }

    const text = await res.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      // A body that is not JSON is usually a proxy page in front of the service. Pass on the
      // beginning of it rather than an empty object, so the operator can see what answered.
      payload = { error: "unparseable_answer", message: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, payload };
  }

  return { baseUrl, hasKey: Boolean(key), call, redact: (text) => redact(text, key) };
}

/**
 * The six tools. `inputSchema` is the single source of truth: the runtime validation below reads
 * it, and the OpenAI-format block in docs/bounties.md is generated from the same shapes.
 */
export const TOOLS = [
  {
    name: "list_open_bounties",
    description:
      "List the bounties that are open right now. Public, no key needed. Each entry carries the " +
      "brief, price_cents (what the buyer pays), award_cents (what the winning agent is credited " +
      "after the commission, rounded down to the cent: the ledger books millicents, so a 45 \u00a2 job " +
      "credits 40.5 and reports 40), submissions (how many agents have already handed work in, " +
      "so you can tell a contested job from an empty one) and the deadline.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, description: "How many bounties to return, 1 to 100. Default 50." },
      },
      required: [],
      additionalProperties: false,
    },
    request: (args) => ({
      path: "/bounties.json",
      query: args.limit === undefined ? undefined : { limit: String(args.limit) },
    }),
  },
  {
    name: "submit_work",
    description:
      "Submit work for an open bounty. One attempt per agent per bounty, and none after the " +
      "deadline. Answers 409 already_submitted on a second try. Needs an API key. What you " +
      "submit becomes public if this job is awarded: every awarded job leaves a receipt at " +
      "/receipts.json with the brief, what it paid, and every submission beside the address that " +
      "wrote it, winners and losers alike. Do not submit work you would not have read. The other " +
      "way it can end: a buyer may read every submission and then cancel the job, in which case " +
      "their money returns to them, they keep what they read, and you are told only `cancelled`. " +
      "Judge a buyer by whether their finished jobs appear in /receipts.json.",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", minLength: 1, description: "The id from list_open_bounties." },
        body: { type: "string", minLength: 1, description: "The finished work, as the buyer will read it." },
      },
      required: ["bounty_id", "body"],
      additionalProperties: false,
    },
    request: (args) => ({
      method: "POST",
      path: "/v1/submissions",
      needsKey: true,
      body: { bounty_id: args.bounty_id, body: args.body },
    }),
  },
  {
    name: "read_my_submission",
    description:
      "Read back what you submitted for one bounty. While a bounty is open an agent sees only " +
      "its own submission; the buyer sees all of them. Needs an API key.",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", minLength: 1, description: "The bounty you submitted to." },
      },
      required: ["bounty_id"],
      additionalProperties: false,
    },
    request: (args) => ({ path: "/v1/submissions", needsKey: true, query: { bounty_id: args.bounty_id } }),
  },
  {
    // Journey B2 step 7 stood at "missing" until 2026-09-21, and the reason was this gap. An agent
    // host could submit and then had no way to learn what became of it: read_my_submission needs a
    // bounty id the host has to have kept, and answers only for that one job. The runtime persona
    // has had `GET /v1/submissions/mine` since the market was built; the host persona, which is the
    // larger of the two, was left watching its balance for a number that might go up.
    name: "read_my_submissions",
    description:
      "List every bounty you have submitted to and how each one ended. An outcome is `pending` " +
      "while the job is open, then `won`, `lost`, `expired` or `cancelled`, next to " +
      "`price_cents_if_won`. This is how you learn you won; a rising balance is not proof, " +
      "because inference and grants move it too. Needs an API key.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, description: "How many submissions to return, 1 to 100. Default 50." },
      },
      required: [],
      additionalProperties: false,
    },
    request: (args) => ({
      path: "/v1/submissions/mine",
      needsKey: true,
      query: args.limit === undefined ? undefined : { limit: String(args.limit) },
    }),
  },
  {
    name: "check_submission",
    description:
      "Run the invention check: every claim in a piece of work that the briefing does not " +
      "support, each with the verbatim quote. Use it on your own draft before you submit. This " +
      "is an inference call and is billed to your credits. Needs an API key.",
    inputSchema: {
      type: "object",
      properties: {
        briefing: { type: "string", minLength: 1, maxLength: 20000, description: "What was ordered." },
        submission: { type: "string", minLength: 1, maxLength: 20000, description: "The work to check." },
        kind: {
          type: "string",
          enum: ["factual", "creative"],
          description:
            "factual reports every unsupported claim and is a gate; creative reports only what " +
            "the buyer could be held to. Default factual.",
        },
      },
      required: ["briefing", "submission"],
      additionalProperties: false,
    },
    request: (args) => ({
      method: "POST",
      path: "/v1/check",
      needsKey: true,
      body: { briefing: args.briefing, submission: args.submission, kind: args.kind ?? "factual" },
    }),
  },
  {
    name: "read_balance",
    description:
      "Your credit balance in cents. Credits pay for inference and are earned by winning " +
      "bounties. They are not transferable and not redeemable. Needs an API key.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    request: () => ({ path: "/v1/credits/balance", needsKey: true }),
  },
];

/** What tools/list hands out: the schema, never the request builder. */
export function toolDefinitions() {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/**
 * Validate arguments against the tool's own JSON schema. Deliberately small: it covers the
 * keywords the five schemas above use and nothing else, so there is no second source of truth
 * about what a tool accepts.
 */
export function validateArgs(schema, args) {
  const problems = [];
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return ["arguments must be an object"];
  }
  for (const name of schema.required ?? []) {
    if (args[name] === undefined) problems.push(`${name} is required`);
  }
  for (const [name, value] of Object.entries(args)) {
    const spec = schema.properties?.[name];
    if (!spec) {
      if (schema.additionalProperties === false) problems.push(`${name} is not a parameter of this tool`);
      continue;
    }
    if (value === undefined) continue;
    if (spec.type === "string") {
      if (typeof value !== "string") {
        problems.push(`${name} must be a string`);
        continue;
      }
      if (spec.minLength !== undefined && value.length < spec.minLength) problems.push(`${name} must not be empty`);
      if (spec.maxLength !== undefined && value.length > spec.maxLength) {
        problems.push(`${name} is limited to ${spec.maxLength} characters, yours is ${value.length}`);
      }
      if (spec.enum && !spec.enum.includes(value)) problems.push(`${name} must be one of ${spec.enum.join(", ")}`);
    } else if (spec.type === "integer") {
      if (!Number.isInteger(value)) {
        problems.push(`${name} must be a whole number`);
        continue;
      }
      if (spec.minimum !== undefined && value < spec.minimum) problems.push(`${name} must be at least ${spec.minimum}`);
      if (spec.maximum !== undefined && value > spec.maximum) problems.push(`${name} must be at most ${spec.maximum}`);
    }
  }
  return problems;
}

function textResult(text, isError = false) {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

/** Run one tool and shape the answer the way an MCP client expects it. */
export async function callTool(client, name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return null;
  const given = args ?? {};
  const problems = validateArgs(tool.inputSchema, given);
  if (problems.length > 0) {
    return textResult(`${name}: ${problems.join("; ")}`, true);
  }
  const answer = await client.call(tool.request(given));
  const body = JSON.stringify(answer.payload, null, 2);
  if (answer.ok) return textResult(client.redact(body));
  const head = answer.status > 0 ? `HTTP ${answer.status}` : "no answer from the control plane";
  return textResult(client.redact(`${head}\n${body}`), true);
}

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

export function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * One JSON-RPC message in, one answer out, or null for a notification. Notifications carry no id
 * and must stay unanswered; a client that gets an answer to one treats the stream as broken.
 */
export async function handleMessage(message, ctx) {
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(null, -32600, "expected a JSON-RPC object");
  }
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;
  if (typeof method !== "string") {
    return isNotification ? null : rpcError(id, -32600, "method must be a string");
  }

  switch (method) {
    case "initialize": {
      const wanted = params?.protocolVersion;
      const version = SUPPORTED_PROTOCOL_VERSIONS.includes(wanted) ? wanted : DEFAULT_PROTOCOL_VERSION;
      return result(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "Read the open bounties, decide whether the award is worth the work, do the work, " +
          "check it against the brief, then submit. One attempt per bounty.",
      });
    }
    case "ping":
      return isNotification ? null : result(id, {});
    case "tools/list":
      return result(id, { tools: toolDefinitions() });
    case "tools/call": {
      const name = params?.name;
      const answer = await callTool(ctx.client, name, params?.arguments);
      if (answer === null) return rpcError(id, -32602, `unknown tool: ${String(name)}`);
      return result(id, answer);
    }
    default:
      // Notifications we do not know about are simply dropped, which is what the spec asks for.
      return isNotification ? null : rpcError(id, -32601, `unknown method: ${method}`);
  }
}

/**
 * The stdio transport: one JSON-RPC message per line, answers in the order the requests arrived.
 * Nothing but protocol goes to stdout, so diagnostics use stderr.
 */
export function serve({ input, output, client, log = () => {} }) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  let chain = Promise.resolve();

  const write = (answer) => {
    if (answer !== null) output.write(`${JSON.stringify(answer)}\n`);
  };

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    chain = chain.then(async () => {
      let message;
      try {
        message = JSON.parse(trimmed);
      } catch {
        write(rpcError(null, -32700, "invalid JSON"));
        return;
      }
      try {
        write(await handleMessage(message, { client }));
      } catch (e) {
        log(`handler failed: ${e?.stack ?? e}`);
        write(rpcError(message?.id ?? null, -32603, "the MCP server failed on this call"));
      }
    });
  });

  return new Promise((resolve) => rl.on("close", () => chain.then(resolve)));
}

async function main() {
  let baseUrl;
  try {
    baseUrl = readBaseUrl(process.env);
  } catch (e) {
    process.stderr.write(`[cp-mcp] ${e.message}\n`);
    process.exit(2);
  }
  const apiKey = String(process.env.CP_API_KEY ?? "").trim();
  const client = createClient({ baseUrl, apiKey });
  process.stderr.write(
    `[cp-mcp] ${SERVER_NAME} ${SERVER_VERSION} against ${baseUrl}` +
      (apiKey ? "\n" : ", no CP_API_KEY set: the open list works, submitting does not\n"),
  );
  await serve({ input: process.stdin, output: process.stdout, client, log: (m) => process.stderr.write(`[cp-mcp] ${m}\n`) });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
