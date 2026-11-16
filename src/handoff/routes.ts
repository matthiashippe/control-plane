/**
 * The way to the phone (goals/konto/02, contract in docs/konto/handoff.md):
 *
 * - `POST /v1/handoff` creates a handoff without a key and answers with code, short link, QR code as text, the number the
 *   terminal shows, the end of the ten minutes and the terminal's secret.
 * - `GET /h/{code}` is the page on the phone, `POST /h/{code}` the tap on one of its three numbers.
 * - `GET /v1/handoff/{code}` tells the terminal how it ended, as Server-Sent Events, and only with the terminal's secret.
 *
 * Registered before the `/v1/*` auth middleware of src/app.ts, which is how a keyless path answers without a key there.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Context, Env, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Db } from "../db.js";
import { clientKey, RateLimiter, type RateLimitOptions } from "../ratelimit.js";
import { siteOrigin } from "../public/site.js";
import { renderHandoffPage, type HandoffPage } from "../public/handoff.js";
import { HANDOFF_TTL_MS, pollTokenMatches } from "./rules.js";
import { chooseHandoff, createHandoff, readHandoff, type Handoff, type HandoffRandom, type HandoffState, type HandoffStep } from "./store.js";
import { qrText } from "./qr.js";
import type { Address, Hex, PublicClient } from "viem";
import { burnMatched, finishKonto, permissionFromJson, takeApiKey } from "../konto/account.js";
import { finishLimit, readAccountLimit } from "../konto/limit.js";
import { parsePermission, permissionMatches, signatureValid } from "../konto/permission.js";
import { FAIL_REASONS, renderKontoPage, type FailReason } from "../public/konto.js";
import { renderLimitPage, type LimitPage } from "../public/limit.js";
import { resolveApiKey } from "../auth/siwe.js";

/** What the passkey step shows: the page asks the person to create the account and to sign exactly this permission. */
export interface PasskeyView {
  code: string;
  automatonName: string;
  dailyLimitUsdc: bigint;
  chainId: number;
  spender: Address;
  token: Address;
  /** The public ID of Turnkey's Auth Proxy configuration the page signs up with; null when CP_KONTO_AUTH_PROXY_ID is unset. */
  authProxyId: string | null;
}

/**
 * The account of konto 03 (src/konto/, docs/konto/konto.md). Null or left out while CP_KONTO_CHAIN_ID is unset: then `step:
 * "konto"` and /h/{code}/konto answer 503.
 */
export interface KontoDeps {
  chainId: number;
  /** Our spender, the address of the key in CP_KONTO_KEY_FILE. */
  spender: Address;
  token: Address;
  /** Asks the chain whether a smart wallet signed (ERC-1271 or ERC-6492). */
  verifyClient: PublicClient;
  /** Public ID of Turnkey's Auth Proxy configuration (CP_KONTO_AUTH_PROXY_ID); without it the button reports the service missing. */
  authProxyId?: string | null;
  /**
   * CP_KONTO_TOPUP_USDC: what one top-up takes. The first payment of a konto step is the lower of this and the daily limit
   * (goals/konto/04), because it is the first spend(); left out, it is the daily limit.
   */
  topupUsdc?: bigint;
}

/**
 * The script of the passkey step, bundled by ops/konto/build-client.mjs from src/public/konto-client/. Next to the compiled file in
 * the image (dist/public, harness/cp/Dockerfile), next to the source under tsx.
 */
function loadKontoScript(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.join(here, "../public/konto-client/konto.js"), path.resolve("src/public/konto-client/konto.js")]) {
    try {
      return readFileSync(candidate, "utf-8");
    } catch {
      continue;
    }
  }
  return null;
}

export interface HandoffDeps {
  db: Db;
  clock: () => Date;
  /** The <style> block of src/public/index.html, which the page carries. */
  indexStyle: () => string;
  /** How often the stream looks at the row. */
  pollMs?: number;
  /** How often the stream sends a comment so that Caddy and the terminal keep the connection open. */
  keepAliveMs?: number;
  /** Cap on unknown codes per address on /h/{code}; null switches it off. */
  missLimit?: RateLimitOptions | null;
  random?: HandoffRandom;
  konto?: KontoDeps | null;
}

/** 20 unknown codes in 10 minutes from one address (docs/konto/handoff.md). */
export const DEFAULT_MISS_LIMIT: RateLimitOptions = { limit: 20, windowMs: 600_000 };
const CONTRACT = "https://github.com/matthiashippe/control-plane/blob/dev/docs/konto/handoff.md";
const NAME_MAX = 64;

/** A positive whole number of atomic USDC in whole cents, as a string; anything else is null. */
export function parseUsdc(v: unknown): bigint | null {
  if (typeof v !== "string" || !/^[0-9]{1,18}$/.test(v)) return null;
  const n = BigInt(v);
  return n > 0n && n % 10_000n === 0n ? n : null;
}

/** 1 to 64 characters, no control characters. */
export function parseName(v: unknown): string | null {
  if (typeof v !== "string" || v.length < 1 || v.length > NAME_MAX || /[\u0000-\u001f\u007f]/.test(v)) return null;
  return v;
}

/** The headers of every answer of /h/{code}: the link is a one-time secret and stays out of caches, referrers and indexes. */
function private_(c: Context): void {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Robots-Tag", "noindex");
}

const REASON: Record<Exclude<HandoffState, "pending">, "used" | "wrong" | "expired"> = {
  matched: "used",
  done: "used",
  burned: "wrong",
  expired: "expired",
};

export function registerHandoff<E extends Env>(app: Hono<E>, deps: HandoffDeps): void {
  const { db, clock } = deps;
  const pollMs = deps.pollMs ?? 1000;
  const keepAliveMs = deps.keepAliveMs ?? 15_000;
  const misses = deps.missLimit === null ? null : new RateLimiter({ ...(deps.missLimit ?? DEFAULT_MISS_LIMIT), now: () => clock().getTime() });
  const nowMs = () => clock().getTime();
  const konto = deps.konto ?? null;
  const KONTO_OFF = {
    error: "konto_unavailable",
    message: "Creating an account is not switched on here yet. Leave out step or send step \"confirm\".",
    docs: CONTRACT,
  };

  /** The step limit (konto 04): the number with today's and the new limit, then the passkey of the account. */
  const limitPage = (c: Context, view: LimitPage, status: 200) => {
    private_(c);
    return c.html(renderLimitPage(view, deps.indexStyle()), status);
  };
  const limitApprove = (h: Handoff): LimitPage => ({
    state: "approve",
    automatonName: h.automatonName,
    previousLimitUsdc: h.previousLimitUsdc ?? 0n,
    dailyLimitUsdc: h.dailyLimitUsdc,
    choices: h.choices,
  });

  const passkey = (c: Context, h: Handoff) => {
    private_(c);
    if (!konto) return c.text("Creating an account is not switched on here. Start again in your terminal.", 503);
    if (h.step === "limit") {
      const row = db.prepare("SELECT owner, organization_id FROM konto_accounts WHERE address = ?").get(h.account ?? "") as
        | { owner: string | null; organization_id: string | null }
        | undefined;
      return limitPage(
        c,
        {
          state: "passkey",
          code: h.code,
          automatonName: h.automatonName,
          previousLimitUsdc: h.previousLimitUsdc ?? 0n,
          dailyLimitUsdc: h.dailyLimitUsdc,
          chainId: konto.chainId,
          spender: konto.spender,
          token: konto.token,
          account: h.account ?? "",
          owner: row?.owner ?? "",
          organizationId: row?.organization_id ?? "",
        },
        200,
      );
    }
    const view: PasskeyView = {
      code: h.code,
      automatonName: h.automatonName,
      dailyLimitUsdc: h.dailyLimitUsdc,
      chainId: konto.chainId,
      spender: konto.spender,
      token: konto.token,
      authProxyId: konto.authProxyId ?? null,
    };
    return c.html(renderKontoPage({ state: "passkey", ...view }, deps.indexStyle()), 200);
  };

  const page = (c: Context, view: HandoffPage, status: 200 | 404 | 410) => {
    private_(c);
    return c.html(renderHandoffPage(view, deps.indexStyle()), status);
  };

  const approve = (h: Handoff): HandoffPage => ({
    state: "approve",
    automatonName: h.automatonName,
    dailyLimitUsdc: h.dailyLimitUsdc,
    amountUsdc: h.amountUsdc,
    choices: h.choices,
  });

  /** An unknown code costs one try of the address; past the cap the answer is 429 instead of 404. */
  const unknown = (c: Context) => {
    if (misses) {
      const { allowed, retryAfterSec } = misses.check(clientKey(c.req.raw.headers));
      if (!allowed) {
        private_(c);
        c.header("Retry-After", String(retryAfterSec));
        return c.text(`Too many unknown codes from your address. Wait ${retryAfterSec} seconds, then start again in your terminal.`, 429);
      }
    }
    return page(c, { state: "invalid", reason: "unknown" }, 404);
  };

  app.post("/v1/handoff", async (c) => {
    c.header("Cache-Control", "no-store");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const automatonName = parseName(body?.automaton_name);
    const dailyLimitUsdc = parseUsdc(body?.daily_limit_usdc);
    const step = body?.step === undefined ? "confirm" : body.step;
    // The first payment of an account is its first spend() (goals/konto/04): the lower of CP_KONTO_TOPUP_USDC and the daily limit,
    // set here when the terminal leaves amount_usdc out; any other value is refused. A raise of the limit has no payment.
    const firstPayment = dailyLimitUsdc === null ? null : konto?.topupUsdc !== undefined && konto.topupUsdc < dailyLimitUsdc ? konto.topupUsdc : dailyLimitUsdc;
    const amountUsdc =
      step === "limit" ? 0n : step === "konto" && body?.amount_usdc === undefined ? firstPayment : parseUsdc(body?.amount_usdc);
    if (step === "konto" && konto && amountUsdc !== null && amountUsdc !== firstPayment) {
      return c.json(
        {
          error: "invalid_handoff",
          message: `The first payment of an account is ${String(firstPayment)} atomic USDC for this daily limit. Leave amount_usdc out and it is set for you.`,
          docs: CONTRACT,
        },
        400,
      );
    }
    if (
      !body ||
      typeof body !== "object" ||
      !automatonName ||
      dailyLimitUsdc === null ||
      amountUsdc === null ||
      (step !== "confirm" && step !== "konto" && step !== "limit")
    ) {
      return c.json(
        {
          error: "invalid_handoff",
          message:
            "Send JSON with automaton_name (1 to 64 characters), daily_limit_usdc and amount_usdc, both a positive whole number of " +
            'atomic USDC (6 decimals) in whole cents, as a string, and optionally step "confirm" (the default), "konto" (amount_usdc ' +
            'may be left out) or "limit" (with your API key, without amount_usdc): ' +
            '{"automaton_name":"Atlas","daily_limit_usdc":"5000000","amount_usdc":"5000000"}.',
          docs: CONTRACT,
        },
        400,
      );
    }
    if ((step === "konto" || step === "limit") && !konto) return c.json(KONTO_OFF, 503);
    let limitOf: { account: string; previousLimitUsdc: bigint } | undefined;
    if (step === "limit") {
      // A raise needs the API key of the account (goals/konto/04): the key alone can only lower the limit (POST /v1/konto/limit).
      const address = resolveApiKey(db, c.req.header("authorization"));
      if (!address) {
        return c.json({ error: "unauthorized", message: 'step "limit" raises the daily limit of an account: send its API key as Authorization: Bearer <key>.', docs: CONTRACT }, 401);
      }
      const limit = readAccountLimit(db, address);
      if (!limit) return c.json({ error: "no_account", message: "This API key belongs to no account with a daily limit.", docs: CONTRACT }, 404);
      if (dailyLimitUsdc <= limit.signed) {
        return c.json(
          {
            error: "invalid_handoff",
            message: `The new daily limit has to be above today's ${String(limit.signed)} atomic USDC. A lower one needs no phone: POST /v1/konto/limit.`,
            docs: CONTRACT,
          },
          400,
        );
      }
      limitOf = { account: limit.account, previousLimitUsdc: limit.signed };
    }
    const { handoff, pollToken, expiresAtMs } = createHandoff(
      db,
      { automatonName, dailyLimitUsdc, amountUsdc, step: step as HandoffStep, ...limitOf },
      nowMs(),
      deps.random,
    );
    const url = `${siteOrigin()}/h/${handoff.code}`;
    return c.json(
      {
        code: handoff.code,
        url,
        qr: qrText(url),
        match: handoff.match,
        expires_at: new Date(expiresAtMs).toISOString(),
        poll_token: pollToken,
      },
      201,
    );
  });

  // What to send, for an agent that looks before it posts. The exact route stands before the wildcard below.
  app.get("/v1/handoff", (c) =>
    c.json({
      method: "POST",
      path: "/v1/handoff",
      body: { automaton_name: "Atlas", daily_limit_usdc: "5000000", amount_usdc: "5000000" },
      optional: {
        step:
          "confirm (default), konto: creates an account with a passkey after the right number (amount_usdc may be left out), " +
          "or limit: raises the daily limit of the account of your API key with its passkey (send the key, leave amount_usdc out)",
      },
      answer: ["code", "url", "qr", "match", "expires_at", "poll_token"],
      outcome:
        "GET /v1/handoff/{code} with Authorization: Bearer <poll_token>, as Server-Sent Events: pending, then done, burned or expired; " +
        "with step konto or limit matched comes before done; the first done of konto carries account and api_key, done of limit " +
        "carries daily_limit_usdc.",
      docs: CONTRACT,
    }),
  );

  // The code is a path segment, which the auth middleware cannot match with its exact list, so this handler checks the
  // terminal's secret itself (test/v1-ohne-variables-segment.test.ts, ERLAUBTE_WILDCARDS).
  app.all("/v1/handoff/*", async (c) => {
    const m = /^\/v1\/handoff\/([^/]+)$/.exec(new URL(c.req.url).pathname);
    if (!m) return c.notFound();
    const asked = c.req.method === "HEAD" ? "GET" : c.req.method;
    if (asked !== "GET") {
      c.header("Allow", "GET, HEAD");
      return c.json({ error: "method_not_allowed", message: `${c.req.path} accepts GET, not ${c.req.method}.`, allow: ["GET"], docs: CONTRACT }, 405);
    }
    const code = m[1].toUpperCase();
    const found = readHandoff(db, code, nowMs());
    if (!found) return c.json({ error: "handoff_not_found", message: "There is no handoff with this code.", docs: CONTRACT }, 404);
    if (!pollTokenMatches(c.req.header("authorization"), found.pollHash)) {
      return c.json(
        { error: "unauthorized", message: "Send the poll_token from the answer of POST /v1/handoff as Authorization: Bearer <poll_token>.", docs: CONTRACT },
        401,
      );
    }
    c.header("Cache-Control", "no-store");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      let last: HandoffState | null = null;
      let beat = Date.now();
      // A code ends after ten minutes at the latest, so no stream has a reason to live longer than that and a minute, whatever
      // the clock of the app says.
      const until = Date.now() + HANDOFF_TTL_MS + 60_000;
      while (!stream.aborted && Date.now() < until) {
        const now = readHandoff(db, code, nowMs())?.handoff;
        const state = now?.state ?? "expired";
        if (state !== last) {
          const data: Record<string, string> = { state };
          // The account of a konto step, and its API key exactly once: whoever reads the first done gets it, nobody after.
          if (state === "done" && now?.step === "konto" && now.account) {
            data.account = now.account;
            const key = takeApiKey(db, code);
            if (key) data.api_key = key;
          }
          // A raise ends with the new limit, never with a key: the terminal has its key already.
          if (state === "done" && now?.step === "limit") data.daily_limit_usdc = String(now.dailyLimitUsdc);
          await stream.writeSSE({ event: "state", data: JSON.stringify(data) });
          last = state;
        }
        if (state !== "pending" && state !== "matched") break;
        if (Date.now() - beat >= keepAliveMs) {
          await stream.write(": keep-alive\n\n");
          beat = Date.now();
        }
        await stream.sleep(pollMs);
      }
    });
  });

  // Before /h/:code, which would take "konto.js" for a code. Only there while the account is on.
  const kontoScript = konto ? loadKontoScript() : null;
  app.get("/h/konto.js", (c) => {
    if (!kontoScript) return c.text("Not found", 404);
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    return c.body(kontoScript, 200, { "Content-Type": "text/javascript; charset=utf-8" });
  });

  app.get("/h/:code", (c) => {
    const found = readHandoff(db, c.req.param("code").toUpperCase(), nowMs());
    if (!found) return unknown(c);
    const { handoff } = found;
    if (handoff.state === "pending") {
      if (handoff.step === "limit") return konto ? limitPage(c, limitApprove(handoff), 200) : passkey(c, handoff);
      return page(c, approve(handoff), 200);
    }
    if (handoff.state === "matched") return passkey(c, handoff);
    // The script of the passkey step comes back here after done: the account exists, so the page says what `approved` says.
    if (handoff.state === "done" && handoff.step !== "confirm") return page(c, { state: "approved" }, 200);
    return page(c, { state: "invalid", reason: REASON[handoff.state] }, 410);
  });

  app.post("/h/:code", async (c) => {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const outcome = chooseHandoff(db, c.req.param("code").toUpperCase(), (form as Record<string, unknown>).pick, nowMs());
    if (outcome.kind === "unknown") return unknown(c);
    if (outcome.kind === "done") return page(c, { state: "approved" }, 200);
    if (outcome.kind === "matched") return passkey(c, outcome.handoff);
    if (outcome.kind === "wrong") return page(c, { state: "invalid", reason: "wrong" }, 410);
    const state = outcome.handoff.state;
    return page(c, { state: "invalid", reason: state === "pending" ? "used" : REASON[state] }, 410);
  });

  // The passkey step (konto 03): the page sends the smart wallet, the permission it signed and the signature. Only a matching,
  // validly signed permission ends the handoff `done`; any other burns it, as a wrong number does.
  app.post("/h/:code/konto", async (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    if (!konto) return c.json(KONTO_OFF, 503);
    const code = c.req.param("code").toUpperCase();
    const found = readHandoff(db, code, nowMs());
    if (!found) return c.json({ error: "handoff_not_found", message: "There is no such code.", docs: CONTRACT }, 404);
    const { handoff } = found;
    if (handoff.step !== "konto" || handoff.state === "pending") {
      return c.json({ error: "not_matched", message: "Tap the number shown in your terminal first.", docs: CONTRACT }, 409);
    }
    if (handoff.state !== "matched") {
      return c.json({ error: "handoff_closed", message: "This code no longer works. Start again in your terminal.", docs: CONTRACT }, 410);
    }
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const permission = parsePermission(body?.permission);
    const signature = typeof body?.signature === "string" ? (body.signature as Hex) : null;
    const now = nowMs();
    const refuse = (message: string) => {
      burnMatched(db, code, now);
      return c.json({ error: "permission_refused", message: `${message} Nothing was set up. Start again in your terminal.`, docs: CONTRACT }, 400);
    };
    if (!permission || !signature) return refuse("The request did not carry a permission and its signature.");
    const want = { account: permission.account, spender: konto.spender, token: konto.token, allowance: handoff.dailyLimitUsdc, nowSec: Math.floor(now / 1000) };
    if (typeof body?.account !== "string" || body.account.toLowerCase() !== permission.account) return refuse("The permission is not for this account.");
    if (!permissionMatches(permission, want)) return refuse("The permission is not the one this code asked for.");
    if (!(await signatureValid(konto.verifyClient, konto.chainId, permission, signature))) return refuse("The signature does not belong to this account.");
    // The passkey wallet and its group at the passkey service, kept so that a raise of the limit can ask the same passkey (konto 04).
    const owner = typeof body?.owner === "string" && /^0x[0-9a-fA-F]{40}$/.test(body.owner) ? body.owner : null;
    const organizationId = typeof body?.organization_id === "string" && /^[0-9a-zA-Z-]{1,64}$/.test(body.organization_id) ? body.organization_id : null;
    const ok = finishKonto(db, {
      code,
      account: permission.account,
      chainId: konto.chainId,
      permission,
      signature,
      name: handoff.automatonName,
      nowMs: nowMs(),
      owner,
      organizationId,
    });
    if (!ok) return c.json({ error: "handoff_closed", message: "This code no longer works. Start again in your terminal.", docs: CONTRACT }, 410);
    return c.json({ state: "done", account: permission.account }, 200);
  });

  // The passkey step of a raise (konto 04): the page sends the permission the account signed with its existing passkey. Only a
  // validly signed permission for exactly the account of the API key that asked and exactly the new limit ends the handoff `done`;
  // any other burns it, and the old permission holds as before.
  app.post("/h/:code/limit", async (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    if (!konto) return c.json(KONTO_OFF, 503);
    const code = c.req.param("code").toUpperCase();
    const found = readHandoff(db, code, nowMs());
    if (!found) return c.json({ error: "handoff_not_found", message: "There is no such code.", docs: CONTRACT }, 404);
    const { handoff } = found;
    if (handoff.step !== "limit" || handoff.state === "pending") {
      return c.json({ error: "not_matched", message: "Tap the number shown in your terminal first.", docs: CONTRACT }, 409);
    }
    if (handoff.state !== "matched" || !handoff.account) {
      return c.json({ error: "handoff_closed", message: "This code no longer works. Start again in your terminal.", docs: CONTRACT }, 410);
    }
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const permission = parsePermission(body?.permission);
    const signature = typeof body?.signature === "string" ? (body.signature as Hex) : null;
    const now = nowMs();
    const refuse = (message: string) => {
      burnMatched(db, code, now);
      return c.json({ error: "permission_refused", message: `${message} The limit stays as it was. Start again in your terminal.`, docs: CONTRACT }, 400);
    };
    if (!permission || !signature) return refuse("The request did not carry a permission and its signature.");
    const account = handoff.account as Address;
    const want = { account, spender: konto.spender, token: konto.token, allowance: handoff.dailyLimitUsdc, nowSec: Math.floor(now / 1000) };
    if (!permissionMatches(permission, want)) return refuse("The permission is not the one this code asked for.");
    const current = db.prepare("SELECT permission FROM konto_accounts WHERE address = ?").get(account) as { permission: string } | undefined;
    if (current && permissionFromJson(current.permission).salt === permission.salt) return refuse("The permission is the one the account already has.");
    if (!(await signatureValid(konto.verifyClient, konto.chainId, permission, signature))) return refuse("The signature does not belong to this account.");
    if (!finishLimit(db, { code, account, permission, signature, nowMs: nowMs() })) {
      return c.json({ error: "handoff_closed", message: "This code no longer works. Start again in your terminal.", docs: CONTRACT }, 410);
    }
    return c.json({ state: "done", account, daily_limit_usdc: String(handoff.dailyLimitUsdc) }, 200);
  });

  // The passkey step failed on the phone (cancelled, the service that creates the account not reachable, or the permission
  // refused): the script of the page sends the reason here as a form, the code is burned like after a wrong number, and the page
  // says that no account was created.
  app.post("/h/:code/fehlgeschlagen", async (c) => {
    private_(c);
    if (!konto) return c.text("Creating an account is not switched on here. Start again in your terminal.", 503);
    const code = c.req.param("code").toUpperCase();
    const found = readHandoff(db, code, nowMs());
    if (!found) return unknown(c);
    const { handoff } = found;
    if (handoff.step === "confirm" || handoff.state === "pending" || handoff.state === "done") {
      return c.text("This code is not at the passkey step. Go back to your terminal.", 409);
    }
    const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
    const reason: FailReason = typeof form.reason === "string" && form.reason in FAIL_REASONS ? (form.reason as FailReason) : "cancelled";
    burnMatched(db, code, nowMs());
    return c.html(renderKontoPage({ state: "fehlgeschlagen", reason }, deps.indexStyle()), 200);
  });
}
