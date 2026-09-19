/**
 * Inferenz-Proxy mit serverseitiger Abbuchung (docs/protocol.md, Abschnitt Inferenz).
 *
 * Verkaufspreis = Listenpreis x MARKUP. Vor dem Call wird gegen den Saldo geschätzt (Prompt-
 * Schätzung plus maximale Ausgabe), nach dem Call nach tatsächlicher `usage` abgebucht, in einer
 * Transaktion mit der Ledger-Zeile. Die Abbuchung übersteigt nie den Saldo; ein Rest landet als
 * `uncollected_mc` im meta, damit der Agent bei 0 stehen bleibt (critical) statt negativ (dead).
 */

import { getAvailableMc, getBalanceMc, mcToCents, postLedger, releaseMc, reserveMc, type Db } from "../db.js";
import { AnfrageZusammenleger, anfrageSchluessel } from "./dedupe.js";
import { DOC } from "../errors.js";
import type { ChatProvider, ChatRequest, ChatResponse, ModelSpec, Usage } from "./provider.js";
import { estimateTokens, ProviderBadRequestError, ProviderUnavailableError } from "./provider.js";

export const MARKUP = 1.3;
const DEFAULT_MAX_TOKENS = 4096;
const HARD_MAX_TOKENS = 32_768;

export interface CatalogEntry {
  spec: ModelSpec;
  provider: ChatProvider;
}

/**
 * Modellkatalog mit Aliasen. Die Upstream-Runtime fragt für Agent-Turns nicht das konfigurierte
 * `inferenceModel`, sondern die Kandidaten ihrer Routing-Matrix ("gpt-5.2", "gpt-5-mini",
 * "gpt-5.3"; src/inference/types.ts im Upstream). Ein Drop-in muss diese IDs bedienen, also
 * bildet der Betreiber sie per Alias auf ein reales Modell ab (`CP_MODEL_ALIASES`).
 */
export class Catalog {
  private readonly entries = new Map<string, CatalogEntry>();
  private readonly aliases = new Map<string, string>();

  constructor(providers: ChatProvider[], aliases: Record<string, string> = {}) {
    for (const provider of providers) {
      for (const spec of provider.models()) this.entries.set(spec.id, { spec, provider });
    }
    for (const [alias, target] of Object.entries(aliases)) {
      if (!this.entries.has(target)) throw new Error(`Alias ${alias} zeigt auf unbekanntes Modell ${target}`);
      if (this.entries.has(alias)) throw new Error(`Alias ${alias} kollidiert mit einem Modell`);
      this.aliases.set(alias, target);
    }
  }

  get(model: string): CatalogEntry | undefined {
    return this.entries.get(this.aliases.get(model) ?? model);
  }

  /** Alle anfragbaren IDs, echte Modelle zuerst, danach die Aliase. Für Fehlermeldungen. */
  modelIds(): string[] {
    return [...this.entries.keys(), ...this.aliases.keys()];
  }

  /**
   * Antwort für GET /v1/models mit Verkaufspreisen. Zwei Leser im Upstream: der Conway-Client
   * liest `input_per_million`, die Model-Registry (refreshFromApi) `input_per_1k`; beide bekommen
   * ihr Feld. `provider` ist "other", weil die Runtime beim Start alle Modelle deaktiviert, die
   * weder in ihrer Baseline stehen noch Provider "ollama"/"other" haben, und weil "other" sicher
   * über das Control Plane geroutet wird (kein direkter OpenAI-/Anthropic-Pfad).
   */
  listModels(): { data: Array<Record<string, unknown>> } {
    const rows: Array<Record<string, unknown>> = [];
    const describe = (id: string, spec: ModelSpec, provider: ChatProvider) => ({
      id,
      object: "model",
      provider: "other",
      owned_by: provider.id,
      upstream_model: spec.id,
      available: true,
      context_window: spec.contextWindow,
      max_tokens: HARD_MAX_TOKENS,
      supports_tools: true,
      parameter_style: /^(o[1-9]|gpt-5|gpt-4\.1)/.test(id) ? "max_completion_tokens" : "max_tokens",
      pricing: {
        input_per_million: sellPrice(spec.inputPerMillion),
        output_per_million: sellPrice(spec.outputPerMillion),
        input_per_1k: sellPrice(spec.inputPerMillion) / 1000,
        output_per_1k: sellPrice(spec.outputPerMillion) / 1000,
      },
    });
    for (const [id, { spec, provider }] of this.entries) rows.push(describe(id, spec, provider));
    for (const [alias, target] of this.aliases) {
      const entry = this.entries.get(target)!;
      rows.push(describe(alias, entry.spec, entry.provider));
    }
    return { data: rows };
  }
}

/** `CP_MODEL_ALIASES="gpt-5.2=claude-sonnet-5,gpt-5-mini=claude-haiku-4-5"` */
export function aliasesFromEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (env.CP_MODEL_ALIASES || "").split(",")) {
    const [alias, target] = pair.split("=").map((s) => s.trim());
    if (alias && target) out[alias] = target;
  }
  return out;
}

export function sellPrice(listUsdPerMillion: number): number {
  return Math.round(listUsdPerMillion * MARKUP * 10_000) / 10_000;
}

const MC_PER_USD = 100_000;

/**
 * Kosten in Millicents. Meldet der Provider die tatsächlichen Einkaufskosten (`cost_usd`), gilt
 * die mal Markup; sonst Listenpreis: USD/1M Tokens ist zugleich Micro-USD je Token, 1 Micro-USD
 * = 0,1 mc, mal Markup.
 */
export function costMc(spec: ModelSpec, usage: Pick<Usage, "prompt_tokens" | "completion_tokens" | "cost_usd">): number {
  if (typeof usage.cost_usd === "number" && Number.isFinite(usage.cost_usd) && usage.cost_usd >= 0) {
    return Math.ceil(usage.cost_usd * MC_PER_USD * MARKUP);
  }
  const microUsd = usage.prompt_tokens * spec.inputPerMillion + usage.completion_tokens * spec.outputPerMillion;
  return Math.ceil(microUsd * 0.1 * MARKUP);
}

/** Einkaufskosten in mc (ohne Markup), für die Margen-Spalte im Ledger. */
export function purchaseMc(spec: ModelSpec, usage: Pick<Usage, "prompt_tokens" | "completion_tokens" | "cost_usd">): number {
  if (typeof usage.cost_usd === "number" && Number.isFinite(usage.cost_usd) && usage.cost_usd >= 0) {
    return Math.ceil(usage.cost_usd * MC_PER_USD);
  }
  const microUsd = usage.prompt_tokens * spec.inputPerMillion + usage.completion_tokens * spec.outputPerMillion;
  return Math.ceil(microUsd * 0.1);
}

export interface ChatResult {
  status: number;
  body: Record<string, unknown> | ChatResponse;
}

/**
 * Prozessweit, weil der Dienst als ein Container läuft (siehe `src/ratelimit.ts` zur selben
 * Annahme). Ein zweiter Prozess auf derselben Datenbank ist ohnehin ausgeschlossen, das erklärt
 * `deploy/README.md` unter "Warum kein echtes Blau/Grün".
 */
const zusammenleger = new AnfrageZusammenleger<ChatResult>();

/** Nur für Tests: Wie viele Anfragen gerade laufen. */
export function laufendeAnfragen(): number {
  return zusammenleger.anzahlLaufend();
}

export async function handleChat(db: Db, catalog: Catalog, address: string, body: unknown): Promise<ChatResult> {
  // Läuft für dieselbe Adresse gerade eine identische Anfrage, wird auf deren Ergebnis gewartet,
  // statt ein zweites Mal einzukaufen und abzubuchen. Siehe `dedupe.ts` für den Grund.
  const schluessel = anfrageSchluessel(address, body);
  const { wert, zusammengelegt } = await zusammenleger.ausfuehren(schluessel, () =>
    handleChatOhneZusammenlegung(db, catalog, address, body),
  );
  if (zusammengelegt) {
    console.log(`[inference] identische Anfrage mit einer laufenden zusammengelegt (${schluessel.slice(0, 12)})`);
  }
  return wert;
}

async function handleChatOhneZusammenlegung(
  db: Db,
  catalog: Catalog,
  address: string,
  body: unknown,
): Promise<ChatResult> {
  if (typeof body !== "object" || body === null) {
    return {
      status: 400,
      body: {
        error: "invalid_body",
        message:
          "The body must be JSON in the OpenAI chat completions format: " +
          '{"model": "...", "messages": [...]}. Check the Content-Type header as well.',
        docs: DOC.inference,
      },
    };
  }
  const req = body as Partial<ChatRequest>;
  if (typeof req.model !== "string" || !Array.isArray(req.messages)) {
    return {
      status: 400,
      body: {
        error: "model and messages are required",
        message:
          'Send "model" as a string and "messages" as an array of {role, content} objects, like ' +
          "any OpenAI-compatible endpoint. GET /v1/models lists the model IDs this instance serves.",
        docs: DOC.inference,
      },
    };
  }
  if (req.stream) {
    return {
      status: 400,
      body: {
        error: "streaming_not_supported",
        message:
          "This endpoint does not stream. Usage is metered and charged server side from the " +
          "provider's usage report once the answer is complete, which a stream does not give us. " +
          'Send "stream": false, as the automaton runtime does.',
        docs: DOC.inference,
      },
    };
  }

  const entry = catalog.get(req.model);
  if (!entry) {
    // Welche IDs es gibt, gehört in die Antwort: Die Runtime fragt die Kandidaten ihrer
    // Routing-Matrix ("gpt-5.2", "gpt-5-mini", "gpt-5.3") und nicht das konfigurierte Modell,
    // und wer eine davon nicht bedient, sucht sonst am falschen Ende.
    const verfuegbar = catalog.modelIds();
    const gezeigt = verfuegbar.slice(0, 12);
    const rest = verfuegbar.length - gezeigt.length;
    return {
      status: 404,
      body: {
        error: "model_not_found",
        model: req.model,
        message:
          `This instance does not serve a model called "${req.model}". Available: ` +
          `${gezeigt.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}. ` +
          "GET /v1/models has the full catalogue with prices; the IDs the runtime asks for are " +
          "mapped to real models by the operator, so the list differs between instances.",
        docs: DOC.models,
      },
    };
  }

  const requested = req.max_completion_tokens ?? req.max_tokens ?? DEFAULT_MAX_TOKENS;
  const maxTokens = Math.max(1, Math.min(HARD_MAX_TOKENS, Math.floor(Number(requested) || DEFAULT_MAX_TOKENS)));

  const estimatedPrompt = estimateTokens(req.messages, req.tools);
  const requiredMc = costMc(entry.spec, { prompt_tokens: estimatedPrompt, completion_tokens: maxTokens });

  // Reservieren statt nur prüfen. Zwischen Prüfung und Abbuchung liegt der Provider-Call, also ein
  // `await`: Wer hier nur den Saldo liest, lässt beliebig viele gleichzeitige Calls dieselbe
  // Deckung sehen. Mit 1 USD Guthaben und 200 parallelen Requests waren so rund 65 USD echte
  // Einkaufskosten erreichbar (Sicherheitsprüfung 19.09.2026). `reserveMc` entscheidet atomar in
  // der Datenbank und ist damit gegen dieses Rennen dicht.
  if (!reserveMc(db, address, requiredMc)) {
    const availableMc = getAvailableMc(db, address);
    return {
      status: 402,
      body: {
        error: "INSUFFICIENT_CREDITS",
        // Wortlaut und `details` bleiben: Die Runtime sucht den Marker im ganzen Körper und liest
        // `details.required_cents`/`details.current_balance_cents`, um den Topup-Tier zu wählen
        // (Upstream `src/conway/topup.ts:103`). Angehängt wird nur der Weg zum Nachkaufen.
        message:
          `Insufficient credits: need ${mcToCents(requiredMc) + 1} cents, have ${mcToCents(availableMc)} cents. ` +
          "Buy credits with GET /pay/{usd}/{this wallet} and sign the x402 offer, or send USDC to " +
          "the wallet and let the runtime's bootstrap topup do it. Nothing was charged for this call.",
        docs: DOC.inference,
        details: {
          required_cents: Math.ceil(requiredMc / 1000),
          current_balance_cents: mcToCents(availableMc),
          model: req.model,
        },
      },
    };
  }

  let response: ChatResponse;
  try {
    response = await entry.provider.chat({ ...(req as ChatRequest), model: entry.spec.id, maxTokens, apiKeyId: address });
  } catch (err) {
    // Jeder Ausgang ohne Buchung muss die Reservierung zurückgeben, sonst bleibt Guthaben des
    // Mandanten dauerhaft blockiert.
    releaseMc(db, address, requiredMc);
    if (err instanceof ProviderUnavailableError) {
      // Der Upstream-Text bleibt im Log. Nach außen ging er bisher mit, und das ist zweierlei
      // falsch: Er verrät den Zustand unseres Einkaufs, und er sagt dem Leser nicht, was er tun
      // kann. Was er wissen muss, ist, dass es nicht an seinem Guthaben liegt.
      console.error(`[inference] provider ${err.provider} unavailable (status ${err.upstreamStatus ?? "none"}): ${err.message}`);
      return {
        status: 503,
        body: {
          error: "provider_unavailable",
          provider: err.provider,
          message:
            "The upstream model provider did not answer this request. Nothing was charged and the " +
            "reserved amount was released, so this is not a credit problem. It is retryable: back " +
            "off and try again, the runtime does that on its own. If it holds for more than a few " +
            "minutes, GET /v1/status tells you which models the instance still serves.",
          docs: DOC.inference,
        },
      };
    }
    if (err instanceof ProviderBadRequestError) {
      return {
        status: 400,
        body: {
          error: "provider_rejected_request",
          provider: err.provider,
          details: err.body,
          message:
            "The model provider rejected this request body; its answer is in `details`. Usually a " +
            "parameter it does not support or a malformed tool schema. Nothing was charged. Fix " +
            "the body and retry; retrying unchanged will fail the same way.",
          docs: DOC.inference,
        },
      };
    }
    throw err;
  }
  // Ab hier darf nichts mehr ohne Freigabe der Reservierung enden. Die Gegenprüfung vom
  // 19.09.2026 hat gezeigt, dass ein Fehler nach der Provider-Antwort (unvollständige `usage`,
  // Schreibfehler der Datenbank bei voller Platte) sonst Guthaben des Mandanten blockiert, bis
  // der Prozess neu startet.
  let gebucht = false;
  try {
    // Der Client soll die ID wiedersehen, die er angefragt hat (Alias oder echte ID).
    response.model = req.model;

    const actualMc = costMc(entry.spec, response.usage);
    const boughtMc = purchaseMc(entry.spec, response.usage);
  // Der Saldo deckt mindestens die Reservierung, mehr kann nur anfallen, wenn die Prompt-Schätzung
  // zu niedrig lag. Dann wird gebucht, was da ist, und der Rest als `uncollected_mc` festgehalten.
    const balanceNow = getBalanceMc(db, address);
    const chargeMc = Math.min(actualMc, balanceNow);
    postLedger(db, {
      address,
      kind: "inference",
      deltaMc: -chargeMc,
      releaseReservedMc: requiredMc,
      ref: response.id,
      meta: {
        model: entry.spec.id,
        requested_model: req.model,
        provider: entry.provider.id,
        usage: response.usage,
        cost_mc: actualMc,
        cost_usd: response.usage.cost_usd ?? null,
        purchase_mc: boughtMc,
        margin_mc: chargeMc - boughtMc,
        uncollected_mc: actualMc - chargeMc,
      },
    });
    gebucht = true;
  } finally {
    // postLedger löst die Reservierung selbst auf. Nur wenn es gar nicht so weit kam, muss hier
    // freigegeben werden.
    if (!gebucht) releaseMc(db, address, requiredMc);
  }

  return { status: 200, body: response };
}

export function providersFromEnv(env: NodeJS.ProcessEnv, factories: Record<string, () => ChatProvider>): ChatProvider[] {
  const ids = (env.CP_PROVIDER || "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.map((id) => {
    const make = factories[id];
    if (!make) throw new Error(`Unbekannter CP_PROVIDER: ${id}`);
    return make();
  });
}
