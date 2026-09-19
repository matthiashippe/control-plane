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
import { clientSchluessel, RateLimiter, type RateLimitOptions } from "./ratelimit.js";
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
  /**
   * Grenze für die Pfade ohne API-Key. `null` schaltet sie ab, was nur Tests tun sollten, die
   * absichtlich viele Anfragen fahren.
   */
  rateLimit?: RateLimitOptions | null;
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

  // Die Pfade ohne API-Key schreiben in die Datenbank, `/pay` ruft zusätzlich den Facilitator.
  // Ein API-Key kostet nichts, deshalb muss die Grenze vor der Authentifizierung greifen.
  const limiter = opts.rateLimit === null ? null : new RateLimiter(opts.rateLimit ?? { limit: 60, fensterMs: 60_000 });
  const OFFENE_PFADE = ["/v1/auth/nonce", "/v1/auth/verify", "/v1/auth/api-keys", "/pay/"];
  if (limiter) {
    app.use("*", async (c, next) => {
      const pfad = c.req.path;
      if (!OFFENE_PFADE.some((p) => pfad.startsWith(p))) return next();
      const { erlaubt, retryAfterSec } = limiter.pruefe(clientSchluessel(c.req.raw.headers));
      if (!erlaubt) {
        c.header("Retry-After", String(retryAfterSec));
        return c.json({ error: "rate_limited", retry_after_seconds: retryAfterSec }, 429);
      }
      return next();
    });
  }

  const indexHtml = loadIndexHtml();

  app.get("/", (c) => {
    if (!indexHtml) return c.json({ ok: true, version: VERSION, note: "no index page built" });
    return c.html(indexHtml);
  });

  // Impressumspflicht nach § 5 DDG: "leicht erkennbar und unmittelbar erreichbar". Die Angaben
  // stehen auf der Startseite; dieser Pfad ist der Weg, den Leute und Prüfer zuerst raten.
  app.get("/impressum", (c) => c.redirect("/#impressum", 302));

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
    // Gezählt werden zahlende Wallets, nicht Registrierungen und auch nicht Einträge in der
    // `automatons`-Tabelle. Zwei Fehler, die diese Zahl schon hinter sich hat:
    //
    // Erstens ist die Registrierung kostenlos und beliebig oft möglich; im Sicherheitsreview vom
    // 19.09.2026 stand hier nach einer Stunde Arbeit `automatons: 100`.
    //
    // Zweitens, und das fiel erst beim ersten echten Kunden auf: Wer einen bereits registrierten
    // Automaton von `api.conway.tech` auf uns umbiegt, schickt nie ein Register. Die Runtime
    // prüft ihr Flag `conwayRegistrationStatus` nur beim Prozessstart und setzt es nie zurück
    // (Upstream `src/index.ts:249-255`). Über die `automatons`-Tabelle gezählt war unser erster
    // zahlender Kunde deshalb unsichtbar, während unser eigener Abnahmelauf die Zahl füllte.
    // Genau falsch herum.
    //
    // Eine Zahlung dagegen ist teuer, eindeutig und on-chain nachprüfbar. Das ist die Zahl.
    const automatons = (
      db.prepare("SELECT count(DISTINCT address) AS n FROM ledger WHERE kind = 'topup'").get() as { n: number }
    ).n;

    // Wie viele davon tatsächlich Inferenz bei uns kaufen. Der Unterschied ist die eigentliche
    // Frage des Dienstes: Zahlen allein heißt noch nicht, dass jemand hier denkt.
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
    });
  });

  /**
   * Maschinenlesbare Beschreibung für andere Agenten und Crawler. Bewusst ohne Zahlen, die
   * sich täglich ändern; die Preise stehen in /v1/status und /v1/models.
   */
  app.get("/.well-known/x402", (c) => {
    const pay = opts.pay ?? null;
    return c.json({
      x402Version: 1,
      service: "conway-compatible control plane",
      description:
        "Prepaid credits for the unmodified Conway automaton runtime: SIWE provisioning, " +
        "USDC topups over x402 on Base, inference billed at purchase cost plus a fixed markup.",
      endpoints: {
        status: "/v1/status",
        models: "/v1/models",
        pricing: "/v1/credits/pricing",
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
        "https://github.com/matthiashippe/control-plane/blob/main/docs/ohne-control-plane.md",
      source: "https://github.com/matthiashippe/control-plane",
    });
  });

  /**
   * llms.txt nach dem Vorschlag von llmstxt.org: kurz, faktisch, ohne Werbung.
   */
  app.get("/llms.txt", (c) => {
    const pay = opts.pay ?? null;
    const tiers = (pay?.tiers ?? TOPUP_TIERS_USD).join(", ");
    const body = [
      "# control-plane",
      "",
      "> A drop-in replacement for api.conway.tech: the subset of the Conway API that the",
      "> unmodified automaton runtime actually calls. Prepaid credits, paid with USDC on Base",
      "> over x402, inference billed at purchase cost times " + MARKUP + ".",
      "",
      "Run by one person, no SLA. Credits are not redeemable and not transferable.",
      "",
      "## Use it",
      "",
      "- Set conwayApiUrl in ~/.automaton/automaton.json to https://cp.hippe.eu, then run automaton --provision.",
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
      "- /.well-known/x402: the same facts as JSON.",
      "",
      "## You may not need this",
      "",
      "The runtime does not think at all when it cannot reach a balance endpoint, but two free",
      "ways around that exist and neither is documented upstream: a local Ollama model, or",
      "setting the cached balance in the runtime's own SQLite state and using your own OpenAI key.",
      "Both are written up at",
      "https://github.com/matthiashippe/control-plane/blob/main/docs/ohne-control-plane.md",
      "",
      "## Source",
      "",
      "https://github.com/matthiashippe/control-plane (PolyForm Noncommercial)",
      "",
    ].join("\n");
    return c.text(body);
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
