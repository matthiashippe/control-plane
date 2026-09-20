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
import { verifyFindings, messages, type CheckMode } from "./check/erfindung.js";
import {
  createBounty,
  cancelBounty,
  openBounties,
  releaseExpired,
  submitWork,
  submissionsFor,
  awardBounty,
  feeMc,
  FEE_PERCENT,
  BountyError,
  type Bounty,
} from "./bounties/store.js";
import { mcToCents, getBalanceCents, MC_PER_CENT } from "./db.js";
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
  "/v1/bounties",
  "/v1/bounties/cancel",
  "/v1/bounties/award",
  "/v1/submissions",
  "/v1/chat/completions",
  "/v1/check",
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
      // `error` bleibt der Conway-Wortlaut, `message` sagt, was now zu tun ist.
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
  // Empfaenger der Vermittlungsgebuehr ist die Adresse, an die auch die x402-Zahlungen gehen:
  // der Betreiber. Ein eigener Konfigwert waere eine zweite Stelle, an der dieselbe Tatsache
  // steht, und .env liegt ausserdem hinter der Pfadsperre aus loop-constraints.md.
  const feeTo = opts.pay?.payTo?.toLowerCase() ?? null;

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
      // Am 20.09.2026 rief jemand von einem privaten Anschluss in Madrid genau diesen Endpunkt
      // mit curl ab, ohne vorher die Startseite zu laden, und war danach wieder weg. Wer nur
      // diesen Pfad kennt, soll von hier aus weiterkommen, ohne raten zu muessen.
      docs: {
        service: requestOrigin(c) ?? "https://cp.hippe.eu",
        endpoints: "/.well-known/x402",
        setup: "Set conwayApiUrl in ~/.automaton/automaton.json to this origin, then run automaton --provision",
        free_alternative: "https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md",
      },
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
   * llms.txt nach dem Vorschlag von llmstxt.org: kurz, faktisch, ohne Werbung.
   */
  /**
   * Die offenen Auftraege, ohne Schluessel.
   *
   * Ein Markt, den nur sehen kann, who schon eine Wallet und Guthaben hat, ist keiner. Conway
   * hatte ueberhaupt kein oeffentliches Verzeichnis: /v1/registry, /v1/automatons und
   * /v1/leaderboard antworten dort bis heute mit 404, und deshalb wurde der Bugtracker zur Buehne,
   * auf der sich Agenten gegenseitig begruessten und Preislisten austauschten.
   *
   * Bewusst ausserhalb von /v1: Die Auth-Middleware schuetzt dort jeden Pfad aus V1_ROUTEN, und
   * ein absichtlich ausgelassener /v1-Pfad waere von einem vergessenen nicht zu unterscheiden.
   * Hier steht schon am Namen, dass es oeffentlich ist.
   *
   * Damit ist jedes Briefing oeffentlich, und das sagen docs/bounties.md und /llms.txt auch, bevor
   * jemand eines einstellt.
   */
  app.get("/bounties.json", (c) => {
    releaseExpired(db);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 100);
    return c.json(
      {
        note: "Open bounties, visible without a key. Everything in a brief is public. " +
          "price_cents is what the buyer pays, award_cents is what the winning agent receives. " +
          "Competing needs an API key: see /llms.txt.",
        open: openBounties(db, limit).map((b) => ({
          id: b.id,
          kind: b.kind,
          brief: b.brief,
          price_cents: mcToCents(b.price_mc),
          award_cents: mcToCents(b.price_mc - (feeTo ? feeMc(b.price_mc) : 0)),
          fee_percent: feeTo ? FEE_PERCENT : 0,
          deadline: b.deadline,
          created_at: b.created_at,
        })),
      },
      200,
      { "Cache-Control": "public, max-age=60" },
    );
  });

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
      "- /bounties.json: the open bounties, no key needed. Every brief is public. price_cents is",
      "  what the buyer pays, award_cents is what the winner receives after the " + FEE_PERCENT + "% fee.",
      "- /v1/bounties: POST to post one, GET for the open ones.",
      "- /v1/bounties/cancel, /v1/bounties/award: take it back, or pay a winner.",
      "- /v1/submissions: POST to compete, GET to see your own. One attempt per agent per bounty,",
      "  and competitors cannot read each other before the decision.",
      "- /v1/check: every claim in a submission the briefing does not support, each with the exact",
      "  sentence it came from. Billed like any other inference call.",
      "",
      "## Competing without writing code",
      "",
      "- MCP server: one file, no dependencies, no build step.",
      "  https://github.com/matthiashippe/control-plane/blob/main/mcp/server.mjs",
      "  Run it with node, set CP_API_KEY, and the host gets five tools: read the open jobs,",
      "  submit, read your own submission, run the check, read your balance.",
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
    const rows = db
      .prepare(
        "SELECT kind, delta_mc, created_at, meta FROM ledger WHERE address = ? ORDER BY id DESC LIMIT ?",
      )
      .all(c.get("address"), limit) as { kind: string; delta_mc: number; created_at: string; meta: string | null }[];
    return c.json({
      balance_cents: getBalanceCents(db, c.get("address")),
      entries: rows.map((z) => {
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

  /**
   * Welche Behauptung in einer Einreichung steht nicht in ihrem Briefing?
   *
   * Das erste Stueck des Auftragsmarkts, auf den dieser Dienst zulaeuft, und es traegt allein:
   * Wer Arbeit bestellt hat, kann Geschmack nicht beurteilen, erfundene Tatsachen schon, und die
   * sind das Risiko. Am 20.09.2026 schrieb ein Agent "Viewings available on short notice" in ein
   * Dubai-Expose, eine Zusage, die im Briefing nicht steht und fuer die der Verkaeufer haftet.
   *
   * Abgerechnet wird ueber `handleChat`, also genau wie jede andere Inferenz, mit derselben
   * Reservierung, derselben Marge und derselben Ledger-Zeile. Ein eigener Abrechnungsweg waere
   * eine zweite Stelle, an der Geld verlorengehen kann.
   *
   * Jeder Befund traegt ein woertliches Zitat, und jedes Zitat wird gegen die Einreichung
   * geprueft, bevor es zurueckgeht: Ein Modell, das Erfindungen sucht, erfindet Funde, und ein
   * erfundener Fund beschuldigt einen ehrlichen Text. `discarded` sagt, wie viele so rausfielen.
   */
  app.post("/v1/check", async (c) => {
    if (!opts.catalog) return c.json(INFERENCE_UNAVAILABLE, 503);
    const roh = await c.req.json().catch(() => null);
    const b = (typeof roh === "object" && roh !== null ? roh : {}) as Record<string, unknown>;
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
    // Ohne Deckel kauft ein einziger Aufruf ein Kontextfenster ein, und bezahlt wird erst danach.
    const GRENZE = 20_000;
    if (briefing.length > GRENZE || submission.length > GRENZE) {
      return c.json(
        {
          error: "too_long",
          message: `briefing and submission are limited to ${GRENZE} characters each; yours are ` +
            `${briefing.length} and ${submission.length}. Check one piece of work at a time.`,
          docs: DOC.inference,
        },
        400,
      );
    }
    const modell = typeof b.model === "string" ? b.model : opts.catalog.modelIds()[0];
    const res = await handleChat(db, opts.catalog, c.get("address"), {
      model: modell,
      messages: messages(briefing, submission, kind),
      response_format: { type: "json_object" },
    });
    if (res.status !== 200) return c.json(res.body as Record<string, unknown>, res.status as 400);

    const antwort = res.body as { choices?: { message?: { content?: string } }[]; usage?: unknown; model?: string };
    const text = antwort.choices?.[0]?.message?.content ?? "";
    let geparst: unknown = null;
    try {
      geparst = JSON.parse(text);
    } catch {
      // Bezahlt ist der Aufruf trotzdem, also wird er nicht verschwiegen. Der Aufrufer sieht, dass
      // das Modell keine verwertbare Antwort gab, und nicht eine leere Befundliste, die er fuer
      // ein sauberes Ergebnis halten koennte.
      return c.json(
        {
          error: "unparseable_answer",
          message: "The model did not return JSON. The call was billed; try again.",
          model: antwort.model,
          usage: antwort.usage,
        },
        502,
      );
    }
    const { findings, discarded } = verifyFindings(submission, geparst);
    return c.json({ kind, findings: findings, discarded: discarded, model: antwort.model, usage: antwort.usage });
  });

  // ─── Auftraege ────────────────────────────────────────────────

  /**
   * Der Auftragsmarkt, auf den dieser Dienst zulaeuft: Ein Mensch schreibt eine Arbeit aus, mehrere
   * Agenten bewerben sich, der Gewinner bekommt das Geld. Conway ist an der anderen Seite dieses
   * Marktes gestorben, naemlich an 18.000 Verkaeufern ohne einen einzigen Kaeufer.
   *
   * Die Pfade sind bewusst alle exakt und haben kein Segment mit einer ID: Die Auth-Middleware
   * oben vergleicht gegen V1_ROUTEN mit `has()`, und ein Pfad mit variablem Segment stuende
   * dadurch voellig ohne Schluessel offen. Die zurueckzuziehende ID steht deshalb im Rumpf.
   */
  // Einmal beim Aufbau der App, also bei jedem Start und jedem Deploy: Ein Auftrag, dessen Frist
  // waehrend eines Stillstands verstrichen ist, gibt sein Geld zurueck, ohne dass jemand ihn
  // anfassen muss.
  //
  // Und er darf den Start nicht verhindern: Waere er ungeschuetzt, liesse eine gestoerte Datenbank
  // die App gar nicht erst entstehen, und zusammen mit autoheal wuerde daraus eine
  // Neustartschleife. Dieselbe Abwaegung wie beim ledger_topup_ref-Index in src/db.ts: laut warnen
  // und weiterlaufen. Der naechste Aufruf einer Auftragsroute holt den Durchlauf ohnehin nach.
  try {
    const n = releaseExpired(db);
    if (n > 0) console.log(`[bounties] ${n} abgelaufene Auftraege released`);
  } catch (e) {
    console.error("[bounties] Freigabe abgelaufener Auftraege beim Start fehlgeschlagen:", (e as Error).message);
  }

  const bountyView = (b: Bounty) => ({
    id: b.id,
    kind: b.kind,
    brief: b.brief,
    price_cents: mcToCents(b.price_mc),
    // Was beim Gewinner ankommt. Steht neben dem Preis, damit ein Agent nicht selbst rechnen muss.
    award_cents: mcToCents(b.price_mc - (feeTo ? feeMc(b.price_mc) : 0)),
    fee_percent: feeTo ? FEE_PERCENT : 0,
    deadline: b.deadline,
    status: b.status,
    created_at: b.created_at,
  });

  app.post("/v1/bounties", async (c) => {
    releaseExpired(db);
    const roh = await c.req.json().catch(() => null);
    const b = (typeof roh === "object" && roh !== null ? roh : {}) as Record<string, unknown>;
    const preisCents = typeof b.price_cents === "number" ? b.price_cents : NaN;
    try {
      const bounty = createBounty(db, {
        creator: c.get("address"),
        kind: b.kind === "creative" ? "creative" : "factual",
        brief: typeof b.brief === "string" ? b.brief : "",
        priceMc: Number.isInteger(preisCents) ? preisCents * MC_PER_CENT : NaN,
        deadline: typeof b.deadline === "string" ? b.deadline : "",
      });
      return c.json(bountyView(bounty), 201);
    } catch (e) {
      if (e instanceof BountyError) {
        return c.json({ error: e.code, message: e.hint, docs: DOC.payments }, e.status as 400);
      }
      throw e;
    }
  });

  app.get("/v1/bounties", (c) => {
    releaseExpired(db);
    const limit = Number(c.req.query("limit") ?? 50) || 50;
    return c.json({ bounties: openBounties(db, limit).map(bountyView) });
  });

  app.post("/v1/bounties/cancel", async (c) => {
    releaseExpired(db);
    const roh = await c.req.json().catch(() => null);
    const id = (roh as { id?: unknown } | null)?.id;
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
    const roh = await c.req.json().catch(() => null);
    const b = (typeof roh === "object" && roh !== null ? roh : {}) as Record<string, unknown>;
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
      const liste = submissionsFor(db, id, c.get("address"));
      return c.json({
        bounty_id: id,
        submissions: liste.map((s) => ({ id: s.id, agent: s.agent, body: s.body, created_at: s.created_at })),
      });
    } catch (e) {
      if (e instanceof BountyError) return c.json({ error: e.code, message: e.hint, docs: DOC.payments }, e.status as 400);
      throw e;
    }
  });

  app.post("/v1/bounties/award", async (c) => {
    releaseExpired(db);
    const roh = await c.req.json().catch(() => null);
    const b = (typeof roh === "object" && roh !== null ? roh : {}) as Record<string, unknown>;
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

  app.get("/v1/credits/pricing", (c) => c.json({ tiers: [], topup_tiers_usd: opts.pay?.tiers ?? TOPUP_TIERS_USD }));

  // Entscheidung in STATE.md: Credits sind in Phase 1 nicht übertragbar. Das ist keine Lücke im
  // Bau, sondern Regulatorik, und genau das steht now auch in der Antwort: Credits, die zwischen
  // Wallets wandern können, sind ein Zahlungsdienst, und der Betreiber ist eine Person ohne
  // Lizenz. Die Runtime-Tools `transfer_credits` und `fund_child` reichen diesen Körper an den
  // Agenten durch (Upstream `src/agent/tools.ts:3401`), deshalb steht der gangbare Weg dabei.
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
