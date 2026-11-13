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
import { burnMatched, finishKonto, takeApiKey } from "../konto/account.js";
import { parsePermission, permissionMatches, signatureValid } from "../konto/permission.js";
import { FAIL_REASONS, renderKontoPage, type FailReason } from "../public/konto.js";

/** What the passkey step shows: the page asks the person to create the account and to sign exactly this permission. */
export interface PasskeyView {
  code: string;
  automatonName: string;
  dailyLimitUsdc: bigint;
  chainId: number;
  spender: Address;
  token: Address;
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

  const passkey = (c: Context, h: Handoff) => {
    private_(c);
    if (!konto) return c.text("Creating an account is not switched on here. Start again in your terminal.", 503);
    const view: PasskeyView = {
      code: h.code,
      automatonName: h.automatonName,
      dailyLimitUsdc: h.dailyLimitUsdc,
      chainId: konto.chainId,
      spender: konto.spender,
      token: konto.token,
    };
    return c.html(renderKontoPage({ state: "passkey", ...view }, deps.indexStyle()), 200);
  };

  const page = (c: Context, view: HandoffPage, status: 200 | 404 | 410) => {
    private_(c);
    return c.html(renderHandoffPage(view, deps.indexStyle()), status);
  };

  const freigabe = (h: Handoff): HandoffPage => ({
    state: "freigabe",
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
    return page(c, { state: "ungueltig", reason: "unknown" }, 404);
  };

  app.post("/v1/handoff", async (c) => {
    c.header("Cache-Control", "no-store");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const automatonName = parseName(body?.automaton_name);
    const dailyLimitUsdc = parseUsdc(body?.daily_limit_usdc);
    const amountUsdc = parseUsdc(body?.amount_usdc);
    const step = body?.step === undefined ? "confirm" : body.step;
    if (!body || typeof body !== "object" || !automatonName || dailyLimitUsdc === null || amountUsdc === null || (step !== "confirm" && step !== "konto")) {
      return c.json(
        {
          error: "invalid_handoff",
          message:
            "Send JSON with automaton_name (1 to 64 characters), daily_limit_usdc and amount_usdc, both a positive whole number of " +
            'atomic USDC (6 decimals) in whole cents, as a string, and optionally step "confirm" (the default) or "konto": ' +
            '{"automaton_name":"Atlas","daily_limit_usdc":"5000000","amount_usdc":"5000000"}.',
          docs: CONTRACT,
        },
        400,
      );
    }
    if (step === "konto" && !konto) return c.json(KONTO_OFF, 503);
    const { handoff, pollToken, expiresAtMs } = createHandoff(
      db,
      { automatonName, dailyLimitUsdc, amountUsdc, step: step as HandoffStep },
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
      optional: { step: "confirm (default) or konto: konto creates an account with a passkey after the right number" },
      answer: ["code", "url", "qr", "match", "expires_at", "poll_token"],
      outcome:
        "GET /v1/handoff/{code} with Authorization: Bearer <poll_token>, as Server-Sent Events: pending, then done, burned or expired; " +
        "with step konto matched comes before done, and the first done carries account and api_key.",
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

  app.get("/h/:code", (c) => {
    const found = readHandoff(db, c.req.param("code").toUpperCase(), nowMs());
    if (!found) return unknown(c);
    const { handoff } = found;
    if (handoff.state === "pending") return page(c, freigabe(handoff), 200);
    if (handoff.state === "matched") return passkey(c, handoff);
    return page(c, { state: "ungueltig", reason: REASON[handoff.state] }, 410);
  });

  app.post("/h/:code", async (c) => {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const outcome = chooseHandoff(db, c.req.param("code").toUpperCase(), (form as Record<string, unknown>).pick, nowMs());
    if (outcome.kind === "unknown") return unknown(c);
    if (outcome.kind === "done") return page(c, { state: "erledigt" }, 200);
    if (outcome.kind === "matched") return passkey(c, outcome.handoff);
    if (outcome.kind === "wrong") return page(c, { state: "ungueltig", reason: "wrong" }, 410);
    const state = outcome.handoff.state;
    return page(c, { state: "ungueltig", reason: state === "pending" ? "used" : REASON[state] }, 410);
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
    const ok = finishKonto(db, { code, account: permission.account, chainId: konto.chainId, permission, signature, name: handoff.automatonName, nowMs: nowMs() });
    if (!ok) return c.json({ error: "handoff_closed", message: "This code no longer works. Start again in your terminal.", docs: CONTRACT }, 410);
    return c.json({ state: "done", account: permission.account }, 200);
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
    if (handoff.step !== "konto" || handoff.state === "pending" || handoff.state === "done") {
      return c.text("This code is not at the passkey step. Go back to your terminal.", 409);
    }
    const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
    const reason: FailReason = typeof form.reason === "string" && form.reason in FAIL_REASONS ? (form.reason as FailReason) : "cancelled";
    burnMatched(db, code, nowMs());
    return c.html(renderKontoPage({ state: "fehlgeschlagen", reason }, deps.indexStyle()), 200);
  });
}
