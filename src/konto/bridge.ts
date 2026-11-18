/**
 * Bridge, the service that turns USDC on Base into euros on a bank account (goals/konto/05, docs/konto/euro.md "Auszahlung").
 *
 * The service reaches it at CP_BRIDGE_URL (default https://api.bridge.xyz) with the key from the file in CP_BRIDGE_KEY_FILE,
 * sent as the header `Api-Key`. Without the file the payout is off: `step: "payout"`, POST /v1/konto/payout and the payout rule
 * answer 503. Every POST carries an Idempotency-Key that the caller derives from what it asks for, so that a retry gets the
 * answer of the first try instead of a second object (Bridge refuses a second payout address for the same bank account); a GET
 * never carries one. `fetch` comes from outside, so tests answer for Bridge without a network.
 *
 * Neither the key nor an IBAN appears in an error, a log line or an answer: errors carry the path and the status only.
 */
import { readFileSync } from "node:fs";

export const BRIDGE_URL_DEFAULT = "https://api.bridge.xyz";

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
}>;

/** A request to Bridge that did not get a usable answer. */
export class BridgeError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(`bridge ${path} answered ${status}`);
    this.name = "BridgeError";
  }
}

export interface KycLink {
  id: string;
  customerId: string | null;
  /** The page at Bridge where the person confirms their identity. */
  kycLink: string;
  /** not_started, incomplete, under_review, approved, rejected, and the others of docs/konto/euro.md. */
  kycStatus: string;
}

export interface BridgeCustomer {
  id: string;
  status: string;
  endorsements: { name: string; status: string }[];
}

export interface ExternalAccount {
  id: string;
  last4: string | null;
}

export interface LiquidationAddress {
  id: string;
  /** Where USDC sent on Base becomes euros on the bank account: the only destination of the forwarder. */
  address: string;
  state: string | null;
}

export interface Drain {
  id: string;
  amount: string;
  currency: string;
  state: string;
  depositTxHash: string | null;
}

export interface Bridge {
  createKycLink(input: { email: string; fullName?: string; idempotencyKey: string }): Promise<KycLink>;
  getKycLink(id: string): Promise<KycLink>;
  getCustomer(id: string): Promise<BridgeCustomer>;
  createExternalAccount(
    customerId: string,
    input: { iban: string; country: string; ownerName: string; idempotencyKey: string },
  ): Promise<ExternalAccount>;
  createLiquidationAddress(customerId: string, input: { externalAccountId: string; idempotencyKey: string }): Promise<LiquidationAddress>;
  drains(customerId: string, liquidationAddressId: string): Promise<Drain[]>;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const segment = (v: string) => encodeURIComponent(v);

function kycLinkOf(path: string, o: Record<string, unknown>): KycLink {
  const id = str(o.id), kycLink = str(o.kyc_link), kycStatus = str(o.kyc_status);
  if (!id || !kycLink || !kycStatus) throw new BridgeError(path, 200);
  return { id, customerId: str(o.customer_id), kycLink, kycStatus };
}

/** The client over `fetch`. `baseUrl` without the /v0 of the paths. */
export function createBridge(params: { baseUrl?: string; apiKey: string; fetch: FetchLike }): Bridge {
  const base = (params.baseUrl || BRIDGE_URL_DEFAULT).replace(/\/+$/, "");
  async function call(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { "Api-Key": params.apiKey, accept: "application/json" };
    if (method === "POST") {
      headers["content-type"] = "application/json";
      headers["Idempotency-Key"] = idempotencyKey ?? "";
    }
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await params.fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch {
      throw new BridgeError(path, 0);
    }
    if (!res.ok) throw new BridgeError(path, res.status);
    const json = await res.json().catch(() => null);
    if (!json || typeof json !== "object") throw new BridgeError(path, res.status);
    return json as Record<string, unknown>;
  }
  return {
    async createKycLink(input) {
      const path = "/v0/kyc_links";
      const body = { email: input.email, type: "individual", endorsements: ["sepa"], ...(input.fullName ? { full_name: input.fullName } : {}) };
      return kycLinkOf(path, await call("POST", path, body, input.idempotencyKey));
    },
    async getKycLink(id) {
      const path = `/v0/kyc_links/${segment(id)}`;
      return kycLinkOf(path, await call("GET", path));
    },
    async getCustomer(id) {
      const path = `/v0/customers/${segment(id)}`;
      const o = await call("GET", path);
      const cid = str(o.id);
      if (!cid) throw new BridgeError(path, 200);
      const endorsements = Array.isArray(o.endorsements)
        ? (o.endorsements as Record<string, unknown>[]).map((e) => ({ name: String(e?.name ?? ""), status: String(e?.status ?? "") }))
        : [];
      return { id: cid, status: String(o.status ?? ""), endorsements };
    },
    async createExternalAccount(customerId, input) {
      const path = `/v0/customers/${segment(customerId)}/external_accounts`;
      const body = {
        currency: "eur",
        account_type: "iban",
        account_owner_name: input.ownerName,
        account_owner_type: "individual",
        iban: { account_number: input.iban, country: input.country },
      };
      const o = await call("POST", path, body, input.idempotencyKey);
      const id = str(o.id);
      if (!id) throw new BridgeError(path, 201);
      const iban = o.iban as Record<string, unknown> | undefined;
      return { id, last4: str(iban?.last_4) ?? str(o.last_4) };
    },
    async createLiquidationAddress(customerId, input) {
      const path = `/v0/customers/${segment(customerId)}/liquidation_addresses`;
      const body = {
        chain: "base",
        currency: "usdc",
        external_account_id: input.externalAccountId,
        destination_payment_rail: "sepa",
        destination_currency: "eur",
      };
      const o = await call("POST", path, body, input.idempotencyKey);
      const id = str(o.id), address = str(o.address);
      if (!id || !address) throw new BridgeError(path, 201);
      return { id, address, state: str(o.state) };
    },
    async drains(customerId, liquidationAddressId) {
      const path = `/v0/customers/${segment(customerId)}/liquidation_addresses/${segment(liquidationAddressId)}/drains`;
      const o = await call("GET", path);
      const data = Array.isArray(o.data) ? (o.data as Record<string, unknown>[]) : [];
      return data.map((d) => ({
        id: String(d.id ?? ""),
        amount: String(d.amount ?? ""),
        currency: String(d.currency ?? ""),
        state: String(d.state ?? ""),
        depositTxHash: str(d.deposit_tx_hash),
      }));
    },
  };
}

/** Null while CP_BRIDGE_KEY_FILE is unset; a start error when the file cannot be read or is empty. Never shows the key. */
export function bridgeFromEnv(env: Record<string, string | undefined>, fetchFn: FetchLike): Bridge | null {
  const file = env.CP_BRIDGE_KEY_FILE?.trim();
  if (!file) return null;
  let key: string;
  try {
    key = readFileSync(file, "utf8").trim();
  } catch {
    throw new Error("CP_BRIDGE_KEY_FILE cannot be read");
  }
  if (!key || /\s/.test(key)) throw new Error("CP_BRIDGE_KEY_FILE does not hold one API key");
  return createBridge({ baseUrl: env.CP_BRIDGE_URL?.trim() || BRIDGE_URL_DEFAULT, apiKey: key, fetch: fetchFn });
}

/** ISO 3166 alpha-3 of the SEPA countries, by the two letters an IBAN starts with; Bridge wants three (docs/konto/euro.md). */
export const SEPA_COUNTRIES: Record<string, string> = {
  AD: "AND", AT: "AUT", BE: "BEL", BG: "BGR", CH: "CHE", CY: "CYP", CZ: "CZE", DE: "DEU", DK: "DNK", EE: "EST", ES: "ESP",
  FI: "FIN", FR: "FRA", GB: "GBR", GI: "GIB", GR: "GRC", HR: "HRV", HU: "HUN", IE: "IRL", IS: "ISL", IT: "ITA", LI: "LIE",
  LT: "LTU", LU: "LUX", LV: "LVA", MC: "MCO", MT: "MLT", NL: "NLD", NO: "NOR", PL: "POL", PT: "PRT", RO: "ROU", SE: "SWE",
  SI: "SVN", SK: "SVK", SM: "SMR", VA: "VAT",
};

/**
 * The IBAN without spaces in capitals, with its country in three letters, when it passes the check of ISO 13616 (mod 97 is 1)
 * and belongs to a SEPA country; null otherwise.
 */
export function parseIban(v: unknown): { iban: string; country: string; last4: string } | null {
  if (typeof v !== "string") return null;
  const iban = v.replace(/[\s-]+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  const country = SEPA_COUNTRIES[iban.slice(0, 2)];
  if (!country) return null;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const digits = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1 ? { iban, country, last4: iban.slice(-4) } : null;
}
