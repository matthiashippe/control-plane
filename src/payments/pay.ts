/**
 * `/pay/{usd}/{address}`: x402-v1-Seller für Credit-Topups (docs/protocol.md, Abschnitt Topup).
 *
 * Ablauf: ohne X-Payment ein 402 mit Angebot; mit X-Payment wird die EIP-3009-Signatur offline
 * geprüft, dann settlet der Settler, dann werden Payment-Status, Ledger-Zeile und Saldo in einer
 * Transaktion geschrieben. Idempotenzschlüssel ist die Authorization-Nonce.
 */

import { isAddress, verifyTypedData, type Address, type Hex } from "viem";
import { MC_PER_CENT, mcToCents, postLedger, type Db } from "../db.js";
import { DOC } from "../errors.js";
import type { Authorization, Settler } from "./settler.js";

/** Die Tiers, die der Runtime-Client kennt (`TOPUP_TIERS` in topup.ts). */
export const TOPUP_TIERS_USD = [5, 25, 100, 500, 1000, 2500] as const;

export interface PayConfig {
  payTo: Address;
  /** "base" oder "base-sepolia"; so steht es im Angebot, der Client normalisiert selbst. */
  network: "base" | "base-sepolia";
  chainId: number;
  usdcAddress: Address;
  maxTimeoutSeconds: number;
  /** Angebotene Tiers in USD; Betreiber dürfen ergänzen (z. B. 1 für Abnahmen). */
  tiers: readonly number[];
}

export interface PayResponse {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface PaymentRequired {
  x402Version: 1;
  accepts: Array<{
    scheme: "exact";
    network: string;
    maxAmountRequired: string;
    payTo: Address;
    asset: Address;
    maxTimeoutSeconds: number;
    resource: string;
    description: string;
  }>;
}

const USDC_DECIMALS = 6n;

export function tierToAtomic(usd: number): bigint {
  return BigInt(usd) * 10n ** USDC_DECIMALS;
}

export function buildPaymentRequired(cfg: PayConfig, usd: number, recipient: Address): PaymentRequired {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: cfg.network,
        // 7+ Stellen: der Runtime-Client liest das als atomare Einheit (siehe protocol.md).
        maxAmountRequired: tierToAtomic(usd).toString(),
        payTo: cfg.payTo,
        asset: cfg.usdcAddress,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        resource: `/pay/${usd}/${recipient}`,
        description: `${usd} USD credits`,
      },
    ],
  };
}

/**
 * Warum ein bezahlter Versuch abgelehnt wurde, in einem Satz, der sagt, was zu tun ist. Der
 * Runtime-Client liest aus diesem Körper nur `x402Version` und `accepts` (Upstream
 * `src/conway/x402.ts`, `normalizePaymentRequired`), Zusatzfelder ignoriert er. Der Mensch, der
 * den Topup von Hand nachstellt, liest genau sie.
 */
function zahlungsHinweis(cfg: PayConfig, usd: number, error: string): string | null {
  if (error.startsWith("wrong_amount")) {
    return (
      `The signed authorization does not carry the amount of the ${usd} USD tier. Sign exactly ` +
      `${tierToAtomic(usd).toString()} atomic USDC units (6 decimals), the value in ` +
      "accepts[0].maxAmountRequired above, or call /pay/{another tier}/{address}."
    );
  }
  if (error.startsWith("settlement_failed")) {
    return (
      "The authorization was signed correctly but could not be settled on chain, so no credits " +
      "were added. The usual causes are too little USDC in the wallet or an authorization that " +
      "has already been spent. Check the wallet on Basescan, then sign a fresh authorization " +
      "with a new nonce and retry."
    );
  }
  switch (error) {
    case "malformed_payment":
      return (
        "The X-Payment header could not be read. It must be base64 of the x402 v1 JSON " +
        "{x402Version, scheme, network, payload: {signature, authorization: {from, to, value, " +
        "validAfter, validBefore, nonce}}}; the offer in this body says what to sign."
      );
    case "unsupported_scheme":
      return 'Only the x402 scheme "exact" is settled here. Sign the offer in accepts[0] above.';
    case "wrong_network":
      return (
        `The payment was signed for a different network. This instance settles on ${cfg.network} ` +
        `(chainId ${cfg.chainId}); sign the offer in accepts[0] above.`
      );
    case "wrong_recipient":
      return (
        `The authorization pays a different address. USDC has to go to ${cfg.payTo}, exactly the ` +
        "payTo of the offer above, or nothing is credited."
      );
    case "recipient_must_match_payer":
      return (
        "Credits go to the wallet that signed the payment, and that signer is not the address in " +
        "the URL. This is deliberate: a signed x402 header is worth money, and without this check " +
        "anyone who catches one could redirect the credits while the USDC keeps leaving the " +
        "signer. Call /pay/{usd}/{the signing wallet}. To fund a different automaton, send USDC " +
        "to its wallet and let its own runtime buy credits."
      );
    case "authorization_expired":
      return (
        "The authorization's validBefore is already in the past. Sign a fresh one; " +
        `maxTimeoutSeconds in the offer above (${cfg.maxTimeoutSeconds} s) is how long it stays valid.`
      );
    case "authorization_not_yet_valid":
      return (
        "The authorization's validAfter lies more than a minute in the future, so it cannot be " +
        "settled yet. Set it to roughly now (the runtime uses now minus 60 seconds) and sign again."
      );
    case "invalid_signature":
      return (
        "The EIP-3009 signature does not verify against the `from` address of the authorization. " +
        'Sign TransferWithAuthorization with the EIP-712 domain {name: "USD Coin", version: "2", ' +
        `chainId: ${cfg.chainId}, verifyingContract: ${cfg.usdcAddress}} over exactly the values ` +
        "you send. A wrong chainId or USDC address is the usual cause. Nothing was charged."
      );
    default:
      return null;
  }
}

function paymentRequiredResponse(cfg: PayConfig, usd: number, recipient: Address, error?: string): PayResponse {
  const required = buildPaymentRequired(cfg, usd, recipient);
  const body: Record<string, unknown> = { ...required };
  if (error) {
    body.error = error;
    const hinweis = zahlungsHinweis(cfg, usd, error);
    if (hinweis) {
      body.message = hinweis;
      body.docs = DOC.payments;
    }
  } else {
    body.message =
      `Payment required: ${usd} USD in USDC on ${cfg.network} buys ${usd * 100} credit cents for ` +
      `${recipient}. Sign the offer in accepts[0] as an EIP-3009 TransferWithAuthorization and ` +
      "repeat this request with the X-Payment header; the runtime does this for you.";
    body.docs = DOC.payments;
  }
  return {
    status: 402,
    body,
    headers: { "X-Payment-Required": Buffer.from(JSON.stringify(required)).toString("base64") },
  };
}

interface ParsedPayment {
  x402Version: number;
  scheme: string;
  network: string;
  signature: Hex;
  authorization: Authorization;
}

function normalizeNetwork(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "base" || v === "eip155:8453") return "base";
  if (v === "base-sepolia" || v === "eip155:84532") return "base-sepolia";
  return null;
}

function parsePaymentHeader(header: string): ParsedPayment | null {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  const payload = v.payload as Record<string, unknown> | undefined;
  const auth = payload?.authorization as Record<string, unknown> | undefined;
  if (!payload || !auth) return null;
  const network = normalizeNetwork(v.network);
  const str = (x: unknown) => (typeof x === "string" ? x : null);
  const from = str(auth.from);
  const to = str(auth.to);
  const value = str(auth.value);
  const validAfter = str(auth.validAfter);
  const validBefore = str(auth.validBefore);
  const nonce = str(auth.nonce);
  const signature = str(payload.signature);
  if (!network || !from || !to || !value || !validAfter || !validBefore || !nonce || !signature) return null;
  if (!isAddress(from) || !isAddress(to)) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) return null;
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) return null;
  if (!/^\d+$/.test(value) || !/^\d+$/.test(validAfter) || !/^\d+$/.test(validBefore)) return null;
  return {
    x402Version: typeof v.x402Version === "number" ? v.x402Version : 1,
    scheme: str(v.scheme) ?? "",
    network,
    signature: signature as Hex,
    authorization: {
      from: from as Address,
      to: to as Address,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce.toLowerCase() as Hex,
    },
  };
}

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export async function verifyAuthorizationSignature(
  cfg: PayConfig,
  auth: Authorization,
  signature: Hex,
): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: auth.from,
      domain: { name: "USD Coin", version: "2", chainId: cfg.chainId, verifyingContract: cfg.usdcAddress },
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: auth.from,
        to: auth.to,
        value: auth.value,
        validAfter: auth.validAfter,
        validBefore: auth.validBefore,
        nonce: auth.nonce,
      },
      signature,
    });
  } catch {
    return false;
  }
}

interface PaymentRow {
  nonce: string;
  status: "pending" | "settled" | "failed";
  credits_mc: number;
  to_address: string;
  tx_hash: string | null;
  balance_after_mc: number | null;
}

function settledResponse(db: Db, row: PaymentRow): PayResponse {
  // Bewusst NICHT den aktuellen Saldo lesen. Diese Antwort gibt es ohne API-Key, sobald jemand
  // einen bereits verbrauchten Zahlungs-Header wiederholt. Mit dem aktuellen Wert wäre das ein
  // Kontostandsmelder für fremde Mandanten (Sicherheitsprüfung 19.09.2026). Der Saldo zum
  // Zeitpunkt der Gutschrift steht in der Zahlung selbst und verrät nichts Neues.
  void db;
  return {
    status: 200,
    body: {
      credits_cents: mcToCents(row.credits_mc),
      balance_cents: mcToCents(row.balance_after_mc ?? row.credits_mc),
      tx_hash: row.tx_hash,
    },
  };
}

/**
 * Dieselbe Autorisierung ist bereits unterwegs. Kein Fehler des Aufrufers, nur ein Rennen: die
 * Nonce ist der Idempotenzschlüssel, eine Wiederholung bucht nie zweimal.
 */
const SETTLEMENT_IN_PROGRESS = {
  error: "settlement_in_progress",
  message:
    "This payment authorization is already being settled by another request. Nothing is lost and " +
    "nothing is charged twice: the authorization nonce is the idempotency key. Wait a few seconds " +
    "and repeat the identical request to see the result.",
  docs: DOC.payments,
};

export interface PayRequest {
  usd: string;
  recipient: string;
  paymentHeader?: string;
}

export async function handlePay(
  db: Db,
  settler: Settler | null,
  cfg: PayConfig,
  req: PayRequest,
  now = Date.now(),
): Promise<PayResponse> {
  const usd = Number(req.usd);
  if (!cfg.tiers.includes(usd)) {
    return {
      status: 400,
      body: {
        error: "invalid_tier",
        tiers: cfg.tiers,
        message:
          `${req.usd} is not a tier this instance sells. Call /pay/{tier}/{address} with one of ` +
          `${cfg.tiers.join(", ")} USD. Tiers are fixed because the offer has to be signed ` +
          "before the money moves.",
        docs: DOC.payments,
      },
    };
  }
  if (!isAddress(req.recipient)) {
    return {
      status: 400,
      body: {
        error: "invalid_address",
        message:
          "The address in the path is not an EVM address (0x plus 40 hex characters). The credits " +
          "are booked to that wallet, so it has to be the automaton's own wallet.",
        docs: DOC.payments,
      },
    };
  }
  const recipient = req.recipient.toLowerCase() as Address;
  if (!settler) {
    return {
      status: 503,
      body: {
        error: "payments_unavailable",
        message:
          "This instance can quote a price but has no settler configured, so a payment could not " +
          "be redeemed on chain. Do not sign anything; check GET /.well-known/x402 to see whether " +
          "topups are available here.",
        docs: DOC.payments,
      },
    };
  }
  if (!req.paymentHeader) {
    return paymentRequiredResponse(cfg, usd, recipient);
  }

  const payment = parsePaymentHeader(req.paymentHeader);
  if (!payment) return paymentRequiredResponse(cfg, usd, recipient, "malformed_payment");
  if (payment.scheme !== "exact") return paymentRequiredResponse(cfg, usd, recipient, "unsupported_scheme");
  if (payment.network !== cfg.network) return paymentRequiredResponse(cfg, usd, recipient, "wrong_network");

  const auth = payment.authorization;
  const expected = tierToAtomic(usd);
  if (auth.to.toLowerCase() !== cfg.payTo.toLowerCase()) {
    return paymentRequiredResponse(cfg, usd, recipient, "wrong_recipient");
  }
  // Die EIP-3009-Signatur deckt Betrag, Empfänger der USDC und Nonce, aber nicht den Pfad, der
  // bestimmt, WER die Credits bekommt. Ohne diese Prüfung kann jeder, der einen signierten
  // Header in die Hände bekommt, die Gutschrift auf eine beliebige Adresse umleiten, während das
  // Geld weiter vom Signierer abfließt (Sicherheitsprüfung 19.09.2026). Die Runtime lädt immer
  // ihre eigene Wallet auf, also schränkt das keinen echten Ablauf ein.
  if (auth.from.toLowerCase() !== recipient.toLowerCase()) {
    return paymentRequiredResponse(cfg, usd, recipient, "recipient_must_match_payer");
  }
  if (auth.value !== expected) {
    return paymentRequiredResponse(cfg, usd, recipient, `wrong_amount: expected ${expected}`);
  }
  const nowSec = BigInt(Math.floor(now / 1000));
  if (auth.validBefore <= nowSec) return paymentRequiredResponse(cfg, usd, recipient, "authorization_expired");
  if (auth.validAfter > nowSec + 60n) return paymentRequiredResponse(cfg, usd, recipient, "authorization_not_yet_valid");

  // Idempotenz: dieselbe Nonce liefert dieselbe Antwort, egal wie oft sie kommt.
  const existing = db.prepare("SELECT nonce, status, credits_mc, to_address, tx_hash, balance_after_mc FROM payments WHERE nonce = ?").get(auth.nonce) as
    | PaymentRow
    | undefined;
  if (existing?.status === "settled") return settledResponse(db, existing);
  if (existing?.status === "pending") return { status: 409, body: SETTLEMENT_IN_PROGRESS };

  if (!(await verifyAuthorizationSignature(cfg, auth, payment.signature))) {
    return paymentRequiredResponse(cfg, usd, recipient, "invalid_signature");
  }

  const creditsCents = usd * 100;
  const creditsMc = creditsCents * MC_PER_CENT;
  const nowIso = new Date(now).toISOString();
  const claim = db.transaction(() => {
    if (existing?.status === "failed") {
      // `changes` prüfen, sonst gewinnen zwei parallele Retries beide den Claim, settlen beide
      // und schreiben zwei Gutschriften für dieselbe Zahlung. Der WHERE-Filter allein reicht
      // nicht: Er verhindert nur, dass ein Nicht-failed-Zustand überschrieben wird.
      const res = db
        .prepare("UPDATE payments SET status = 'pending', error = NULL, created_at = ? WHERE nonce = ? AND status = 'failed'")
        .run(nowIso, auth.nonce);
      return res.changes === 1;
    }
    try {
      db.prepare(
        "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
      ).run(auth.nonce, auth.from.toLowerCase(), recipient, auth.value.toString(), creditsMc, nowIso);
      return true;
    } catch {
      return false; // Rennen: ein anderer Request hat die Nonce gerade angelegt
    }
  });
  if (!claim()) return { status: 409, body: SETTLEMENT_IN_PROGRESS };

  // Ab hier darf ein Client-Abbruch nichts mehr ändern: Settlement und Buchung laufen zu Ende.
  const result = await settler.settle(auth, payment.signature, `/pay/${usd}/${recipient}`);
  if (!result.ok) {
    db.prepare("UPDATE payments SET status = 'failed', error = ?, tx_hash = ? WHERE nonce = ?").run(
      result.error ?? "settlement_failed",
      result.txHash ?? null,
      auth.nonce,
    );
    return paymentRequiredResponse(cfg, usd, recipient, `settlement_failed: ${result.error ?? "unknown"}`);
  }

  const book = db.transaction(() => {
    const { balanceMc } = postLedger(db, {
      address: recipient,
      kind: "topup",
      deltaMc: creditsMc,
      ref: auth.nonce,
      meta: { tx_hash: result.txHash, from: auth.from.toLowerCase(), value_atomic: auth.value.toString(), usd },
    });
    db.prepare("UPDATE payments SET status = 'settled', tx_hash = ?, settled_at = ?, balance_after_mc = ? WHERE nonce = ?").run(
      result.txHash ?? null,
      new Date().toISOString(),
      balanceMc,
      auth.nonce,
    );
    return balanceMc;
  });
  const balanceMc = book();

  return {
    status: 200,
    body: { credits_cents: creditsCents, balance_cents: mcToCents(balanceMc), tx_hash: result.txHash ?? null },
    headers: {
      "X-Payment-Response": Buffer.from(JSON.stringify({ success: true, txHash: result.txHash ?? null, network: cfg.network })).toString("base64"),
    },
  };
}

export function payConfigFromEnv(env: NodeJS.ProcessEnv): PayConfig | null {
  const payTo = env.CP_PAY_TO;
  if (!payTo) return null;
  if (!isAddress(payTo)) throw new Error("CP_PAY_TO ist keine Adresse");
  const network = (env.CP_NETWORK || "base") as PayConfig["network"];
  if (network !== "base" && network !== "base-sepolia") throw new Error(`CP_NETWORK unbekannt: ${network}`);
  const usdc = env.CP_USDC_ADDRESS || (network === "base"
    ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    : "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  const tiers = (env.CP_TOPUP_TIERS_USD || TOPUP_TIERS_USD.join(","))
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!tiers.length) throw new Error("CP_TOPUP_TIERS_USD ist leer");
  return {
    payTo: payTo as Address,
    network,
    chainId: Number(env.CP_CHAIN_ID || (network === "base" ? 8453 : 84532)),
    usdcAddress: usdc as Address,
    maxTimeoutSeconds: Number(env.CP_PAY_TIMEOUT_SECONDS || 300),
    tiers,
  };
}
