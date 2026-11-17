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
import { createHash } from "node:crypto";
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
import { parsePermission, permissionMatches, SignatureCheckUnavailable, signatureValid, type SpendPermission } from "../konto/permission.js";
import { FAIL_REASONS, renderKontoPage, type FailReason } from "../public/konto.js";
import { renderLimitPage, type LimitPage } from "../public/limit.js";
import { renderMoneyPage, type MoneyPage } from "../public/money.js";
import { BridgeError, parseIban, type Bridge } from "../konto/bridge.js";
import {
  finishPayout,
  forwarderAddress,
  forwarderFixed,
  isPayoutAddress,
  namesTarget,
  parseUsd,
  payoutPermissionMatches,
  readPayout,
  readPendingBank,
  ensurePayoutRow,
  type PayoutChain,
} from "../konto/payout.js";
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
  /**
   * The chain of the payout (goals/konto/05): balanceOf of the smart wallet and every transaction of a payout, through sendKontoTx.
   * Left out, the payout answers 503 like an account that is off.
   */
  payoutChain?: PayoutChain;
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
  /** Bridge (src/konto/bridge.ts, CP_BRIDGE_KEY_FILE); null or left out, `step: "payout"` and its page answer 503. */
  bridge?: Bridge | null;
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

/**
 * The answer when the chain could not be asked whether the signature is valid (goals/konto/05, point 7): the handoff stays
 * `matched`, nothing changed, and the page sends the same body again from /h/{code}/retry, without a second passkey.
 */
export const SIGNATURE_CHECK_UNAVAILABLE = {
  error: "signature_check_unavailable",
  message: "The signature could not be checked just now. Nothing changed; send the same request again.",
  docs: CONTRACT,
};

/** signatureValid, with a failure of the transport as its own answer instead of an exception. */
async function checkSignature(konto: KontoDeps, permission: SpendPermission, signature: Hex): Promise<boolean | "unavailable"> {
  try {
    return await signatureValid(konto.verifyClient, konto.chainId, permission, signature);
  } catch (err) {
    if (err instanceof SignatureCheckUnavailable) return "unavailable";
    throw err;
  }
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

  const bridge = deps.bridge ?? null;
  const PAYOUT_OFF = {
    error: "payout_unavailable",
    message: "Payouts to a bank account are not switched on here yet.",
    docs: CONTRACT,
  };
  const moneyPage = (c: Context, view: MoneyPage, status: 200 | 400 = 200) => {
    private_(c);
    return c.html(renderMoneyPage(view, deps.indexStyle()), status);
  };
  /** The passkey wallet and its group of an account, which the money steps sign and pay with; neither is a secret. */
  const accountOf = (address: string) =>
    (db.prepare("SELECT owner, organization_id FROM konto_accounts WHERE address = ?").get(address) as
      | { owner: string | null; organization_id: string | null }
      | undefined) ?? { owner: null, organization_id: null };
  /**
   * The codes whose page showed the identity step of Bridge, so that bank and passkey step count three steps; a person Bridge
   * had checked before sees two (note of the Design Reviewer). Only the counter on the page hangs on it, so memory is enough:
   * after a restart within the ten minutes of a code the page counts two steps for it. Entries go after the life of a code.
   */
  const showedVerify = new Map<string, number>();
  const stepsOf = (code: string): 2 | 3 => {
    const cutoff = nowMs() - 3_600_000;
    for (const [k, at] of showedVerify) if (at < cutoff) showedVerify.delete(k);
    return showedVerify.has(code) ? 3 : 2;
  };
  /** The address the person gives Bridge for the identity check: one per account on our own domain, because we hold no email. */
  const payoutEmail = (address: string) => `payout-${address.slice(2, 18)}@postyourprice.com`;

  /**
   * The step of a matched payout handoff (goals/konto/05, decision 3): the identity check at Bridge until Bridge reports
   * `approved` (skipped for a customer already approved), then the bank account, then the passkey with the forwarder as spender.
   */
  const payoutStep = async (c: Context, h: Handoff) => {
    private_(c);
    if (!konto || !bridge) return c.text("Payouts are not switched on here. Start again in your terminal.", 503);
    const account = h.account ?? "";
    const bank = readPendingBank(db, h.code);
    if (bank) {
      const row = accountOf(account);
      return moneyPage(c, {
        state: "payout-passkey",
        code: h.code,
        automatonName: h.automatonName,
        bankLast4: bank.bank_last4,
        chainId: konto.chainId,
        spender: bank.forwarder,
        token: konto.token,
        account,
        owner: row.owner ?? "",
        organizationId: row.organization_id ?? "",
        steps: stepsOf(h.code),
      });
    }
    ensurePayoutRow(db, account, nowMs());
    const payout = readPayout(db, account)!;
    if (!payout.kyc_approved) {
      try {
        const link = payout.kyc_link_id
          ? await bridge.getKycLink(payout.kyc_link_id)
          : await bridge.createKycLink({ email: payoutEmail(account), idempotencyKey: `kyc-link-${account}` });
        const approved = link.kycStatus === "approved" ? 1 : 0;
        db.prepare("UPDATE konto_payouts SET kyc_link_id = ?, bridge_customer_id = COALESCE(?, bridge_customer_id), kyc_approved = ?, updated_at = ? WHERE address = ?").run(
          link.id,
          link.customerId,
          approved,
          nowMs(),
          account,
        );
        if (!approved) {
          showedVerify.set(h.code, nowMs());
          return moneyPage(c, { state: "payout-verify", code: h.code, automatonName: h.automatonName, kycLink: link.kycLink });
        }
      } catch (err) {
        if (!(err instanceof BridgeError)) throw err;
        return c.text("Bridge could not be reached just now. Reload this page in a minute.", 502);
      }
    }
    return moneyPage(c, { state: "payout-bank", code: h.code, automatonName: h.automatonName, steps: stepsOf(h.code) });
  };

  /** The page of a matched handoff: the passkey step of konto and limit, the card of a deposit, the next step of a payout. */
  const matchedPage = async (c: Context, h: Handoff) => {
    if (h.step === "payout") return payoutStep(c, h);
    if (h.step === "deposit") {
      private_(c);
      if (!konto) return c.text("Accounts are not switched on here. Start again in your terminal.", 503);
      const row = accountOf(h.account ?? "");
      return moneyPage(c, {
        state: "deposit-card",
        code: h.code,
        automatonName: h.automatonName,
        amountUsdc: h.amountUsdc,
        address: h.account ?? "",
        chainId: konto.chainId,
        organizationId: row.organization_id ?? "",
        owner: row.owner ?? "",
      });
    }
    return passkey(c, h);
  };

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

  /** The answer of POST /v1/handoff for a created handoff. */
  const created = (c: Context, r: ReturnType<typeof createHandoff>) => {
    const url = `${siteOrigin()}/h/${r.handoff.code}`;
    return c.json(
      { code: r.handoff.code, url, qr: qrText(url), match: r.handoff.match, expires_at: new Date(r.expiresAtMs).toISOString(), poll_token: r.pollToken },
      201,
    );
  };

  /**
   * `step: "deposit"` and `step: "payout"` (goals/konto/05): both need the API key of an account and take no target. The target of
   * a deposit is the smart wallet of the key's account, set by the server on the page; that of a payout the bank account the
   * person enters on the phone.
   */
  const moneyHandoff = async (c: Context, body: Record<string, unknown>) => {
    const step = body.step as "deposit" | "payout";
    const refuse = (message: string) => c.json({ error: "invalid_handoff", message, docs: CONTRACT }, 400);
    if (namesTarget(body)) return refuse("Money goes only to the account of your API key or to the bank account set up on your phone. Leave out every address.");
    const automatonName = parseName(body.automaton_name);
    if (!automatonName) return refuse("Send automaton_name, 1 to 64 characters.");
    const amountUsdc = step === "deposit" ? parseUsd(body.amount_usd) : 0n;
    if (amountUsdc === null) return refuse('Send amount_usd, dollars as a string like "20.00".');
    if (!konto) return c.json(KONTO_OFF, 503);
    if (step === "payout" && (!bridge || !konto.payoutChain)) return c.json(PAYOUT_OFF, 503);
    const address = resolveApiKey(db, c.req.header("authorization"));
    if (!address) {
      return c.json({ error: "unauthorized", message: `step "${step}" moves money of an account: send its API key as Authorization: Bearer <key>.`, docs: CONTRACT }, 401);
    }
    const account = address.toLowerCase();
    if (!db.prepare("SELECT 1 FROM konto_accounts WHERE address = ?").get(account)) {
      return c.json({ error: "no_account", message: "This API key belongs to no account. Create one with step konto first.", docs: CONTRACT }, 404);
    }
    return created(c, createHandoff(db, { automatonName, dailyLimitUsdc: 0n, amountUsdc, step, account }, nowMs(), deps.random));
  };

  app.post("/v1/handoff", async (c) => {
    c.header("Cache-Control", "no-store");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && typeof body === "object" && (body.step === "deposit" || body.step === "payout")) return moneyHandoff(c, body);
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
          // A deposit and a payout end with the state alone; a payout adds the last four characters of the IBAN it pays to.
          if (state === "done" && now?.step === "payout" && now.account) {
            const last4 = readPayout(db, now.account)?.bank_last4;
            if (last4) data.bank_last4 = last4;
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
      if (handoff.step === "deposit") {
        return moneyPage(c, { state: "deposit-approve", automatonName: handoff.automatonName, amountUsdc: handoff.amountUsdc, choices: handoff.choices });
      }
      if (handoff.step === "payout") return moneyPage(c, { state: "payout-approve", automatonName: handoff.automatonName, choices: handoff.choices });
      return page(c, approve(handoff), 200);
    }
    if (handoff.state === "matched") return matchedPage(c, handoff);
    // The script of the passkey step comes back here after done: the account exists, so the page says what `approved` says.
    if (handoff.state === "done" && handoff.step !== "confirm") return page(c, { state: "approved" }, 200);
    return page(c, { state: "invalid", reason: REASON[handoff.state] }, 410);
  });

  app.post("/h/:code", async (c) => {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const outcome = chooseHandoff(db, c.req.param("code").toUpperCase(), (form as Record<string, unknown>).pick, nowMs());
    if (outcome.kind === "unknown") return unknown(c);
    if (outcome.kind === "done") return page(c, { state: "approved" }, 200);
    if (outcome.kind === "matched") return matchedPage(c, outcome.handoff);
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
    const checked = await checkSignature(konto, permission, signature);
    if (checked === "unavailable") return c.json(SIGNATURE_CHECK_UNAVAILABLE, 503);
    if (!checked) return refuse("The signature does not belong to this account.");
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
    const checked = await checkSignature(konto, permission, signature);
    if (checked === "unavailable") return c.json(SIGNATURE_CHECK_UNAVAILABLE, 503);
    if (!checked) return refuse("The signature does not belong to this account.");
    if (!finishLimit(db, { code, account, permission, signature, nowMs: nowMs() })) {
      return c.json({ error: "handoff_closed", message: "This code no longer works. Start again in your terminal.", docs: CONTRACT }, 410);
    }
    return c.json({ state: "done", account, daily_limit_usdc: String(handoff.dailyLimitUsdc) }, 200);
  });

  // The passkey step failed on the phone (cancelled, the service that creates the account not reachable, or the permission
  // refused): the script of the page sends the reason here as a form, the code is burned like after a wrong number, and the page
  // says that no account was created.
  app.post("/h/:code/failed", async (c) => {
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
    return c.html(renderKontoPage({ state: "failed", reason }, deps.indexStyle()), 200);
  });

  // goals/konto/05, point 7: after a 503 signature_check_unavailable the script of the page keeps what it sent and comes here; the
  // one button sends the same body to the same route again, without a second passkey.
  app.get("/h/:code/retry", (c) => {
    const found = readHandoff(db, c.req.param("code").toUpperCase(), nowMs());
    if (!found) return unknown(c);
    const { handoff } = found;
    if (handoff.state === "matched" && (handoff.step === "konto" || handoff.step === "limit" || handoff.step === "payout")) {
      return moneyPage(c, { state: "retry", code: handoff.code, automatonName: handoff.automatonName });
    }
    if (handoff.state === "done" && handoff.step !== "confirm") return page(c, { state: "approved" }, 200);
    if (handoff.state === "pending") return page(c, { state: "invalid", reason: "used" }, 410);
    return page(c, { state: "invalid", reason: REASON[handoff.state] }, 410);
  });

  /** A matched handoff of `step`, or the answer that says why not, for the JSON routes of the money steps. */
  const matchedOf = (c: Context, step: "deposit" | "payout"): Handoff | Response => {
    const found = readHandoff(db, c.req.param("code")!.toUpperCase(), nowMs());
    if (!found) return c.json({ error: "handoff_not_found", message: "There is no such code.", docs: CONTRACT }, 404);
    const { handoff } = found;
    if (handoff.step !== step || handoff.state === "pending") {
      return c.json({ error: "not_matched", message: "Tap the number shown in your terminal first.", docs: CONTRACT }, 409);
    }
    if (handoff.state !== "matched" || !handoff.account) {
      return c.json({ error: "handoff_closed", message: "This code no longer works. Start again in your terminal.", docs: CONTRACT }, 410);
    }
    return handoff;
  };

  // The deposit (goals/konto/05, decision 6): the script of the page reports that the card payment opened, with the address the
  // server set on the page; the handoff is then done. A body that names an address is refused, because only the server sets it.
  app.post("/h/:code/deposit", async (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    if (!konto) return c.json(KONTO_OFF, 503);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (namesTarget(body)) {
      return c.json({ error: "invalid_deposit", message: "The money goes to the account set on this page; send no address.", docs: CONTRACT }, 400);
    }
    const h = matchedOf(c, "deposit");
    if (h instanceof Response) return h;
    if (body?.opened !== true) return c.json({ error: "invalid_deposit", message: 'Send {"opened":true} once the card payment opened.', docs: CONTRACT }, 400);
    const changed = db.prepare("UPDATE handoffs SET state = 'done', updated_at = ? WHERE code = ? AND state = 'matched'").run(nowMs(), h.code).changes;
    if (changed !== 1) return c.json({ error: "handoff_closed", message: "This code no longer works. Start again in your terminal.", docs: CONTRACT }, 410);
    return c.json({ state: "done" }, 200);
  });

  /** A matched payout handoff for the form posts of its page, or the page that says why not. */
  const payoutForm = (c: Context): Handoff | Response => {
    const found = readHandoff(db, c.req.param("code")!.toUpperCase(), nowMs());
    if (!found) return unknown(c);
    const { handoff } = found;
    if (handoff.step !== "payout" || handoff.state === "pending") {
      private_(c);
      return c.text("Tap the number shown in your terminal first.", 409);
    }
    if (handoff.state !== "matched" || !handoff.account) return page(c, { state: "invalid", reason: REASON[handoff.state as Exclude<HandoffState, "pending">] ?? "used" }, 410);
    return handoff;
  };

  // The identity step: the button on the page asks Bridge again, as a reload of /h/{code} does; only `approved` moves on.
  app.post("/h/:code/payout-verify", async (c) => {
    if (!konto || !bridge) return c.text("Payouts are not switched on here. Start again in your terminal.", 503);
    const h = payoutForm(c);
    if (h instanceof Response) return h;
    return payoutStep(c, h);
  });

  // The bank step: IBAN (checked with mod 97) and account holder. Bridge gets the bank account and a payout address for USDC on
  // Base to SEPA in euros; the row keeps their IDs, the address and the last four characters of the IBAN, never the IBAN.
  app.post("/h/:code/payout-bank", async (c) => {
    if (!konto || !bridge) return c.text("Payouts are not switched on here. Start again in your terminal.", 503);
    const h = payoutForm(c);
    if (h instanceof Response) return h;
    const account = h.account!;
    const payout = readPayout(db, account);
    if (!payout?.kyc_approved || !payout.bridge_customer_id) return payoutStep(c, h);
    const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
    const again = (error: string) => moneyPage(c, { state: "payout-bank", code: h.code, automatonName: h.automatonName, error, steps: stepsOf(h.code) }, 400);
    const iban = parseIban(form.iban);
    if (!iban) return again("This IBAN is not valid. Check it and try again.");
    const ownerName = typeof form.owner_name === "string" ? form.owner_name.trim() : "";
    if (ownerName.length < 2 || ownerName.length > 100 || /[\u0000-\u001f\u007f]/.test(ownerName)) return again("Enter the name on the bank account.");
    let destination: string;
    let externalAccountId: string;
    let liquidationAddressId: string;
    try {
      // The keys follow from what is asked, so a retry of the same form gets the objects of the first try.
      const ext = await bridge.createExternalAccount(payout.bridge_customer_id, {
        iban: iban.iban,
        country: iban.country,
        ownerName,
        idempotencyKey: `external-account-${h.code}-${createHash("sha256").update(`${iban.iban}|${ownerName}`).digest("hex").slice(0, 16)}`,
      });
      const liq = await bridge.createLiquidationAddress(payout.bridge_customer_id, { externalAccountId: ext.id, idempotencyKey: `liquidation-address-${ext.id}` });
      if (!isPayoutAddress(liq.address)) throw new BridgeError("/v0/customers/{id}/liquidation_addresses", 201);
      destination = liq.address.toLowerCase();
      externalAccountId = ext.id;
      liquidationAddressId = liq.id;
    } catch (err) {
      if (!(err instanceof BridgeError)) throw err;
      private_(c);
      return c.text("Bridge could not set up this bank account just now. Go back and try again in a minute.", 502);
    }
    const forwarder = forwarderAddress(account as Address, destination as Address, forwarderFixed(konto)).toLowerCase();
    db.prepare(
      `INSERT INTO payout_handoffs (code, address, external_account_id, liquidation_address_id, destination, bank_last4, forwarder, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET external_account_id = excluded.external_account_id,
       liquidation_address_id = excluded.liquidation_address_id, destination = excluded.destination, bank_last4 = excluded.bank_last4,
       forwarder = excluded.forwarder`,
    ).run(h.code, account, externalAccountId, liquidationAddressId, destination, iban.last4, forwarder, nowMs());
    return payoutStep(c, h);
  });

  // The passkey step of a payout: the page sends the second permission, signed with the existing passkey. Only a validly signed
  // permission for exactly this account, the forwarder of the bank step, USDC, no cap and no end ends the handoff `done`; any other
  // burns it. A chain that cannot be asked answers 503 and the handoff stays matched (point 7).
  app.post("/h/:code/payout", async (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    if (!konto) return c.json(KONTO_OFF, 503);
    if (!bridge) return c.json(PAYOUT_OFF, 503);
    const h = matchedOf(c, "payout");
    if (h instanceof Response) return h;
    const bank = readPendingBank(db, h.code);
    if (!bank) return c.json({ error: "bank_missing", message: "Enter the bank account on this page first.", docs: CONTRACT }, 409);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const permission = parsePermission(body?.permission);
    const signature = typeof body?.signature === "string" ? (body.signature as Hex) : null;
    const now = nowMs();
    const refuse = (message: string) => {
      burnMatched(db, h.code, now);
      return c.json({ error: "permission_refused", message: `${message} Nothing was set up. Start again in your terminal.`, docs: CONTRACT }, 400);
    };
    if (!permission || !signature) return refuse("The request did not carry a permission and its signature.");
    const want = { account: h.account!, forwarder: bank.forwarder, token: konto.token, nowSec: Math.floor(now / 1000) };
    if (!payoutPermissionMatches(permission, want)) return refuse("The permission is not the one this code asked for.");
    const current = readPayout(db, h.account!);
    if (current?.permission && permissionFromJson(current.permission).salt === permission.salt) return refuse("The permission is the one the account already has.");
    const checked = await checkSignature(konto, permission, signature);
    if (checked === "unavailable") return c.json(SIGNATURE_CHECK_UNAVAILABLE, 503);
    if (!checked) return refuse("The signature does not belong to this account.");
    if (!finishPayout(db, { code: h.code, account: h.account!, permission, signature, nowMs: nowMs() })) {
      return c.json({ error: "handoff_closed", message: "This code no longer works. Start again in your terminal.", docs: CONTRACT }, 410);
    }
    return c.json({ state: "done", bank_last4: bank.bank_last4 }, 200);
  });
}
