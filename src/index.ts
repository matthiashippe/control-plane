/**
 * Start of the control plane.
 *
 * Env:
 *   CP_PORT       port, default 8402
 *   CP_HOST       bind address, default 127.0.0.1 (0.0.0.0 inside the container)
 *   CP_DB_PATH    SQLite file, default ./data/control-plane.db
 *   CP_TLS_CERT   PEM certificate; together with CP_TLS_KEY the server speaks HTTPS.
 *   CP_TLS_KEY    PEM key
 *   CP_SIWE_DOMAIN  default "conway.tech" (that is exactly what the runtime client sends)
 *   CP_PAY_TO     wallet the topups go to; without it /pay answers 503
 *   CP_NETWORK    "base" (default) or "base-sepolia"; CP_CHAIN_ID, CP_USDC_ADDRESS override it
 *   CP_SETTLER    "facilitator" in production (CP_FACILITATOR_URL, optional CP_FACILITATOR_AUTH),
 *                 "local" only in the harness (CP_RPC_URL, CP_SETTLER_KEY, CP_USDC_ADDRESS)
 *   CP_TOPUP_TIERS_USD  default "5,25,100,500,1000,2500"; operators may extend it
 *   CP_PROVIDER   comma-separated list of inference providers; "mock" for harness and tests
 *   CP_MODEL_ALIASES  "gpt-5.2=<model>,gpt-5-mini=<model>": the IDs the runtime hard-codes;
 *                 without it the OpenRouter provider serves its defaults
 *   OPENROUTER_API_KEY, CP_OPENROUTER_MODELS  for CP_PROVIDER=openrouter
 *   CP_INFERENCE_SUNSET_AT  ISO 8601; from then on a provider marked `resale: false` is no longer
 *                 sold. Default INFERENCE_SUNSET_AT_DEFAULT in app.ts, which is the production value
 */

import fs from "node:fs";
import path from "node:path";
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { createApp, INFERENCE_SUNSET_AT_DEFAULT, VERSION } from "./app.js";
import { cleanupExpired, cleanupOrderBriefs, getKV, openDb, setKV } from "./db.js";
import { MockProvider } from "./inference/mock.js";
import { OpenRouterProvider, openRouterFromEnv } from "./inference/openrouter.js";
import { aliasesFromEnv, Catalog, providersFromEnv } from "./inference/proxy.js";
import { payConfigFromEnv } from "./payments/pay.js";
import { settlerFromEnv } from "./payments/settler.js";
import { stripeFromEnv } from "./payments/stripe.js";
import { reconcileCheckouts } from "./checkout/index.js";
import { deliverPaidOrders, deliveryWriter, type Mailer } from "./checkout/deliver.js";
import { cleanupConversations } from "./checkout/conversation.js";
import { siteOrigin } from "./public/site.js";

const port = Number(process.env.CP_PORT || 8402);
const host = process.env.CP_HOST || "127.0.0.1";
const dbPath = process.env.CP_DB_PATH || path.resolve("data", "control-plane.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = openDb(dbPath);
const pay = payConfigFromEnv(process.env);
const settler = settlerFromEnv(process.env, pay);
const providers = providersFromEnv(process.env, {
  mock: () => new MockProvider(),
  openrouter: () => openRouterFromEnv(process.env),
});
// Load the prices on start. The service must not bill without prices, but it must not die either
// just because OpenRouter happens to be slow: on 19.09.2026 the start hung twice at exactly this
// point and the service was gone from the outside. So the last successful catalogue is persisted
// and used as a fallback. Only when there is none of those either is a failed start the right
// answer.
// The KV key is a value in the production database and stays as it is.
const PRICE_CACHE_KEY = "openrouter_price_snapshot";
/** Persists the catalogue after every successful fetch, the hourly one included. */
const saveCatalog = (specs: Parameters<NonNullable<ConstructorParameters<typeof OpenRouterProvider>[0]["onRefresh"]>>[0]) => {
  try {
    setKV(db, PRICE_CACHE_KEY, JSON.stringify(specs));
  } catch (err) {
    console.error(`[openrouter] could not persist the catalogue: ${err instanceof Error ? err.message : String(err)}`);
  }
};
for (const p of providers) {
  if (!(p instanceof OpenRouterProvider)) continue;
  p.setOnRefresh(saveCatalog);
  try {
    await p.init();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const cached = getKV(db, PRICE_CACHE_KEY);
    if (!cached) {
      console.error(`[openrouter] price fetch failed (${reason}) and no catalogue is stored. Cannot start.`);
      throw err;
    }
    p.loadSnapshot(JSON.parse(cached));
    console.error(
      `[openrouter] price fetch failed (${reason}). Carrying on with the stored catalogue; ` +
        `the hourly fetch replaces it as soon as it gets through, and persists it too.`,
    );
  }
}
const aliases = process.env.CP_MODEL_ALIASES
  ? aliasesFromEnv(process.env)
  : Object.assign({}, ...providers.map((p) => (p instanceof OpenRouterProvider ? p.defaultAliases() : {})));
const catalog = providers.length ? new Catalog(providers, aliases) : null;
// One Stripe adapter for the pages and the reconcile run, built exactly as createApp would build it.
const checkout = stripeFromEnv(siteOrigin);
// A typo here must stop the start, not quietly move the date every page announces (HAN-62).
const sunsetRaw = process.env.CP_INFERENCE_SUNSET_AT || INFERENCE_SUNSET_AT_DEFAULT;
const inferenceSunsetAt = new Date(sunsetRaw);
if (Number.isNaN(inferenceSunsetAt.getTime())) {
  throw new Error(`CP_INFERENCE_SUNSET_AT is not an ISO 8601 date: ${sunsetRaw}`);
}
const app = createApp({
  db,
  siwe: process.env.CP_SIWE_DOMAIN ? { domain: process.env.CP_SIWE_DOMAIN } : undefined,
  pay,
  settler,
  catalog,
  checkout,
  inferenceSunsetAt,
  // The conversation reads answers with the same provider that writes the texts, never the mock.
  conversation: deliveryWriter(providers),
});

// Cleanup: once on start, hourly after that. Otherwise `siwe_nonces` grows with every call to
// /v1/auth/nonce, and that one needs no API key.
const cleanup = () => {
  try {
    const removed = cleanupExpired(db);
    if (removed.nonces || removed.sessions || removed.payments) {
      console.log(`[cleanup] removed ${removed.nonces} nonces, ${removed.sessions} sessions, ${removed.payments} old failed payments`);
    }
    // A count only: the rows hold a person's email and what they wrote (HAN-25, condition 8).
    const briefs = cleanupOrderBriefs(db);
    if (briefs) console.log(`[cleanup] removed ${briefs} order briefs past their retention period`);
    const talks = cleanupConversations(db);
    if (talks) console.log(`[cleanup] removed ${talks} conversations older than a day`);
  } catch (err) {
    console.error(`[cleanup] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
};
cleanup();
setInterval(cleanup, 60 * 60 * 1000).unref();

// Who writes the texts of a paid order (HAN-67): the first provider that is not the harness mock,
// never the mock (HAN-72). No mailer until HAN-44: rows stay `written` and the buyer reads them on
// the page.
const writer = deliveryWriter(providers);
const mailer: Mailer | null = null;

// Card payments: once on start, every five minutes after that (Goal 22). Books what was paid even
// when the buyer never came back to /katalog/danke, then writes what was paid for (Goal 23): first
// book, then deliver, in that order, in one tick. Does nothing while the card path is off, and a
// failed run is logged, never fatal.
const reconcile = async () => {
  try {
    await reconcileCheckouts(db, checkout);
  } catch (err) {
    console.error(`[reconcile] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    await deliverPaidOrders(db, writer, mailer);
  } catch (err) {
    console.error(`[deliver] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
};
void reconcile();
setInterval(() => void reconcile(), 5 * 60 * 1000).unref();

const tlsCert = process.env.CP_TLS_CERT;
const tlsKey = process.env.CP_TLS_KEY;
const tls = tlsCert && tlsKey ? { cert: fs.readFileSync(tlsCert), key: fs.readFileSync(tlsKey) } : null;

serve(
  {
    fetch: app.fetch,
    port,
    hostname: host,
    ...(tls ? { createServer: createHttpsServer, serverOptions: tls } : {}),
  },
  (info) => {
    console.log(
      `[control-plane] v${VERSION} ${tls ? "https" : "http"}://${info.address}:${info.port} db=${dbPath} ` +
        `pay=${pay ? `${pay.network}->${pay.payTo}` : "off"} settler=${settler?.kind ?? "none"} ` +
        `providers=${providers.map((p) => p.id).join(",") || "none"} aliases=${Object.keys(aliases).join(",") || "none"} ` +
        `inference_sunset=${inferenceSunsetAt.toISOString()}`,
    );
  },
);
