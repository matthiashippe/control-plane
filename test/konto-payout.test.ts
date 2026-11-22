/**
 * goals/konto/05, point 10: the first payout goes over the handoff to identity, IBAN and a second permission whose spender is the
 * forwarder to the fixed payout address; every later one pays with the API key only there, never more than the USDC of the smart
 * wallet and never from the balance of the service.
 *
 * The forwarder the page asks to sign is compared with an address computed here from the CREATE2 rule (expectedForwarder), and
 * the deployed init code is read back from the raw transaction, so a forwarderAddress that returned anything else fails here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { postLedger, getBalanceMc } from "../src/db.js";
import { permissionFromJson } from "../src/konto/account.js";
import { SEPOLIA_USDC, SPEND_PERMISSION_MANAGER } from "../src/konto/config.js";
import { createPayoutChain, type PayoutChain } from "../src/konto/payout.js";
import { tap } from "./handoff-helpers.js";
import {
  account,
  dataOf,
  ENTRY_POINT_V06,
  EXAMPLE_IBAN,
  expectedForwarder,
  form,
  json,
  moneySetup,
  payoutPermission,
  stateOf,
  toPasskey,
  withNewGasKey,
  type MoneySetup,
} from "./money-helpers.js";

const USD = 1_000_000n;
/** USDC on Base mainnet: a token other than the one of the account. */
const MAINNET_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

/** An account with its second permission set up over the handoff, and `usd` dollars of USDC in its smart wallet. */
async function ready(s: MoneySetup, usd = 30n) {
  const a = await account(s);
  const p = await toPasskey(s, a);
  const done = await json(s, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, p.spender));
  expect(done.status).toBe(200);
  s.node.balances.set(a.address, usd * USD);
  return { ...a, spender: p.spender, destination: s.bridge.state.liquidation.at(-1)! };
}

const payout = (s: MoneySetup, key: string | null, body: unknown) => json(s, "/v1/konto/payout", body, key ?? undefined);

describe("the payout to the person's bank account", () => {
  it("answers 401 on step payout without an API key", async () => {
    const s = moneySetup();
    await account(s);
    const res = await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "payout" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  it("turns the right number into matched and a wrong one into burned", async () => {
    const s = moneySetup();
    const a = await account(s);
    const start = async () => (await (await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "payout" }, a.key)).json()) as { code: string; match: number };
    const right = await start();
    const page = await s.app.request(`/h/${right.code}`);
    expect(await page.text()).toContain('data-soll="approve"');
    await tap(s.app, right.code, right.match);
    expect(stateOf(s, right.code)).toBe("matched");
    const wrong = await start();
    await tap(s.app, wrong.code, wrong.match === 99 ? 98 : wrong.match + 1);
    expect(stateOf(s, wrong.code)).toBe("burned");
  });

  it("shows the identity link of Bridge in payout-verify and moves on only once Bridge reports approved", async () => {
    const s = moneySetup();
    const a = await account(s);
    const h = (await (await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "payout" }, a.key)).json()) as { code: string; match: number };
    const verify = await (await tap(s.app, h.code, h.match)).text();
    expect(verify).toContain('data-soll="verify"');
    expect(verify).toContain('data-href="https://bridge.example/verify/kyc_1"');
    const created = s.bridge.calls.find((c) => c.method === "POST" && c.path === "/v0/kyc_links")!;
    expect(created.body).toMatchObject({ type: "individual" });
    expect(created.headers["Api-Key"]).toBe("fake-bridge");
    expect(created.headers["Idempotency-Key"]).toBeTruthy();
    s.bridge.state.kycStatus = "under_review";
    expect(await (await form(s, `/h/${h.code}/payout-verify`, {})).text()).toContain('data-soll="verify"');
    expect(await (await s.app.request(`/h/${h.code}`)).text()).toContain('data-soll="verify"');
    s.bridge.state.kycStatus = "approved";
    const bank = await (await s.app.request(`/h/${h.code}`)).text();
    expect(bank).toContain('data-soll="bank"');
    expect(bank).toMatch(/<input[^>]+name="iban"/);
    expect(s.bridge.calls.filter((c) => c.method === "GET" && c.path === "/v0/kyc_links/kyc_1").length).toBeGreaterThanOrEqual(2);
  });

  it("skips payout-verify for a customer Bridge already approved", async () => {
    const s = moneySetup();
    const a = await account(s);
    await toPasskey(s, a);
    const before = s.bridge.calls.filter((c) => c.path.startsWith("/v0/kyc_links")).length;
    const h = (await (await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "payout" }, a.key)).json()) as { code: string; match: number };
    const page = await (await tap(s.app, h.code, h.match)).text();
    expect(page).toContain('data-soll="bank"');
    expect(page).not.toContain('data-soll="verify"');
    expect(s.bridge.calls.filter((c) => c.path.startsWith("/v0/kyc_links")).length).toBe(before);
  });

  it("refuses an invalid IBAN with 400; a valid one makes external account and payout address for base, usdc, sepa and eur, and keeps four characters", async () => {
    const s = moneySetup();
    const a = await account(s);
    s.bridge.state.kycStatus = "approved";
    const h = (await (await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "payout" }, a.key)).json()) as { code: string; match: number };
    await tap(s.app, h.code, h.match);
    for (const bad of [EXAMPLE_IBAN.slice(0, -1) + "1", "DE00", "not an iban"]) {
      const res = await form(s, `/h/${h.code}/payout-bank`, { iban: bad, owner_name: "Erika Mustermann" });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('data-soll="bank"');
    }
    expect(s.bridge.calls.filter((c) => c.path.includes("external_accounts"))).toHaveLength(0);
    expect(stateOf(s, h.code)).toBe("matched");
    const ok = await form(s, `/h/${h.code}/payout-bank`, { iban: EXAMPLE_IBAN, owner_name: "Erika Mustermann" });
    expect(ok.status).toBe(200);
    const html = await ok.text();
    expect(html).toContain('data-soll="payout"');
    expect(html).toContain("ending 3000.");
    const ext = s.bridge.calls.find((c) => c.path === "/v0/customers/cus_1/external_accounts")!;
    expect(ext.body).toMatchObject({ currency: "eur", account_type: "iban", account_owner_name: "Erika Mustermann", iban: { account_number: "DE89370400440532013000", country: "DEU" } });
    const liq = s.bridge.calls.find((c) => c.path === "/v0/customers/cus_1/liquidation_addresses")!;
    expect(liq.body).toEqual({ chain: "base", currency: "usdc", external_account_id: "ext_1", destination_payment_rail: "sepa", destination_currency: "eur" });
    const pending = s.db.prepare("SELECT * FROM payout_handoffs WHERE code = ?").get(h.code) as Record<string, unknown>;
    expect(pending).toMatchObject({ bank_last4: "3000", external_account_id: "ext_1", liquidation_address_id: "liq_1", destination: s.bridge.state.liquidation[0] });
    // Nowhere in the database is more of the IBAN than its last four characters. Random addresses are taken out first: one in
    // about 600 runs a fresh address holds "0532" by chance, which is no part of an IBAN.
    const dump = JSON.stringify(s.db.prepare("SELECT * FROM payout_handoffs").all()) + JSON.stringify(s.db.prepare("SELECT * FROM konto_payouts").all());
    expect(dump.replace(/0x[0-9a-fA-F]{40}/g, "0x")).not.toMatch(/0532|DE89|37040044/);
  });

  it("ends done with a permission whose spender is forwarderAddress(account, destination) and whose token is USDC", async () => {
    const s = moneySetup();
    const a = await account(s);
    const p = await toPasskey(s, a);
    const destination = s.bridge.state.liquidation[0];
    expect(p.spender).toBe(expectedForwarder(a.address, destination, s.gas.address));
    expect(dataOf(p.html, "konto-passkey", "account")).toBe(a.address);
    expect(dataOf(p.html, "konto-passkey", "mode")).toBe("payout");
    const res = await json(s, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, expectedForwarder(a.address, destination, s.gas.address)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "done", bank_last4: "3000" });
    expect(stateOf(s, p.h.code)).toBe("done");
    const row = s.db.prepare("SELECT forwarder, destination, bank_last4 FROM konto_payouts WHERE address = ?").get(a.address);
    expect(row).toEqual({ forwarder: expectedForwarder(a.address, destination, s.gas.address), destination, bank_last4: "3000" });
  });

  it("refuses the spender of another forwarder, another token or another account with 400 and burns the handoff", async () => {
    const s = moneySetup();
    const a = await account(s);
    const destination = () => s.bridge.state.liquidation.at(-1)!;
    const other = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const cases = [
      (spender: string) => payoutPermission(a.owner, a.address, expectedForwarder(a.address, other, s.gas.address), { spender: expectedForwarder(a.address, other, s.gas.address) }),
      (spender: string) => payoutPermission(a.owner, a.address, spender, { token: MAINNET_USDC }),
      (spender: string) => payoutPermission(a.owner, other, expectedForwarder(other, destination(), s.gas.address), { spender }),
    ];
    for (const make of cases) {
      const p = await toPasskey(s, a);
      const res = await json(s, `/h/${p.h.code}/payout`, await make(p.spender));
      expect(res.status).toBe(400);
      expect(stateOf(s, p.h.code)).toBe("burned");
    }
    expect((s.db.prepare("SELECT permission FROM konto_payouts WHERE address = ?").get(a.address) as { permission: string | null }).permission).toBeNull();
  });

  it("answers 409 payout_needs_phone on POST /v1/konto/payout without the second permission", async () => {
    const s = moneySetup();
    const a = await account(s);
    s.node.balances.set(a.address, 30n * USD);
    const res = await payout(s, a.key, { amount_usd: "10.00" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "payout_needs_phone" });
    expect(s.node.sent).toEqual([]);
  });

  it("sends the first payout through sendKontoTx as deploy, approveWithSignature and payout, and the second as payout only", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    const forwarder = expectedForwarder(a.address, a.destination, s.gas.address);
    const first = await payout(s, a.key, { amount_usd: "10.00" });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ state: "sent", amount_usd: "10.00", bank_last4: "3000" });
    expect(s.node.sent.map((t) => t.kind)).toEqual(["deploy", "approveWithSignature", "payout"]);
    const [deploy, approve, pay] = s.node.sent;
    expect(deploy.to).toBe("0x4e59b44847b379578588920ca78fbf26c0b4956c");
    expect(deploy.target).toBe(forwarder);
    expect(deploy.ctor!.slice(0, 2)).toEqual([a.address, a.destination]);
    expect(deploy.ctor![4]).toBe(s.gas.address.toLowerCase());
    expect(approve.target).toBe(forwarder);
    expect(pay).toMatchObject({ to: forwarder, value: 10n * USD });
    expect(s.node.balances.get(a.destination)).toBe(10n * USD);
    const second = await payout(s, a.key, { amount_usd: "5" });
    expect(second.status).toBe(200);
    expect(s.node.sent.map((t) => t.kind)).toEqual(["deploy", "approveWithSignature", "payout", "payout"]);
    expect(s.node.balances.get(a.destination)).toBe(15n * USD);
    expect(s.node.balances.get(a.address)).toBe(15n * USD);
  });

  it("refuses to, destination, address or iban in the body with 400 invalid_arguments and zero transactions", async () => {
    const s = moneySetup();
    const a = await ready(s);
    for (const field of ["to", "destination", "address", "iban"]) {
      const res = await payout(s, a.key, { amount_usd: "10.00", [field]: field === "iban" ? EXAMPLE_IBAN : privateKeyToAccount(generatePrivateKey()).address });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_arguments" });
    }
    expect(s.node.sent).toEqual([]);
  });

  it("refuses more than balanceOf of the smart wallet with 400 insufficient_balance", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    const res = await payout(s, a.key, { amount_usd: "30.01" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "insufficient_balance", balance_usd: "30.00" });
    expect(s.node.sent).toEqual([]);
  });

  it("pays nothing for all:true with 50 USD of balance at the service and 0 USDC: zero transactions, the balance unchanged", async () => {
    const s = moneySetup();
    const a = await ready(s, 0n);
    postLedger(s.db, { address: a.address, kind: "topup", deltaMc: 5_000_000, ref: "test-50-usd" });
    const before = getBalanceMc(s.db, a.address);
    const res = await payout(s, a.key, { all: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "nothing_to_pay", amount_usd: "0.00" });
    expect(s.node.sent).toEqual([]);
    expect(getBalanceMc(s.db, a.address)).toBe(before);
    expect(before).toBeGreaterThanOrEqual(5_000_000);
  });

  it("refuses less than 1.00 USD with 400 below_minimum", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    for (const amount of ["0.99", "0.01"]) {
      const res = await payout(s, a.key, { amount_usd: amount });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "below_minimum" });
    }
    for (const bad of ["5.001", "-1", "abc", 10]) expect((await payout(s, a.key, { amount_usd: bad })).status).toBe(400);
    expect(s.node.sent).toEqual([]);
  });

  it("answers 503 without CP_KONTO_CHAIN_ID or without CP_BRIDGE_KEY_FILE", async () => {
    const on = moneySetup();
    const a = await account(on);
    const { createApp } = await import("../src/app.js");
    const at = () => new Date(Date.parse("2026-11-13T12:00:00Z"));
    for (const off of [{ konto: null, bridge: on.bridge.bridge }, { konto: on.konto, bridge: null }]) {
      const app = createApp({ db: on.db, now: at, rateLimit: null, handoff: { pollMs: 5, missLimit: null }, ...off });
      const req = (path: string, body: unknown) =>
        app.request(path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${a.key}` }, body: JSON.stringify(body) });
      expect((await req("/v1/konto/payout", { amount_usd: "10.00" })).status).toBe(503);
      expect((await req("/v1/handoff", { automaton_name: "Atlas", step: "payout" })).status).toBe(503);
      expect((await req("/v1/konto/payout-rule", { keep_usd: "20.00", weekday: "monday" })).status).toBe(503);
    }
    expect(on.node.sent).toEqual([]);
  });

  it("makes a new IBAN a new forwarder and a new signature over the handoff, and ends the old permission with its revoke before the next payout", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    const oldForwarder = expectedForwarder(a.address, a.destination, s.gas.address);
    expect((await payout(s, a.key, { amount_usd: "10.00" })).status).toBe(200);
    // The terminal cannot change the target: only a new handoff with the passkey does.
    const p = await toPasskey(s, a);
    const newDestination = s.bridge.state.liquidation.at(-1)!;
    expect(newDestination).not.toBe(a.destination);
    const newForwarder = expectedForwarder(a.address, newDestination, s.gas.address);
    expect(p.spender).toBe(newForwarder);
    expect((await json(s, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, newForwarder, { salt: 100n }))).status).toBe(200);
    const res = await payout(s, a.key, { amount_usd: "5.00" });
    expect(res.status).toBe(200);
    const after = s.node.sent.slice(3);
    expect(after.map((t) => t.kind)).toEqual(["revoke", "deploy", "approveWithSignature", "payout"]);
    expect(after[0]).toMatchObject({ to: ENTRY_POINT_V06, target: oldForwarder, salt: 99n });
    expect(after[1].target).toBe(newForwarder);
    expect(after[3]).toMatchObject({ to: newForwarder, value: 5n * USD });
    expect(s.node.balances.get(newDestination)).toBe(5n * USD);
    expect(s.node.balances.get(a.destination)).toBe(10n * USD);
    // Ended once: the payout after that goes over the new forwarder alone.
    expect((await payout(s, a.key, { amount_usd: "1.00" })).status).toBe(200);
    expect(s.node.sent.slice(7).map((t) => t.kind)).toEqual(["payout"]);
  });
});

/**
 * A setup whose chain can lose approveWithSignature: `mode.approveReceipt` makes the wait for its receipt break off after it went
 * through on-chain, `mode.approveSend` makes the send fail before it reaches the node.
 */
function lossySetup() {
  const mode = { approveReceipt: false, approveSend: false };
  const inner: { chain: PayoutChain | null } = { chain: null };
  const approvals = new Set<string>();
  const chain: PayoutChain = {
    code: (a) => inner.chain!.code(a),
    balanceOf: (a) => inner.chain!.balanceOf(a),
    isApproved: (p) => inner.chain!.isApproved(p),
    callerOf: (f) => inner.chain!.callerOf(f),
    nonceOf: (a) => inner.chain!.nonceOf(a),
    async send(tx) {
      const approve = tx.to.toLowerCase() === SPEND_PERMISSION_MANAGER;
      if (approve && mode.approveSend) throw new Error("connection reset before the node got the transaction");
      const hash = await inner.chain!.send(tx);
      if (approve) approvals.add(hash);
      return hash;
    },
    async receipt(hash: Hex) {
      if (mode.approveReceipt && approvals.has(hash)) throw new Error("timed out waiting for the receipt");
      return inner.chain!.receipt(hash);
    },
  };
  const s = moneySetup({ konto: { payoutChain: chain } });
  inner.chain = createPayoutChain({ chainId: 84532, account: s.gas, transport: s.node.transport, token: SEPOLIA_USDC });
  return { s, mode };
}

/** Every line the service logged through console.log while the test ran. */
function logLines() {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  return () => spy.mock.calls.map((c) => String(c[0]));
}

/** The waiting retire of an account: the old forwarder and permission the next payout retires first. */
function retireRow(s: MoneySetup, address: string) {
  return s.db.prepare("SELECT retire_forwarder, retire_permission FROM konto_payouts WHERE address = ?").get(address.toLowerCase()) as {
    retire_forwarder: string | null;
    retire_permission: string | null;
  };
}

describe("after a new gas key or a lost receipt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ends the old permission before the next payout when the receipt of its approveWithSignature broke off", async () => {
    const { s, mode } = lossySetup();
    const a = await ready(s, 30n);
    const oldForwarder = expectedForwarder(a.address, a.destination, s.gas.address);
    mode.approveReceipt = true;
    const lost = await payout(s, a.key, { amount_usd: "10.00" });
    expect(lost.status).toBe(502);
    expect(await lost.json()).toMatchObject({ error: "payout_failed", stage: "approve" });
    mode.approveReceipt = false;
    expect(s.node.sent.map((t) => t.kind)).toEqual(["deploy", "approveWithSignature"]);
    // The approval went through on-chain although the service never saw its receipt.
    expect(s.node.approved.has(`${a.address}:99`)).toBe(true);
    const p = await toPasskey(s, a);
    const newDestination = s.bridge.state.liquidation.at(-1)!;
    const newForwarder = expectedForwarder(a.address, newDestination, s.gas.address);
    expect(p.spender).toBe(newForwarder);
    expect((await json(s, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, newForwarder, { salt: 100n }))).status).toBe(200);
    const res = await payout(s, a.key, { amount_usd: "5.00" });
    expect(res.status).toBe(200);
    const after = s.node.sent.slice(2);
    expect(after.map((t) => t.kind)).toEqual(["revoke", "deploy", "approveWithSignature", "payout"]);
    expect(after[0]).toMatchObject({ to: ENTRY_POINT_V06, target: oldForwarder, salt: 99n });
    expect(after[1].target).toBe(newForwarder);
    expect(after[3]).toMatchObject({ to: newForwarder, value: 5n * USD });
    expect(s.node.approved.has(`${a.address}:99`)).toBe(false);
    expect(s.node.balances.get(newDestination)).toBe(5n * USD);
  });

  it("pays again after a new gas key and one phone handoff, ends the permission of the old key with the revoke of that handoff instead of a retire", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    const oldForwarder = expectedForwarder(a.address, a.destination, s.gas.address);
    expect((await payout(s, a.key, { amount_usd: "10.00" })).status).toBe(200);
    expect(s.node.sent).toHaveLength(3);
    const b = withNewGasKey(s);
    const blocked = await payout(b, a.key, { amount_usd: "5.00" });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: "payout_needs_phone" });
    expect(s.node.sent).toHaveLength(3);
    const p = await toPasskey(b, a);
    const newDestination = s.bridge.state.liquidation.at(-1)!;
    const newForwarder = expectedForwarder(a.address, newDestination, b.gas.address);
    expect(p.spender).toBe(newForwarder);
    expect((await json(b, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, newForwarder, { salt: 100n }))).status).toBe(200);
    const lines = logLines();
    const res = await payout(b, a.key, { amount_usd: "5.00" });
    expect(res.status).toBe(200);
    const after = s.node.sent.slice(3);
    expect(after.map((t) => t.kind)).toEqual(["revoke", "deploy", "approveWithSignature", "payout"]);
    expect(after[0]).toMatchObject({ to: ENTRY_POINT_V06, target: oldForwarder, salt: 99n });
    expect(after[1]).toMatchObject({ target: newForwarder });
    expect(after[1].ctor![4]).toBe(b.gas.address.toLowerCase());
    expect(after[3]).toMatchObject({ to: newForwarder, value: 5n * USD });
    expect(s.node.balances.get(newDestination)).toBe(5n * USD);
    expect(s.node.approved.has(`${a.address}:99`)).toBe(false);
    expect(lines().filter((l) => l.includes("other_caller"))).toEqual([]);
    // The ended permission leaves no waiting retire behind, so the next new IBAN ends the one of today's key.
    expect(retireRow(s, a.address)).toEqual({ retire_forwarder: null, retire_permission: null });
    const third = await toPasskey(b, a);
    const thirdDestination = s.bridge.state.liquidation.at(-1)!;
    const thirdForwarder = expectedForwarder(a.address, thirdDestination, b.gas.address);
    expect(third.spender).toBe(thirdForwarder);
    expect((await json(b, `/h/${third.h.code}/payout`, await payoutPermission(a.owner, a.address, thirdForwarder, { salt: 101n }))).status).toBe(200);
    const next = await payout(b, a.key, { amount_usd: "5.00" });
    expect(next.status).toBe(200);
    const last = s.node.sent.slice(7);
    expect(last.map((t) => t.kind)).toEqual(["revoke", "deploy", "approveWithSignature", "payout"]);
    expect(last[0]).toMatchObject({ to: ENTRY_POINT_V06, target: newForwarder, salt: 100n });
    expect(last[3]).toMatchObject({ to: thirdForwarder, value: 5n * USD });
    expect(s.node.approved.has(`${a.address}:100`)).toBe(false);
  });

  it("sends no retire for a permission whose approveWithSignature never reached the node and logs not_approved", async () => {
    const { s, mode } = lossySetup();
    const a = await ready(s, 30n);
    const oldForwarder = expectedForwarder(a.address, a.destination, s.gas.address);
    mode.approveSend = true;
    const lost = await payout(s, a.key, { amount_usd: "10.00" });
    expect(lost.status).toBe(502);
    expect(await lost.json()).toMatchObject({ error: "payout_failed", stage: "approve" });
    mode.approveSend = false;
    expect(s.node.sent.map((t) => t.kind)).toEqual(["deploy"]);
    expect(s.node.approved.has(`${a.address}:99`)).toBe(false);
    const p = await toPasskey(s, a);
    const newDestination = s.bridge.state.liquidation.at(-1)!;
    const newForwarder = expectedForwarder(a.address, newDestination, s.gas.address);
    expect((await json(s, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, newForwarder, { salt: 100n }))).status).toBe(200);
    const lines = logLines();
    const res = await payout(s, a.key, { amount_usd: "5.00" });
    expect(res.status).toBe(200);
    const after = s.node.sent.slice(1);
    expect(after.map((t) => t.kind)).toEqual(["deploy", "approveWithSignature", "payout"]);
    expect(after[2]).toMatchObject({ to: newForwarder, value: 5n * USD });
    expect(lines()).toContain(`[payout] retire skipped for ${oldForwarder}: not_approved`);
    expect(retireRow(s, a.address)).toEqual({ retire_forwarder: null, retire_permission: null });
  });

  it("keeps a waiting retire through a second new IBAN and drops the permission between them, which never went on-chain", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    const firstForwarder = expectedForwarder(a.address, a.destination, s.gas.address);
    expect((await payout(s, a.key, { amount_usd: "10.00" })).status).toBe(200);
    const second = await toPasskey(s, a);
    expect((await json(s, `/h/${second.h.code}/payout`, await payoutPermission(a.owner, a.address, second.spender, { salt: 100n }))).status).toBe(200);
    const third = await toPasskey(s, a);
    const thirdDestination = s.bridge.state.liquidation.at(-1)!;
    const thirdForwarder = expectedForwarder(a.address, thirdDestination, s.gas.address);
    expect(third.spender).toBe(thirdForwarder);
    expect(thirdForwarder).not.toBe(second.spender);
    expect((await json(s, `/h/${third.h.code}/payout`, await payoutPermission(a.owner, a.address, thirdForwarder, { salt: 101n }))).status).toBe(200);
    const res = await payout(s, a.key, { amount_usd: "5.00" });
    expect(res.status).toBe(200);
    const after = s.node.sent.slice(3);
    expect(after.map((t) => t.kind)).toEqual(["revoke", "deploy", "approveWithSignature", "payout"]);
    expect(after[0]).toMatchObject({ to: ENTRY_POINT_V06, target: firstForwarder, salt: 99n });
    expect(after[1].target).toBe(thirdForwarder);
    expect(after[2]).toMatchObject({ target: thirdForwarder, salt: 101n });
    expect(after[3]).toMatchObject({ to: thirdForwarder, value: 5n * USD });
    expect(s.node.code.has(second.spender)).toBe(false);
    expect(s.node.balances.get(thirdDestination)).toBe(5n * USD);
  });
});

/**
 * A setup whose chain cannot read the old permission or the old forwarder: `fail.approvedSalt` makes isApproved throw for the
 * permission with that salt, `fail.callerOf` makes callerOf throw for that forwarder. Every other read and send goes through.
 */
function unreadableSetup() {
  const fail: { approvedSalt: bigint | null; callerOf: string | null } = { approvedSalt: null, callerOf: null };
  const inner: { chain: PayoutChain | null } = { chain: null };
  const chain: PayoutChain = {
    code: (a) => inner.chain!.code(a),
    balanceOf: (a) => inner.chain!.balanceOf(a),
    async isApproved(p) {
      if (fail.approvedSalt !== null && BigInt(p.salt) === fail.approvedSalt) throw new Error("rpc timeout on isApproved");
      return inner.chain!.isApproved(p);
    },
    async callerOf(f) {
      if (fail.callerOf !== null && f.toLowerCase() === fail.callerOf) throw new Error("rpc timeout on caller");
      return inner.chain!.callerOf(f);
    },
    nonceOf: (a) => inner.chain!.nonceOf(a),
    send: (tx) => inner.chain!.send(tx),
    receipt: (hash) => inner.chain!.receipt(hash),
  };
  const s = moneySetup({ konto: { payoutChain: chain } });
  inner.chain = createPayoutChain({ chainId: 84532, account: s.gas, transport: s.node.transport, token: SEPOLIA_USDC });
  return { s, fail };
}

describe("when the chain cannot be read before the retire", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const read of ["isApproved", "callerOf"] as const) {
    it(`stops in stage retire without a transaction when ${read} of the old one fails, keeps the retire and ends it on the next payout`, async () => {
      const { s, fail } = unreadableSetup();
      const a = await ready(s, 30n);
      const oldForwarder = expectedForwarder(a.address, a.destination, s.gas.address);
      expect((await payout(s, a.key, { amount_usd: "10.00" })).status).toBe(200);
      expect(s.node.sent).toHaveLength(3);
      const p = await toPasskey(s, a);
      const newDestination = s.bridge.state.liquidation.at(-1)!;
      const newForwarder = expectedForwarder(a.address, newDestination, s.gas.address);
      expect(p.spender).toBe(newForwarder);
      expect((await json(s, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, newForwarder, { salt: 100n }))).status).toBe(200);
      // callerOf is read only for a retire without a revoke: a row from before goals/konto/11, which this one models.
      if (read === "callerOf") s.db.prepare("UPDATE konto_payouts SET retire_revoke = NULL WHERE address = ?").run(a.address);
      const waiting = retireRow(s, a.address);
      expect(waiting.retire_forwarder?.toLowerCase()).toBe(oldForwarder);
      expect(waiting.retire_permission).not.toBeNull();

      if (read === "isApproved") fail.approvedSalt = 99n;
      else fail.callerOf = oldForwarder;
      const lines = logLines();
      const broken = await payout(s, a.key, { amount_usd: "5.00" });
      expect(broken.status).toBe(502);
      expect(await broken.json()).toMatchObject({ error: "payout_failed", stage: "retire" });
      expect(s.node.sent).toHaveLength(3);
      expect(retireRow(s, a.address)).toEqual(waiting);
      expect(lines().filter((l) => l.includes("retire skipped"))).toEqual([]);
      expect(s.node.approved.has(`${a.address}:99`)).toBe(true);

      fail.approvedSalt = null;
      fail.callerOf = null;
      const res = await payout(s, a.key, { amount_usd: "5.00" });
      expect(res.status).toBe(200);
      const after = s.node.sent.slice(3);
      expect(after.map((t) => t.kind)).toEqual([read === "isApproved" ? "revoke" : "retire", "deploy", "approveWithSignature", "payout"]);
      expect(after[0]).toMatchObject({ to: read === "isApproved" ? ENTRY_POINT_V06 : oldForwarder, target: oldForwarder, salt: 99n });
      expect(after[1].target).toBe(newForwarder);
      expect(after[3]).toMatchObject({ to: newForwarder, value: 5n * USD });
      expect(s.node.approved.has(`${a.address}:99`)).toBe(false);
      expect(retireRow(s, a.address)).toEqual({ retire_forwarder: null, retire_permission: null });
      expect(s.node.balances.get(newDestination)).toBe(5n * USD);
    });
  }
});

/**
 * goals/konto/11: after a new gas key the old forwarder has a caller the service no longer holds, so only the person's passkey can
 * end its permission. The same tap that signs the new permission signs a user operation of the smart wallet with revoke of the old
 * one; the service sends it through handleOps and pays nothing out until isApproved says the old permission is gone. The hash the
 * tap signs comes from data-revoke-hash of the page, never from this test. Three of these cases fail on the code before the goal;
 * the fourth guards the first setup, which asks for no second signature.
 */
describe("the earlier permission ends with the same passkey", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const payoutRow = (s: MoneySetup, address: string) => s.db.prepare("SELECT * FROM konto_payouts WHERE address = ?").get(address.toLowerCase()) as Record<string, unknown>;

  it("ends the old permission with the same passkey after a new gas key, through handleOps before the first payout of the new key", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    const oldForwarder = expectedForwarder(a.address, a.destination, s.gas.address);
    expect((await payout(s, a.key, { amount_usd: "10.00" })).status).toBe(200);
    expect(s.node.sent).toHaveLength(3);
    const oldPermission = permissionFromJson(String(payoutRow(s, a.address).permission));
    const b = withNewGasKey(s);
    expect((await payout(b, a.key, { amount_usd: "5.00" })).status).toBe(409);
    const p = await toPasskey(b, a);
    // The page before the number says that this ends the earlier approval.
    expect(p.approve).toContain("Earlier approval");
    const hash = dataOf(p.html, "konto-passkey", "revoke-hash");
    const nonce = dataOf(p.html, "konto-passkey", "revoke-nonce");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(nonce).toBe("0");
    const newDestination = s.bridge.state.liquidation.at(-1)!;
    const newForwarder = expectedForwarder(a.address, newDestination, b.gas.address);
    expect(p.spender).toBe(newForwarder);
    // One tap, two signatures by the owner: the new permission and the revoke of the old one.
    const body = { ...(await payoutPermission(a.owner, a.address, newForwarder, { salt: 100n })), revoke: { nonce, signature: await a.owner.sign({ hash: hash as Hex }) } };
    const done = await json(b, `/h/${p.h.code}/payout`, body);
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ state: "done" });
    expect(await b.konto!.payoutChain!.isApproved(oldPermission)).toBe(true);
    const res = await payout(b, a.key, { amount_usd: "5.00" });
    expect(res.status).toBe(200);
    const after = s.node.sent.slice(3);
    expect(after.map((t) => t.kind)).toEqual(["revoke", "deploy", "approveWithSignature", "payout"]);
    expect(after[0]).toMatchObject({ to: ENTRY_POINT_V06, target: oldForwarder, salt: 99n });
    expect(after[1].ctor![4]).toBe(b.gas.address.toLowerCase());
    expect(after[3]).toMatchObject({ to: newForwarder, value: 5n * USD });
    expect(await b.konto!.payoutChain!.isApproved(oldPermission)).toBe(false);
    expect(s.node.nonces.get(a.address)).toBe(1n);
    expect(retireRow(s, a.address)).toEqual({ retire_forwarder: null, retire_permission: null });
  });

  it("answers 409 payout_needs_phone and keeps the retire when the old forwarder has another caller and no revoke waits", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    const oldForwarder = expectedForwarder(a.address, a.destination, s.gas.address);
    expect((await payout(s, a.key, { amount_usd: "10.00" })).status).toBe(200);
    const b = withNewGasKey(s);
    // A setup for the new key whose earlier permission waits as retire_* without a revoke, written straight into the row: the
    // state a row from before this goal is in, or one whose revoke did not go through.
    const before = payoutRow(s, a.address);
    const newDestination = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const newForwarder = expectedForwarder(a.address, newDestination, b.gas.address);
    const next = await payoutPermission(a.owner, a.address, newForwarder, { salt: 100n });
    s.db
      .prepare(
        `UPDATE konto_payouts SET destination = ?, forwarder = ?, permission = ?, signature = ?, permission_approved = 0,
         retire_forwarder = ?, retire_permission = ? WHERE address = ?`,
      )
      .run(newDestination, newForwarder, JSON.stringify(next.permission), next.signature, oldForwarder, String(before.permission), a.address);
    const lines = logLines();
    const res = await payout(b, a.key, { amount_usd: "5.00" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "payout_needs_phone" });
    expect(s.node.sent).toHaveLength(3);
    expect(retireRow(s, a.address)).toEqual({ retire_forwarder: oldForwarder, retire_permission: String(before.permission) });
    expect(s.node.approved.has(`${a.address}:99`)).toBe(true);
    expect(lines()).toContain(`[payout] retire waits for the phone for ${oldForwarder}: other_caller`);
  });

  it("refuses a payout handoff without the revoke when an earlier permission exists, burns it and keeps the payout setup", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    const before = payoutRow(s, a.address);
    const p = await toPasskey(s, a);
    const { revoke: _asked, ...bare } = (await payoutPermission(a.owner, a.address, p.spender, { salt: 100n })) as Record<string, unknown>;
    const res = await json(s, `/h/${p.h.code}/payout`, bare);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "permission_refused" });
    expect(stateOf(s, p.h.code)).toBe("burned");
    expect(payoutRow(s, a.address)).toEqual(before);
  });

  it("keeps the first payout setup as it is: no revoke on the page, no earlier approval, deploy, approveWithSignature and payout", async () => {
    const s = moneySetup();
    const a = await account(s);
    const p = await toPasskey(s, a);
    expect(p.approve).toContain('data-soll="approve"');
    expect(p.approve).not.toContain("Earlier approval");
    expect(dataOf(p.html, "konto-passkey", "revoke-hash")).toBeNull();
    expect(dataOf(p.html, "konto-passkey", "revoke-nonce")).toBeNull();
    const done = await json(s, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, p.spender));
    expect(done.status).toBe(200);
    s.node.balances.set(a.address, 30n * USD);
    const res = await payout(s, a.key, { amount_usd: "10.00" });
    expect(res.status).toBe(200);
    expect(s.node.sent.map((t) => t.kind)).toEqual(["deploy", "approveWithSignature", "payout"]);
    expect(s.node.nonces.size).toBe(0);
  });
});

/**
 * goals/konto/11, critique: a revoke that went out and did not end the old permission is never sent a second time. Either handleOps
 * reverts (the wallet already used the nonce the passkey signed) or it goes through while its execute reverts inside, and the chain
 * still approves the old permission. Both answer 502 in stage retire, drop retire_revoke and keep the retire; the next payout asks
 * for the phone without a transaction, because only a new tap can end the permission of the old key.
 */
describe("a revoke that does not end the old permission", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const revokeRow = (s: MoneySetup, address: string) =>
    (s.db.prepare("SELECT retire_revoke FROM konto_payouts WHERE address = ?").get(address.toLowerCase()) as { retire_revoke: string | null }).retire_revoke;

  /** An account that paid with the old key, then a new gas key and one phone handoff whose revoke waits in retire_revoke. */
  async function waitingRevoke() {
    const s = moneySetup();
    const a = await ready(s, 30n);
    const oldForwarder = expectedForwarder(a.address, a.destination, s.gas.address);
    expect((await payout(s, a.key, { amount_usd: "10.00" })).status).toBe(200);
    expect(s.node.sent).toHaveLength(3);
    const b = withNewGasKey(s);
    const p = await toPasskey(b, a);
    const newForwarder = expectedForwarder(a.address, s.bridge.state.liquidation.at(-1)!, b.gas.address);
    expect(p.spender).toBe(newForwarder);
    expect((await json(b, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, newForwarder, { salt: 100n }))).status).toBe(200);
    const waiting = retireRow(s, a.address);
    expect(waiting.retire_forwarder?.toLowerCase()).toBe(oldForwarder);
    expect(revokeRow(s, a.address)).not.toBeNull();
    return { s, b, a, oldForwarder, waiting };
  }

  async function expectDroppedAndPhoneAsked(w: Awaited<ReturnType<typeof waitingRevoke>>, sentAfterRevoke: number) {
    const { s, b, a, waiting } = w;
    expect(revokeRow(s, a.address)).toBeNull();
    expect(retireRow(s, a.address)).toEqual(waiting);
    expect(s.node.approved.has(`${a.address}:99`)).toBe(true);
    const lines = logLines();
    const again = await payout(b, a.key, { amount_usd: "5.00" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "payout_needs_phone" });
    expect(s.node.sent).toHaveLength(sentAfterRevoke);
    expect(lines().filter((l) => l.includes("retire waits for the phone for"))).toHaveLength(1);
    expect(retireRow(s, a.address)).toEqual(waiting);
  }

  it("drops the revoke and asks for the phone when its handleOps reverts, because the wallet already used that nonce", async () => {
    const w = await waitingRevoke();
    const { s, b, a } = w;
    // The wallet sent another user operation with the nonce the passkey signed, so this one can never validate again.
    s.node.nonces.set(a.address, 1n);
    const broken = await payout(b, a.key, { amount_usd: "5.00" });
    expect(broken.status).toBe(502);
    expect(await broken.json()).toMatchObject({ error: "payout_failed", stage: "retire" });
    expect(s.node.sent.slice(3)).toEqual([{ kind: "other", to: ENTRY_POINT_V06 }]);
    expect(s.node.nonces.get(a.address)).toBe(1n);
    await expectDroppedAndPhoneAsked(w, 4);
  });

  it("drops the revoke and asks for the phone when the chain still approves the old permission after handleOps", async () => {
    const w = await waitingRevoke();
    const { s, b, a } = w;
    s.node.entryPoint.innerReverts = true;
    const broken = await payout(b, a.key, { amount_usd: "5.00" });
    expect(broken.status).toBe(502);
    expect(await broken.json()).toMatchObject({ error: "payout_failed", stage: "retire" });
    expect(s.node.sent.slice(3)).toEqual([{ kind: "other", to: ENTRY_POINT_V06 }]);
    // The user operation validated and used its nonce; only its revoke did not happen.
    expect(s.node.nonces.get(a.address)).toBe(1n);
    await expectDroppedAndPhoneAsked(w, 4);
  });
});

describe("the payout waits for the SEPA approval of Bridge", () => {
  /** A matched payout handoff of a fresh account whose identity Bridge approved, and the page the tap on the number showed. */
  async function matched(s: MoneySetup) {
    const a = await account(s);
    s.bridge.state.kycStatus = "approved";
    const h = (await (await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "payout" }, a.key)).json()) as { code: string; match: number };
    const tapped = await tap(s.app, h.code, h.match);
    return { a, h, tapped };
  }
  const customerCalls = (s: MoneySetup) => s.bridge.calls.filter((c) => c.method === "GET" && c.path === "/v0/customers/cus_1");
  const bankCalls = (s: MoneySetup) =>
    s.bridge.calls.filter((c) => c.method === "POST" && (c.path.endsWith("/external_accounts") || c.path.endsWith("/liquidation_addresses")));

  it("stays on payout-verify while Bridge has not approved SEPA", async () => {
    const s = moneySetup();
    s.bridge.state.sepaStatus = "incomplete";
    const { h, tapped } = await matched(s);
    for (const html of [await tapped.text(), await (await s.app.request(`/h/${h.code}`)).text(), await (await form(s, `/h/${h.code}/payout-verify`, {})).text()]) {
      expect(html).toContain('data-soll="verify"');
      expect(html).toContain('data-href="https://bridge.example/verify/kyc_1"');
      expect(html).not.toContain('data-soll="bank"');
    }
    expect(customerCalls(s).length).toBeGreaterThanOrEqual(1);
  });

  it("makes no bank account at Bridge while SEPA is not approved", async () => {
    const s = moneySetup();
    s.bridge.state.sepaStatus = "incomplete";
    const { h } = await matched(s);
    const res = await form(s, `/h/${h.code}/payout-bank`, { iban: EXAMPLE_IBAN, owner_name: "Erika Mustermann" });
    const html = await res.text();
    expect(html).toContain('data-soll="verify"');
    expect(html).not.toContain('data-soll="payout"');
    expect(bankCalls(s)).toHaveLength(0);
    expect(s.bridge.calls.filter((c) => c.path === "/v0/customers/cus_1/external_accounts")).toHaveLength(0);
    expect(s.db.prepare("SELECT * FROM payout_handoffs WHERE code = ?").get(h.code)).toBeUndefined();
    expect(stateOf(s, h.code)).toBe("matched");
  });

  it("moves on to the bank step once KYC and SEPA are approved", async () => {
    const s = moneySetup();
    s.bridge.state.sepaStatus = "incomplete";
    const { h, tapped } = await matched(s);
    expect(tapped.status).toBe(200);
    s.bridge.state.sepaStatus = "approved";
    const res = await s.app.request(`/h/${h.code}`);
    expect(res.status).toBe(200);
    const bank = await res.text();
    expect(bank).toContain('data-soll="bank"');
    expect(bank).toMatch(/<input[^>]+name="iban"/);
  });

  it("answers 502 when Bridge cannot report the customer", async () => {
    const s = moneySetup();
    s.bridge.state.customerFails = true;
    const { h } = await matched(s);
    const page = await s.app.request(`/h/${h.code}`);
    expect(page.status).toBe(502);
    expect(await page.text()).not.toContain('data-soll="bank"');
    const res = await form(s, `/h/${h.code}/payout-bank`, { iban: EXAMPLE_IBAN, owner_name: "Erika Mustermann" });
    expect(res.status).toBe(502);
    expect(s.bridge.calls.filter((c) => c.path.endsWith("/external_accounts"))).toHaveLength(0);
    expect(s.db.prepare("SELECT * FROM payout_handoffs WHERE code = ?").get(h.code)).toBeUndefined();
  });
});
