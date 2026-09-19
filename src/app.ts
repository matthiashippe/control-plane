/**
 * Hono-App mit den Routen, die die Automaton-Runtime aufruft (docs/protocol.md).
 * Alles Unbekannte antwortet 404 mit JSON-Fehler; die Runtime behandelt das als
 * "Feature nicht verfügbar".
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { Db } from "./db.js";
import { getBalanceCents } from "./db.js";
import { Catalog, handleChat, MARKUP } from "./inference/proxy.js";
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
 * Startseite. Liegt als Datei neben dem Quellcode und wird einmal beim Start gelesen; sie lädt
 * ihre Zahlen per fetch von /v1/status nach, damit die HTML-Datei statisch bleibt.
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
  /** Ohne pay/settler antwortet /pay mit 503. */
  pay?: PayConfig | null;
  settler?: Settler | null;
  /** Ohne Katalog antworten /v1/chat/completions und /v1/models mit 503. */
  catalog?: Catalog | null;
}

type Env = { Variables: { address: `0x${string}` } };

export function createApp(opts: AppOptions) {
  const { db } = opts;
  const siweCfg: SiweConfig = { ...DEFAULT_SIWE_CONFIG, ...opts.siwe };
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof AuthError) {
      return c.json({ error: err.message }, err.status as 400 | 401);
    }
    console.error(`[app] ${c.req.method} ${c.req.path}: ${err.stack || err.message}`);
    return c.json({ error: "internal_error" }, 500);
  });

  const indexHtml = loadIndexHtml();

  app.get("/", (c) => {
    if (!indexHtml) return c.json({ ok: true, version: VERSION, note: "no index page built" });
    return c.html(indexHtml);
  });

  app.get("/health", (c) => c.json({ ok: true, version: VERSION }));

  /**
   * Öffentlicher Status für die Startseite. Bewusst arm: nichts, was einen Mandanten
   * identifiziert (keine Adressen, keine Salden, keine Key-Prefixe).
   */
  app.get("/v1/status", (c) => {
    // Ein Eintrag je echtem Modell; die IDs, die die Runtime hart anfragt, stehen als Aliase daneben.
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
    const automatons = (db.prepare("SELECT count(*) AS n FROM automatons").get() as { n: number }).n;
    return c.json({
      ok: true,
      version: VERSION,
      phase: 1,
      markup: MARKUP,
      models,
      topup_tiers_usd: opts.pay?.tiers ?? TOPUP_TIERS_USD,
      automatons,
    });
  });

  // ─── Topup (x402, ohne API-Key: der Runtime-Client sendet hier keinen) ───

  app.get("/pay/:usd/:address", async (c) => {
    const pay = opts.pay ?? null;
    const settler = opts.settler ?? null;
    if (!pay) return c.json({ error: "payments_unavailable" }, 503);
    const res = await handlePay(db, settler, pay, {
      usd: c.req.param("usd"),
      recipient: c.req.param("address"),
      paymentHeader: c.req.header("x-payment"),
    });
    for (const [k, v] of Object.entries(res.headers ?? {})) c.header(k, v);
    return c.json(res.body, res.status as 200);
  });

  // ─── Provisionierung ───────────────────────────────────────────

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
    if (!auth.startsWith("Bearer ")) throw new AuthError(401, "Bearer token required");
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const { key, keyPrefix } = createApiKey(db, auth.slice(7), body.name ?? "conway-automaton");
    return c.json({ key, key_prefix: keyPrefix });
  });

  // ─── Alles ab hier braucht einen API-Key (roh im Authorization-Header) ───

  app.use("/v1/*", async (c, next) => {
    const address = resolveApiKey(db, c.req.header("authorization"));
    if (!address) throw new AuthError(401, "Invalid API key");
    c.set("address", address);
    await next();
  });

  app.get("/v1/credits/balance", (c) =>
    c.json({ balance_cents: getBalanceCents(db, c.get("address")) }),
  );

  // ─── Inferenz ─────────────────────────────────────────────────

  app.get("/v1/models", (c) => {
    if (!opts.catalog) return c.json({ error: "inference_unavailable" }, 503);
    return c.json(opts.catalog.listModels());
  });

  app.post("/v1/chat/completions", async (c) => {
    if (!opts.catalog) return c.json({ error: "inference_unavailable" }, 503);
    const body = await c.req.json().catch(() => null);
    const res = await handleChat(db, opts.catalog, c.get("address"), body);
    return c.json(res.body as Record<string, unknown>, res.status as 200);
  });

  app.get("/v1/credits/pricing", (c) => c.json({ tiers: [], topup_tiers_usd: opts.pay?.tiers ?? TOPUP_TIERS_USD }));

  // Entscheidung in STATE.md: Credits sind in Phase 1 nicht übertragbar.
  app.post("/v1/credits/transfer", (c) =>
    c.json({ error: "not_implemented", reason: "credit transfers are disabled in phase 1" }, 501),
  );
  app.post("/v1/credits/transfers", (c) =>
    c.json({ error: "not_implemented", reason: "credit transfers are disabled in phase 1" }, 501),
  );

  // ─── Registry ─────────────────────────────────────────────────

  app.post("/v1/automatons/register", async (c) => {
    const body = await c.req.json().catch(() => null);
    const res = await handleRegister(db, c.get("address"), body);
    return c.json(res.body, res.status as 200);
  });

  // ─── Sandboxes (Phase 2) ──────────────────────────────────────

  app.get("/v1/sandboxes", (c) => c.json({ sandboxes: [] }));
  app.all("/v1/sandboxes/*", (c) => c.json({ error: "not_implemented" }, 501));
  app.post("/v1/sandboxes", (c) => c.json({ error: "not_implemented" }, 501));

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
