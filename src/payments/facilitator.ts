/**
 * Settlement through an external x402 facilitator (production). The control plane sends nothing
 * on-chain itself; it passes the runtime's v1 payload through to `/verify` and `/settle`.
 *
 * PayAI (`https://facilitator.payai.network`) supports `x402Version 1, exact, base`
 * (checked 19.09.2026 through `/supported`); CDP additionally needs an auth header.
 */

import type { Address, Hex } from "viem";
import type { Authorization, Settler, SettleResult } from "./settler.js";
import { BAZAAR_DESCRIPTION, BAZAAR_EXTENSION } from "./bazaar.js";

export interface FacilitatorConfig {
  url: string;
  /** The full Authorization header value, in case the facilitator demands one (CDP). */
  authHeader?: string;
  /** "base" or "base-sepolia", as in the offer. */
  network: "base" | "base-sepolia";
  payTo: Address;
  usdcAddress: Address;
  maxTimeoutSeconds: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** x402 v1 requirements, the way facilitators expect them for `exact` on EVM. */
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
    // The token's EIP-712 domain; the runtime client signs with "USD Coin" / "2".
    extra: { name: "USD Coin", version: "2" },
    // Without this block the facilitator never takes the service into its directory.
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
    // The facilitator's answer in full, once, into the log. It carries no signature and no
    // secret, but it is the only place that says whether it has taken the seller into its
    // directory. On 20.09. a settlement ran through cleanly and we were still not in the
    // directory afterwards, with nowhere to read why.
    console.log(`[facilitator] settle -> ${JSON.stringify(settle.data).slice(0, 600)}`);
    if (!s.success) return { ok: false, error: `settle failed: ${s.errorReason ?? "unknown"}` };
    const txHash = (s.transaction || s.txHash || "") as Hex;
    return { ok: true, txHash: txHash || undefined };
  }

  /**
   * What the facilitator says about our catalogue entry, in a header nobody read.
   *
   * The specification (coinbase/x402, docs/extensions/bazaar.mdx) says a facilitator may answer a
   * payment carrying the bazaar extension with `EXTENSION-RESPONSES`: base64 JSON whose `bazaar`
   * key holds a `status` of `success`, `processing` or `rejected`, and on a rejection a
   * `rejectedReason` in plain words.
   *
   * `post` returned the parsed body and dropped every header, so between 20.09. and 24.09.2026
   * this service settled through PayAI between one and nine times, stayed out of the catalogue,
   * and the sentence explaining why was thrown away each time. Four cycles went into guessing at
   * the catalogue from outside instead.
   *
   * Never throws and never fails a settlement: a payment that went through went through, whatever
   * a directory thinks of it.
   */
  private bazaarOutcome(headers: Headers, path: string): void {
    const raw = headers.get("EXTENSION-RESPONSES") ?? headers.get("extension-responses");
    if (!raw) return;
    try {
      const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as {
        bazaar?: { status?: string; rejectedReason?: string };
      };
      const b = parsed.bazaar;
      if (!b) return;
      const why = b.rejectedReason ? `: ${b.rejectedReason}` : "";
      console.log(`[facilitator] ${path} bazaar -> ${b.status ?? "(no status)"}${why}`);
    } catch {
      console.log(`[facilitator] ${path} bazaar header not readable: ${raw.slice(0, 120)}`);
    }
  }

  private async post(path: string, body: string): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.cfg.authHeader) headers.Authorization = this.cfg.authHeader;
      const res = await this.fetchImpl(`${this.url}${path}`, { method: "POST", headers, body, signal: controller.signal });
      const text = await res.text();
      this.bazaarOutcome(res.headers, path);
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
