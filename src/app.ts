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
import { mcToCents,getBalanceCents } from "./db.js";
import { DOC } from "./errors.js";
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

/** Diese Instanz hat keine Zahlungs-Wallet konfiguriert, also kann hier niemand Credits kaufen. */
const PAYMENTS_UNAVAILABLE = {
  error: "payments_unavailable",
  message:
    "This instance has no payment wallet configured, so credits cannot be bought here. " +
    "GET /.well-known/x402 shows whether topups are available; operators enable them by setting " +
    "CP_PAY_TO and a settler.",
  docs: DOC.payments,
};

/** Kein Inferenz-Provider konfiguriert: Modelle und Chat-Completions gibt es dann nicht. */
const INFERENCE_UNAVAILABLE = {
  error: "inference_unavailable",
  message:
    "No inference provider is configured on this instance, so there are no models to list and " +
    "nothing to bill. GET /v1/status shows the models an instance actually serves; operators " +
    "enable inference by setting CP_PROVIDER.",
  docs: DOC.inference,
};

/**
 * Die oeffentliche Basis-URL dieses Requests. Sie macht die `resource` im Zahlungsangebot absolut,
 * was ein x402-Facilitator braucht, um den Dienst in sein Verzeichnis aufzunehmen.
 *
 * Der Host-Header ist faelschbar, und das ist hier vertretbar: Er faerbt nur die Kennung des
 * Angebots ein. Wohin das Geld geht, steht in `payTo` aus der Umgebung, und die Signatur des
 * Zahlers deckt `resource` nicht ab. Ein Betreiber, der das nicht mag, setzt CP_PUBLIC_URL; die
 * Umgebung schlaegt den Header.
 */
/**
 * Die Pfade unter /v1, die es wirklich gibt. Die Auth-Middleware laesst alles andere durch, damit
 * ein Tippfehler oder eine falsch zusammengesetzte Basis-URL als 404 zurueckkommt statt als 401.
 */
const V1_ROUTEN = new Set([
  "/v1/auth/api-keys",
  "/v1/auth/nonce",
  "/v1/auth/verify",
  "/v1/automatons/register",
  "/v1/chat/completions",
  "/v1/credits/balance",
  "/v1/credits/history",
  "/v1/credits/pricing",
  "/v1/credits/transfer",
  "/v1/credits/transfers",
  "/v1/models",
  "/v1/sandboxes",
  "/v1/status",
]);

function requestOrigin(c: { req: { header: (name: string) => string | undefined; url: string } }): string | undefined {
  const host = c.req.header("host");
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return undefined;
  const gemeldet = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const proto = gemeldet === "https" || gemeldet === "http"
    ? gemeldet
    : c.req.url.startsWith("https:") ? "https" : "http";
  return `${proto}://${host}`;
}

export function createApp(opts: AppOptions) {
  const { db } = opts;
  const siweCfg: SiweConfig = { ...DEFAULT_SIWE_CONFIG, ...opts.siwe };
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof AuthError) {
      // `error` bleibt der Conway-Wortlaut, `message` sagt, was jetzt zu tun ist.
      return c.json(
        { error: err.message, ...(err.hint ? { message: err.hint, docs: DOC.authentication } : {}) },
        err.status as 400 | 401,
      );
    }
    // Der Stacktrace bleibt im Log. Nach außen geht nur, dass es unsere Schuld war und dass die
    // Anfrage nichts gekostet hat; alles andere wäre ein Blick in fremde Interna.
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

  // Die Pfade ohne API-Key schreiben in die Datenbank, `/pay` ruft zusätzlich den Facilitator.
  // Ein API-Key kostet nichts, deshalb muss die Grenze vor der Authentifizierung greifen.
  const rateLimitOpts: RateLimitOptions = opts.rateLimit ?? { limit: 60, fensterMs: 60_000 };
  const limiter = opts.rateLimit === null ? null : new RateLimiter(rateLimitOpts);
  const OFFENE_PFADE = ["/v1/auth/nonce", "/v1/auth/verify", "/v1/auth/api-keys", "/pay/"];
  if (limiter) {
    const fensterSek = Math.round(rateLimitOpts.fensterMs / 1000);
    app.use("*", async (c, next) => {
      const pfad = c.req.path;
      if (!OFFENE_PFADE.some((p) => pfad.startsWith(p))) return next();
      const { erlaubt, retryAfterSec } = limiter.pruefe(clientSchluessel(c.req.raw.headers));
      if (!erlaubt) {
        c.header("Retry-After", String(retryAfterSec));
        return c.json(
          {
            error: "rate_limited",
            retry_after_seconds: retryAfterSec,
            message:
              `More than ${rateLimitOpts.limit} requests in ${fensterSek} seconds from your address to the ` +
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
    return c.html(indexHtml);
  });

  // Impressumspflicht nach § 5 DDG: "leicht erkennbar und unmittelbar erreichbar". Die Angaben
  // stehen auf der Startseite; dieser Pfad ist der Weg, den Leute und Prüfer zuerst raten.
  app.get("/impressum", (c) => c.redirect("/#impressum", 302));

  // Die Seite trägt ihr Icon als data-URI im Head, trotzdem fragen manche Clients stur nach
  // /favicon.ico und bekamen 404. Das kostet nichts und sieht sonst unfertig aus.
  const FAVICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="6" fill="#0b0e14"/>' +
    '<circle cx="16" cy="12" r="5.5" fill="none" stroke="#58d6a0" stroke-width="2.5"/>' +
    '<rect x="7" y="21" width="18" height="3.5" rx="1.75" fill="#58d6a0"/></svg>';
  /**
   * Suchmaschinen duerfen alles lesen. Die Datei existiert trotzdem, weil ihr Fehlen jeden Crawler
   * einen 404 kostet und weil sie der Ort ist, an dem eine spaetere Einschraenkung stehen wuerde.
   */
  app.get("/robots.txt", (c) =>
    c.text("User-agent: *\nAllow: /\n", 200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" }),
  );

  app.get("/favicon.ico", (c) => c.body(FAVICON, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }));

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
      // Die Basis, an die die Pfade darunter gehoeren. Ohne sie raet ein Skript, und am
      // 20.09.2026 riet eines falsch: es verkettete zwei Endpunkte zu /v1/status/v1/models.
      base_url: requestOrigin(c) ?? null,
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
        "https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md",
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
      "https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md",
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
    if (!pay) return c.json(PAYMENTS_UNAVAILABLE, 503);
    const res = await handlePay(db, settler, { ...pay, publicOrigin: pay.publicOrigin ?? requestOrigin(c) }, {
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

  // ─── Alles ab hier braucht einen API-Key (roh im Authorization-Header) ───

  // Vorher die Methode prüfen, sonst fällt eine falsche Methode auf einem schlüssellosen Pfad in
  // die Auth-Middleware und wird als "kein API-Key" abgewiesen. Ein `GET /v1/auth/verify` bekam so
  // ein 401 mit der Aufforderung, einen Schlüssel zu schicken, den dieser Pfad gar nicht braucht.
  // Für einen Scanner egal, für jemanden, der die Methode verwechselt, eine Sackgasse.
  const ERLAUBTE_METHODEN: Record<string, string[]> = {
    "/v1/auth/nonce": ["POST"],
    "/v1/auth/verify": ["POST"],
    "/v1/auth/api-keys": ["POST"],
  };
  app.use("/v1/auth/*", async (c, next) => {
    const erlaubt = ERLAUBTE_METHODEN[c.req.path];
    if (erlaubt && !erlaubt.includes(c.req.method)) {
      c.header("Allow", erlaubt.join(", "));
      return c.json(
        {
          error: "method_not_allowed",
          message: `${c.req.path} accepts ${erlaubt.join(" and ")}, not ${c.req.method}. This endpoint needs no API key.`,
          allow: erlaubt,
          docs: DOC.authentication,
        },
        405,
      );
    }
    return next();
  });

  app.use("/v1/*", async (c, next) => {
    // Ein Pfad, den es nicht gibt, ist kein Schluesselproblem. Ohne diese Zeile beantwortet die
    // Middleware auch /v1/status/v1/models mit 401 "Invalid API key", und der Aufrufer sucht
    // stundenlang an seinem Schluessel statt an seiner URL. Beobachtet am 20.09.2026 um 09:26 UTC.
    if (!V1_ROUTEN.has(c.req.path)) return next();
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
   * Die eigenen Buchungen, neueste zuerst.
   *
   * Die Startseite verspricht, dass jeder Aufruf eine Ledger-Zeile mit Einkaufspreis und Marge
   * ist. Einsehen konnte ein Kunde diese Zeilen bisher nicht, und damit war das Versprechen
   * unbelegbar. Wichtiger noch ist der Fall, der uns am 19.09. begegnet ist: Ein Kunde zahlt,
   * danach passiert nichts, und er hat keine Moeglichkeit zu unterscheiden, ob sein Geld nicht
   * ankam oder seine Runtime nicht denkt. Eine leere Liste bei vorhandenem Guthaben beantwortet
   * genau das.
   *
   * Nur die eigene Adresse, die aus dem API-Key kommt. Kein Parameter waehlt eine fremde.
   */
  app.get("/v1/credits/history", (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
    const zeilen = db
      .prepare(
        "SELECT kind, delta_mc, created_at, meta FROM ledger WHERE address = ? ORDER BY id DESC LIMIT ?",
      )
      .all(c.get("address"), limit) as { kind: string; delta_mc: number; created_at: string; meta: string | null }[];
    return c.json({
      balance_cents: getBalanceCents(db, c.get("address")),
      entries: zeilen.map((z) => {
        const meta = (() => {
          try {
            return z.meta ? (JSON.parse(z.meta) as Record<string, unknown>) : {};
          } catch {
            return {};
          }
        })();
        const eintrag: Record<string, unknown> = {
          kind: z.kind,
          cents: mcToCents(z.delta_mc),
          at: z.created_at,
        };
        if (z.kind === "inference") {
          eintrag.model = meta.model;
          // Was der Aufruf im Einkauf gekostet hat und was davon unsere Marge war, in derselben
          // Einheit wie die Abbuchung. Wer nachrechnen will, kann es.
          eintrag.purchase_usd = meta.cost_usd;
          eintrag.margin_cents = typeof meta.margin_mc === "number" ? mcToCents(meta.margin_mc) : undefined;
          const usage = meta.usage as { total_tokens?: number } | undefined;
          eintrag.total_tokens = usage?.total_tokens;
        }
        if (z.kind === "topup") eintrag.tx_hash = meta.tx_hash;
        return eintrag;
      }),
    });
  });

  // ─── Inferenz ─────────────────────────────────────────────────

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

  app.get("/v1/credits/pricing", (c) => c.json({ tiers: [], topup_tiers_usd: opts.pay?.tiers ?? TOPUP_TIERS_USD }));

  // Entscheidung in STATE.md: Credits sind in Phase 1 nicht übertragbar. Das ist keine Lücke im
  // Bau, sondern Regulatorik, und genau das steht jetzt auch in der Antwort: Credits, die zwischen
  // Wallets wandern können, sind ein Zahlungsdienst, und der Betreiber ist eine Person ohne
  // Lizenz. Die Runtime-Tools `transfer_credits` und `fund_child` reichen diesen Körper an den
  // Agenten durch (Upstream `src/agent/tools.ts:3401`), deshalb steht der gangbare Weg dabei.
  const TRANSFER_501 = {
    error: "not_implemented",
    reason: "credit transfers are disabled in phase 1",
    message:
      "Credits cannot be moved between wallets here, and that is a deliberate regulatory line, " +
      "not a missing feature: credits buy usage of this service, they are not money, not " +
      "redeemable and not transferable, which keeps the operator out of payment-service " +
      "licensing. To fund another automaton, send USDC to that automaton's own wallet and let " +
      "its runtime buy credits (it bootstraps a $5 topup when its balance runs low).",
    docs: DOC.transfers,
  };
  app.post("/v1/credits/transfer", (c) => c.json(TRANSFER_501, 501));
  app.post("/v1/credits/transfers", (c) => c.json(TRANSFER_501, 501));

  // ─── Registry ─────────────────────────────────────────────────

  app.post("/v1/automatons/register", async (c) => {
    const body = await c.req.json().catch(() => null);
    const res = await handleRegister(db, c.get("address"), body);
    return c.json(res.body, res.status as 200);
  });

  // ─── Sandboxes (Phase 2) ──────────────────────────────────────

  // Der 501 ist inhaltlich richtig und bleibt: Die Runtime fängt ihn ab und startet statt der
  // Sandbox einen lokalen Worker (Upstream `src/agent/loop.ts:304`, "Conway sandbox unavailable,
  // spawning local worker"), der weiterarbeitet und seine Inferenz weiter hier kauft. Eine
  // freundliche 200-Attrappe wäre schädlich: `spawnChild` legte ein halbes Kind an und liefe am
  // nächsten Endpunkt auf. Was fehlte, war der Satz, dass das Absicht ist.
  const SANDBOX_HINWEIS =
    "This control plane runs no sandboxes: it sells provisioning, credits and inference, nothing " +
    "that boots a VM. The 501 is the intended answer, not an outage. Your runtime handles it by " +
    "spawning a local worker instead, which keeps the task running and its inference billed here; " +
    'to skip the attempt entirely, leave "sandboxId" empty in ~/.automaton/automaton.json.';
  app.get("/v1/sandboxes", (c) => c.json({ sandboxes: [] }));
  // Die Route für den Erstellungsversuch steht vor der Wildcard: `/v1/sandboxes/*` matcht in Hono
  // auch `/v1/sandboxes`, und dann bekäme ein `POST /v1/sandboxes` den Text der Unterpfade
  // ("nichts, worin man etwas ausführen könnte") statt der Antwort auf seine eigene Frage.
  app.post("/v1/sandboxes", (c) =>
    c.json({ error: "not_implemented", message: SANDBOX_HINWEIS, docs: DOC.sandboxes }, 501),
  );
  app.all("/v1/sandboxes/*", (c) =>
    c.json(
      {
        error: "not_implemented",
        message:
          "There is no sandbox to exec in, copy files to or expose a port from. " + SANDBOX_HINWEIS,
        docs: DOC.sandboxes,
      },
      501,
    ),
  );

  app.notFound((c) => {
    // Eine doppelte /v1-Stufe heisst fast immer: Jemand hat eine Basis-URL, die schon einen Pfad
    // enthaelt, mit einem Endpunkt verkettet. Der Hinweis spart ihm die Suche am falschen Ende.
    const doppelt = (c.req.path.match(/\/v1\//g) ?? []).length > 1;
    return c.json(
      {
        error: "not_found",
        message: doppelt
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
