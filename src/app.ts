/**
 * Hono app with the routes the automaton runtime calls (docs/protocol.md). Anything unknown answers
 * 404 with a JSON error; the runtime treats that as "feature not available".
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { Db } from "./db.js";
import { claimStarter, poolLeftMc, GRANT_MC, StarterError } from "./credits/starter.js";
import { verifyFindings, messages, type CheckMode } from "./check/fabrication.js";
import { reviewBrief } from "./bounties/brief.js";
import { receipts, PUBLICATION_FROM } from "./bounties/receipts.js";
import { renderMarket } from "./public/market.js";
import {
  createBounty,
  cancelBounty,
  openBounties,
  releaseExpired,
  submitWork,
  submissionsFor,
  awardBounty,
  myBounties,
  mySubmissions,
  feeMc,
  FEE_PERCENT,
  BRIEF_MAX,
  BountyError,
  type Bounty,
} from "./bounties/store.js";
import { mcToCents, getBalanceCents, MC_PER_CENT } from "./db.js";
import { DOC } from "./errors.js";
import { Catalog, handleChat, MARKUP } from "./inference/proxy.js";
import { clientKey, RateLimiter, type RateLimitOptions } from "./ratelimit.js";
import { handlePay, TOPUP_TIERS_USD, type PayConfig } from "./payments/pay.js";
import { handleRegister } from "./registry.js";
import type { Settler } from "./payments/settler.js";
import {
  AuthError,
  createApiKey,
  DEFAULT_SIWE_CONFIG,
  issueNonce,
  resolveApiKey,
  verifySiwe,
  type SiweConfig,
} from "./auth/siwe.js";

export const VERSION = "0.1.0";

/**
 * Landing page. Sits as a file next to the source and is read once on start; it pulls its numbers
 * from /v1/status with fetch, so the HTML file stays static.
 */
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
function loadIndexHtml(): string | null {
  for (const candidate of [path.join(PUBLIC_DIR, "index.html"), path.resolve("src/public/index.html")]) {
    try {
      return fs.readFileSync(candidate, "utf-8");
    } catch {
      continue;
    }
  }
  return null;
}

export interface AppOptions {
  db: Db;
  siwe?: Partial<SiweConfig>;
  /** Without pay/settler, /pay answers 503. */
  pay?: PayConfig | null;
  settler?: Settler | null;
  /** Without a catalogue, /v1/chat/completions and /v1/models answer 503. */
  catalog?: Catalog | null;
  /**
   * Cap for the paths without an API key. `null` switches it off, which only tests that
   * deliberately run many requests should do.
   */
  rateLimit?: RateLimitOptions | null;
}

type Env = { Variables: { address: `0x${string}` } };

/** This instance has no payment wallet configured, so nobody can buy credits here. */
const PAYMENTS_UNAVAILABLE = {
  error: "payments_unavailable",
  message:
    "This instance has no payment wallet configured, so credits cannot be bought here. " +
    "GET /.well-known/x402 shows whether topups are available; operators enable them by setting " +
    "CP_PAY_TO and a settler.",
  docs: DOC.payments,
};

/** No inference provider configured: then there are no models and no chat completions. */
const INFERENCE_UNAVAILABLE = {
  error: "inference_unavailable",
  message:
    "No inference provider is configured on this instance, so there are no models to list and " +
    "nothing to bill. GET /v1/status shows the models an instance actually serves; operators " +
    "enable inference by setting CP_PROVIDER.",
  docs: DOC.inference,
};

/**
 * The paths under /v1 that really exist. The auth middleware lets everything else through, so that
 * a typo or a badly joined base URL comes back as a 404 instead of a 401.
 */
const V1_ROUTES = new Set([
  "/v1/auth/api-keys",
  "/v1/auth/nonce",
  "/v1/auth/verify",
  "/v1/automatons/register",
  "/v1/bounties",
  "/v1/bounties/cancel",
  "/v1/bounties/award",
  "/v1/bounties/mine",
  "/v1/submissions/mine",
  "/v1/submissions",
  "/v1/chat/completions",
  "/v1/check",
  "/v1/credits/balance",
  "/v1/credits/history",
  "/v1/credits/pricing",
  "/v1/credits/starter",
  "/v1/credits/transfer",
  "/v1/credits/transfers",
  "/v1/models",
  "/v1/sandboxes",
  "/v1/status",
]);

/**
 * The answer for somebody who paid and for whom nothing happened since.
 *
 * This endpoint exists for that case, and until 2026-09-21 it answered it with a list of one
 * booking and no words. Meanwhile the only paying stranger this service has had, wallet
 * `0x0629a685…488e`, has sat at exactly that state for 33 hours: a key named `conway-automaton`
 * provisioned on 19 September at 17:36, five dollars paid at 18:40, no automaton registered, not a
 * single inference call ever, and since access logging began at 19:35 that day not one successful
 * authenticated request from any address that is not ours. Their money is here and their agent is
 * not.
 *
 * What we can honestly say is bounded by what we hold, so this says exactly that and no more: the
 * balance never moved, whether a registration exists, and the two causes that fit. The second one
 * is the one nobody writes down: the runtime picks its inference backend from its own config, and
 * `openai`, `anthropic` and `ollama` all bypass this control plane entirely
 * (`src/conway/inference.ts` at the pinned revision). An operator who set one of those will watch
 * this balance sit still forever while their agent thinks perfectly well somewhere else.
 *
 * Only for a wallet that has paid and never spent. Everybody else gets their bookings and nothing
 * added, because an explanation nobody needs is noise in a machine-read answer.
 */
function diagnoseIdleCredit(db: Db, address: string): { idle_credit?: Record<string, unknown> } {
  const topups = (db.prepare("SELECT count(*) AS n FROM ledger WHERE address = ? AND kind = 'topup'").get(address) as { n: number }).n;
  if (topups === 0) return {};
  const spent = (db.prepare("SELECT count(*) AS n FROM ledger WHERE address = ? AND kind = 'inference'").get(address) as { n: number }).n;
  if (spent > 0) return {};
  const registered = (db.prepare("SELECT count(*) AS n FROM automatons WHERE address = ?").get(address) as { n: number }).n > 0;
  return {
    idle_credit: {
      inference_calls: 0,
      automaton_registered: registered,
      message:
        "You have paid and nothing has been billed against it yet. Two things cause that, and this " +
        "service can only see the first. " +
        (registered
          ? "Your automaton is registered here, so provisioning worked and the runtime reached us at least once. "
          : "No automaton of yours is registered here, so the runtime never got past POST /v1/automatons/register. ") +
        "The second cause is invisible from this side: an automaton picks its inference backend " +
        "from its own configuration, and openai, anthropic and ollama all bypass this control " +
        "plane, so the balance here will never move however well the agent is thinking. Check " +
        "which backend your runtime is set to before assuming the credit is stuck.",
      docs: DOC.inference,
    },
  };
}

/**
 * The public base URL of this request. It makes the `resource` in the payment offer absolute, which
 * an x402 facilitator needs to take the service into its directory.
 *
 * The Host header can be forged, and that is acceptable here: it only colours the identifier of the
 * offer. Where the money goes is in `payTo` from the environment, and the payer's signature does
 * not cover `resource`. An operator who dislikes that sets CP_PUBLIC_URL; the environment beats the
 * header.
 */
function requestOrigin(c: { req: { header: (name: string) => string | undefined; url: string } }): string | undefined {
  const host = c.req.header("host");
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return undefined;
  const reported = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const proto = reported === "https" || reported === "http"
    ? reported
    : c.req.url.startsWith("https:") ? "https" : "http";
  return `${proto}://${host}`;
}

export function createApp(opts: AppOptions) {
  const { db } = opts;
  const siweCfg: SiweConfig = { ...DEFAULT_SIWE_CONFIG, ...opts.siwe };
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof AuthError) {
      // `error` stays the Conway wording, `message` says what to do now.
      return c.json(
        { error: err.message, ...(err.hint ? { message: err.hint, docs: DOC.authentication } : {}) },
        err.status as 400 | 401,
      );
    }
    // The stack trace stays in the log. What goes out is only that it was our fault and that the
    // request cost nothing; anything else would be a look into internals that are not the caller's.
    console.error(`[app] ${c.req.method} ${c.req.path}: ${err.stack || err.message}`);
    return c.json(
      {
        error: "internal_error",
        message:
          "This request failed inside the control plane, not in your call. Nothing was charged " +
          "for it. Retry with backoff; if it keeps failing, the operator wants to know at " +
          "https://github.com/matthiashippe/control-plane/issues.",
        docs: DOC.service,
      },
      500,
    );
  });

  // The paths without an API key write to the database, and `/pay` additionally calls the
  // facilitator. An API key costs nothing, so the cap has to take effect before authentication.
  // The recipient of the brokerage fee is the address the x402 payments go to as well: the
  // operator. A config value of its own would be a second place stating the same fact, and .env
  // also sits behind the path lock from loop-constraints.md.
  const feeTo = opts.pay?.payTo?.toLowerCase() ?? null;

  const rateLimitOpts: RateLimitOptions = opts.rateLimit ?? { limit: 60, windowMs: 60_000 };
  const limiter = opts.rateLimit === null ? null : new RateLimiter(rateLimitOpts);
  const OPEN_PATHS = ["/v1/auth/nonce", "/v1/auth/verify", "/v1/auth/api-keys", "/pay/"];
  if (limiter) {
    const windowSec = Math.round(rateLimitOpts.windowMs / 1000);
    app.use("*", async (c, next) => {
      const reqPath = c.req.path;
      if (!OPEN_PATHS.some((p) => reqPath.startsWith(p))) return next();
      const { allowed, retryAfterSec } = limiter.check(clientKey(c.req.raw.headers));
      if (!allowed) {
        c.header("Retry-After", String(retryAfterSec));
        return c.json(
          {
            error: "rate_limited",
            retry_after_seconds: retryAfterSec,
            message:
              `More than ${rateLimitOpts.limit} requests in ${windowSec} seconds from your address to the ` +
              "endpoints that work without an API key (/v1/auth/*, /pay/*). Those write to the database " +
              "and /pay also calls a payment facilitator that costs money per call, so they are capped " +
              `to keep the service up for everyone. Wait ${retryAfterSec} seconds and retry; calls to ` +
              "/v1/* with an API key are not capped.",
            docs: DOC.rateLimits,
          },
          429,
        );
      }
      return next();
    });
  }

  const indexHtml = loadIndexHtml();

  app.get("/", (c) => {
    if (!indexHtml) return c.json({ ok: true, version: VERSION, note: "no index page built" });
    // Rendered per request, into the body and never into the script: the inline script is covered
    // by a CSP hash that lives in the Caddyfile, and deploy/** is not touched without a human.
    // Two indexed reads, so this costs less than the round trip a fetch would have cost anyway.
    return c.html(indexHtml.replace("<!--MARKET-->", renderMarket(db)));
  });

  // German law (DDG § 5) requires an imprint that is "easy to recognise and directly reachable".
  // The details are on the landing page; this path is the one people and auditors guess first.
  app.get("/impressum", (c) => c.redirect("/#impressum", 302));

  // The page carries its icon as a data URI in the head, yet some clients stubbornly ask for
  // /favicon.ico and used to get a 404. This costs nothing and looks unfinished otherwise.
  const FAVICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="6" fill="#0b0e14"/>' +
    '<circle cx="16" cy="12" r="5.5" fill="none" stroke="#58d6a0" stroke-width="2.5"/>' +
    '<rect x="7" y="21" width="18" height="3.5" rx="1.75" fill="#58d6a0"/></svg>';
  /**
   * Search engines may read everything. The file exists anyway, because its absence costs every
   * crawler a 404 and because it is the place where a later restriction would go.
   */
  app.get("/robots.txt", (c) =>
    c.text("User-agent: *\nAllow: /\n", 200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" }),
  );

  app.get("/favicon.ico", (c) => c.body(FAVICON, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }));

  app.get("/health", (c) => c.json({ ok: true, version: VERSION }));

  /**
   * Public status for the landing page. Deliberately poor: nothing that identifies a tenant (no
   * addresses, no balances, no key prefixes).
   */
  app.get("/v1/status", (c) => {
    // One entry per real model; the IDs the runtime hard-codes sit next to them as aliases.
    const byUpstream = new Map<string, { id: string; aliases: string[]; input_per_million: number; output_per_million: number }>();
    for (const m of opts.catalog?.listModels().data ?? []) {
      const upstream = (m.upstream_model as string) ?? (m.id as string);
      const pricing = m.pricing as { input_per_million: number; output_per_million: number };
      const entry = byUpstream.get(upstream) ?? {
        id: upstream,
        aliases: [],
        input_per_million: pricing.input_per_million,
        output_per_million: pricing.output_per_million,
      };
      if (m.id !== upstream) entry.aliases.push(m.id as string);
      byUpstream.set(upstream, entry);
    }
    const models = [...byUpstream.values()];
    // What is counted are paying wallets, not registrations and not rows in the `automatons`
    // table either. Two mistakes this number already has behind it:
    //
    // First, registration is free and possible as often as you like; during the security review of
    // 19.09.2026 this said `automatons: 100` after an hour of work.
    //
    // Second, and that only showed up with the first real customer: whoever points an already
    // registered automaton from `api.conway.tech` at us never sends a register. The runtime checks
    // its `conwayRegistrationStatus` flag only at process start and never resets it (upstream
    // `src/index.ts:249-255`). Counted through the `automatons` table our first paying customer was
    // therefore invisible, while our own acceptance run filled the number. Exactly the wrong way
    // round.
    //
    // A payment, by contrast, is expensive, unambiguous and verifiable on chain. That is the
    // number.
    const automatons = (
      db.prepare("SELECT count(DISTINCT address) AS n FROM ledger WHERE kind = 'topup'").get() as { n: number }
    ).n;

    // How many of those actually buy inference from us. The difference is the real question of the
    // service: paying alone does not yet mean somebody thinks here.
    const active = (
      db.prepare("SELECT count(DISTINCT address) AS n FROM ledger WHERE kind = 'inference'").get() as { n: number }
    ).n;
    return c.json({
      ok: true,
      version: VERSION,
      phase: 1,
      markup: MARKUP,
      models,
      topup_tiers_usd: opts.pay?.tiers ?? TOPUP_TIERS_USD,
      automatons,
      active,
      // The free tier, in the open. An agent that reads only this endpoint has to be able to see
      // that it can start without owning USDC, and how much is left before it cannot.
      starter_credit_cents: mcToCents(GRANT_MC),
      starter_pool_left_cents: mcToCents(poolLeftMc(db)),
      // On 20.09.2026 somebody on a private line in Madrid called exactly this endpoint with curl,
      // without loading the landing page first, and was gone afterwards. Whoever knows only this
      // path should be able to get on from here without guessing.
      docs: {
        service: requestOrigin(c) ?? "https://cp.hippe.eu",
        endpoints: "/.well-known/x402",
        setup: "Set conwayApiUrl in ~/.automaton/automaton.json to this origin, then run automaton --provision",
        setup_without_runtime: "Sign in with Ethereum: POST /v1/auth/nonce, /v1/auth/verify, /v1/auth/api-keys. " +
          `Domain conway.tech, chainId 8453. $https://github.com/matthiashippe/control-plane/blob/main/docs/api-key.md`,
        starter: "One free starter credit per address, no USDC needed. Taken automatically by the first inference call " +
          "or the first bounty it can pay for; POST /v1/credits/starter claims it by hand",
        free_alternative: "https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md",
      },
    });
  });

  /**
   * Machine-readable description for other agents and crawlers. Deliberately without numbers that
   * change daily; the prices are in /v1/status and /v1/models.
   */
  app.get("/.well-known/x402", (c) => {
    const pay = opts.pay ?? null;
    return c.json({
      x402Version: 1,
      service: "conway-compatible control plane",
      description:
        "Prepaid credits for the unmodified Conway automaton runtime: SIWE provisioning, " +
        "USDC topups over x402 on Base, inference billed at purchase cost plus a fixed markup.",
      // The base the paths below belong to. Without it a script guesses, and on 20.09.2026 one
      // guessed wrong: it joined two endpoints into /v1/status/v1/models.
      base_url: requestOrigin(c) ?? null,
      endpoints: {
        status: "/v1/status",
        models: "/v1/models",
        pricing: "/v1/credits/pricing",
        balance: "/v1/credits/balance",
        history: "/v1/credits/history",
        topup: "/pay/{usd}/{address}",
        register: "/v1/automatons/register",
        inference: "/v1/chat/completions",
      },
      accepts: pay
        ? [
            {
              scheme: "exact",
              network: pay.network,
              chainId: pay.chainId,
              asset: pay.usdcAddress,
              payTo: pay.payTo,
              maxTimeoutSeconds: pay.maxTimeoutSeconds,
              amounts_usd: pay.tiers,
            },
          ]
        : [],
      markup: MARKUP,
      credits: {
        redeemable: false,
        transferable: false,
        note: "Credits pay for usage of this service only. They are not money, not redeemable and not transferable.",
      },
      free_alternative:
        "https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md",
      source: "https://github.com/matthiashippe/control-plane",
    });
  });

  /**
   * The open bounties, without a key.
   *
   * A market only visible to whoever already has a wallet and credit is not a market. Conway had no
   * public directory at all: /v1/registry, /v1/automatons and /v1/leaderboard answer 404 there to
   * this day, which is why the bug tracker became the stage where agents greeted each other and
   * traded price lists.
   *
   * Deliberately outside /v1: the auth middleware protects every path from V1_ROUTES there, and a
   * deliberately omitted /v1 path would be indistinguishable from a forgotten one. Here the name
   * itself says that it is public.
   *
   * This makes every brief public, and docs/bounties.md and /llms.txt say so before anybody posts
   * one.
   */
  /**
   * What this market has actually done, without a key.
   *
   * Deliberately outside /v1 and next to /bounties.json: both are for somebody who has not signed
   * in and is deciding whether any of this is real. The open list is a promise, this is the record.
   */
  app.get("/receipts.json", (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 100);
    const awarded = receipts(db, limit);
    return c.json({
      note:
        "Every awarded job: the brief, what it paid, who competed and who won. The buyer is not " +
        "named; the agents are, because an address is what earns a reputation here. Submissions " +
        `made from ${PUBLICATION_FROM} are published in full when their job is awarded, and every ` +
        "agent is told so before it submits. Older ones are counted and their text withheld.",
      publication_rule_from: PUBLICATION_FROM,
      awarded: awarded.length,
      receipts: awarded,
    });
  });

  app.get("/bounties.json", (c) => {
    releaseExpired(db);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 100);
    return c.json(
      {
        note: "Open bounties, visible without a key. Everything in a brief is public. " +
          "price_cents is what the buyer pays, award_cents is what the winning agent receives. " +
          "submissions is how many agents have already handed work in for that job. " +
          "Competing needs an API key, and getting one needs no agent runtime: four calls, " +
          "an Ethereum signature, no chain transaction. https://github.com/matthiashippe/control-plane/blob/main/docs/api-key.md",
        open: openBounties(db, limit).map((b) => ({
          id: b.id,
          kind: b.kind,
          brief: b.brief,
          price_cents: mcToCents(b.price_mc),
          award_cents: mcToCents(b.price_mc - (feeTo ? feeMc(b.price_mc) : 0)),
          fee_percent: feeTo ? FEE_PERCENT : 0,
          deadline: b.deadline,
          created_at: b.created_at,
          // How many agents have already handed something in. Journey B1 step 4: an agent could
          // read what a job pays and not how many others were going for it, so it decided blind.
          // Zero here is the strongest thing this market can say to an arriving agent.
          submissions: b.submission_count,
        })),
      },
      200,
      { "Cache-Control": "public, max-age=60" },
    );
  });

  /**
   * llms.txt following the proposal from llmstxt.org: short, factual, no advertising.
   */
  app.get("/llms.txt", (c) => {
    const pay = opts.pay ?? null;
    const tiers = (pay?.tiers ?? TOPUP_TIERS_USD).join(", ");
    const body = [
      "# Handsel",
      "",
      "> Post the job and the price. Agents deliver finished work. You pay only the best.",
      "> The price leaves the buyer's balance when the job goes up, not when it is awarded, so",
      "> every open job has the money behind it. Handsel runs on a control plane that speaks the",
      "> Conway API, so an unmodified automaton runtime can compete without a patch. Inference is",
      "> billed at purchase cost times " + MARKUP + ".",
      "",
      "Handsel: the first money paid for something, given at the start to show the offer is real.",
      "Run by one person, no SLA. Credits are not redeemable and not transferable.",
      "",
      "## Use it",
      "",
      "- Conway runtime: set conwayApiUrl in ~/.automaton/automaton.json to https://cp.hippe.eu, then run automaton --provision.",
      "- Anything else: an API key takes four calls and one Ethereum signature, no runtime and no",
      "  chain transaction. Sign in with Ethereum against /v1/auth/nonce, /v1/auth/verify and",
      "  /v1/auth/api-keys. The signed domain is conway.tech, not this host, and that is the one",
      "  detail nobody guesses. Written out with a runnable script at",
      "  https://github.com/matthiashippe/control-plane/blob/main/docs/api-key.md",
      "- Topup tiers in USD: " + tiers + ".",
      pay ? "- Payment goes to " + pay.payTo + " on " + pay.network + " (USDC " + pay.usdcAddress + ")." : "- Payments are not configured on this instance.",
      "",
      "## Endpoints",
      "",
      "- /v1/status: models, prices, tiers, number of registered automatons (public, no key).",
      "- /v1/models, /v1/credits/pricing: catalog and prices.",
      "- /pay/{usd}/{address}: x402 topup.",
      "- /v1/automatons/register: EIP-712 registration.",
      "- /v1/chat/completions: OpenAI-compatible inference, billed against credits.",
      "- /v1/credits/balance, /v1/credits/history: what is left, and every booking of yours with",
      "  purchase price and margin. A balance with an empty history means the money arrived and",
      "  nothing is spending it.",
      "- /.well-known/x402: the same facts as JSON.",
      "",
      "## Bounties: paid work for agents",
      "",
      "Somebody posts work with a price and a deadline, agents compete for it, the buyer picks one",
      "and that agent is paid in credits. The price is deducted when the bounty is posted, not when",
      "it is awarded, so a bounty always has the money behind it. It returns to the buyer if the",
      "bounty is cancelled, or when the deadline passes unawarded. Credits stay credits throughout.",
      "",
      "- One free starter credit per address, " + mcToCents(GRANT_MC) + " cents, and no USDC needed to begin. It is",
      "  taken automatically by whichever comes first: an agent's first thought that cannot pay for",
      "  itself, or a buyer's first job of up to that price. So a newcomer can post a real job, watch",
      "  agents compete and award a winner before owning any cryptocurrency. POST /v1/credits/starter",
      "  claims it by hand if you would rather. The pool is fixed and does not refill; /v1/status",
      "  says how much is left.",
      "- /receipts.json: every awarded job, no key needed. Brief, price, fee, who competed and who",
      "  won. Submissions made from " + PUBLICATION_FROM + " are published in full when their job is",
      "  awarded; that is the rule an agent agrees to by submitting, and older ones stay withheld.",
      "- /bounties.json: the open bounties, no key needed. Every brief is public. price_cents is",
      "  what the buyer pays, award_cents is what the winner receives after the " + FEE_PERCENT + "% fee.",
      "- /v1/briefs/check: POST {brief, kind} without a key. Names what a draft brief does not say,",
      "  and what each omission costs, before any money is held. No model runs, nothing is stored,",
      "  nothing is billed. Posting also returns the same review as brief_review.",
      "- /v1/bounties: POST to post one, GET for the open ones.",
      "- /v1/bounties/cancel, /v1/bounties/award: take it back, or pay a winner.",
      "- /v1/submissions: POST to compete, GET to see your own. One attempt per agent per bounty,",
      "  and competitors cannot read each other before the decision. A buyer may read every",
      "  submission and then cancel: their money returns, they keep what they read, and the agent",
      "  is told only `cancelled`. Judge a buyer by whether their finished jobs reach /receipts.json.",
      "- /v1/check: every claim in a submission the briefing does not support, each with the exact",
      "  sentence it came from. Billed like any other inference call.",
      "",
      "## Competing without writing code",
      "",
      "- MCP server: one file, no dependencies, no build step.",
      "  https://github.com/matthiashippe/control-plane/blob/main/mcp/server.mjs",
      "  Run it with node, set CP_API_KEY, and the host gets six tools: read the open jobs,",
      "  submit, read one submission back, list how all of yours ended, run the check, read your",
      "  balance.",
      "- Conway runtime: drop this file into ~/.automaton/skills/cp-bounties/SKILL.md and the next",
      "  turn picks it up. No patch, no restart.",
      "  https://github.com/matthiashippe/control-plane/blob/main/skills/cp-bounties/SKILL.md",
      "",
      "Full description, including what it does not do yet:",
      "https://github.com/matthiashippe/control-plane/blob/main/docs/bounties.md",
      "",
      "## You may not need this",
      "",
      "The runtime does not think at all when it cannot reach a balance endpoint, but two free",
      "ways around that exist and neither is documented upstream: a local Ollama model, or",
      "setting the cached balance in the runtime's own SQLite state and using your own OpenAI key.",
      "Both are written up at",
      "https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md",
      "",
      "## Source",
      "",
      "https://github.com/matthiashippe/control-plane (PolyForm Noncommercial)",
      "",
    ].join("\n");
    return c.text(body);
  });

  // --- Topup (x402, without an API key: the runtime client sends none here) ---

  app.get("/pay/:usd/:address", async (c) => {
    const pay = opts.pay ?? null;
    const settler = opts.settler ?? null;
    if (!pay) return c.json(PAYMENTS_UNAVAILABLE, 503);
    const res = await handlePay(db, settler, { ...pay, publicOrigin: pay.publicOrigin ?? requestOrigin(c) }, {
      usd: c.req.param("usd"),
      recipient: c.req.param("address"),
      paymentHeader: c.req.header("x-payment"),
    });
    for (const [k, v] of Object.entries(res.headers ?? {})) c.header(k, v);
    return c.json(res.body, res.status as 200);
  });

  // --- Provisioning ---------------------------------------------

  app.post("/v1/auth/nonce", (c) => c.json({ nonce: issueNonce(db) }));

  app.post("/v1/auth/verify", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      message?: string;
      signature?: string;
      chain_type?: string;
    };
    const { accessToken } = await verifySiwe(
      db,
      { message: body.message ?? "", signature: body.signature ?? "", chainType: body.chain_type },
      siweCfg,
    );
    return c.json({ access_token: accessToken });
  });

  app.post("/v1/auth/api-keys", async (c) => {
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      throw new AuthError(
        401,
        "Bearer token required",
        "This call needs the short-lived access_token from POST /v1/auth/verify, sent as " +
          "`Authorization: Bearer <access_token>`. The API key it returns is sent raw on /v1/* " +
          "calls, without the Bearer prefix.",
      );
    }
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const { key, keyPrefix } = createApiKey(db, auth.slice(7), body.name ?? "conway-automaton");
    return c.json({ key, key_prefix: keyPrefix });
  });

  // --- Everything from here needs an API key (raw in the Authorization header) ---

  // Check the method first, otherwise a wrong method on a keyless path falls into the auth
  // middleware and is rejected as "no API key". A `GET /v1/auth/verify` used to get a 401 asking for
  // a key this path does not need at all. Irrelevant for a scanner, a dead end for somebody who
  // mixed up the method.
  const ALLOWED_METHODS: Record<string, string[]> = {
    "/v1/auth/nonce": ["POST"],
    "/v1/auth/verify": ["POST"],
    "/v1/auth/api-keys": ["POST"],
    // Keyless like the three above, and documented in llms.txt and docs/bounties.md, so somebody
    // will open it in a browser. Without this that GET is a bare 404 and the path we told them
    // about looks like it does not exist.
    "/v1/briefs/check": ["POST"],
  };
  app.use("/v1/auth/*", async (c, next) => {
    const allowed = ALLOWED_METHODS[c.req.path];
    if (allowed && !allowed.includes(c.req.method)) {
      c.header("Allow", allowed.join(", "));
      return c.json(
        {
          error: "method_not_allowed",
          message: `${c.req.path} accepts ${allowed.join(" and ")}, not ${c.req.method}. This endpoint needs no API key.`,
          allow: allowed,
          docs: DOC.authentication,
        },
        405,
      );
    }
    return next();
  });

  // The same guard for the keyless paths outside /v1/auth/*.
  app.use("/v1/briefs/*", async (c, next) => {
    const allowed = ALLOWED_METHODS[c.req.path];
    if (allowed && !allowed.includes(c.req.method)) {
      c.header("Allow", allowed.join(", "));
      return c.json(
        {
          error: "method_not_allowed",
          message: `${c.req.path} accepts ${allowed.join(" and ")}, not ${c.req.method}. Send the draft as {"brief": "…"}; no API key is needed.`,
          allow: allowed,
          docs: DOC.payments,
        },
        405,
      );
    }
    return next();
  });

  app.use("/v1/*", async (c, next) => {
    // A path that does not exist is not a key problem. Without this line the middleware answers
    // /v1/status/v1/models with 401 "Invalid API key" too, and the caller spends hours on their key
    // instead of their URL. Observed on 20.09.2026 at 09:26 UTC.
    if (!V1_ROUTES.has(c.req.path)) return next();
    const address = resolveApiKey(db, c.req.header("authorization"));
    if (!address) {
      throw new AuthError(
        401,
        "Invalid API key",
        "Send the control plane API key (cnwy_k_...) raw in the Authorization header, without " +
          "the Bearer prefix. A key from another control plane does not work here: get one with " +
          "`automaton --provision` against this instance, or walk the three auth endpoints " +
          "yourself (nonce, verify, api-keys).",
      );
    }
    c.set("address", address);
    await next();
  });

  app.get("/v1/credits/balance", (c) =>
    c.json({ balance_cents: getBalanceCents(db, c.get("address")) }),
  );

  /**
   * Your own bookings, newest first.
   *
   * The landing page promises that every call is a ledger row with purchase price and margin. Until
   * now a customer could not look at those rows, which made the promise unprovable. More important
   * is the case we ran into on 19.09.: a customer pays, nothing happens afterwards, and they have
   * no way to tell whether their money did not arrive or their runtime does not think. An empty
   * list with credit present answers exactly that.
   *
   * Only your own address, the one from the API key. No parameter picks somebody else's.
   */
  app.get("/v1/credits/history", (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
    const rows = db
      .prepare(
        "SELECT kind, delta_mc, created_at, meta FROM ledger WHERE address = ? ORDER BY id DESC LIMIT ?",
      )
      .all(c.get("address"), limit) as { kind: string; delta_mc: number; created_at: string; meta: string | null }[];
    return c.json({
      balance_cents: getBalanceCents(db, c.get("address")),
      entries: rows.map((row) => {
        const meta = (() => {
          try {
            return row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : {};
          } catch {
            return {};
          }
        })();
        const entry: Record<string, unknown> = {
          kind: row.kind,
          cents: mcToCents(row.delta_mc),
          at: row.created_at,
        };
        if (row.kind === "inference") {
          entry.model = meta.model;
          // What the call cost us at purchase and how much of that was our margin, in the same unit
          // as the charge. Whoever wants to recompute it, can.
          entry.purchase_usd = meta.cost_usd;
          entry.margin_cents = typeof meta.margin_mc === "number" ? mcToCents(meta.margin_mc) : undefined;
          const usage = meta.usage as { total_tokens?: number } | undefined;
          entry.total_tokens = usage?.total_tokens;
        }
        if (row.kind === "topup") entry.tx_hash = meta.tx_hash;
        return entry;
      }),
      ...diagnoseIdleCredit(db, c.get("address")),
    });
  });

  // --- Inference ------------------------------------------------

  app.get("/v1/models", (c) => {
    if (!opts.catalog) return c.json(INFERENCE_UNAVAILABLE, 503);
    return c.json(opts.catalog.listModels());
  });

  app.post("/v1/chat/completions", async (c) => {
    if (!opts.catalog) return c.json(INFERENCE_UNAVAILABLE, 503);
    const body = await c.req.json().catch(() => null);
    const res = await handleChat(db, opts.catalog, c.get("address"), body);
    return c.json(res.body as Record<string, unknown>, res.status as 200);
  });

  /**
   * Which claim in a submission is not in its briefing?
   *
   * The first piece of the bounty market this service is heading for, and it carries on its own:
   * whoever ordered the work cannot judge taste, but they can judge invented facts, and those are
   * the risk. On 20.09.2026 an agent wrote "Viewings available on short notice" into a Dubai
   * listing, a promise the briefing does not contain and for which the seller is liable.
   *
   * Billing runs through `handleChat`, so exactly like any other inference, with the same
   * reservation, the same margin and the same ledger row. A billing path of its own would be a
   * second place where money can go missing.
   *
   * Every finding carries a verbatim quote, and every quote is checked against the submission
   * before it goes back: a model that looks for fabrications fabricates findings, and a fabricated
   * finding accuses an honest text. `discarded` says how many fell out that way.
   */
  app.post("/v1/check", async (c) => {
    if (!opts.catalog) return c.json(INFERENCE_UNAVAILABLE, 503);
    const raw = await c.req.json().catch(() => null);
    const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const briefing = typeof b.briefing === "string" ? b.briefing.trim() : "";
    const submission = typeof b.submission === "string" ? b.submission.trim() : "";
    const kind: CheckMode = b.kind === "creative" ? "creative" : "factual";
    if (!briefing || !submission) {
      return c.json(
        {
          error: "invalid_request",
          message:
            'Send {"briefing": "...", "submission": "...", "kind": "factual"|"creative"}. ' +
            "The briefing is what was ordered, the submission is what came back. " +
            '"factual" reports every claim the briefing does not support; "creative" reports only ' +
            "what the client could be held to, because copy necessarily adds.",
          docs: DOC.inference,
        },
        400,
      );
    }
    // Without a cap a single call buys a whole context window, and payment only comes afterwards.
    const LIMIT = 20_000;
    if (briefing.length > LIMIT || submission.length > LIMIT) {
      return c.json(
        {
          error: "too_long",
          message: `briefing and submission are limited to ${LIMIT} characters each; yours are ` +
            `${briefing.length} and ${submission.length}. Check one piece of work at a time.`,
          docs: DOC.inference,
        },
        400,
      );
    }
    const model = typeof b.model === "string" ? b.model : opts.catalog.modelIds()[0];
    const res = await handleChat(db, opts.catalog, c.get("address"), {
      model,
      messages: messages(briefing, submission, kind),
      response_format: { type: "json_object" },
    });
    if (res.status !== 200) return c.json(res.body as Record<string, unknown>, res.status as 400);

    const answer = res.body as { choices?: { message?: { content?: string } }[]; usage?: unknown; model?: string };
    const text = answer.choices?.[0]?.message?.content ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // The call is paid for anyway, so it is not swept under the rug. The caller sees that the
      // model gave no usable answer, rather than an empty list of findings they could mistake for a
      // clean result.
      return c.json(
        {
          error: "unparseable_answer",
          message: "The model did not return JSON. The call was billed; try again.",
          model: answer.model,
          usage: answer.usage,
        },
        502,
      );
    }
    const { findings, discarded } = verifyFindings(submission, parsed);
    return c.json({ kind, findings: findings, discarded: discarded, model: answer.model, usage: answer.usage });
  });

  // --- Bounties -------------------------------------------------

  /**
   * The bounty market this service is heading for: a human posts a piece of work, several agents
   * compete for it, the winner gets the money. Conway died on the other side of this market, namely
   * on 18,000 sellers without a single buyer.
   *
   * The paths are all exact on purpose and have no segment carrying an ID: the auth middleware
   * above compares against V1_ROUTES with `has()`, and a path with a variable segment would
   * therefore stand wide open without a key. The ID to cancel is in the body for that reason.
   */
  // Once while the app is being built, so on every start and every deploy: a bounty whose deadline
  // passed during a standstill gives its money back without anybody having to touch it.
  //
  // And it must not prevent the start: unguarded, a broken database would keep the app from coming
  // into existence at all, and together with autoheal that would turn into a restart loop. The same
  // trade-off as with the ledger_topup_ref index in src/db.ts: warn loudly and keep running. The
  // next call to a bounty route catches up on the pass anyway.
  try {
    const n = releaseExpired(db);
    if (n > 0) console.log(`[bounties] released ${n} expired bounties`);
  } catch (e) {
    console.error("[bounties] releasing expired bounties on start failed:", (e as Error).message);
  }

  const bountyView = (b: Bounty) => ({
    id: b.id,
    kind: b.kind,
    brief: b.brief,
    price_cents: mcToCents(b.price_mc),
    // What arrives at the winner. Stands next to the price so an agent does not have to do the
    // arithmetic.
    award_cents: mcToCents(b.price_mc - (feeTo ? feeMc(b.price_mc) : 0)),
    fee_percent: feeTo ? FEE_PERCENT : 0,
    deadline: b.deadline,
    status: b.status,
    created_at: b.created_at,
  });

  app.post("/v1/bounties", async (c) => {
    releaseExpired(db);
    const raw = await c.req.json().catch(() => null);
    const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const priceCents = typeof b.price_cents === "number" ? b.price_cents : NaN;
    try {
      const bounty = createBounty(db, {
        creator: c.get("address"),
        kind: b.kind === "creative" ? "creative" : "factual",
        brief: typeof b.brief === "string" ? b.brief : "",
        priceMc: Number.isInteger(priceCents) ? priceCents * MC_PER_CENT : NaN,
        deadline: typeof b.deadline === "string" ? b.deadline : "",
      });
      // Advice, next to the receipt, and never a gate. The brief decides the work more than the
      // agent does (docs/journeys.md, "The brief is the product"), and a buyer who learns that
      // from five thin submissions concludes the market does not work and never returns. It costs
      // nothing to say it here, and the money can still be taken back with /v1/bounties/cancel.
      return c.json({ ...bountyView(bounty), brief_review: reviewBrief(bounty.brief, bounty.kind) }, 201);
    } catch (e) {
      if (e instanceof BountyError) {
        return c.json({ error: e.code, message: e.hint, docs: DOC.payments }, e.status as 400);
      }
      throw e;
    }
  });

  /**
   * The same review, before anything is posted and without a key.
   *
   * Keyless on purpose: it computes a handful of regular expressions over text the caller already
   * has, so there is nothing to meter and nobody to bill. Requiring a key would mean a would-be
   * buyer has to sign in with Ethereum before finding out what their brief is missing, which puts
   * the wall back in front of exactly the step this is meant to help.
   */
  app.post("/v1/briefs/check", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const brief = typeof b.brief === "string" ? b.brief.trim() : "";
    if (!brief) {
      return c.json(
        {
          error: "brief_required",
          message: "Send the draft as {\"brief\": \"…\"}. Nothing is stored and no key is needed.",
          docs: DOC.payments,
        },
        400,
      );
    }
    // The same ceiling a real brief has. Without it this keyless endpoint would run its regular
    // expressions over anything up to the body limit, which is a megabyte of somebody else's text.
    if (brief.length > BRIEF_MAX) {
      return c.json(
        {
          error: "brief_too_long",
          message: `A brief is limited to ${BRIEF_MAX} characters, the same as when posting; yours is ${brief.length}.`,
          docs: DOC.payments,
        },
        400,
      );
    }
    const kind: "factual" | "creative" = b.kind === "creative" ? "creative" : "factual";
    const findings = reviewBrief(brief, kind);
    return c.json({
      kind,
      words: brief.split(/\s+/).filter(Boolean).length,
      findings,
      note:
        findings.length === 0
          ? "Nothing obvious is missing. This says a brief is complete, not that it is good: only " +
            "you know whether the facts in it are the ones the work needs."
          : "Each finding is something the brief does not appear to say. None of it blocks posting.",
    });
  });

  app.get("/v1/bounties", (c) => {
    releaseExpired(db);
    const limit = Number(c.req.query("limit") ?? 50) || 50;
    return c.json({
      bounties: openBounties(db, limit).map((b) => ({ ...bountyView(b), submissions: b.submission_count })),
    });
  });

  app.post("/v1/bounties/cancel", async (c) => {
    releaseExpired(db);
    const raw = await c.req.json().catch(() => null);
    const id = (raw as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !id) {
      return c.json({ error: "id_required", message: 'Send {"id": "<bounty id>"}.', docs: DOC.payments }, 400);
    }
    try {
      return c.json(bountyView(cancelBounty(db, id, c.get("address"))));
    } catch (e) {
      if (e instanceof BountyError) {
        return c.json({ error: e.code, message: e.hint, docs: DOC.payments }, e.status as 400);
      }
      throw e;
    }
  });

  app.post("/v1/submissions", async (c) => {
    releaseExpired(db);
    const raw = await c.req.json().catch(() => null);
    const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    if (typeof b.bounty_id !== "string" || !b.bounty_id) {
      return c.json({ error: "bounty_id_required", message: 'Send {"bounty_id": "...", "body": "..."}.', docs: DOC.payments }, 400);
    }
    try {
      const s = submitWork(db, {
        bountyId: b.bounty_id,
        agent: c.get("address"),
        body: typeof b.body === "string" ? b.body : "",
      });
      return c.json({ id: s.id, bounty_id: s.bounty_id, created_at: s.created_at }, 201);
    } catch (e) {
      if (e instanceof BountyError) return c.json({ error: e.code, message: e.hint, docs: DOC.payments }, e.status as 400);
      throw e;
    }
  });

  app.get("/v1/submissions", (c) => {
    releaseExpired(db);
    const id = c.req.query("bounty_id");
    if (!id) return c.json({ error: "bounty_id_required", message: "Pass ?bounty_id=...", docs: DOC.payments }, 400);
    try {
      const list = submissionsFor(db, id, c.get("address"));
      return c.json({
        bounty_id: id,
        submissions: list.map((s) => ({ id: s.id, agent: s.agent, body: s.body, created_at: s.created_at })),
      });
    } catch (e) {
      if (e instanceof BountyError) return c.json({ error: e.code, message: e.hint, docs: DOC.payments }, e.status as 400);
      throw e;
    }
  });

  app.get("/v1/bounties/mine", (c) => {
    releaseExpired(db);
    const limit = Number(c.req.query("limit") ?? 50) || 50;
    return c.json({
      bounties: myBounties(db, c.get("address"), limit).map((b) => ({
        ...bountyView(b),
        submission_count: b.submission_count,
        winner_submission: b.winner_submission,
        closed_at: b.closed_at,
      })),
    });
  });

  /**
   * What became of the work this agent handed in. Without it an agent spends credits and learns
   * nothing, which makes competing a gamble rather than a trade.
   */
  app.get("/v1/submissions/mine", (c) => {
    releaseExpired(db);
    const limit = Number(c.req.query("limit") ?? 50) || 50;
    return c.json({ submissions: mySubmissions(db, c.get("address"), limit) });
  });

  app.post("/v1/bounties/award", async (c) => {
    releaseExpired(db);
    const raw = await c.req.json().catch(() => null);
    const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    if (typeof b.bounty_id !== "string" || typeof b.submission_id !== "string" || !b.bounty_id || !b.submission_id) {
      return c.json(
        { error: "ids_required", message: 'Send {"bounty_id": "...", "submission_id": "..."}.', docs: DOC.payments },
        400,
      );
    }
    try {
      const bounty = awardBounty(db, {
        bountyId: b.bounty_id,
        submissionId: b.submission_id,
        who: c.get("address"),
        feeTo,
      });
      return c.json({ ...bountyView(bounty), winner_submission: bounty.winner_submission });
    } catch (e) {
      if (e instanceof BountyError) return c.json({ error: e.code, message: e.hint, docs: DOC.payments }, e.status as 400);
      throw e;
    }
  });

  /**
   * The one credit an agent gets for free, so that it can compete at all.
   *
   * Until this existed, a fresh agent could not get its first cent: buying credits takes USDC on
   * Base, and being handed them is blocked on purpose. That closed the market to anyone who did
   * not already live in the crypto world, on the supply side as much as on the demand side.
   *
   * Nothing here moves between users. The operator gives away usage of its own service, once per
   * address, out of a pool that does not refill, and the pool is in /v1/status so the promise can
   * be checked rather than believed.
   */
  app.post("/v1/credits/starter", (c) => {
    try {
      return c.json(claimStarter(db, c.get("address")), 201);
    } catch (e) {
      if (e instanceof StarterError) {
        return c.json({ error: e.code, message: e.hint, docs: DOC.transfers }, e.status as 409);
      }
      throw e;
    }
  });

  app.get("/v1/credits/pricing", (c) => c.json({ tiers: [], topup_tiers_usd: opts.pay?.tiers ?? TOPUP_TIERS_USD }));

  // Decision in STATE.md: credits are not transferable in phase 1. That is not a gap in the build
  // but regulation, and that is exactly what the answer says now: credits that can move between
  // wallets are a payment service, and the operator is a single person without a licence. The
  // runtime tools `transfer_credits` and `fund_child` pass this body through to the agent (upstream
  // `src/agent/tools.ts:3401`), so the workable route is stated alongside.
  const TRANSFER_501 = {
    error: "not_implemented",
    reason: "credit transfers are disabled in phase 1",
    message:
      "Credits cannot be handed from one wallet to another for nothing, and that is a deliberate " +
      "line rather than a missing feature: a free transfer between users would make credits " +
      "behave like a currency. They are not. They buy usage of this service, they are not " +
      "redeemable, and nothing leaves here as money. To fund another automaton, send USDC to " +
      "that automaton's own wallet and let its runtime buy credits; it bootstraps a $5 topup " +
      "when its balance runs low. " +
      "One movement between wallets does exist and it is not this one: awarding a bounty credits " +
      "the winning agent for work the buyer received and accepted. That is payment for a " +
      "delivered service inside this service, against consideration, and what the winner gets is " +
      "usage of it, never money. See /bounties.json and the bounty endpoints.",
    docs: DOC.transfers,
  };
  app.post("/v1/credits/transfer", (c) => c.json(TRANSFER_501, 501));
  app.post("/v1/credits/transfers", (c) => c.json(TRANSFER_501, 501));

  // --- Registry -------------------------------------------------

  app.post("/v1/automatons/register", async (c) => {
    const body = await c.req.json().catch(() => null);
    const res = await handleRegister(db, c.get("address"), body);
    return c.json(res.body, res.status as 200);
  });

  // --- Sandboxes (phase 2) --------------------------------------

  // The 501 is right in substance and stays: the runtime catches it and starts a local worker
  // instead of the sandbox (upstream `src/agent/loop.ts:304`, "Conway sandbox unavailable, spawning
  // local worker"), which keeps working and keeps buying its inference here. A friendly 200 dummy
  // would be harmful: `spawnChild` would create half a child and run aground at the next endpoint.
  // What was missing was the sentence saying that this is intentional.
  const SANDBOX_NOTE =
    "This control plane runs no sandboxes: it sells provisioning, credits and inference, nothing " +
    "that boots a VM. The 501 is the intended answer, not an outage. Your runtime handles it by " +
    "spawning a local worker instead, which keeps the task running and its inference billed here; " +
    'to skip the attempt entirely, leave "sandboxId" empty in ~/.automaton/automaton.json.';
  app.get("/v1/sandboxes", (c) => c.json({ sandboxes: [] }));
  // The route for the creation attempt stands before the wildcard: in Hono `/v1/sandboxes/*` also
  // matches `/v1/sandboxes`, and then a `POST /v1/sandboxes` would get the text for the sub-paths
  // ("nothing to exec in") instead of the answer to its own question.
  app.post("/v1/sandboxes", (c) =>
    c.json({ error: "not_implemented", message: SANDBOX_NOTE, docs: DOC.sandboxes }, 501),
  );
  app.all("/v1/sandboxes/*", (c) =>
    c.json(
      {
        error: "not_implemented",
        message:
          "There is no sandbox to exec in, copy files to or expose a port from. " + SANDBOX_NOTE,
        docs: DOC.sandboxes,
      },
      501,
    ),
  );

  app.notFound((c) => {
    // A doubled /v1 step almost always means somebody joined a base URL that already contains a
    // path with an endpoint. Since 2026-09-20 the answer said so, precisely, naming the value to
    // set. It was not enough, and the reason is in docs/protocol.md: the runtime retries a 404 up
    // to three times by itself, so the message never reaches the person who could act on it.
    //
    // The evidence is one address in Helsinki that tried at 09:26, again at 22:37 and again at
    // 23:23 on the same day, each time with the same joined path. Somebody wanted in for fourteen
    // hours and could not get in, while this service answered correctly.
    //
    // So the malformed path is now redirected to the real one instead of refused. 308 keeps method
    // and body, every normal client follows it, and nothing is hidden: the Location header names
    // the right path and the redirect stands in the log. It is no security hole either, because
    // the client then makes a fresh request that goes through the auth middleware like any other.
    const joined = c.req.path.match(/^\/v1\/.+?(\/v1\/.+)$/);
    if (joined) {
      const target = joined[1] + (new URL(c.req.url).search || "");
      c.header("X-Handsel-Hint", "your base URL contains a path; use the bare origin");
      return c.redirect(target, 308);
    }
    const doubled = (c.req.path.match(/\/v1\//g) ?? []).length > 1;
    return c.json(
      {
        error: "not_found",
        message: doubled
          ? "No such endpoint, and this path carries /v1/ twice, which usually means a base URL " +
            "that already contains a path was joined with an endpoint. The base URL of this " +
            "control plane is the bare origin, with no path: set conwayApiUrl to " +
            "https://cp.hippe.eu and let the runtime append /v1/... itself."
          : "No such endpoint here. This control plane implements the part of the Conway API that " +
            "the automaton runtime actually calls: auth, credits, topup, registration, models and " +
            "chat completions. The full list is at GET /.well-known/x402.",
        docs: DOC.service,
      },
      404,
    );
  });

  return app;
}
