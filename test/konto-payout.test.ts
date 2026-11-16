/**
 * goals/konto/05, point 10: the first payout goes over the handoff to identity, IBAN and a second permission whose spender is the
 * forwarder to the fixed payout address; every later one pays with the API key only there, never more than the USDC of the smart
 * wallet and never from the balance of the service.
 *
 * The forwarder the page asks to sign is compared with an address computed here from the CREATE2 rule (expectedForwarder), and
 * the deployed init code is read back from the raw transaction, so a forwarderAddress that returned anything else fails here.
 */
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { postLedger, getBalanceMc } from "../src/db.js";
import { tap } from "./handoff-helpers.js";
import {
  account,
  dataOf,
  EXAMPLE_IBAN,
  expectedForwarder,
  form,
  json,
  moneySetup,
  payoutPermission,
  stateOf,
  toPasskey,
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
    // Nowhere in the database is more of the IBAN than its last four characters.
    const dump = JSON.stringify(s.db.prepare("SELECT * FROM payout_handoffs").all()) + JSON.stringify(s.db.prepare("SELECT * FROM konto_payouts").all());
    expect(dump).not.toMatch(/0532|DE89|37040044/);
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

  it("makes a new IBAN a new forwarder and a new signature over the handoff, and sends retire to the old one before the next payout", async () => {
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
    expect(after.map((t) => t.kind)).toEqual(["retire", "deploy", "approveWithSignature", "payout"]);
    expect(after[0]).toMatchObject({ to: oldForwarder, salt: 99n });
    expect(after[1].target).toBe(newForwarder);
    expect(after[3]).toMatchObject({ to: newForwarder, value: 5n * USD });
    expect(s.node.balances.get(newDestination)).toBe(5n * USD);
    expect(s.node.balances.get(a.destination)).toBe(10n * USD);
    // Retired once: the payout after that goes over the new forwarder alone.
    expect((await payout(s, a.key, { amount_usd: "1.00" })).status).toBe(200);
    expect(s.node.sent.slice(7).map((t) => t.kind)).toEqual(["payout"]);
  });
});
