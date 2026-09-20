/**
 * Settlement über einen externen x402-Facilitator (Betrieb). Das Control Plane sendet nichts
 * selbst on-chain; es reicht den v1-Payload der Runtime an `/verify` und `/settle` durch.
 *
 * PayAI (`https://facilitator.payai.network`) unterstützt `x402Version 1, exact, base`
 * (geprüft 19.09.2026 über `/supported`); CDP braucht zusätzlich einen Auth-Header.
 */

import type { Address, Hex } from "viem";
import type { Authorization, Settler, SettleResult } from "./settler.js";
import { BAZAAR_DESCRIPTION, BAZAAR_EXTENSION } from "./bazaar.js";

export interface FacilitatorConfig {
  url: string;
  /** Vollständiger Authorization-Header-Wert, falls der Facilitator einen verlangt (CDP). */
  authHeader?: string;
  /** "base" oder "base-sepolia", wie im Angebot. */
  network: "base" | "base-sepolia";
  payTo: Address;
  usdcAddress: Address;
  maxTimeoutSeconds: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** x402-v1-Requirements, wie Facilitatoren sie für `exact` auf EVM erwarten. */
export function buildV1Requirements(cfg: FacilitatorConfig, auth: Authorization, resource: string) {
  return {
    scheme: "exact",
    network: cfg.network,
    maxAmountRequired: auth.value.toString(),
    resource,
    description: BAZAAR_DESCRIPTION,
    mimeType: "application/json",
    payTo: cfg.payTo,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    asset: cfg.usdcAddress,
    // EIP-712-Domain des Tokens; der Runtime-Client signiert mit "USD Coin" / "2".
    extra: { name: "USD Coin", version: "2" },
    // Ohne diesen Block nimmt der Facilitator den Dienst nie in sein Verzeichnis auf.
    extensions: BAZAAR_EXTENSION,
  };
}

export function buildV1Payload(cfg: FacilitatorConfig, auth: Authorization, signature: Hex) {
  return {
    x402Version: 1,
    scheme: "exact",
    network: cfg.network,
    payload: {
      signature,
      authorization: {
        from: auth.from,
        to: auth.to,
        value: auth.value.toString(),
        validAfter: auth.validAfter.toString(),
        validBefore: auth.validBefore.toString(),
        nonce: auth.nonce,
      },
    },
    extensions: BAZAAR_EXTENSION,
  };
}

export class FacilitatorSettler implements Settler {
  readonly kind = "facilitator";
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly url: string;

  constructor(private readonly cfg: FacilitatorConfig) {
    this.fetchImpl = cfg.fetch ?? fetch;
    this.timeoutMs = cfg.timeoutMs ?? 60_000;
    this.url = cfg.url.replace(/\/$/, "");
  }

  async settle(auth: Authorization, signature: Hex, resource = "/pay"): Promise<SettleResult> {
    const body = JSON.stringify({
      x402Version: 1,
      paymentPayload: buildV1Payload(this.cfg, auth, signature),
      paymentRequirements: buildV1Requirements(this.cfg, auth, resource),
    });

    const verify = await this.post("/verify", body);
    if (!verify.ok) return { ok: false, error: `verify: ${verify.error}` };
    const v = verify.data as { isValid?: boolean; invalidReason?: string };
    if (!v.isValid) return { ok: false, error: `verify rejected: ${v.invalidReason ?? "unknown"}` };

    const settle = await this.post("/settle", body);
    if (!settle.ok) return { ok: false, error: `settle: ${settle.error}` };
    const s = settle.data as { success?: boolean; errorReason?: string; transaction?: string; txHash?: string };
    // Die Antwort des Facilitators einmal vollstaendig ins Log. Sie enthaelt keine Signatur und
    // kein Geheimnis, aber sie ist die einzige Stelle, an der steht, ob er den Verkaeufer in sein
    // Verzeichnis uebernommen hat. Am 20.09. lief ein Settlement sauber durch, und wir standen
    // danach trotzdem nicht im Verzeichnis, ohne dass irgendwo nachzulesen war warum.
    console.log(`[facilitator] settle -> ${JSON.stringify(settle.data).slice(0, 600)}`);
    if (!s.success) return { ok: false, error: `settle failed: ${s.errorReason ?? "unknown"}` };
    const txHash = (s.transaction || s.txHash || "") as Hex;
    return { ok: true, txHash: txHash || undefined };
  }

  private async post(path: string, body: string): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.cfg.authHeader) headers.Authorization = this.cfg.authHeader;
      const res = await this.fetchImpl(`${this.url}${path}`, { method: "POST", headers, body, signal: controller.signal });
      const text = await res.text();
      if (!res.ok) return { ok: false, error: `${res.status} ${text.slice(0, 300)}` };
      try {
        return { ok: true, data: JSON.parse(text) };
      } catch {
        return { ok: false, error: `unparseable response: ${text.slice(0, 200)}` };
      }
    } catch (err) {
      return { ok: false, error: controller.signal.aborted ? `timeout after ${this.timeoutMs} ms` : err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }
}
