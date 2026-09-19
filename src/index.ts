/**
 * Start des Control Plane.
 *
 * Env:
 *   CP_PORT       Port, Default 8402
 *   CP_HOST       Bind-Adresse, Default 127.0.0.1 (im Container 0.0.0.0)
 *   CP_DB_PATH    SQLite-Datei, Default ./data/control-plane.db
 *   CP_TLS_CERT   PEM-Zertifikat; zusammen mit CP_TLS_KEY wird HTTPS gesprochen.
 *   CP_TLS_KEY    PEM-Key
 *   CP_SIWE_DOMAIN  Default "conway.tech" (der Runtime-Client sendet genau das)
 *   CP_PAY_TO     Wallet, an die Topups gehen; ohne sie antwortet /pay 503
 *   CP_NETWORK    "base" (Default) oder "base-sepolia"; CP_CHAIN_ID, CP_USDC_ADDRESS überschreiben
 *   CP_SETTLER    "facilitator" im Betrieb (CP_FACILITATOR_URL, optional CP_FACILITATOR_AUTH),
 *                 "local" nur im Harness (CP_RPC_URL, CP_SETTLER_KEY, CP_USDC_ADDRESS)
 *   CP_TOPUP_TIERS_USD  Default "5,25,100,500,1000,2500"; Betreiber dürfen ergänzen
 *   CP_PROVIDER   Komma-Liste der Inferenz-Provider; "mock" für Harness und Tests
 *   CP_MODEL_ALIASES  "gpt-5.2=<modell>,gpt-5-mini=<modell>": IDs, die die Runtime hart anfragt;
 *                 ohne Angabe liefert der OpenRouter-Provider seine Defaults
 *   OPENROUTER_API_KEY, CP_OPENROUTER_MODELS  für CP_PROVIDER=openrouter
 */

import fs from "node:fs";
import path from "node:path";
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { createApp, VERSION } from "./app.js";
import { cleanupExpired, getKV, openDb, setKV } from "./db.js";
import { MockProvider } from "./inference/mock.js";
import { OpenRouterProvider, openRouterFromEnv } from "./inference/openrouter.js";
import { aliasesFromEnv, Catalog, providersFromEnv } from "./inference/proxy.js";
import { payConfigFromEnv } from "./payments/pay.js";
import { settlerFromEnv } from "./payments/settler.js";

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
// Preise beim Start laden. Der Dienst darf ohne Preise nicht abrechnen, aber er darf auch nicht
// sterben, nur weil OpenRouter gerade langsam ist: Am 19.09.2026 hing der Start zweimal genau hier
// und der Dienst war von außen weg. Deshalb wird der letzte erfolgreiche Katalog gespeichert und
// als Rückfalloption benutzt. Nur wenn es auch den nicht gibt, ist der Start zu Recht ein Fehler.
const PREIS_CACHE_KEY = "openrouter_price_snapshot";
for (const p of providers) {
  if (!(p instanceof OpenRouterProvider)) continue;
  try {
    await p.init();
    setKV(db, PREIS_CACHE_KEY, JSON.stringify(p.snapshot()));
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    const zwischengespeichert = getKV(db, PREIS_CACHE_KEY);
    if (!zwischengespeichert) {
      console.error(`[openrouter] Preisabruf fehlgeschlagen (${grund}) und kein Katalog gespeichert. Start nicht möglich.`);
      throw err;
    }
    p.loadSnapshot(JSON.parse(zwischengespeichert));
    console.error(
      `[openrouter] Preisabruf fehlgeschlagen (${grund}). Weiter mit dem gespeicherten Katalog; ` +
        `der stündliche Refresh zieht ihn nach. Preise können veraltet sein.`,
    );
  }
}
const aliases = process.env.CP_MODEL_ALIASES
  ? aliasesFromEnv(process.env)
  : Object.assign({}, ...providers.map((p) => (p instanceof OpenRouterProvider ? p.defaultAliases() : {})));
const catalog = providers.length ? new Catalog(providers, aliases) : null;
const app = createApp({
  db,
  siwe: process.env.CP_SIWE_DOMAIN ? { domain: process.env.CP_SIWE_DOMAIN } : undefined,
  pay,
  settler,
  catalog,
});

// Aufräumen: Beim Start einmal, danach stündlich. `siwe_nonces` wächst sonst mit jedem Aufruf von
// /v1/auth/nonce, und der braucht keinen API-Key.
const cleanup = () => {
  try {
    const weg = cleanupExpired(db);
    if (weg.nonces || weg.sessions || weg.payments) {
      console.log(`[cleanup] ${weg.nonces} Nonces, ${weg.sessions} Sessions, ${weg.payments} alte failed-Payments entfernt`);
    }
  } catch (err) {
    console.error(`[cleanup] fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
  }
};
cleanup();
setInterval(cleanup, 60 * 60 * 1000).unref();

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
        `providers=${providers.map((p) => p.id).join(",") || "none"} aliases=${Object.keys(aliases).join(",") || "none"}`,
    );
  },
);
