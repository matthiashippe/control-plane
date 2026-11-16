/**
 * Shared setup of the money tests of goals/konto/05: a smart wallet that a plain key owns, a chain that answers like Base Sepolia
 * and records every transaction it gets through sendKontoTx, Bridge answered without a network, and an account made through the
 * handoff of konto 03. No port, no real key (generatePrivateKey at run time), only the example IBAN.
 */
import { afterEach, expect } from "vitest";
import {
  concat,
  createPublicClient,
  custom,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  erc6492SignatureValidatorByteCode,
  getAddress,
  HttpRequestError,
  keccak256,
  pad,
  parseTransaction,
  recoverAddress,
  type Address,
  type Hex,
  type PrivateKeyAccount,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { Bridge, FetchLike } from "../src/konto/bridge.js";
import { createBridge } from "../src/konto/bridge.js";
import { SEPOLIA_USDC, SPEND_PERMISSION_MANAGER } from "../src/konto/config.js";
import { FORWARDER_ABI, FORWARDER_BYTECODE } from "../src/konto/forwarder.js";
import { createPayoutChain } from "../src/konto/payout.js";
import { SPEND_PERMISSION_TYPES, spendPermissionDomain } from "../src/konto/permission.js";
import { SPEND_PERMISSION_MANAGER_ABI } from "../src/konto/topup.js";
import type { KontoDeps } from "../src/handoff/routes.js";
import { ATLAS, create, handoffApp, tap } from "./handoff-helpers.js";

export const DAY = 86_400;
export const START_SEC = Math.floor(Date.parse("2026-11-13T12:00:00Z") / 1000);
export const EXAMPLE_IBAN = "DE89 3704 0044 0532 0130 00";
export const PROXY = "0x4e59b44847b379578588920ca78fbf26c0b4956c";

/**
 * The verifier of a chain on which `owners` maps smart wallets to the key that owns them. `mode.down` makes every request fail
 * like an RPC that answers 503; otherwise eth_call of the ERC-6492 validator says whether the owner of the wallet signed.
 */
export function walletChain() {
  const owners = new Map<string, string>();
  const mode = { down: false };
  const calls: string[] = [];
  const client = createPublicClient({
    chain: baseSepolia,
    transport: custom(
      {
        async request({ method, params }: { method: string; params?: unknown[] }) {
          calls.push(method);
          if (mode.down) throw new HttpRequestError({ url: "https://sepolia.base.org", status: 503, body: { method } });
          if (method !== "eth_call") throw new Error(`unexpected ${method}`);
          const data = (params?.[0] as { data: Hex }).data;
          const args = `0x${data.slice(erc6492SignatureValidatorByteCode.length)}` as Hex;
          const [wallet, hash, signature] = decodeAbiParameters([{ type: "address" }, { type: "bytes32" }, { type: "bytes" }], args);
          const owner = owners.get(wallet.toLowerCase());
          let ok = false;
          try {
            ok = Boolean(owner) && (await recoverAddress({ hash, signature })).toLowerCase() === owner;
          } catch {
            ok = false;
          }
          return ok ? "0x01" : "0x00";
        },
      },
      { retryCount: 0 },
    ),
  }) as unknown as PublicClient;
  return { owners, mode, calls, client };
}

/** One transaction the chain got, decoded. */
export interface Sent {
  kind: "deploy" | "approveWithSignature" | "payout" | "retire" | "other";
  to: string;
  /** deploy: the address it creates; payout and retire: the forwarder; approveWithSignature: the spender of the permission. */
  target?: string;
  value?: bigint;
  salt?: bigint;
  /** deploy: the five constructor arguments as the init code carries them. */
  ctor?: string[];
}

/**
 * A Base Sepolia node for the payout: USDC balances, the code at addresses, approvals at the SpendPermissionManager, and every
 * raw transaction decoded and applied, so that a payout moves the USDC of the wallet to the destination of the forwarder.
 */
export function payoutNode() {
  const balances = new Map<string, bigint>();
  const code = new Map<string, Hex>();
  const approved = new Set<string>();
  const destinations = new Map<string, string>();
  const sent: Sent[] = [];
  const reverted = new Set<string>();
  let n = 0;
  const hashOf = () => `0x${String(++n).padStart(64, "0")}` as Hex;
  const key = (p: { salt: bigint; account: string }) => `${p.account.toLowerCase()}:${p.salt}`;
  const transport = custom(
    {
      async request({ method, params }: { method: string; params?: unknown[] }) {
        switch (method) {
          case "eth_chainId": return "0x14a34";
          case "eth_getTransactionCount": return "0x0";
          case "eth_estimateGas": return "0x30000";
          case "eth_maxPriorityFeePerGas": return "0x1";
          case "eth_gasPrice": return "0x2";
          case "eth_blockNumber": return "0x10";
          case "eth_getBlockByNumber": return { baseFeePerGas: "0x1", number: "0x10", hash: "0x" + "00".repeat(32), timestamp: "0x1", transactions: [] };
          case "eth_getCode": return code.get(String(params?.[0]).toLowerCase()) ?? "0x";
          case "eth_call": {
            const { to, data } = params?.[0] as { to: string; data: Hex };
            if (to.toLowerCase() === SEPOLIA_USDC) {
              const [who] = decodeAbiParameters([{ type: "address" }], `0x${data.slice(10)}` as Hex);
              return encodeAbiParameters([{ type: "uint256" }], [balances.get(who.toLowerCase()) ?? 0n]);
            }
            const call = decodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, data });
            if (call.functionName === "isApproved") return encodeAbiParameters([{ type: "bool" }], [approved.has(key(call.args![0] as never))]);
            throw new Error(`unexpected eth_call ${call.functionName}`);
          }
          case "eth_sendRawTransaction": {
            const tx = parseTransaction(params?.[0] as Hex);
            const to = tx.to!.toLowerCase();
            const hash = hashOf();
            if (to === PROXY) {
              const init = `0x${tx.data!.slice(66)}` as Hex;
              const at = getAddress(`0x${keccak256(concat(["0xff", PROXY, tx.data!.slice(0, 66) as Hex, keccak256(init)])).slice(-40)}`).toLowerCase();
              const ctor = decodeAbiParameters(
                [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }],
                `0x${init.slice(FORWARDER_BYTECODE.length)}` as Hex,
              ).map((a) => a.toLowerCase());
              code.set(at, "0x6001");
              destinations.set(at, ctor[1]);
              sent.push({ kind: "deploy", to, target: at, ctor });
            } else if (to === SPEND_PERMISSION_MANAGER) {
              const call = decodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, data: tx.data! });
              const p = call.args![0] as { spender: string; salt: bigint; account: string };
              approved.add(key(p));
              sent.push({ kind: call.functionName === "approveWithSignature" ? "approveWithSignature" : "other", to, target: p.spender.toLowerCase(), salt: p.salt });
            } else {
              const call = decodeFunctionData({ abi: FORWARDER_ABI, data: tx.data! });
              const p = call.args![0] as { account: string; salt: bigint };
              if (call.functionName === "payout") {
                const value = call.args![1] as bigint;
                const from = p.account.toLowerCase();
                const have = balances.get(from) ?? 0n;
                if (!code.has(to) || have < value || !approved.has(key(p))) reverted.add(hash);
                else {
                  balances.set(from, have - value);
                  const dest = destinations.get(to)!;
                  balances.set(dest, (balances.get(dest) ?? 0n) + value);
                }
                sent.push({ kind: "payout", to, target: to, value, salt: p.salt });
              } else if (call.functionName === "retire") {
                approved.delete(key(p));
                sent.push({ kind: "retire", to, target: to, salt: p.salt });
              } else sent.push({ kind: "other", to });
            }
            return hash;
          }
          case "eth_getTransactionReceipt":
            return {
              status: reverted.has(String(params?.[0])) ? "0x0" : "0x1", transactionHash: params?.[0], blockNumber: "0x10", blockHash: "0x" + "00".repeat(32),
              logs: [], cumulativeGasUsed: "0x1", gasUsed: "0x1", effectiveGasPrice: "0x1", from: "0x" + "00".repeat(20), to: null, transactionIndex: "0x0",
              type: "0x2", logsBloom: "0x" + "00".repeat(256), contractAddress: null,
            };
          default: throw new Error(`unexpected ${method}`);
        }
      },
    },
    { retryCount: 0 },
  );
  return { balances, code, approved, sent, transport };
}

/** Bridge without a network: records every request; `kycStatus` is what the identity check reports. */
export function bridgeFake() {
  const calls: { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> | null }[] = [];
  const state = { kycStatus: "not_started", liquidation: [] as string[] };
  let next = 0;
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ method, path: url.pathname, headers: init?.headers ?? {}, body });
    const ok = (status: number, json: unknown) => ({ status, ok: status < 300, json: async () => json });
    const kyc = { id: "kyc_1", customer_id: "cus_1", kyc_link: "https://bridge.example/verify/kyc_1", kyc_status: state.kycStatus, tos_link: "https://bridge.example/tos", tos_status: "approved" };
    if (method === "POST" && url.pathname === "/v0/kyc_links") return ok(200, kyc);
    if (method === "GET" && url.pathname === "/v0/kyc_links/kyc_1") return ok(200, kyc);
    if (method === "POST" && /^\/v0\/customers\/cus_1\/external_accounts$/.test(url.pathname)) {
      const iban = (body?.iban as { account_number: string }).account_number;
      return ok(201, { id: `ext_${++next}`, currency: "eur", account_type: "iban", iban: { last_4: iban.slice(-4) } });
    }
    if (method === "POST" && /^\/v0\/customers\/cus_1\/liquidation_addresses$/.test(url.pathname)) {
      const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
      state.liquidation.push(address);
      return ok(201, { id: `liq_${next}`, chain: "base", currency: "usdc", address, state: "active" });
    }
    return ok(404, { code: "not_found" });
  };
  const bridge: Bridge = createBridge({ baseUrl: "https://bridge.test", apiKey: "fake-bridge", fetch });
  return { calls, state, bridge };
}

const opened: ReadableStreamDefaultReader<Uint8Array>[] = [];
afterEach(async () => {
  for (const r of opened.splice(0)) await r.cancel().catch(() => {});
});

/** All events of a stream until it ends, each read raced against 10 s. */
export async function allEvents(res: Response): Promise<Record<string, string>[]> {
  const reader = res.body!.getReader();
  opened.push(reader);
  let text = "";
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const r = await Promise.race([
      reader.read(),
      new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error("stream did not end within 10 s")), 10_000); }),
    ]).finally(() => clearTimeout(timer));
    if (r.done) break;
    text += new TextDecoder().decode(r.value);
  }
  return [...text.matchAll(/^data: (.*)$/gm)].map((m) => JSON.parse(m[1]) as Record<string, string>);
}

/** A permission signed by `owner` for the smart wallet `account`, as the page sends it. */
export async function signed(owner: PrivateKeyAccount, permission: Record<string, unknown>) {
  const message = { extraData: "0x", ...permission } as Record<string, unknown>;
  const signature = await owner.signTypedData({
    domain: spendPermissionDomain(84532),
    types: SPEND_PERMISSION_TYPES,
    primaryType: "SpendPermission",
    message: message as never,
  });
  const json = Object.fromEntries(Object.entries(message).map(([k, v]) => [k, typeof v === "bigint" ? String(v) : v]));
  return { permission: json, signature };
}

/** The whole money setup: an app with account, payout chain and Bridge, and the helpers the tests use. */
export function moneySetup(over: { konto?: Partial<KontoDeps> | null; bridge?: boolean } = {}) {
  const verify = walletChain();
  const node = payoutNode();
  const gas = privateKeyToAccount(generatePrivateKey());
  const payoutChain = createPayoutChain({ chainId: 84532, account: gas, transport: node.transport, token: SEPOLIA_USDC });
  const bridge = bridgeFake();
  const konto: KontoDeps | null =
    over.konto === null ? null : { chainId: 84532, spender: gas.address, token: SEPOLIA_USDC, verifyClient: verify.client, payoutChain, ...over.konto };
  const s = handoffApp({ konto, bridge: over.bridge === false ? null : bridge.bridge });
  return { ...s, verify, node, gas, bridge, konto };
}
export type MoneySetup = ReturnType<typeof moneySetup>;

/** An account of konto 03 for a fresh smart wallet owned by a fresh key, made through the handoff, and its API key. */
export async function account(s: MoneySetup) {
  const owner = privateKeyToAccount(generatePrivateKey());
  const wallet = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  s.verify.owners.set(wallet, owner.address.toLowerCase());
  const h = await create(s.app, { ...ATLAS, step: "konto" });
  await tap(s.app, h.code, h.match);
  const body = await signed(owner, {
    account: wallet,
    spender: s.gas.address.toLowerCase(),
    token: SEPOLIA_USDC,
    allowance: 5_000_000n,
    period: DAY,
    start: START_SEC,
    end: START_SEC + 365 * DAY,
    salt: 7n,
  });
  const res = await s.app.request(`/h/${h.code}/konto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: wallet, owner: owner.address, organization_id: "org-test-1", ...body }),
  });
  expect(res.status).toBe(200);
  const done = (await allEvents(await s.app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }))).at(-1)!;
  expect(done.state).toBe("done");
  return { owner, address: wallet as Address, key: done.api_key };
}

/** The forwarder address for account and destination, computed here from the CREATE2 rule, not with the code under test. */
export function expectedForwarder(account: string, destination: string, caller: string): string {
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }],
    [account as Address, destination as Address, SEPOLIA_USDC, SPEND_PERMISSION_MANAGER, caller as Address],
  );
  const digest = keccak256(concat(["0xff", PROXY, pad("0x00", { size: 32 }), keccak256(concat([FORWARDER_BYTECODE, args]))]));
  return `0x${digest.slice(-40)}`.toLowerCase();
}

/** A form post of the page. */
export const form = (s: MoneySetup, path: string, fields: Record<string, string>) =>
  s.app.request(path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });

export const json = (s: MoneySetup, path: string, body: unknown, key?: string) =>
  s.app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });

export const stateOf = (s: MoneySetup, code: string) => (s.db.prepare("SELECT state FROM handoffs WHERE code = ?").get(code) as { state: string }).state;

/** The value of a data attribute of the element with `id` in `html`. */
export function dataOf(html: string, id: string, name: string): string | null {
  const tag = new RegExp(`<[^>]*id="${id}"[^>]*>`).exec(html)?.[0];
  return tag ? (new RegExp(`data-${name}="([^"]*)"`).exec(tag)?.[1] ?? null) : null;
}

/** The second permission as the page builds it: spender `forwarder`, USDC, no cap, 30 days, no end. */
export async function payoutPermission(owner: PrivateKeyAccount, wallet: string, forwarder: string, over: Record<string, unknown> = {}) {
  return signed(owner, {
    account: wallet,
    spender: forwarder,
    token: SEPOLIA_USDC,
    allowance: 2n ** 160n - 1n,
    period: 2_592_000,
    start: START_SEC,
    end: 2 ** 48 - 1,
    salt: 99n,
    ...over,
  });
}

/**
 * A payout handoff from the API key to `payout-passkey`: right number, identity (approved at Bridge), IBAN. Returns the code,
 * the page and the spender the page asks to sign.
 */
export async function toPasskey(s: MoneySetup, a: { key: string }) {
  s.bridge.state.kycStatus = "approved";
  const created = await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "payout" }, a.key);
  expect(created.status).toBe(201);
  const h = (await created.json()) as { code: string; match: number; poll_token: string };
  const bank = await tap(s.app, h.code, h.match);
  expect(await bank.text()).toContain('data-soll="bank"');
  const passkey = await form(s, `/h/${h.code}/payout-bank`, { iban: EXAMPLE_IBAN, owner_name: "Erika Mustermann" });
  expect(passkey.status).toBe(200);
  const html = await passkey.text();
  return { h, html, spender: dataOf(html, "konto-passkey", "spender")! };
}

/** The konto 03 row of an account: its permission and the one a raise brought. */
export const readKonto = (s: MoneySetup, address: string) =>
  s.db.prepare("SELECT permission, signature, next_permission, cap_usdc FROM konto_accounts WHERE address = ?").get(address) as {
    permission: string;
    signature: string;
    next_permission: string | null;
    cap_usdc: string | null;
  };
