import { afterEach, describe, expect, it, vi } from "vitest";
import { checkHouseReport, ensureHouseJob, HOUSE_DAILY_AWARDS, HOUSE_PRICE_MC, openHouseJob } from "../src/bounties/house.js";
import { OUR_ADDRESSES } from "../src/bounties/ours.js";
import { houseWorld, validReport } from "./house-helpers.js";

// goals/kunden/11 point 2: a valid report of a foreign runtime is awarded without a human and pays its next inference;
// every refusal books nothing, and the limits per address and per day hold.

afterEach(() => {
  vi.useRealTimers();
});

type Refusal = { error: string; message: string; reason?: string; retry_after?: string };

describe("house award (goals/kunden/11)", () => {
  it("pays a valid report then inference", async () => {
    const { db, account } = houseWorld();
    const customer = account();
    expect(customer.balance()).toBe(0);
    expect((await customer.chat()).status).toBe(402);

    const job = ensureHouseJob(db).bounty;
    const res = await customer.submit(job.id, validReport("/pay/5/0x1111111111111111111111111111111111111111", 402));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; bounty_id: string; award: string; credit_mc: number };
    expect(body.bounty_id).toBe(job.id);
    expect(body.award).toBe("paid");
    // Without a fee address the whole price arrives.
    expect(body.credit_mc).toBe(HOUSE_PRICE_MC);
    expect(customer.rows("bounty_award")).toBe(1);
    expect(customer.balance()).toBe(HOUSE_PRICE_MC);

    const chat = await customer.chat();
    expect(chat.status).toBe(200);
    expect(customer.rows("inference")).toBe(2);
    expect(customer.balance()).toBeLessThan(HOUSE_PRICE_MC);
  });

  it("rejects an invalid report and books nothing", async () => {
    const { db, account, ledgerRows, submissionRows } = houseWorld();
    const customer = account();
    const job = ensureHouseJob(db).bounty;
    const ledger = ledgerRows();
    const invalid = [
      "These calls failed: POST /v1/sandboxes.",
      "[]",
      JSON.stringify({ calls: [{ method: "GET", path: "/v1/x", status: 404 }] }),
      JSON.stringify({ runtime: "xyz", calls: [{ method: "GET", path: "/v1/x", status: 404 }] }),
      JSON.stringify({ runtime: "d8f8168", calls: [] }),
      JSON.stringify({ runtime: "d8f8168", calls: Array.from({ length: 21 }, () => ({ method: "GET", path: "/v1/x", status: 404 })) }),
      JSON.stringify({ runtime: "d8f8168", calls: [{ method: "HEAD", path: "/v1/x", status: 404 }] }),
      JSON.stringify({ runtime: "d8f8168", calls: [{ method: "GET", path: "v1/x", status: 404 }] }),
      JSON.stringify({ runtime: "d8f8168", calls: [{ method: "GET", path: `/${"a".repeat(200)}`, status: 404 }] }),
      JSON.stringify({ runtime: "d8f8168", calls: [{ method: "GET", path: "/v1/x", status: 600 }] }),
      JSON.stringify({ runtime: "d8f8168", calls: [{ method: "GET", path: "/v1/x", status: 404.5 }] }),
      JSON.stringify({ runtime: "d8f8168", calls: [{ method: "GET", path: "/v1/x", status: 404 }], note: "x" }),
    ];
    for (const body of invalid) {
      expect(checkHouseReport(body).ok, body).toBe(false);
      const res = await customer.submit(job.id, body);
      expect(res.status, body).toBe(422);
      const r = (await res.json()) as Refusal;
      expect(r.error).toBe("house_report_invalid");
      expect(r.reason).toBeTruthy();
    }
    expect(submissionRows()).toBe(0);
    expect(ledgerRows()).toBe(ledger);
    expect(customer.balance()).toBe(0);
    expect(openHouseJob(db)?.id).toBe(job.id);
    // The boundaries themselves are valid.
    expect(checkHouseReport(JSON.stringify({ runtime: "a".repeat(40), calls: [{ method: "DELETE", path: `/${"a".repeat(199)}`, status: 599 }] })).ok).toBe(true);
    expect(checkHouseReport(validReport()).ok).toBe(true);
  });

  it("never pays our own addresses", async () => {
    const { db, account, ledgerRows, submissionRows } = houseWorld();
    const job = ensureHouseJob(db).bounty;
    const ledger = ledgerRows();
    // One of ours by history, carrying the runtime's own key name; and one of ours by the name of its key.
    const byList = account({ address: OUR_ADDRESSES[1], spentStarter: false });
    const byKey = account({ keyName: "ops-house-probe", spentStarter: false });
    for (const who of [byList, byKey]) {
      const res = await who.submit(job.id, validReport());
      expect(res.status).toBe(403);
      expect(((await res.json()) as Refusal).error).toBe("house_ours");
    }
    expect(submissionRows()).toBe(0);
    expect(ledgerRows()).toBe(ledger);
  });

  it("pays only a runtime key", async () => {
    const { db, account, ledgerRows, submissionRows } = houseWorld();
    const job = ensureHouseJob(db).bounty;
    const script = account({ keyName: "my-bot" });
    // A key under the runtime's own name on a foreign wallet is what the house job pays.
    const runtime = account();
    const ledger = ledgerRows();
    const res = await script.submit(job.id, validReport());
    expect(res.status).toBe(403);
    expect(((await res.json()) as Refusal).error).toBe("house_runtime_only");
    expect(submissionRows()).toBe(0);
    expect(ledgerRows()).toBe(ledger);
    expect((await runtime.submit(job.id, validReport())).status).toBe(201);
    expect(script.rows("bounty_award")).toBe(0);
  });

  it("pays one report per address per day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T09:00:00Z"));
    const { db, account, ledgerRows, submissionRows } = houseWorld();
    const customer = account();
    expect((await customer.submit(ensureHouseJob(db).bounty.id, validReport())).status).toBe(201);
    const ledger = ledgerRows();
    const subs = submissionRows();

    vi.setSystemTime(new Date("2026-11-23T23:59:00Z"));
    const second = await customer.submit(ensureHouseJob(db).bounty.id, validReport("/v1/models", 500));
    expect(second.status).toBe(409);
    const r = (await second.json()) as Refusal;
    expect(r.error).toBe("house_daily_limit");
    expect(r.retry_after).toBe("2026-11-24T00:00:00.000Z");
    expect(submissionRows()).toBe(subs);
    expect(ledgerRows()).toBe(ledger);

    vi.setSystemTime(new Date("2026-11-24T00:00:01Z"));
    expect((await customer.submit(ensureHouseJob(db).bounty.id, validReport("/v1/models", 500))).status).toBe(201);
    expect(customer.rows("bounty_award")).toBe(2);
  });

  it("stops at the daily house limit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
    const { db, account, ledgerRows, submissionRows } = houseWorld();
    for (let i = 0; i < HOUSE_DAILY_AWARDS; i++) {
      const res = await account().submit(ensureHouseJob(db).bounty.id, validReport());
      expect(res.status).toBe(201);
    }
    expect(HOUSE_DAILY_AWARDS).toBe(4);
    const late = account();
    const ledger = ledgerRows();
    const subs = submissionRows();
    const res = await late.submit(ensureHouseJob(db).bounty.id, validReport());
    expect(res.status).toBe(409);
    const r = (await res.json()) as Refusal;
    expect(r.error).toBe("house_pool_empty");
    expect(r.retry_after).toBe("2026-11-24T00:00:00.000Z");
    expect(submissionRows()).toBe(subs);
    expect(ledgerRows()).toBe(ledger);
    expect(late.balance()).toBe(0);
    // The house job stays on the board for tomorrow.
    expect(openHouseJob(db)).not.toBeNull();

    vi.setSystemTime(new Date("2026-11-24T00:00:01Z"));
    expect((await late.submit(ensureHouseJob(db).bounty.id, validReport())).status).toBe(201);
  });
});
