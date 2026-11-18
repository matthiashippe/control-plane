#!/usr/bin/env node
/**
 * MCP server for this control plane: the bounty market and the automatons.
 *
 * One file, no dependencies, no build step. An agent host that speaks MCP over stdio runs
 * `node server.mjs` and gets fourteen tools. Six are the bounty market: read the open bounties,
 * submit work, read back its own submission, run the invention check, read its balance. Five run
 * an automaton (goals/konto/04): start_automaton, automaton_status, automaton_logs,
 * set_daily_limit and stop_automaton. Three move money (goals/konto/05): deposit by card, payout
 * to the person's own bank account and set_payout_rule. None of them takes a destination: the
 * service knows only the bank account the person entered on the phone.
 *
 * Environment:
 *   CP_API_KEY   the key from POST /v1/auth/api-keys. Wins over the key file.
 *   CP_KEY_FILE  where the key of an account created by start_automaton is kept, default
 *                ~/.config/control-plane/api-key, mode 0600. A file other users can read is refused.
 *   CP_URL       base URL of the control plane, default https://automatonhost.com
 *
 * The key is never written to stdout or stderr: every tool result and every log line runs through
 * redact() or scrub() first, because an agent host shows tool output to a model and often logs it
 * as well. No signing key of any kind lives on this machine; the account is created and its daily
 * limit raised on the phone, with a passkey.
 *
 * Everything below is exported so the test suite can drive it against a stub fetch. The suite
 * makes no network calls.
 */

import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, fchmodSync, mkdirSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const SERVER_NAME = "control-plane-bounties";
export const SERVER_VERSION = "0.1.0";
export const DEFAULT_BASE_URL = "https://automatonhost.com";

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
// Not part of the deployed image. `harness/cp/Dockerfile` copies `src` and nothing else, and the
// service has no MCP route: this is a stdio server a client starts from a checkout. So a change
// here reaches people when it reaches `main`, not when the VM is rolled out. Two cycles in
// September 2026 carried "mcp/server.mjs waits for the next deploy" as an open item, and there was
// nothing to wait for.
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

/** What tools/list hands out: the schema, never the request builder. The automaton tools follow the six. */
export function toolDefinitions() {
  return [...TOOLS, ...AUTOMATON_TOOLS].map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
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
      if (spec.pattern !== undefined && !new RegExp(spec.pattern).test(value)) {
        problems.push(`${name} has the wrong form: ${spec.description ?? spec.pattern}`);
      }
    } else if (spec.type === "boolean") {
      if (typeof value !== "boolean") problems.push(`${name} must be true or false`);
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

/*
 * The automaton tools (goals/konto/04). They speak to the routes of sandbox 08 (/v1/automatons),
 * the phone step of konto 02 and 03 (POST /v1/handoff, then a Server-Sent Events stream per code)
 * and the daily limit of konto 04 (/v1/konto/limit). Amounts on the wire are atomic USDC with six
 * decimals, as decimal strings; the tools take US dollars with at most two decimals and convert
 * with bigint arithmetic only, so no amount ever passes through a float.
 */

export const ATOMIC_PER_USD = 1_000_000n;
/** How long a start that answers 402 is retried while the account tops itself up (decision 3). */
export const START_RETRY_MS = 90_000;
export const START_RETRY_EVERY_MS = 5_000;
/** How often a stream that dropped without a final state is opened again. */
const STREAM_RECONNECTS = 30;
const STREAM_RECONNECT_MS = 2_000;

const AMOUNT = /^(\d{1,9})(?:\.(\d{1,2}))?$/;
const ANY_KEY = /cnwy_k_[A-Za-z0-9_-]+/g;
const HEX_64 = /[0-9a-fA-F]{64}/g;

/** "5", "5.0", "5.00" or "0.50" to atomic USDC; null for anything else, including zero. */
export function parseUsd(value) {
  if (typeof value !== "string") return null;
  const m = AMOUNT.exec(value);
  if (!m) return null;
  const atomic = BigInt(m[1]) * ATOMIC_PER_USD + BigInt((m[2] ?? "").padEnd(2, "0")) * 10_000n;
  return atomic > 0n ? atomic : null;
}

/** Atomic USDC (bigint or decimal string) to dollars with two decimals, rounded down to the cent. */
export function formatUsd(atomic) {
  const cents = BigInt(atomic) / 10_000n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

function atomicFrom(value) {
  if (typeof value !== "string" || !/^\d{1,30}$/.test(value)) return null;
  return BigInt(value);
}

/**
 * The one decision of set_daily_limit: a limit above what the person confirmed on the phone needs
 * the phone again. Bigint in, boolean out. The service refuses every raise without the phone as
 * well; this only decides which way the tool goes.
 */
export function raiseNeedsPhone(wantedAtomic, signedAtomic) {
  return wantedAtomic > signedAtomic;
}

export function defaultKeyFile(env = process.env) {
  const given = String(env.CP_KEY_FILE ?? "").trim();
  return given || join(homedir(), ".config", "control-plane", "api-key");
}

/**
 * Read the key file. A missing file is no key; a file that group or others may read is not read
 * at all, because another user of this machine could have copied the key already.
 */
export function readKeyFile(path) {
  let st;
  try {
    st = statSync(path);
  } catch (e) {
    if (e?.code === "ENOENT") return { key: "" };
    return { error: { error: "key_file_unreadable", message: `Could not read the key file ${path}: ${e?.code ?? e?.message ?? e}.` } };
  }
  if (process.platform !== "win32" && (st.mode & 0o077) !== 0) {
    const mode = (st.mode & 0o777).toString(8).padStart(4, "0");
    return {
      error: {
        error: "key_file_mode",
        message:
          `The key file ${path} has mode ${mode}, so other users of this machine can read it, and it was not read. ` +
          `Run: chmod 600 ${path}`,
        file: path,
        mode,
      },
    };
  }
  return { key: readFileSync(path, "utf8").trim() };
}

/** Write the key with mode 0600, in a directory created with 0700 if it is missing. */
export function writeKeyFile(path, key) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const fd = openSync(path, "w", 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeSync(fd, `${key}\n`);
  } finally {
    closeSync(fd);
  }
  chmodSync(path, 0o600);
}

/** Server-Sent Events from a fetch body: yields `{ event, data }`, skips `:` comments. */
export async function* readServerEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data = [];
  const takeLine = (line) => {
    if (line === "") {
      const out = data.length > 0 ? { event, data: data.join("\n") } : null;
      event = "message";
      data = [];
      return out;
    }
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    return null;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += typeof value === "string" ? value : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n?/g, "\n");
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const out = takeLine(line);
        if (out) yield out;
      }
    }
    if (buffer) takeLine(buffer);
    const last = takeLine("");
    if (last) yield last;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A body that is still being read by an aborted fetch cannot be released; nothing to do.
    }
  }
}

/**
 * Amounts of deposit, payout and set_payout_rule: US dollars as a string, up to seven digits and two
 * decimals, the form the money routes accept. The pattern is checked before any request; that the
 * amount is above zero is checked by the tool itself, because keep_usd may be "0".
 */
export const MONEY_PATTERN = "^[0-9]{1,7}(\\.[0-9]{1,2})?$";
const MONEY = new RegExp(MONEY_PATTERN);
export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function moneyArg(description) {
  return { type: "string", minLength: 1, maxLength: 10, pattern: MONEY_PATTERN, description };
}

/** A money amount to atomic USDC, or null when it does not have the form; zero only with allowZero. */
export function parseMoneyUsd(value, { allowZero = false } = {}) {
  if (typeof value !== "string" || !MONEY.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  const atomic = BigInt(whole) * ATOMIC_PER_USD + BigInt(frac.padEnd(2, "0")) * 10_000n;
  if (atomic === 0n && !allowZero) return null;
  return atomic;
}

const ID_ARG = {
  type: "string",
  minLength: 1,
  maxLength: 200,
  description: "Which automaton. Default: the one started from here, else the newest of the account.",
};

export const AUTOMATON_TOOLS = [
  {
    name: "start_automaton",
    description:
      "Start an automaton: an agent that runs on its own in a sandbox on automatonhost.com and pays for " +
      "its thinking from your account, never more per day than the daily limit. The first time on " +
      "this machine there is no account yet: the answer then carries a QR code (`qr`), a link (`url`) " +
      "and a number (`match`). Show `qr` exactly as it is in a code block, with the link and the " +
      "number below it. The person scans the code with a phone, picks that number and confirms with " +
      "a passkey, which creates the account. Then call automaton_status until it says running or " +
      "failed. The key of the account is kept in a file on this machine and never shown. With an " +
      "account already on this machine the automaton starts right away.",
    inputSchema: {
      type: "object",
      properties: {
        genesis_prompt: {
          type: "string",
          minLength: 1,
          maxLength: 8000,
          description: "What the automaton is for, in your own words. It reads this first and works from it.",
        },
        name: {
          type: "string",
          minLength: 1,
          maxLength: 32,
          pattern: "^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$",
          description: "A short name of 1 to 32 characters: letters, digits, spaces, underscores and hyphens, starting with a letter or digit.",
        },
        daily_limit_usd: {
          type: "string",
          minLength: 1,
          maxLength: 13,
          description:
            'The most the account may charge per day, in US dollars with at most two decimals, as a string, e.g. "5.00".',
        },
      },
      required: ["genesis_prompt", "name", "daily_limit_usd"],
      additionalProperties: false,
    },
  },
  {
    name: "automaton_status",
    description:
      "How the automaton is doing: waiting_for_phone, matched (the right number was picked, the " +
      "passkey is next), starting, running, stopped or failed, with the reason in plain words. When " +
      "the phone step fails the reason says burned (a wrong number was picked) or expired (the code " +
      "ran out); start_automaton then makes a new code. Also shows how a change of the daily limit " +
      "went. Without id: the automaton started from here, else the newest of the account.",
    inputSchema: { type: "object", properties: { id: ID_ARG }, required: [], additionalProperties: false },
  },
  {
    name: "automaton_logs",
    description:
      "The last lines the automaton wrote, up to 200, with keys and long secrets blanked out. " +
      "Without id: the automaton started from here, else the newest of the account.",
    inputSchema: { type: "object", properties: { id: ID_ARG }, required: [], additionalProperties: false },
  },
  {
    name: "set_daily_limit",
    description:
      'Change the daily limit of the account, in US dollars as a string, e.g. "2.50". Lowering ' +
      "holds at once. Raising above what was confirmed on the phone needs the phone again: the " +
      "answer then carries `qr`, `url` and `match`, shown exactly as with start_automaton, and the " +
      "person confirms with the passkey they already have; automaton_status shows when the new " +
      "limit holds. Nothing on this machine can raise the limit without the phone.",
    inputSchema: {
      type: "object",
      properties: {
        daily_limit_usd: {
          type: "string",
          minLength: 1,
          maxLength: 13,
          description: 'The new daily limit in US dollars with at most two decimals, as a string, e.g. "10.00".',
        },
      },
      required: ["daily_limit_usd"],
      additionalProperties: false,
    },
  },
  {
    name: "stop_automaton",
    description:
      "Stop the automaton. Its sandbox halts, and stopped time costs nothing. Without id: the " +
      "automaton started from here, else the newest of the account.",
    inputSchema: { type: "object", properties: { id: ID_ARG }, required: [], additionalProperties: false },
  },
  {
    name: "deposit",
    description:
      'Put money into the account by card, in US dollars as a string, e.g. "20.00". The answer carries ' +
      "`qr`, `url` and `match`, shown exactly as with start_automaton. The person scans the code, picks " +
      "that number and pays by card on the phone with MoonPay. automaton_status shows how it went and " +
      "the balance once the money has arrived.",
    inputSchema: {
      type: "object",
      properties: { amount_usd: moneyArg('The amount in US dollars with at most two decimals, as a string, e.g. "20.00".') },
      required: ["amount_usd"],
      additionalProperties: false,
    },
  },
  {
    name: "payout",
    description:
      'Send money from the account to the person\'s bank account: amount_usd as a string, e.g. "10.00", ' +
      "or all: true for the whole balance. Money can only go to the bank account the person entered on " +
      "their phone; this tool takes no destination. The first time the answer carries `qr`, `url` and " +
      "`match`, shown exactly as with start_automaton: the person scans the code, picks that number, " +
      "confirms their identity once with Bridge, enters their IBAN and confirms with the passkey, and " +
      "then the money is sent. After that, payout pays at once without the phone.",
    inputSchema: {
      type: "object",
      properties: {
        amount_usd: moneyArg('The amount in US dollars with at most two decimals, as a string, e.g. "10.00". Leave out with all.'),
        all: { type: "boolean", description: "true pays out the whole balance. Leave out with amount_usd." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "set_payout_rule",
    description:
      "Pay out once a week on its own: keep keep_usd in the account and send the rest to the person's " +
      'bank account every weekday given, e.g. keep_usd "20.00" and weekday "monday". Nothing is sent ' +
      "when the rest is below $1.00. off: true removes the rule. Needs one payout with the phone first.",
    inputSchema: {
      type: "object",
      properties: {
        keep_usd: moneyArg('What stays in the account, in US dollars as a string, e.g. "20.00"; "0" sends everything.'),
        weekday: { type: "string", enum: WEEKDAYS, description: "The day of the week the payout runs, monday to sunday." },
        off: { type: "boolean", description: "true removes the rule. Leave out keep_usd and weekday then." },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

const PHONE_FAILED = {
  burned:
    "burned: a wrong number was picked on the phone, so this code no longer works. Call start_automaton again for a new code.",
  expired:
    "expired: the code ran out before the phone step was finished. Call start_automaton again for a new code.",
};

const LIMIT_FAILED = {
  burned: "burned: a wrong number was picked on the phone, so the daily limit stays as it was. Call set_daily_limit again for a new code.",
  expired: "expired: the code ran out before the phone step was finished, so the daily limit stays as it was. Call set_daily_limit again.",
};

const DEPOSIT_FAILED = {
  burned: "burned: a wrong number was picked on the phone, so nothing was paid. Call deposit again for a new code.",
  expired: "expired: the code ran out before the card payment was opened, so nothing was paid. Call deposit again.",
};

const PAYOUT_FAILED = {
  burned: "burned: a wrong number was picked on the phone, so no money was sent. Call payout again for a new code.",
  expired: "expired: the code ran out before the phone step was finished, so no money was sent. Call payout again.",
};

/** What each kind of phone step says when it fails, and what its log line calls it. */
const STEP_FAILED = { start: PHONE_FAILED, limit: LIMIT_FAILED, deposit: DEPOSIT_FAILED, payout: PAYOUT_FAILED };
const STEP_LOG = { start: "automaton start", limit: "daily limit change", deposit: "deposit", payout: "payout" };

function describeAutomaton(status, reason, turns) {
  if (status === "running") return `The automaton is running${Number.isInteger(turns) ? ` and has finished ${turns} turns` : ""}.`;
  if (status === "starting") return "The sandbox is up and the automaton is working on its first turn.";
  if (status === "stopped") {
    if (reason === "credit") return "Stopped because the account ran out of credit. It tops itself up within the daily limit.";
    return "Stopped.";
  }
  if (status === "failed") return `The automaton failed${reason ? `: ${reason}` : ""}.`;
  return undefined;
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

/**
 * The automaton and money tools with their state: the job this server started, the open stream of
 * its phone step, a pending raise of the daily limit, the last deposit and payout. Every dependency is injectable, so the suite
 * drives it with a stub fetch, a fake clock and a sleep that returns at once.
 */
export function createAutomatonTools({
  baseUrl = DEFAULT_BASE_URL,
  env = process.env,
  fetchImpl,
  now = () => Date.now(),
  sleep = defaultSleep,
  keyFile,
  log = () => {},
  startRetryMs = START_RETRY_MS,
  retryEveryMs = START_RETRY_EVERY_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  newIdempotencyKey = randomUUID,
} = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const envKey = String(env.CP_API_KEY ?? "").trim();
  const keyPath = keyFile ?? defaultKeyFile(env);
  const secrets = new Set(envKey ? [envKey] : []);
  const controllers = new Set();
  const pending = new Set();
  let knownKey = "";
  let job = null;
  let limitJob = null;
  let depositJob = null;
  let payoutJob = null;
  let closed = false;

  function scrub(text) {
    let out = String(text);
    for (const secret of secrets) if (secret) out = out.split(secret).join(REDACTED);
    return out.replace(ANY_KEY, REDACTED).replace(HEX_64, "[redacted]");
  }
  const say = (line) => log(scrub(line));

  function answer(value, isError = false, extra = []) {
    const text = scrub(JSON.stringify(value, null, 2));
    const result = textResult(text, isError);
    for (const part of extra) result.content.push({ type: "text", text: scrub(part) });
    return result;
  }
  const invalid = (message) => answer({ error: "invalid_arguments", message }, true);

  function track(promise) {
    const p = promise.catch((e) => say(`background step failed: ${e?.stack ?? e}`));
    pending.add(p);
    p.finally(() => pending.delete(p));
    return p;
  }

  function resolveKey() {
    if (envKey) return { key: envKey };
    if (knownKey) return { key: knownKey };
    const read = readKeyFile(keyPath);
    if (read.error) return read;
    if (read.key) {
      knownKey = read.key;
      secrets.add(read.key);
    }
    return { key: read.key };
  }

  async function request({ method = "GET", path, body, key, headers: extra = {} }) {
    const headers = { accept: "application/json", ...extra };
    if (key) headers.authorization = `Bearer ${key}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    let res;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return { ok: false, status: 0, payload: { error: "network_error", message: `${baseUrl} did not answer: ${e?.message ?? e}` } };
    }
    const text = await res.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: "unparseable_answer", message: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, payload };
  }

  function httpError(res) {
    const p = res.payload && typeof res.payload === "object" ? res.payload : {};
    return answer(
      { error: p.error ?? `http_${res.status}`, http_status: res.status, message: p.message ?? "The control plane refused this call." },
      true,
    );
  }

  function fail(target, reason, message) {
    target.status = "failed";
    target.reason = reason;
    target.message = message;
    say(`${STEP_LOG[target.kind] ?? STEP_LOG.start} failed: ${reason}`);
  }

  function jobView(j) {
    const view = { status: j.status };
    if (j.reason) view.reason = j.reason;
    if (j.message) view.message = j.message;
    if (j.name) view.name = j.name;
    if (j.id) view.id = j.id;
    if (j.status === "waiting_for_phone" || j.status === "matched") {
      Object.assign(view, { qr: j.qr, url: j.url, match: j.match, expires_at: j.expires_at });
    }
    return view;
  }

  function limitView() {
    if (!limitJob) return {};
    const view = { status: limitJob.status, daily_limit_usd: formatUsd(limitJob.wanted) };
    if (limitJob.reason) view.reason = limitJob.reason;
    if (limitJob.message) view.message = limitJob.message;
    if (limitJob.status === "waiting_for_phone" || limitJob.status === "matched") {
      Object.assign(view, { url: limitJob.url, match: limitJob.match, expires_at: limitJob.expires_at });
    }
    return { daily_limit_change: view };
  }

  /** How the last deposit and payout started from here went, for automaton_status. */
  function moneyJobsView() {
    const out = {};
    for (const [field, j] of [["deposit", depositJob], ["payout", payoutJob]]) {
      if (!j) continue;
      const view = { status: j.status };
      if (j.amount_usd) view.amount_usd = j.amount_usd;
      if (j.all) view.all = true;
      if (j.bank_last4) view.bank_account = `ending ${j.bank_last4}`;
      if (j.reason) view.reason = j.reason;
      if (j.message) view.message = j.message;
      if (j.status === "waiting_for_phone" || j.status === "matched") {
        Object.assign(view, { url: j.url, match: j.match, expires_at: j.expires_at });
      }
      out[field] = view;
    }
    return out;
  }

  /**
   * Balance and payout rule from GET /v1/konto/payout. An account without the money part (404, 503)
   * or any other failure leaves the status as it was: this is extra, never a reason to fail.
   */
  async function balanceView(key) {
    const res = await request({ path: "/v1/konto/payout", key });
    if (!res.ok) return {};
    const p = res.payload ?? {};
    const view = {};
    if (typeof p.balance_usd === "string") view.balance_usd = p.balance_usd;
    const rule = p.rule && typeof p.rule === "object" ? p.rule : null;
    view.payout_rule = rule ? { keep_usd: rule.keep_usd, weekday: rule.weekday } : "no payout rule";
    if (typeof p.bank_last4 === "string" && p.bank_last4) view.bank_account = `ending ${p.bank_last4}`;
    return view;
  }

  /** One POST /v1/automatons: "done", "retry" after a 402, or "failed". */
  async function attemptStart(j, key) {
    const res = await request({
      method: "POST",
      path: "/v1/automatons",
      key,
      headers: { "idempotency-key": j.idempotencyKey },
      body: { name: j.name, genesis_prompt: j.genesisPrompt },
    });
    if (res.ok) {
      j.id = res.payload?.id;
      j.status = res.payload?.status ?? "starting";
      j.reason = undefined;
      j.message = describeAutomaton(j.status);
      say(`automaton ${j.id} is ${j.status}`);
      return "done";
    }
    if (res.status === 402) {
      const balance = await request({ path: "/v1/credits/balance", key });
      j.status = "starting";
      j.message = "Waiting for the account to top up its credit before the automaton can start.";
      if (balance.ok) j.balance = balance.payload;
      return "retry";
    }
    fail(j, res.payload?.error ?? `http_${res.status}`, res.payload?.message ?? "The control plane refused the start.");
    return "failed";
  }

  async function keepStarting(j, key, t0) {
    for (;;) {
      if (now() - t0 >= startRetryMs) {
        fail(
          j,
          "not_enough_credit",
          `The account did not have enough credit to start the automaton within ${Math.round(startRetryMs / 1000)} seconds. ` +
            "Check the balance with read_balance and call start_automaton again.",
        );
        return;
      }
      await sleep(retryEveryMs);
      if (closed) return;
      if ((await attemptStart(j, key)) !== "retry") return;
    }
  }

  async function startLoop(j, key) {
    const t0 = now();
    if ((await attemptStart(j, key)) === "retry") await keepStarting(j, key, t0);
  }

  /** Keep GET /v1/handoff/{code} open and feed each state to `onState` until it says the end. */
  async function follow(j, pollToken, onState) {
    const controller = new AbortController();
    controllers.add(controller);
    j.controller = controller;
    const expiresMs = Date.parse(j.expires_at ?? "");
    try {
      for (let attempt = 0; !closed && !controller.signal.aborted; attempt++) {
        let res = null;
        try {
          res = await doFetch(`${baseUrl}/v1/handoff/${encodeURIComponent(j.code)}`, {
            method: "GET",
            headers: { accept: "text/event-stream", authorization: `Bearer ${pollToken}` },
            signal: controller.signal,
          });
        } catch (e) {
          if (controller.signal.aborted) return;
          say(`the connection for the phone step broke: ${e?.message ?? e}`);
        }
        if (res && !res.ok) {
          if (res.status === 404) fail(j, "expired", (STEP_FAILED[j.kind] ?? PHONE_FAILED).expired);
          else fail(j, `http_${res.status}`, "The control plane closed the connection for the phone step.");
          return;
        }
        if (res?.body) {
          for await (const ev of readServerEvents(res.body)) {
            if (ev.event !== "state") continue;
            let data;
            try {
              data = JSON.parse(ev.data);
            } catch {
              continue;
            }
            if (await onState(data)) return;
          }
        }
        // The stream ended without a final state, so the connection dropped. Open it again while the code can still hold.
        if (attempt >= STREAM_RECONNECTS || (Number.isFinite(expiresMs) && now() > expiresMs + 60_000)) {
          fail(j, "expired", (STEP_FAILED[j.kind] ?? PHONE_FAILED).expired);
          return;
        }
        await sleep(STREAM_RECONNECT_MS);
      }
    } finally {
      controllers.delete(controller);
      controller.abort();
    }
  }

  function phoneState(j, data, failed) {
    if (data.state === "pending") j.status = "waiting_for_phone";
    else if (data.state === "matched") j.status = "matched";
    else if (data.state === "burned" || data.state === "expired") {
      fail(j, data.state, failed[data.state]);
      return true;
    }
    return false;
  }

  async function onKontoState(j, data) {
    if (data.state !== "done") return phoneState(j, data, PHONE_FAILED);
    const key = typeof data.api_key === "string" ? data.api_key.trim() : "";
    if (!key) {
      fail(
        j,
        "key_missing",
        "The account was created on the phone, but its key did not reach this machine. Set CP_API_KEY or ask for help.",
      );
      return true;
    }
    secrets.add(key);
    knownKey = key;
    try {
      writeKeyFile(keyPath, key);
      say(`account ready, its key is kept in ${keyPath}`);
    } catch (e) {
      say(`could not write the key file ${keyPath}: ${e?.code ?? e?.message ?? e}; the key holds only while this server runs`);
    }
    j.account = data.account;
    j.status = "starting";
    j.message = "The account is ready, the automaton is starting.";
    await startLoop(j, key);
    return true;
  }

  function onDepositState(j, data) {
    if (data.state !== "done") return phoneState(j, data, DEPOSIT_FAILED);
    j.status = "done";
    j.message =
      `The card payment of $${j.amount_usd} is open on the phone. ` +
      "Once MoonPay has sent the money, automaton_status shows it in balance_usd.";
    say(`deposit of ${j.amount_usd} opened on the phone`);
    return true;
  }

  /** One POST /v1/konto/payout with exactly the arguments the person gave, nothing else. */
  function sendPayout(key, body) {
    return request({ method: "POST", path: "/v1/konto/payout", key, body });
  }

  function sentView(payload, fallbackAmount) {
    const p = payload ?? {};
    if (p.state === "nothing_to_pay") {
      return { status: "nothing_to_pay", amount_usd: "0.00", message: "There is nothing to pay out: the balance is $0.00." };
    }
    const amount = typeof p.amount_usd === "string" ? p.amount_usd : fallbackAmount;
    const last4 = typeof p.bank_last4 === "string" && p.bank_last4 ? p.bank_last4 : null;
    if (p.state === "pending") {
      // 202: the money left, but the confirmation is still missing. Asking again with the same request never pays twice.
      const pending = {
        status: "pending",
        amount_usd: amount,
        message: `$${amount} is on its way, but the confirmation has not arrived yet. Do not pay it again: call payout with the same amount later to see whether it arrived.`,
      };
      return { view: pending, last4 };
    }
    const view = { status: "sent", amount_usd: amount };
    if (last4) view.bank_account = `ending ${last4}`;
    view.message = `Sent $${amount} to your bank account${last4 ? ` ending ${last4}` : ""}.`;
    return { view, last4 };
  }

  async function onPayoutState(j, data, key) {
    if (data.state !== "done") return phoneState(j, data, PAYOUT_FAILED);
    if (typeof data.bank_last4 === "string" && data.bank_last4) j.bank_last4 = data.bank_last4;
    j.status = "sending";
    j.message = "The phone step is done, the money is being sent.";
    const res = await sendPayout(key, j.body);
    if (!res.ok) {
      const p = res.payload ?? {};
      fail(j, p.error ?? `http_${res.status}`, p.message ?? "The control plane refused the payout after the phone step.");
      return true;
    }
    const { view, last4 } = sentView(res.payload, j.amount_usd);
    Object.assign(j, { status: view.status, amount_usd: view.amount_usd, message: view.message, reason: undefined });
    if (last4) j.bank_last4 = last4;
    say(`payout ${view.status}: ${view.amount_usd}`);
    return true;
  }

  function onLimitState(j, data) {
    if (data.state !== "done") return phoneState(j, data, LIMIT_FAILED);
    const confirmed = atomicFrom(data.daily_limit_usdc);
    if (confirmed !== null) j.wanted = confirmed;
    j.status = "done";
    j.message = `The daily limit is now $${formatUsd(j.wanted)} a day.`;
    say(`daily limit raised to ${formatUsd(j.wanted)}`);
    return true;
  }

  const isOpen = (j) => j && (j.status === "waiting_for_phone" || j.status === "matched" || (j.status === "starting" && !j.id));

  function startAnswer(j, message) {
    const view = { ...jobView(j), message };
    return answer(view, false, j.qr && (j.status === "waiting_for_phone" || j.status === "matched") ? [j.qr] : []);
  }

  async function newestAutomaton(key) {
    const res = await request({ path: "/v1/automatons", key });
    if (!res.ok) return { error: httpError(res) };
    const list = Array.isArray(res.payload?.automatons) ? res.payload.automatons : [];
    const newest = [...list].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
    return { automaton: newest ?? null };
  }

  async function resolveId(given, key) {
    if (given) return { id: given };
    if (job?.id) return { id: job.id };
    const found = await newestAutomaton(key);
    if (found.error) return found;
    if (!found.automaton) {
      return { error: answer({ error: "no_automaton", message: "This account has no automaton yet. Use start_automaton." }, true) };
    }
    return { id: found.automaton.id };
  }

  /** The automaton name the phone shows: given, else the one started here, else the newest of the account. */
  async function automatonName(key, given) {
    if (given) return given;
    if (job?.name) return job.name;
    const found = await newestAutomaton(key);
    return found.automaton?.name ?? "your automaton";
  }

  /** Open a phone step with the key of this machine and follow its stream in the background. */
  async function openPhoneStep(key, body, j, onState) {
    const res = await request({ method: "POST", path: "/v1/handoff", key, body });
    if (!res.ok) return { error: httpError(res) };
    const { code, url, qr, match, expires_at: expiresAt, poll_token: pollToken } = res.payload ?? {};
    if (typeof pollToken === "string" && pollToken.length >= 12) secrets.add(pollToken);
    Object.assign(j, { status: "waiting_for_phone", code, url, qr, match, expires_at: expiresAt });
    track(follow(j, pollToken, (data) => onState(j, data)));
    return { job: j };
  }

  function phoneAnswer(j, message) {
    const view = { status: j.status, qr: j.qr, url: j.url, match: j.match, expires_at: j.expires_at, message };
    if (j.amount_usd) view.amount_usd = j.amount_usd;
    if (j.all) view.all = true;
    return answer(view, false, j.qr ? [j.qr] : []);
  }

  function keyOrError() {
    const k = resolveKey();
    if (k.error) return { error: answer(k.error, true) };
    if (!k.key) {
      return {
        error: answer(
          { error: "no_account", message: "There is no account on this machine yet. start_automaton creates one with the phone." },
          true,
        ),
      };
    }
    return { key: k.key };
  }

  const handlers = {
    async start_automaton(args) {
      const wanted = parseUsd(args.daily_limit_usd);
      if (wanted === null) {
        return invalid('daily_limit_usd must be a positive amount in US dollars with at most two decimals, as a string, e.g. "5.00".');
      }
      if (isOpen(job)) {
        return startAnswer(job, "A start is already under way. Scan the code if it is shown, then ask automaton_status.");
      }
      const k = resolveKey();
      if (k.error) return answer(k.error, true);
      const next = {
        kind: "start",
        name: args.name,
        genesisPrompt: args.genesis_prompt,
        wanted,
        idempotencyKey: newIdempotencyKey(),
        status: "starting",
      };
      if (k.key) {
        job = next;
        const t0 = now();
        if ((await attemptStart(next, k.key)) === "retry") track(keepStarting(next, k.key, t0));
        return answer(jobView(next), next.status === "failed");
      }
      const res = await request({
        method: "POST",
        path: "/v1/handoff",
        body: { automaton_name: args.name, daily_limit_usdc: wanted.toString(), step: "konto" },
      });
      if (!res.ok) return httpError(res);
      const { code, url, qr, match, expires_at: expiresAt, poll_token: pollToken } = res.payload ?? {};
      if (typeof pollToken === "string" && pollToken.length >= 12) secrets.add(pollToken);
      Object.assign(next, { status: "waiting_for_phone", code, url, qr, match, expires_at: expiresAt });
      job = next;
      track(follow(next, pollToken, (data) => onKontoState(next, data)));
      return startAnswer(
        next,
        `Scan the QR code with your phone, pick the number ${match} there and confirm with a passkey. ` +
          "That creates your account. Then ask automaton_status until it says running.",
      );
    },

    async automaton_status(args) {
      if (!args.id && job && !job.id) return answer({ ...jobView(job), ...limitView(), ...moneyJobsView() });
      const k = resolveKey();
      if (k.error) return answer(k.error, true);
      if (!k.key) {
        if (job) return answer({ ...jobView(job), ...limitView(), ...moneyJobsView() });
        return answer({ status: "none", message: "No automaton has been started from this machine. Use start_automaton." });
      }
      const target = await resolveId(args.id, k.key);
      if (target.error) return target.error;
      const res = await request({ path: `/v1/automatons/${encodeURIComponent(target.id)}`, key: k.key });
      if (!res.ok) return httpError(res);
      const p = res.payload ?? {};
      if (job && job.id === target.id && p.status) {
        job.status = p.status;
        job.reason = p.reason;
        job.message = undefined;
      }
      const view = { id: target.id, name: p.name, status: p.status, message: describeAutomaton(p.status, p.reason, p.turns) };
      if (p.reason) view.reason = p.reason;
      if (p.turns !== undefined) view.turns = p.turns;
      return answer({ ...view, ...(await balanceView(k.key)), ...limitView(), ...moneyJobsView() });
    },

    async automaton_logs(args) {
      const k = keyOrError();
      if (k.error) return k.error;
      const target = await resolveId(args.id, k.key);
      if (target.error) return target.error;
      const res = await request({ path: `/v1/automatons/${encodeURIComponent(target.id)}/logs`, key: k.key });
      if (!res.ok) return httpError(res);
      const lines = Array.isArray(res.payload?.lines) ? res.payload.lines.map((l) => scrub(String(l))) : [];
      return answer({ id: target.id, lines });
    },

    async stop_automaton(args) {
      const k = keyOrError();
      if (k.error) return k.error;
      const target = await resolveId(args.id, k.key);
      if (target.error) return target.error;
      const res = await request({ method: "POST", path: `/v1/automatons/${encodeURIComponent(target.id)}/stop`, key: k.key });
      if (!res.ok) return httpError(res);
      if (job && job.id === target.id) {
        job.status = "stopped";
        job.reason = "stopped";
      }
      return answer({ id: target.id, status: res.payload?.status ?? "stopped", message: "Stopped. Stopped time costs nothing." });
    },

    async set_daily_limit(args) {
      const wanted = parseUsd(args.daily_limit_usd);
      if (wanted === null) {
        return invalid('daily_limit_usd must be a positive amount in US dollars with at most two decimals, as a string, e.g. "2.50".');
      }
      const k = keyOrError();
      if (k.error) return k.error;
      const current = await request({ path: "/v1/konto/limit", key: k.key });
      if (!current.ok) return httpError(current);
      const signed = atomicFrom(current.payload?.signed_limit_usdc);
      if (signed === null) {
        return answer({ error: "unexpected_answer", message: "The control plane did not say which daily limit the phone confirmed." }, true);
      }
      const before = atomicFrom(current.payload?.daily_limit_usdc);

      if (raiseNeedsPhone(wanted, signed)) {
        // No name: the phone shows the name of the account, which nothing on this machine sets (goals/konto/06).
        const res = await request({
          method: "POST",
          path: "/v1/handoff",
          key: k.key,
          body: { daily_limit_usdc: wanted.toString(), step: "limit" },
        });
        if (!res.ok) return httpError(res);
        const { code, url, qr, match, expires_at: expiresAt, poll_token: pollToken } = res.payload ?? {};
        if (typeof pollToken === "string" && pollToken.length >= 12) secrets.add(pollToken);
        limitJob?.controller?.abort();
        const next = { kind: "limit", status: "waiting_for_phone", wanted, code, url, qr, match, expires_at: expiresAt };
        limitJob = next;
        track(follow(next, pollToken, (data) => onLimitState(next, data)));
        const view = {
          status: "waiting_for_phone",
          daily_limit_usd: formatUsd(wanted),
          qr,
          url,
          match,
          expires_at: expiresAt,
          message:
            `Raising the daily limit to $${formatUsd(wanted)} needs the phone: scan the QR code, pick the number ${match} ` +
            "and confirm with your passkey. Until then the old limit holds; automaton_status shows when the new one does.",
        };
        if (before !== null) view.current_daily_limit_usd = formatUsd(before);
        return answer(view, false, qr ? [qr] : []);
      }

      const res = await request({ method: "POST", path: "/v1/konto/limit", key: k.key, body: { daily_limit_usdc: wanted.toString() } });
      if (!res.ok) return httpError(res);
      const now_ = atomicFrom(res.payload?.daily_limit_usdc) ?? wanted;
      return answer({ status: "done", daily_limit_usd: formatUsd(now_), message: `The daily limit is now $${formatUsd(now_)} a day.` });
    },

    async deposit(args) {
      const atomic = parseMoneyUsd(args.amount_usd);
      if (atomic === null) {
        return invalid('amount_usd must be a positive amount in US dollars with at most two decimals, as a string, e.g. "20.00".');
      }
      const k = keyOrError();
      if (k.error) return k.error;
      const amount = formatUsd(atomic);
      const name = await automatonName(k.key);
      depositJob?.controller?.abort();
      const next = { kind: "deposit", amount_usd: amount };
      const opened = await openPhoneStep(k.key, { automaton_name: name, step: "deposit", amount_usd: amount }, next, onDepositState);
      if (opened.error) return opened.error;
      depositJob = next;
      return phoneAnswer(
        next,
        `Scan the QR code with your phone, pick the number ${next.match} there and pay $${amount} by card. ` +
          "automaton_status shows when the card payment is open and the balance once the money has arrived.",
      );
    },

    async payout(args) {
      const hasAmount = args.amount_usd !== undefined;
      const hasAll = args.all !== undefined;
      if (hasAmount === hasAll) {
        return invalid('payout takes either amount_usd as a string, e.g. "10.00", or all: true, and not both.');
      }
      if (hasAll && args.all !== true) return invalid("all must be true; to pay a part of the balance give amount_usd.");
      let body;
      if (hasAmount) {
        const atomic = parseMoneyUsd(args.amount_usd);
        if (atomic === null) {
          return invalid('amount_usd must be a positive amount in US dollars with at most two decimals, as a string, e.g. "10.00".');
        }
        body = { amount_usd: formatUsd(atomic) };
      } else {
        body = { all: true };
      }
      const k = keyOrError();
      if (k.error) return k.error;

      const res = await sendPayout(k.key, body);
      if (res.ok) {
        const { view } = sentView(res.payload, body.amount_usd);
        return answer(view);
      }
      if (res.status !== 409 || res.payload?.error !== "payout_needs_phone") return httpError(res);

      // The first payout: the phone sets up the bank account and the passkey confirms it once.
      const name = await automatonName(k.key);
      payoutJob?.controller?.abort();
      const next = { kind: "payout", body, amount_usd: body.amount_usd, all: body.all === true };
      const opened = await openPhoneStep(k.key, { automaton_name: name, step: "payout" }, next, (j, data) =>
        onPayoutState(j, data, k.key),
      );
      if (opened.error) return opened.error;
      payoutJob = next;
      return phoneAnswer(
        next,
        `The first payout needs the phone once: scan the QR code, pick the number ${next.match}, confirm your identity once ` +
          "with Bridge, enter your IBAN and confirm with your passkey. Money can only go to your bank account. " +
          "Then the money is sent, and automaton_status shows when; after that, payout pays without the phone.",
      );
    },

    async set_payout_rule(args) {
      const hasRule = args.keep_usd !== undefined || args.weekday !== undefined;
      if (args.off !== undefined) {
        if (args.off !== true || hasRule) return invalid("set_payout_rule takes either keep_usd and weekday, or off: true alone.");
      } else if (args.keep_usd === undefined || args.weekday === undefined) {
        return invalid('set_payout_rule needs keep_usd as a string, e.g. "20.00", and weekday, e.g. "monday"; or off: true.');
      }
      let body;
      if (args.off === true) {
        body = { off: true };
      } else {
        const keep = parseMoneyUsd(args.keep_usd, { allowZero: true });
        if (keep === null) {
          return invalid('keep_usd must be an amount in US dollars with at most two decimals, as a string, e.g. "20.00" or "0".');
        }
        body = { keep_usd: formatUsd(keep), weekday: args.weekday };
      }
      const k = keyOrError();
      if (k.error) return k.error;
      const res = await request({ method: "POST", path: "/v1/konto/payout-rule", key: k.key, body });
      if (!res.ok) return httpError(res);
      const rule = res.payload?.rule && typeof res.payload.rule === "object" ? res.payload.rule : null;
      if (!rule) return answer({ status: "done", payout_rule: "no payout rule", message: "The payout rule is off." });
      return answer({
        status: "done",
        payout_rule: { keep_usd: rule.keep_usd, weekday: rule.weekday },
        message:
          `Every ${rule.weekday}, everything above $${rule.keep_usd} goes to your bank account, ` +
          "when that is at least $1.00.",
      });
    },
  };

  return {
    tools: AUTOMATON_TOOLS,
    has: (name) => Object.hasOwn(handlers, name),
    /** Validate, then run. Bad arguments give invalid_arguments and make no call. */
    async call(name, args) {
      const tool = AUTOMATON_TOOLS.find((t) => t.name === name);
      if (!tool) return null;
      const given = args ?? {};
      const problems = validateArgs(tool.inputSchema, given);
      if (problems.length > 0) return invalid(`${name}: ${problems.join("; ")}`);
      return handlers[name](given);
    },
    /** A client for the six bounty tools with the key of this machine, when CP_API_KEY is not set. */
    keyedClient(fallback) {
      const k = resolveKey();
      if (k.error || !k.key) return fallback;
      return createClient({ baseUrl, apiKey: k.key, fetchImpl, timeoutMs });
    },
    scrub,
    keyFile: keyPath,
    /** Resolves when no background step (stream, retries) is running. */
    async settled() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    close() {
      closed = true;
      for (const c of controllers) c.abort();
    },
  };
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
      if (AUTOMATON_TOOLS.some((t) => t.name === name)) {
        ctx.automaton ??= createAutomatonTools({ baseUrl: ctx.client?.baseUrl ?? DEFAULT_BASE_URL });
        return result(id, await ctx.automaton.call(name, params?.arguments));
      }
      // The bounty tools use the key of this machine too once start_automaton has created one, unless CP_API_KEY is set.
      const client = ctx.automaton && !ctx.client.hasKey ? ctx.automaton.keyedClient(ctx.client) : ctx.client;
      const answer = await callTool(client, name, params?.arguments);
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
export function serve({ input, output, client, automaton, log = () => {} }) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  let chain = Promise.resolve();
  const ctx = { client, automaton };

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
        write(await handleMessage(message, ctx));
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
  const automaton = createAutomatonTools({
    baseUrl,
    env: process.env,
    log: (m) => process.stderr.write(`[cp-mcp] ${m}\n`),
  });
  process.stderr.write(
    `[cp-mcp] ${SERVER_NAME} ${SERVER_VERSION} against ${baseUrl}` +
      (apiKey ? "\n" : `, no CP_API_KEY set: the key file ${automaton.keyFile} is used once start_automaton has created it\n`),
  );
  await serve({
    input: process.stdin,
    output: process.stdout,
    client,
    automaton,
    log: (m) => process.stderr.write(`[cp-mcp] ${automaton.scrub(m)}\n`),
  });
  automaton.close();
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
