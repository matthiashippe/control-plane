#!/usr/bin/env node
/**
 * Stand-in for Bridge and for the card onramp in the harness (goals/konto/05, point 14). Plain node, no package.
 *
 * Bridge (the paths src/konto/bridge.ts calls, shapes of docs/konto/euro.md): every request needs the header `Api-Key` with
 * the obviously fake value in BRIDGE_KEY, every POST an `Idempotency-Key`; the same key answers the object of the first call.
 *   POST /v0/kyc_links                                   -> kyc_status not_started, a kyc_link on https://bridge.test
 *   GET  /v0/kyc_links/{id}                              -> kyc_status approved (the person went through the check)
 *   GET  /v0/customers/{id}                              -> active, endorsement sepa approved
 *   POST /v0/customers/{id}/external_accounts            -> the bank account, last_4 of the IBAN
 *   POST /v0/customers/{id}/liquidation_addresses        -> a fresh address on Base; USDC sent there counts as paid out
 *   GET  /v0/customers/{id}/liquidation_addresses/{id}/drains -> empty list
 * Onramp: POST /onramp {address, amount, chain} mints `amount` atomic test USDC to `address` on the chain at RPC_URL (the open
 * mint() of the USDC mock, sent from the second anvil account), the way a card payment would deliver USDC to the smart wallet.
 * GET /mock/calls lists every call (method, path, whether the key matched, the Idempotency-Key, the JSON body, status and answer);
 * GET /healthz.
 *
 * Env: PORT (default 8790; 0 picks a free one and prints it), BRIDGE_KEY, RPC_URL (default http://chain-konto:8545),
 * USDC_ADDRESS (default the Base Sepolia test USDC), CHAIN_ID (default 84532).
 */
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.PORT ?? 8790);
const BRIDGE_KEY = process.env.BRIDGE_KEY || "harness-fake-bridge-key-not-a-secret";
const RPC_URL = process.env.RPC_URL || "http://chain-konto:8545";
const USDC = (process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e").toLowerCase();
const CHAIN_ID = Number(process.env.CHAIN_ID || 84532);
const MINT_SELECTOR = "0x40c10f19"; // mint(address,uint256)

const calls = [];
const byIdempotency = new Map();
const kycLinks = new Map();
const customers = new Map();
const external = new Map();
const liquidation = new Map();
let seq = 0;
const nextId = (prefix) => `${prefix}_${(++seq).toString().padStart(4, "0")}${crypto.randomBytes(4).toString("hex")}`;

async function rpc(method, params) {
  const res = await fetch(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

const word = (hex) => hex.replace(/^0x/, "").padStart(64, "0");

async function mint(address, amount) {
  const [, minter] = await rpc("eth_accounts", []);
  const data = MINT_SELECTOR + word(address.toLowerCase()) + word(BigInt(amount).toString(16));
  const hash = await rpc("eth_sendTransaction", [{ from: minter, to: USDC, data, gas: "0x30d40" }]);
  for (let i = 0; i < 50; i++) {
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (receipt) return { hash, status: receipt.status };
    await new Promise((r) => setTimeout(r, 200));
  }
  return { hash, status: null };
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (d) => { raw += d; if (raw.length > 1_000_000) req.destroy(); });
    req.on("end", () => {
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); } catch { resolve(undefined); }
    });
  });
}

/** Bridge: one handler per path; returns [status, body]. */
async function bridge(method, path, body) {
  let m;
  if (method === "POST" && path === "/v0/kyc_links") {
    if (!body?.email || body.type !== "individual") return [400, { code: "invalid_request", message: "email and type individual" }];
    const id = nextId("kyc");
    const customerId = nextId("cust");
    const link = { id, customer_id: customerId, email: body.email, type: "individual", kyc_link: `https://bridge.test/verify/${id}`, tos_link: `https://bridge.test/tos/${id}`, kyc_status: "not_started", tos_status: "pending" };
    kycLinks.set(id, link);
    customers.set(customerId, { id: customerId, status: "not_started", endorsements: [{ name: "sepa", status: "incomplete" }] });
    return [200, link];
  }
  if (method === "GET" && (m = /^\/v0\/kyc_links\/([^/]+)$/.exec(path))) {
    const link = kycLinks.get(decodeURIComponent(m[1]));
    if (!link) return [404, { code: "not_found" }];
    // The person finished the identity check at Bridge between the first page and the button.
    link.kyc_status = "approved";
    link.tos_status = "approved";
    customers.set(link.customer_id, { id: link.customer_id, status: "active", endorsements: [{ name: "sepa", status: "approved" }] });
    return [200, link];
  }
  if (method === "GET" && (m = /^\/v0\/customers\/([^/]+)$/.exec(path))) {
    const c = customers.get(decodeURIComponent(m[1]));
    return c ? [200, c] : [404, { code: "not_found" }];
  }
  if (method === "POST" && (m = /^\/v0\/customers\/([^/]+)\/external_accounts$/.exec(path))) {
    const customerId = decodeURIComponent(m[1]);
    if (customers.get(customerId)?.status !== "active") return [403, { code: "customer_not_active" }];
    const iban = String(body?.iban?.account_number ?? "");
    if (body?.currency !== "eur" || body?.account_type !== "iban" || !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban) || !/^[A-Z]{3}$/.test(String(body?.iban?.country ?? ""))) {
      return [400, { code: "invalid_request", message: "currency eur, account_type iban, iban.account_number, iban.country" }];
    }
    const id = nextId("ext");
    const account = { id, customer_id: customerId, currency: "eur", account_type: "iban", account_owner_name: body.account_owner_name, iban: { last_4: iban.slice(-4), country: body.iban.country }, active: true };
    external.set(id, account);
    return [201, account];
  }
  if (method === "POST" && (m = /^\/v0\/customers\/([^/]+)\/liquidation_addresses$/.exec(path))) {
    const customerId = decodeURIComponent(m[1]);
    const ext = external.get(String(body?.external_account_id ?? ""));
    if (!ext || ext.customer_id !== customerId) return [400, { code: "invalid_request", message: "external_account_id" }];
    if (body.chain !== "base" || body.currency !== "usdc" || body.destination_payment_rail !== "sepa" || body.destination_currency !== "eur") {
      return [400, { code: "invalid_request", message: "chain base, currency usdc, rail sepa, eur" }];
    }
    const id = nextId("liq");
    const address = `0x${crypto.randomBytes(20).toString("hex")}`;
    const liq = { id, customer_id: customerId, chain: "base", currency: "usdc", address, external_account_id: ext.id, destination_payment_rail: "sepa", destination_currency: "eur", state: "active" };
    liquidation.set(id, liq);
    return [201, liq];
  }
  if (method === "GET" && (m = /^\/v0\/customers\/([^/]+)\/liquidation_addresses\/([^/]+)\/drains$/.exec(path))) {
    return liquidation.has(decodeURIComponent(m[2])) ? [200, { count: 0, data: [] }] : [404, { code: "not_found" }];
  }
  return [404, { code: "not_found", message: `${method} ${path}` }];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://mock");
  const path = url.pathname;
  try {
    if (req.method === "GET" && path === "/healthz") return send(res, 200, { ok: true });
    if (req.method === "GET" && path === "/mock/calls") return send(res, 200, { calls });
    const body = req.method === "POST" ? await readJson(req) : null;
    if (body === undefined) return send(res, 400, { code: "invalid_json" });

    if (req.method === "POST" && path === "/onramp") {
      calls.push({ method: "POST", path, body });
      const address = String(body?.address ?? "");
      const amount = String(body?.amount ?? "");
      if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^[1-9][0-9]{0,15}$/.test(amount)) return send(res, 400, { error: "address and amount" });
      if (Number(body?.chain) !== CHAIN_ID) return send(res, 400, { error: `chain ${body?.chain} is not ${CHAIN_ID}` });
      const minted = await mint(address, amount);
      return send(res, minted.status === "0x1" ? 200 : 502, { address: address.toLowerCase(), amount, tx: minted.hash, status: minted.status });
    }

    if (path.startsWith("/v0/")) {
      const keyOk = req.headers["api-key"] === BRIDGE_KEY;
      const idem = req.method === "POST" ? String(req.headers["idempotency-key"] ?? "") : null;
      const call = { method: req.method, path, key_ok: keyOk, idempotency_key: idem, body, status: 0, answer: null };
      calls.push(call);
      if (!keyOk) return send(res, 401, { code: "unauthorized" });
      if (req.method === "POST" && !idem) return send(res, 400, { code: "idempotency_key_missing" });
      const slot = `${path}|${idem}`;
      const [status, answer] = idem && byIdempotency.has(slot) ? byIdempotency.get(slot) : await bridge(req.method ?? "GET", path, body);
      if (idem && status < 300) byIdempotency.set(slot, [status, answer]);
      Object.assign(call, { status, answer });
      return send(res, status, answer);
    }
    return send(res, 404, { error: "not_found" });
  } catch (err) {
    return send(res, 500, { error: String(err?.message ?? err).slice(0, 200) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`money-mock listening on ${server.address().port}`);
});
