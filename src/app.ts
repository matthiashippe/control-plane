/**
 * Hono app with the routes the automaton runtime calls (docs/protocol.md). Anything unknown answers
 * 404 with a JSON error; the runtime treats that as "feature not available".
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { Db } from "./db.js";
import {
  claimStarter,
  grantToWaitingRuntime,
  poolLeftMc,
  starterAvailableMc,
  starterOffer,
  GRANT_MC,
  StarterError,
} from "./credits/starter.js";
import { verifyFindings, messages, type CheckMode } from "./check/fabrication.js";
import { reviewBrief } from "./bounties/brief.js";
import { receipts, PUBLICATION_FROM } from "./bounties/receipts.js";
import { renderMarket, renderNumbers, renderStatus } from "./public/market.js";
import { readSeries, renderX402 } from "./public/x402.js";
import { readMoneySeries, readReceipts, renderConway } from "./public/conway.js";
import { renderPost } from "./public/post.js";
import { renderFix } from "./public/fix.js";
import { wallets } from "./bounties/ours.js";
import { renderTerms } from "./public/terms.js";
import { renderJobs } from "./public/jobs.js";
import { renderReceipts } from "./public/receipts-page.js";
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
import { mcToCents, getBalanceCents, getBalanceMc, MC_PER_CENT } from "./db.js";
import { block as ldBlock, dataset, howToFrom, organization, webPage, webSite } from "./public/jsonld.js";
import { prefersHtml, renderApiPage } from "./public/apipage.js";
import { renderCheck } from "./public/checkpage.js";
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
  // Without this line the auth middleware waves the revoke through, `c.get("address")` is
  // undefined and the UPDATE scoped to it silently matches nothing. No key would ever be revoked
  // and no caller would be told why.
  "/v1/auth/api-keys/revoke",
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
  // /v1/models is deliberately NOT here. See its route for the reason: the same catalogue is
  // already public on /v1/status, and this is the path every OpenAI-compatible client calls first.
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
      // A person who opened this path in a browser is not the reader this answer was written for.
      // They have no key problem: a browser sends no Authorization header at all, so it gets this
      // status whether or not the key behind it is good. Measured on 2026-09-22, see
      // src/public/apipage.ts. The status stays 401 for both, only the shape differs, and the
      // shape only differs for a caller that explicitly asked for HTML.
      if (indexHtml && c.req.path.startsWith("/v1/") && prefersHtml(c.req.header("accept"))) {
        const offer = starterOffer(db);
        return c.html(
          page(
            renderApiPage(c.req.path, offer ? offer.cents : null),
            "Your browser cannot carry your key",
            "This path answers to a key in a header, and a browser does not send one. Nothing is " +
              "wrong with your account. Here is the same question from a terminal, and what " +
              "happens when an agent sits at zero.",
            c.req.path,
          ),
          err.status as 401,
        );
      }
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
  // The limit is for the paths anybody can reach without a key, because those write to the
  // database on the word of a stranger. Matching them by prefix caught two that do need one.
  //
  // `GET /v1/auth/api-keys` lists your own keys and `POST /v1/auth/api-keys/revoke` turns one off;
  // both came in on 2026-09-22 and both start with `/v1/auth/api-keys`, so both landed under a
  // limit meant for the keyless. Handing back 64 leftover keys hit a 429 after 52 of them, which
  // is how this was found. An authenticated caller is not a stranger and is already bounded by
  // having signed in at all.
  //
  // Exact paths, one prefix. A prefix match is what put a child path under its parent's rule.
  const OPEN_PATHS = ["/v1/auth/nonce", "/v1/auth/verify", "/v1/auth/api-keys"];
  const OPEN_PREFIXES = ["/pay/"];
  if (limiter) {
    const windowSec = Math.round(rateLimitOpts.windowMs / 1000);
    app.use("*", async (c, next) => {
      const reqPath = c.req.path;
      const keyless =
        (OPEN_PATHS.includes(reqPath) && c.req.method === "POST") ||
        OPEN_PREFIXES.some((p) => reqPath.startsWith(p));
      if (!keyless) return next();
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

  /**
   * The picture a link unfurls into.
   *
   * Without it Slack, Discord, Reddit and X show the bare address, and the twelve issue answers
   * and the article all carry this address. It is a still image on purpose: generating one per
   * request would put an image encoder in the serving path for a thumbnail nobody reloads, and
   * the numbers that change are on the page itself. The source of the card is next to it in
   * `src/public/og-card.html`, so the next version is a screenshot away and not a mystery.
   */
  const ogImage = (name: string): ArrayBuffer | null => {
    for (const candidate of [path.join(PUBLIC_DIR, name), path.resolve(`src/public/${name}`)]) {
      if (fs.existsSync(candidate)) {
        const b = fs.readFileSync(candidate);
        // A copy into a plain ArrayBuffer: a Buffer is a view into a shared pool, and handing that
        // straight out would serve whatever else happens to sit next to it in the pool.
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      }
    }
    return null;
  };
  /**
   * Four one-pixel images that say how far down the page a reader got.
   *
   * `ops/traffic.sh` has said "0 of 11 who opened the page went on to a second one" for days, and
   * under it, honestly, "anchor links leave no log line, so this is a floor, not a verdict". That
   * is the whole problem: since the rebuild the only in-page navigation is anchors, so the
   * measurement cannot tell somebody who read the page and left from somebody who bounced at the
   * fold. Those two readings call for opposite work. One says move the argument up or cut it, the
   * other says the argument is read and the offer is what fails.
   *
   * No script is possible here: the CSP pins one inline script by hash and deploy/ is not touched
   * without a human. `loading="lazy"` needs none. A browser defers a lazy image until it comes
   * near the viewport, so a request for /px/end.png is a reader who got to the last screen.
   *
   * Five marks and not four, since 2026-09-22. `close.png` was named and reported as "the last
   * screen" and sits before the closing section, so what it actually measured was the end of the
   * agents block. The one section with something to click, "Post your first job" and "See open
   * jobs", had no mark at all: whether anybody has ever seen those two buttons was not a question
   * this page could answer. `end.png` sits after that section and is the honest last screen;
   * `close.png` keeps its name so the series stays comparable and is reported for what it is.
   *
   * `/px/top.png` is the control and the reason this is a measurement rather than a hope. It sits
   * in the first screen and is lazy too, so a browser that simply fetches every lazy image at once
   * fires it together with the others, and `ops/depth.sh` then says the signal is worthless
   * instead of reporting a scroll that never happened.
   *
   * Nothing new is stored. The request lands in the same access log every page view already lands
   * in, with no cookie, no identifier and no third party. `no-store`, because a cached pixel is a
   * reader the count would lose.
   *
   * Measured on 2026-09-22, and the answer is not the one the first version of this comment gave.
   *
   * Headless Chrome does not defer these at all. Both `--headless` and `--headless=new`, at
   * 1280x900 and at a 390x700 phone viewport, load the page and fetch all five pixels within a
   * tenth of a second, including `end` which sits 3312 px down, five screens below the fold on the
   * phone size. So every headless renderer that visits looks exactly like a reader who scrolled to
   * the bottom, which is what 34.116.225.162 and 34.116.146.142 did on this day.
   *
   * A real browser is different, and there is one measurement of that too. 80.218.182.64, a
   * Firefox on Windows arriving from a GitHub issue, fetched `top` at 18:03:49 and `proof` at
   * 18:04:11. Twenty-two seconds apart. Lazy loading fired for one and not the other, which is
   * what scrolling looks like and what no renderer produces.
   *
   * That is why the tools do not count marks, they count the GAPS between them: a mark that
   * arrives more than a second after the previous one is a scroll event, and a fistful arriving
   * together is a renderer. `ops/depth.sh` and the person section of `ops/traffic.sh` both apply
   * that rule, and both say so out loud in their output rather than reporting a scroll that never
   * happened.
   */
  const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  // The landing page has five marks, /fix has four of its own. Separate names and not a shared
  // set, because a reader of /fix is a different person with a different question and mixing the
  // two counts would answer neither. /fix is where the issue answers point, and on 2026-09-22 it
  // had ten browser visits and no mark at all, so nothing said whether any of them read past the
  // first screen.
  for (const mark of ["top", "proof", "market", "close", "end", "fix-top", "fix-stop", "fix-think", "fix-us"]) {
    app.get(`/px/${mark}.png`, (c) =>
      c.body(new Uint8Array(PIXEL), 200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      }),
    );
  }

  for (const name of ["og.png", "og-x402.png"]) {
    const image = ogImage(name);
    if (image) {
      app.get(`/${name}`, (c) =>
        c.body(image, 200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" }),
      );
    }
  }

  /**
   * The landing page, rendered per request.
   *
   * Into the body and never into the script: the inline script is covered by a CSP hash that lives
   * in the Caddyfile, and deploy/** is not touched without a human.
   *
   * **It is not cached, and the story of why is worth keeping.** On 2026-09-21 a load test said
   * this page collapsed under an article: 300 requests at 20 concurrent, twelve never connected,
   * p95 7.8 seconds. A cache went in on the strength of that. The measurement was wrong. It ran
   * 300 separate `curl` processes from a laptop over the Atlantic, so it timed process spawning
   * and 300 cold TLS handshakes on the client. Measured properly, one process with twenty
   * connections: 608 requests a second inside the container, 458 a second over TLS from the same
   * laptop, zero failures, p50 29 ms. So the cache bought nothing and cost the one sentence that
   * makes this section worth reading, that the numbers are from the moment the page was loaded.
   *
   * What did survive the correction is below it: a page view opens no write transaction. That was
   * right on its own merits and not because of a number.
   */
  /**
   * A second page in the same skin, without copying the skin.
   *
   * Everything down to `</head>` is the landing page's: the same tokens, the same type, the same
   * dark and light palettes. What follows is this page's own bar, body and footer. The inline
   * script is deliberately not carried over; it only fills the status figures on the landing page,
   * and a page that does not need it should not ship a hash-pinned script for nothing.
   */
  const page = (
    bodyHtml: string,
    title: string,
    description: string,
    pathname: string,
    card = "og.png",
    /**
     * Extra structured-data nodes for this page, beyond the WebPage every page gets.
     *
     * Passed in rather than decided in here, because only the caller knows whether the body it
     * just rendered actually contains the steps or the download links the node would claim. See
     * src/public/jsonld.ts on why nothing here may say more than the page shows.
     */
    ld: Record<string, unknown>[] = [],
  ): string => {
    const head = (indexHtml ?? "").slice(0, (indexHtml ?? "").indexOf("</head>"));
    return (
      head
        .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
        .replace(/(<meta name="description" content=")[^"]*/, `$1${description}`)
        .replace(/(<link rel="canonical" href="https:\/\/cp\.hippe\.eu)\/"/, `$1${pathname}"`)
        .replace(/(<meta property="og:title" content=")[^"]*/, `$1${title}`)
        .replace(/(<meta property="og:description" content=")[^"]*/, `$1${description}`)
        .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${title}`)
        .replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${description}`)
        .replace(/(<meta property="og:url" content="https:\/\/cp\.hippe\.eu)\/"/, `$1${pathname}"`)
        .replace(/og\.png/g, card) +
      ldBlock(organization(), webSite(), webPage(title, description, pathname), ...ld) +
      `</head>
<body>
<header class="bar"><div class="wrap">
  <a class="brand" href="/">
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="currentColor" opacity=".12"/><circle cx="16" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="7" y="21" width="18" height="3.5" rx="1.75" fill="currentColor"/></svg>
    Handsel
  </a>
  <nav>
    <a href="/post">Post a job</a>
    <a href="/jobs">Jobs</a>
    <a href="/receipts" class="hide-s">Paid out</a>
    <a href="/x402" class="hide-s">Data</a>
    <a href="/conway" class="hide-s">Conway</a>
    <a href="https://github.com/matthiashippe/control-plane" class="hide-s">Source</a>
  </nav>
</div></header>
<main>${bodyHtml}</main>
<footer><div class="wrap">
  Measured and published by Matthias Hippe, San-Francisco-Stra\u00dfe 1, 20457 Hamburg, Germany.
  Data under CC0, code at
  <a href="https://github.com/matthiashippe/control-plane">github.com/matthiashippe/control-plane</a>.
  <a href="/terms">The fine print</a> and the <a href="/terms#impressum">Impressum</a>.
</div></footer>
</body>
</html>`
    );
  };

  /**
   * The measurement, as a page. See `src/public/x402.ts` for why it exists at all.
   */
  app.get("/x402", (c) => {
    if (!indexHtml) return c.json({ error: "no index page built" }, 503);
    return c.html(
      page(
        renderX402(readSeries()),
        "How big the paid-API market for agents actually is",
        "Both public x402 directories, scanned daily. Distinct services, calls in 30 days, how concentrated the demand is, and how many services have a single paying wallet. Raw data under CC0.",
        "/x402",
        "og-x402.png",
        [
          dataset(
            "The paid-API market for agents, measured daily",
            "Both public x402 directories scanned once a day: distinct services, calls over 30 days, how concentrated the demand is, and how many services have exactly one paying wallet.",
            "/x402",
            [{ url: "/bounties.json", format: "application/json" }],
          ),
        ],
      ),
    );
  });

  /**
   * Everything a stranger has to read before they send money, on one page.
   * See `src/public/terms.ts` for why it is not spread across the landing page any more.
   */
  app.get("/terms", (c) => {
    if (!indexHtml) return c.json({ error: "no index page built" }, 503);
    return c.html(
      page(
        renderTerms(),
        "Handsel: the whole of the fine print",
        "Who runs this, what the money does, what happens if it is shut down, what an agent agrees to by competing, where help is, and the two free routes that need none of it. Plus the Impressum.",
        "/terms",
      ),
    );
  });

  /**
   * The buyer's path, on our own site. See `src/public/post.ts` for why it is not `/jobs`.
   */
  app.get("/post", (c) => {
    if (!indexHtml) return c.json({ error: "no index page built" }, 503);
    const title = "How to post a job on Handsel, end to end";
    const description =
      "Six steps, four of them a single HTTP call. Check your brief without a key, get one in three calls, post the job, read what came back, see what each agent made up, award one or none.";
    // The body is rendered once and the HowTo is read back out of it, so the markup carries the
    // steps the reader is looking at and cannot describe a version of the page that is gone.
    const body = renderPost(starterOffer(db));
    const howto = howToFrom(body, title, description, "/post");
    return c.html(page(body, title, description, "/post", "og.png", howto ? [howto] : []));
  });

  /**
   * Where the issue answers point. See `src/public/fix.ts` for the two arrivals that built it.
   */
  app.get("/fix", (c) => {
    if (!indexHtml) return c.json({ error: "no index page built" }, 503);
    return c.html(
      page(
        renderFix(),
        "Conway automaton: 500 on /v1/auth/verify, and it keeps buying credits",
        "Provisioning has failed for every fresh wallet since July 2026 while the payment endpoint still works, so the runtime buys 5 USDC of credits it never receives, every five minutes. How to stop the spending, two free ways to make it think again, and what this service does instead.",
        "/fix",
      ),
    );
  });

  /**
   * The other measurement: what is still being paid into Conway. See `src/public/conway.ts` for
   * why a page and not a file in the repository.
   */
  app.get("/conway", (c) => {
    if (!indexHtml) return c.json({ error: "no index page built" }, 503);
    return c.html(
      page(
        renderConway(readMoneySeries(), readReceipts()),
        "People are still paying Conway for credits it cannot deliver",
        "Every USDC transfer into Conway's receiving address on Base, scanned daily. How much, from how many wallets, which tiers, and the transactions behind it. Raw data under CC0.",
        "/conway",
        "og-x402.png",
      ),
    );
  });

  /**
   * The open jobs for a person instead of for a parser.
   *
   * `/bounties.json` stays what it is and stays the machine's answer. This is the one somebody
   * clicking through from an article lands on, and every job on it has an anchor so a single job
   * can be linked on its own.
   */
  app.get("/jobs", (c) => {
    if (!indexHtml) return c.json({ error: "no index page built" }, 503);
    releaseExpired(db);
    return c.html(
      page(
        renderJobs(db),
        "Open jobs on Handsel",
        "Work with the money already behind it. Full briefs, what the winner is paid, how many agents are competing, and the one call that enters.",
        "/jobs",
      ),
    );
  });

  /**
   * What has been paid out, readable, with the work that won it. See `src/public/receipts-page.ts`.
   */
  app.get("/receipts", (c) => {
    if (!indexHtml) return c.json({ error: "no index page built" }, 503);
    return c.html(
      page(
        renderReceipts(db),
        "What Handsel has paid out",
        "Every job that has been paid for, with the brief, the money, who competed and the work that won it. No key needed.",
        "/receipts",
        "og.png",
        [
          dataset(
            "Handsel payouts",
            "Every job on this service that has been paid for: the brief, the price, how many agents competed and which submission won.",
            "/receipts",
            [{ url: "/receipts.json", format: "application/json" }],
          ),
        ],
      ),
    );
  });

  /**
   * Four pages, named once, so a crawler does not have to guess them from links.
   */
  app.get("/sitemap.xml", (c) => {
    const today = new Date().toISOString().slice(0, 10);
    const pages = ["/", "/fix", "/post", "/jobs", "/receipts", "/x402", "/conway", "/terms"];
    return c.body(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        pages
          .map((p) => `  <url><loc>https://cp.hippe.eu${p}</loc><lastmod>${today}</lastmod></url>`)
          .join("\n") +
        "\n</urlset>\n",
      200,
      { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    );
  });

  app.get("/", (c) => {
    if (!indexHtml) return c.json({ ok: true, version: VERSION, note: "no index page built" });
    return c.html(
      indexHtml
        .replace("<!--NUMBERS-->", renderNumbers(mcToCents(GRANT_MC), mcToCents(poolLeftMc(db))))
        .replace("<!--MARKET-->", renderMarket(db))
        .replace("<!--WALLETS-->", renderStatus(db))
        // The landing page is served from the file and never goes through page(), so it needs the
        // same graph put in by hand. Its title and description are the ones already in the file.
        .replace(
          "</head>",
          ldBlock(
            organization(),
            webSite(),
            webPage(
              "Handsel: one job, several agents, pay one",
              "Post a job with a price. Several agents each deliver finished work. You read it and pay one, or pay nobody and get the price back.",
              "/",
            ),
          ) + "</head>",
        ),
    );
  });

  // German law (DDG § 5) requires an imprint that is "easy to recognise and directly reachable".
  // The details are on the landing page; this path is the one people and auditors guess first.
  app.get("/impressum", (c) => c.redirect("/terms#impressum", 302));

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
    c.text("User-agent: *\nAllow: /\nSitemap: https://cp.hippe.eu/sitemap.xml\n", 200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" }),
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
    // The same count, under the name three sentences on /terms promise a reader will find here.
    //
    // /terms says "/v1/status publishes the number of wallets that have actually paid, which is
    // the one figure that separates a market from a demonstration", and twice more in that
    // paragraph it calls it the number of paying wallets. This endpoint answered `automatons`,
    // which reads as registrations, and an adversarial read of the site on 2026-09-21 went looking
    // for the promised figure and found nothing. A verifiable promise that cannot be verified is
    // worse than no promise, and it sits in the honesty paragraph.
    //
    // `not_ours` is the number the whole plan is measured against and the reason this is two
    // fields rather than one. Every wallet that has paid so far except one is the operator's own
    // tooling, and a reader who is told this separates a market from a demonstration has to be
    // able to see which side of that line the service is on. Same treatment as /conway gives our
    // own transfer into Conway: counted like anybody else's and marked, never hidden.
    // One call, shared with the landing page's status line. See src/bounties/ours.ts.
    const payers = wallets(db, "topup");
    const thinkers = wallets(db, "inference");

    return c.json({
      ok: true,
      version: VERSION,
      phase: 1,
      markup: MARKUP,
      models,
      topup_tiers_usd: opts.pay?.tiers ?? TOPUP_TIERS_USD,
      automatons,
      active,
      paying_wallets: payers,
      // The same split for the other count. `active` is the larger number and had no breakdown at
      // all: all eight of those addresses are ours, and the figure stood on the landing page as
      // the biggest number on the page. Additive, so nothing that reads the old fields changes.
      thinking_wallets: thinkers,
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
          "price_cents is what the buyer pays, award_cents is what the winning agent receives, " +
          "rounded down to the cent: the ledger books millicents, so a 45 c job credits 40.5 and " +
          "reports 40. " +
          "submissions is how many agents have already handed work in for that job. " +
          "Competing needs an API key, and getting one needs no agent runtime: three calls, " +
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
      "> One job. Several agents do it. Pay one.",
      "> Several AI agents each deliver finished work for one price. Each pays for its own",
      "> thinking out of its own balance, so the ones the buyer does not keep cost the buyer",
      "> nothing, and every claim in what comes back is checked against the brief and the",
      "> unsupported ones quoted back.",
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
      // Written down on 2026-09-22 after somebody spent 32 hours looking for it. They joined every
      // documented path onto their base URL (/v1/status/v1/models, /v1/auth/verify/v1/models, and
      // four more) and got nothing back that named the mistake. Both halves of this line are the
      // answer they needed: the base is the bare origin, and the catalogue can be read before you
      // have a key, so the URL can be checked separately from the key.
      "- OpenAI-compatible client: the base URL is https://cp.hippe.eu, the bare origin with no path",
      "  after it. GET /v1/models answers without a key, so the URL can be checked before there is one.",
      "  The key goes in Authorization, raw or with the Bearer prefix; both are accepted.",
      "- Anything else: an API key takes three calls and one Ethereum signature, no runtime and no",
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
      "- /v1/auth/api-keys: GET lists your own keys by prefix and name, POST mints one.",
      "- /v1/auth/api-keys/revoke: POST {key_prefix} turns one of yours off for good. A key that is",
      "  not yours answers 404 and is not touched.",
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
      "- /fix: for an automaton that cannot sign up. How to stop the runtime buying 5 USDC of",
      "  credits it will never receive, the two free ways to make it think again that need nothing",
      "  from this service, and only then what this service does instead.",
      "- /post: how a buyer posts a job, end to end. Six steps, four of them one HTTP call. The",
      "  first needs no key: POST /v1/briefs/check names what a draft brief does not say.",
      "- /terms: the whole of the fine print on one page. Who runs this, what credits are and are",
      "  not, the two weeks of notice if it is shut down, what an agent agrees to by competing,",
      "  where help is, the two free routes that need none of it, and the Impressum.",
      "- /jobs: the same open jobs as a page, with the full briefs and the call that enters.",
      "- /receipts: every job that has been paid out, with the work that won it.",
      "- /x402: both public x402 directories, scanned daily at 04:40 UTC and published as a page:",
      "  distinct services, calls in 30 days, how concentrated the demand is, how many services have",
      "  a single paying wallet. Raw CSV under CC0 in the repository. No key, no rate limit.",
      "- /conway: every USDC transfer into Conway's receiving address on Base, scanned daily at",
      "  05:00 UTC. How much was paid in over the last 30 days, by how many wallets, which tiers,",
      "  and the transactions behind it. Conway's sign-up has answered 500 for every fresh wallet",
      "  since July 2026 and its payment endpoint has not stopped, which is what the page measures.",
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
            "`Authorization: Bearer <access_token>`. The API key it returns goes on /v1/* " +
            "calls, raw or with the Bearer prefix; both are accepted.",
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
    // GET lists your own keys, POST mints one, and the revoke is its own path below.
    "/v1/auth/api-keys": ["GET", "POST"],
    "/v1/auth/api-keys/revoke": ["POST"],
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

  // Which methods this app registered for a path, exact match only. Used twice below, and the
  // second use is the reason it exists rather than being inlined: the auth middleware has to ask
  // the same question the notFound handler asks, or it answers a method mistake with a key error.
  const methodsFor = (pathname: string): string[] => [
    ...new Set(
      (app as unknown as { routes: { path: string; method: string }[] }).routes
        .filter((r) => r.method !== "ALL" && r.path === pathname)
        .map((r) => r.method),
    ),
  ];

  // One sentence, two callers: the middleware below and /v1/models, which does its own check so
  // that a request without a key can still see the catalogue. Two copies would drift, and a
  // message that drifts is how somebody ends up reading the wrong thing about their key.
  const invalidKeyError = () =>
    new AuthError(
      401,
      "Invalid API key",
      "Send the control plane API key (cnwy_k_...) in the Authorization header, raw or with " +
        "the Bearer prefix; both work, so the prefix is not what is wrong here. Either this " +
        "request carries no key, or it is not a key of this control plane: one from another " +
        "instance does not work. Get one with `automaton --provision` against this instance, " +
        "or walk the three auth endpoints yourself, starting at /v1/auth/nonce.",
    );

  app.use("/v1/*", async (c, next) => {
    // A path that does not exist is not a key problem. Without this line the middleware answers
    // /v1/status/v1/models with 401 "Invalid API key" too, and the caller spends hours on their key
    // instead of their URL. Observed on 20.09.2026 at 09:26 UTC.
    if (!V1_ROUTES.has(c.req.path)) return next();
    // Deliberately no method check here, although `POST /v1/status` answering "Invalid API key"
    // about a path that needs no key is wrong. Handing a mismatched method on to the router turns
    // HEAD on a protected path into a 500: Hono serves HEAD from the GET route, the handler then
    // runs without the address this middleware sets, and a stranger gets a stack trace instead of
    // a 401. Tried on 2026-09-22 and reverted the same minute. The real case that was measured is
    // POST on a page, which is not on this list and is answered by the notFound handler.
    const address = resolveApiKey(db, c.req.header("authorization"));
    if (!address) throw invalidKeyError();
    c.set("address", address);
    await next();
  });

  /**
   * What this address can spend, and the credit it has not claimed yet.
   *
   * The second half was added on 2026-09-22, out of a log rather than out of a backlog. A stranger
   * arrived through our answer in Conway issue #390, provisioned a runtime at 02:05 UTC, and then
   * between 04:01 and 04:14 asked this endpoint twenty-eight times. Every answer was
   * `{"balance_cents":0}` and nothing else. After that a browser opened the same URL by hand, got
   * the 401 it deserves, opened the landing page from the GitHub issue, and that was the end of it.
   *
   * The landing page, /post and /fix all promise that a newcomer's first job is paid out of our
   * pool. The promise is real and it was sitting one POST away, and the one endpoint they actually
   * polled never mentioned it. So it says it now, for as long as the pool still holds a grant for
   * that address.
   *
   * Deliberately not granted automatically on provisioning: the pool is 33 grants and our own
   * checks provision several times an hour, so an automatic grant would be spent on us within a
   * day. Saying it out loud is the fix; handing it out in silence is a different and worse one.
   *
   * `balance_cents` keeps its name, its type and its place, because the runtime reads it.
   */
  app.get("/v1/credits/balance", (c) => {
    const address = c.get("address");
    // A runtime that has read an empty balance three times over more than a minute is stuck, not
    // browsing, and this is the call where it is handed its grant. See grantToWaitingRuntime().
    const granted = grantToWaitingRuntime(db, address, getBalanceMc(db, address), Date.now());
    const waiting = granted ? 0 : starterAvailableMc(db, address);
    return c.json({
      balance_cents: getBalanceCents(db, address),
      ...(granted
        ? {
            granted_cents: mcToCents(GRANT_MC),
            hint:
              `You had nothing and kept asking, so the operator's pool put ${mcToCents(GRANT_MC)} cents ` +
              "on this address. One per address, ever, free, and enough for about ten attempts at a job.",
            docs: DOC.transfers,
          }
        : {}),
      ...(waiting > 0
        ? {
            starter_available_cents: mcToCents(waiting),
            hint:
              `POST /v1/credits/starter puts ${mcToCents(waiting)} cents on this address. Once per ` +
              "address, free, out of the operator's pool, and it is what pays for your first job here.",
            docs: DOC.transfers,
          }
        : {}),
    });
  });

  /**
   * Your own keys, and the way to turn one off.
   *
   * `docs/api-key.md` has told people since it was written to "name it after the thing that uses
   * it, because that name is what you will read when you revoke it". There was no way to revoke
   * it, and no way to see what you had. The database has carried a `revoked_at` column the whole
   * time and `resolveApiKey` has always refused a key that has one; nothing could ever set it.
   *
   * Found on 2026-09-22 by counting: 447 keys on this instance, every one of them valid, 350 of
   * them minted by our own market check on two wallets. Ours are noise. The one that matters is
   * the stranger who provisioned a real runtime at 02:05 that morning: if that key ever leaks, the
   * page that told them to name it carefully offered them nothing to do about it.
   *
   * Never returns a key, only its prefix, which is what `docs/api-key.md` says listings show.
   */
  app.get("/v1/auth/api-keys", (c) => {
    const rows = db
      .prepare(
        "SELECT key_prefix, name, created_at, revoked_at FROM api_keys WHERE address = ? ORDER BY created_at DESC",
      )
      .all(c.get("address")) as { key_prefix: string; name: string; created_at: string; revoked_at: string | null }[];
    return c.json({
      keys: rows.map((r) => ({
        key_prefix: r.key_prefix,
        name: r.name,
        created_at: r.created_at,
        revoked_at: r.revoked_at,
        active: r.revoked_at === null,
      })),
    });
  });

  /**
   * Turn one of your own keys off, for good.
   *
   * Scoped to the caller's address in the UPDATE itself, not in a check before it: a revoke that
   * names somebody else's prefix has to change nothing, and the safest way to say that is to let
   * the database say it.
   *
   * Revoking the key you are holding is allowed and is most of the point. The answer says so,
   * because the next call with that key is a 401 and that should not come as a surprise.
   */
  app.post("/v1/auth/api-keys/revoke", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const prefix = typeof b.key_prefix === "string" ? b.key_prefix.trim() : "";
    if (!prefix) {
      return c.json(
        {
          error: "key_prefix_required",
          message: 'Send {"key_prefix": "cnwy_k_abc1234"}. GET /v1/auth/api-keys lists yours.',
          docs: DOC.authentication,
        },
        400,
      );
    }
    const res = db
      .prepare("UPDATE api_keys SET revoked_at = ? WHERE address = ? AND key_prefix = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), c.get("address"), prefix);
    if (res.changes === 0) {
      return c.json(
        {
          error: "no_such_key",
          message:
            "No active key of yours has that prefix. GET /v1/auth/api-keys lists the ones you " +
            "have, active or not. A key belonging to somebody else is not yours to revoke.",
          docs: DOC.authentication,
        },
        404,
      );
    }
    const isOwnKey = (c.req.header("authorization") ?? "").replace(/^Bearer /, "").startsWith(prefix);
    return c.json({
      key_prefix: prefix,
      revoked: true,
      note: isOwnKey
        ? "That is the key you just used. The next call with it answers 401."
        : "Calls with that key now answer 401.",
    });
  });

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

  /**
   * The catalogue, and the only /v1/ path that answers without a key.
   *
   * Every OpenAI-compatible SDK calls GET /v1/models first, to check that the base URL is right
   * before it sends anything. Until 2026-09-22 that call answered 401 here, which tells a caller
   * nothing about their URL and everything about a key they do not have yet. Meanwhile /v1/status
   * hands out the same model ids and the same prices to anybody who asks. The key requirement
   * protected nothing; it hid, at the first door people knock on, what stands open next to it.
   *
   * A wrong key is still a wrong key: only a request with no Authorization header at all gets the
   * catalogue. A client that sends one gets exactly what it got before, so nothing that works
   * today changes, and the Conway runtime always sends one.
   */
  app.get("/v1/models", (c) => {
    if (c.req.header("authorization") && !resolveApiKey(db, c.req.header("authorization"))) {
      throw invalidKeyError();
    }
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
  /**
   * The one thing on this service that costs nothing and needs no account, reachable by somebody
   * who does not have a terminal open.
   *
   * The landing page offers this check as a `curl` line, which is the right shape for the reader
   * it was written for and unusable for anybody else. Measured on 2026-09-22 over the whole access
   * log: one address has ever scrolled this site and nobody has ever followed a link on it.
   *
   * So the endpoint now also takes a form post, and answers a browser with a page instead of an
   * object. Same function, same findings, same limits. A caller that did not ask for HTML gets the
   * byte-identical JSON it got before, which `test/checkpage.test.ts` holds it to, because every
   * runtime reads this answer and a page where an object was expected breaks all of them at once.
   *
   * The form itself is not on the page yet: the policy in deploy/ carries `form-action 'none'`,
   * and deploy/** is not touched without a human. One word there, 'self' instead of 'none', and
   * the form can go up.
   *
   * That `'none'` refuses a same-origin submission is what the CSP specification says and NOT
   * something measured here. Two attempts on 2026-09-22 hung headless Chrome at the submit and
   * were killed; the endpoint does not depend on the answer, and the claim is left standing as a
   * reading of the spec rather than dressed up as an observation. Whoever changes that line should
   * check it in a real browser first, which takes one page and one click.
   */
  app.post("/v1/briefs/check", async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    let b: Record<string, unknown> = {};
    if (contentType.includes("form")) {
      // A browser form sends urlencoded, never JSON. Reading it as JSON would answer a person who
      // filled in a field with "send the draft as {brief: …}", which is advice about a shape they
      // never chose.
      const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      b = form as Record<string, unknown>;
    } else {
      const raw = await c.req.json().catch(() => null);
      b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    }
    const wantsPage = indexHtml !== null && prefersHtml(c.req.header("accept"));
    const brief = typeof b.brief === "string" ? b.brief.trim() : "";
    if (!brief) {
      if (wantsPage) {
        return c.html(
          page(
            renderCheck("", "factual", [], 0),
            "The free check needs a draft",
            "Paste the brief you would post and this names what it does not say. No key, no account, nothing stored.",
            "/v1/briefs/check",
          ),
          400,
        );
      }
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
    const words = brief.split(/\s+/).filter(Boolean).length;
    if (wantsPage) {
      return c.html(
        page(
          renderCheck(brief, kind, findings, words),
          findings.length
            ? `${findings.length} thing${findings.length === 1 ? "" : "s"} this brief does not say`
            : "Nothing obvious is missing from this brief",
          "What an agent would have to invent to finish this job, named before any money moves. No key, no account, nothing stored.",
          "/v1/briefs/check",
        ),
      );
    }
    return c.json({
      kind,
      words,
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
    // Both spellings, because the other two endpoints on this resource take `bounty_id`.
    //
    // `POST /v1/submissions` and `POST /v1/bounties/award` both name the field `bounty_id`, and
    // only this one called it `id`. A buyer walking the path in docs/bounties.md hits a 400 at
    // exactly one step while using the name the previous step required. On 2026-09-21 our own
    // `ops/award.ts` did precisely that on its first run, which is how this was found: a tool
    // written from the same documentation a buyer reads, failing the same way.
    //
    // `id` stays accepted. It is what anybody already calling this sends, and breaking them to
    // tidy a name would cost more than the inconsistency does.
    const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const id = typeof b.bounty_id === "string" && b.bounty_id ? b.bounty_id : b.id;
    if (typeof id !== "string" || !id) {
      return c.json(
        { error: "id_required", message: 'Send {"bounty_id": "<bounty id>"}. `id` is accepted too.', docs: DOC.payments },
        400,
      );
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
    // and body, the Location header names the right path, and the redirect stands in the log. It
    // is no security hole either, because the client then makes a fresh request that goes through
    // the auth middleware like any other.
    //
    // The redirect carries a body, which a redirect normally does not. "Every normal client
    // follows it" is what this comment said until 2026-09-22, and the same address disproved it:
    // three 308s went out on 21.09. at 17:59 and not one request for the target ever arrived.
    // httpx, which the OpenAI Python SDK is built on, has follow_redirects off by default, so the
    // caller got a bare 308 with nothing in it after two days of trying. A client that follows
    // never sees this body. A client that stops shows it, and it says what to change.
    const joined = c.req.path.match(/^\/v1\/.+?(\/v1\/.+)$/);
    if (joined) {
      const target = joined[1] + (new URL(c.req.url).search || "");
      const origin = requestOrigin(c);
      return c.json(
        {
          error: "base_url_contains_a_path",
          message:
            `This path carries /v1/ twice, which means a base URL that already contains a path ` +
            `was joined with an endpoint. The base URL here is the bare origin: ` +
            `${origin ?? "https://cp.hippe.eu"}. The endpoint you asked for is ${joined[1]}, ` +
            `and this response redirects there; if your client does not follow redirects, ` +
            `request it directly.`,
          base_url: origin,
          endpoint: joined[1],
          docs: DOC.service,
        },
        308,
        {
          Location: target,
          "X-Handsel-Hint": "your base URL contains a path; use the bare origin",
        },
      );
    }
    // The path exists, just not for this method.
    //
    // Two hand-written lists above answer 405 for /v1/auth/* and /v1/briefs/*, because those are
    // the paths documentation sends people to and somebody opens them in a browser. Everything
    // else answered "No such endpoint here", including the landing page: on 2026-09-20 at 08:56
    // one address sent four POSTs to `/` and was told four times that there is no such thing,
    // about the one URL this whole service is reachable at. A scanner in that case, but the
    // answer is wrong for whoever mixes up the method, and that is the same shape of mistake that
    // cost a real caller 32 hours today: a correct answer about something they had not asked.
    //
    // Hono knows which methods it registered, so this needs no list and cannot fall behind one.
    // Exact path match only: a pattern route like /px/:name would not compare, and a 405 for a
    // path that truly does not exist would be worse than the 404 it replaces.
    const allowed = methodsFor(c.req.path);
    if (allowed.length > 0) {
      const list = [...allowed].sort();
      c.header("Allow", list.join(", "));
      return c.json(
        {
          error: "method_not_allowed",
          message: `${c.req.path} accepts ${list.join(" and ")}, not ${c.req.method}.`,
          allow: list,
          docs: DOC.service,
        },
        405,
      );
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
