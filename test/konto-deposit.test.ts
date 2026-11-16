/**
 * goals/konto/05, point 12 (server): the person pays by card over the handoff straight into the smart wallet of the account of the
 * API key, and only the server sets that target. The case of the page client is in test/konto-client-deposit.test.ts.
 */
import { describe, expect, it } from "vitest";
import { tap } from "./handoff-helpers.js";
import { account, allEvents, dataOf, json, moneySetup, stateOf, type MoneySetup } from "./money-helpers.js";

const start = async (s: MoneySetup, key: string, amount = "20.00") => {
  const res = await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "deposit", amount_usd: amount }, key);
  expect(res.status).toBe(201);
  return (await res.json()) as { code: string; url: string; qr: string; match: number; poll_token: string; expires_at: string };
};

describe("the deposit by card", () => {
  it("answers 401 on step deposit without an API key", async () => {
    const s = moneySetup();
    await account(s);
    const res = await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "deposit", amount_usd: "20.00" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  it("refuses an amount like 5.001, -1, abc, 0 or a number with 400", async () => {
    const s = moneySetup();
    const a = await account(s);
    for (const amount of ["5.001", "-1", "abc", "0", "0.00", 20, "12345678"]) {
      const res = await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "deposit", amount_usd: amount }, a.key);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_handoff" });
    }
    expect(s.db.prepare("SELECT count(*) AS n FROM handoffs WHERE step = 'deposit'").get()).toEqual({ n: 0 });
  });

  it("shows deposit-card after the right number, with the smart wallet of the account of this key, set by the server", async () => {
    const s = moneySetup();
    const a = await account(s);
    const other = await account(s);
    const h = await start(s, a.key);
    const approve = await (await s.app.request(`/h/${h.code}`)).text();
    expect(approve).toContain('data-soll="approve"');
    expect(approve).toContain("$20.00");
    const card = await (await tap(s.app, h.code, h.match)).text();
    expect(card).toContain('data-soll="card"');
    expect(stateOf(s, h.code)).toBe("matched");
    expect(dataOf(card, "money-card", "address")).toBe(a.address);
    expect(dataOf(card, "money-card", "address")).not.toBe(other.address);
    expect(dataOf(card, "money-card", "amount")).toBe("20000000");
    expect(dataOf(card, "money-card", "chain")).toBe("84532");
    expect(dataOf(card, "money-card", "code")).toBe(h.code);
    expect(dataOf(card, "money-card", "org")).toBe("org-test-1");
    expect(dataOf(card, "money-card", "owner")).toBe(a.owner.address);
  });

  it("refuses wallet_address in the body of the handoff and of the report of the page with 400", async () => {
    const s = moneySetup();
    const a = await account(s);
    const target = (await account(s)).address;
    for (const field of ["wallet_address", "address", "to", "destination"]) {
      const res = await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "deposit", amount_usd: "20.00", [field]: target }, a.key);
      expect(res.status).toBe(400);
    }
    const h = await start(s, a.key);
    await tap(s.app, h.code, h.match);
    const res = await json(s, `/h/${h.code}/deposit`, { opened: true, wallet_address: target });
    expect(res.status).toBe(400);
    expect(stateOf(s, h.code)).toBe("matched");
  });

  it("ends done when the page reports the card payment open, and the event carries no api_key", async () => {
    const s = moneySetup();
    const a = await account(s);
    const h = await start(s, a.key);
    expect((await json(s, `/h/${h.code}/deposit`, { opened: true })).status).toBe(409);
    await tap(s.app, h.code, h.match);
    expect((await json(s, `/h/${h.code}/deposit`, { opened: false })).status).toBe(400);
    const res = await json(s, `/h/${h.code}/deposit`, { opened: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "done" });
    const events = await allEvents(await s.app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }));
    expect(events.at(-1)).toEqual({ state: "done" });
    expect(JSON.stringify(events)).not.toContain("api_key");
    expect((await json(s, `/h/${h.code}/deposit`, { opened: true })).status).toBe(410);
  });

  it("answers 503 without CP_KONTO_CHAIN_ID", async () => {
    const on = moneySetup();
    const a = await account(on);
    const { createApp } = await import("../src/app.js");
    const app = createApp({ db: on.db, now: () => new Date(Date.parse("2026-11-13T12:00:00Z")), rateLimit: null, handoff: { pollMs: 5, missLimit: null }, konto: null });
    const res = await app.request("/v1/handoff", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${a.key}` },
      body: JSON.stringify({ automaton_name: "Atlas", step: "deposit", amount_usd: "20.00" }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "konto_unavailable" });
    expect((await app.request("/h/0123456789AB/deposit", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(503);
  });

  it("answers 404 no_account for a key without an account", async () => {
    const s = moneySetup();
    const a = await account(s);
    s.db.prepare("DELETE FROM konto_accounts WHERE address = ?").run(a.address);
    const res = await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "deposit", amount_usd: "20.00" }, a.key);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "no_account" });
  });
});
