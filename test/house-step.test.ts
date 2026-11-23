import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureHouseJob,
  grantForHouseJob,
  HOUSE_DAILY_MC,
  HOUSE_PRICE_MC,
  HOUSE_STEP_MC,
  openHouseJob,
  submitHouseReport,
} from "../src/bounties/house.js";
import { OUR_ADDRESSES } from "../src/bounties/ours.js";
import { postLedger } from "../src/db.js";
import { houseWorld, validReport } from "./house-helpers.js";

// goals/kunden/13: a foreign runtime that has thought here before and whose balance cannot pay its next inference gets
// one step credit while a house job is open, so that its model can read the job and write the report. Every other case
// keeps the 402 and books nothing. A report to a closed or expired house job names the open one.

afterEach(() => {
  vi.useRealTimers();
});

type Refusal = { error: string; message: string; open_house_job?: { id: string } };

describe("house step credit (goals/kunden/13)", () => {
  it("empty balance, house job open, next completion 200", async () => {
    const { db, account } = houseWorld();
    const customer = account();
    ensureHouseJob(db);
    expect(customer.balance()).toBe(0);

    const res = await customer.chat();
    expect(res.status).toBe(200);
    expect(customer.rows("house_step")).toBe(1);
    const row = db
      .prepare("SELECT delta_mc, ref, meta FROM ledger WHERE address = ? AND kind = 'house_step'")
      .get(customer.address) as { delta_mc: number; ref: string; meta: string };
    expect(row.delta_mc).toBe(HOUSE_STEP_MC);
    expect(row.ref).toBe(`house-step:${customer.address}`);
    expect(JSON.parse(row.meta)).toEqual({ trigger: "house job open", bounty_id: openHouseJob(db)?.id });
    // The answer is charged like any other, out of the step credit.
    expect(customer.rows("inference")).toBe(2);
    expect(customer.balance()).toBeGreaterThan(0);
    expect(customer.balance()).toBeLessThan(HOUSE_STEP_MC);
  });

  it("no step credit without an open house job", async () => {
    const { db, account, ledgerRows } = houseWorld();
    const customer = account();
    const ledger = ledgerRows();
    const res = await customer.chat();
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe("INSUFFICIENT_CREDITS");
    expect(ledgerRows()).toBe(ledger);
    expect(grantForHouseJob(db, customer.address)).toBe(false);
    expect(customer.rows("house_step")).toBe(0);
    expect(customer.balance()).toBe(0);
  });

  it("one step credit per address, ever", async () => {
    const { db, account, ledgerRows } = houseWorld();
    const customer = account();
    ensureHouseJob(db);
    expect((await customer.chat()).status).toBe(200);
    // The rest of the step credit is spent elsewhere; the balance is empty again.
    postLedger(db, { address: customer.address, kind: "inference", deltaMc: -customer.balance(), ref: `drain-${customer.address}` });
    expect(customer.balance()).toBe(0);
    const ledger = ledgerRows();

    expect((await customer.chat()).status).toBe(402);
    expect(grantForHouseJob(db, customer.address)).toBe(false);
    expect(customer.rows("house_step")).toBe(1);
    expect(ledgerRows()).toBe(ledger);
    // The unique index holds it even past the checks.
    expect(() =>
      postLedger(db, { address: customer.address, kind: "house_step", deltaMc: HOUSE_STEP_MC, ref: `house-step:${customer.address}` }),
    ).toThrow(/UNIQUE/);
  });

  it("no step credit for our own addresses", async () => {
    const { db, account, ledgerRows } = houseWorld();
    ensureHouseJob(db);
    const byList = account({ address: OUR_ADDRESSES[1] });
    const byKey = account({ keyName: "ops-house-probe" });
    const ledger = ledgerRows();
    for (const who of [byList, byKey]) {
      expect((await who.chat()).status).toBe(402);
      expect(who.rows("house_step")).toBe(0);
    }
    expect(ledgerRows()).toBe(ledger);
  });

  it("no step credit for a handle of the keyless door", async () => {
    const { db, account, ledgerRows } = houseWorld();
    ensureHouseJob(db);
    const handle = account({ address: `key:${"ab".repeat(20)}` });
    const ledger = ledgerRows();
    expect((await handle.chat()).status).toBe(402);
    expect(handle.rows("house_step")).toBe(0);
    expect(ledgerRows()).toBe(ledger);
  });

  it("no step credit without a runtime key", async () => {
    const { db, account, ledgerRows } = houseWorld();
    ensureHouseJob(db);
    const script = account({ keyName: "my-bot" });
    const ledger = ledgerRows();
    expect((await script.chat()).status).toBe(402);
    expect(script.rows("house_step")).toBe(0);
    expect(ledgerRows()).toBe(ledger);
  });

  it("no step credit before a first inference", async () => {
    const { db, account, ledgerRows } = houseWorld();
    ensureHouseJob(db);
    // A fresh wallet whose starter credit is gone (here: the day's pool spent) and that never thought here.
    const fresh = account({ spentStarter: false });
    const before = ledgerRows();
    vi.stubEnv("CP_POOL_DAILY_MC", "1");
    try {
      expect((await fresh.chat()).status).toBe(402);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(fresh.rows("grant")).toBe(0);
    expect(fresh.rows("house_step")).toBe(0);
    expect(ledgerRows()).toBe(before);
  });

  it("no step credit after a house award", async () => {
    const { db, account, ledgerRows } = houseWorld();
    const customer = account();
    expect((await customer.submit(ensureHouseJob(db).bounty.id, validReport())).status).toBe(201);
    postLedger(db, { address: customer.address, kind: "inference", deltaMc: -customer.balance(), ref: `drain-${customer.address}` });
    expect(customer.balance()).toBe(0);
    expect(openHouseJob(db)).not.toBeNull();
    const ledger = ledgerRows();
    expect((await customer.chat()).status).toBe(402);
    expect(customer.rows("house_step")).toBe(0);
    expect(ledgerRows()).toBe(ledger);
  });

  it("step credits and awards stay within one dollar a day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
    const { db, account, ledgerRows, submissionRows } = houseWorld();
    expect(HOUSE_DAILY_MC).toBe(100_000);
    // Three awards (75 cents) and two step credits (20 cents) make 95 cents; the third step credit would pass a dollar.
    for (let i = 0; i < 3; i++) expect((await account().submit(ensureHouseJob(db).bounty.id, validReport())).status).toBe(201);
    for (let i = 0; i < 2; i++) expect((await account().chat()).status).toBe(200);
    const late = account();
    let ledger = ledgerRows();
    expect((await late.chat()).status).toBe(402);
    expect(late.rows("house_step")).toBe(0);
    expect(ledgerRows()).toBe(ledger);
    // A fourth award would make 120 cents: refused like a full pool, and nothing is booked.
    const fourth = account();
    const job = ensureHouseJob(db).bounty;
    ledger = ledgerRows();
    const subs = submissionRows();
    const res = await fourth.submit(job.id, validReport());
    expect(res.status).toBe(409);
    expect(((await res.json()) as Refusal).error).toBe("house_pool_empty");
    expect(ledgerRows()).toBe(ledger);
    expect(submissionRows()).toBe(subs);
    const spent =
      3 * HOUSE_PRICE_MC +
      (db.prepare("SELECT coalesce(sum(delta_mc), 0) AS n FROM ledger WHERE kind = 'house_step'").get() as { n: number }).n;
    expect(spent).toBeLessThanOrEqual(HOUSE_DAILY_MC);

    // The next UTC day starts over.
    vi.setSystemTime(new Date("2026-11-24T00:00:01Z"));
    expect((await late.chat()).status).toBe(200);
    expect(late.rows("house_step")).toBe(1);
  });

  // A call whose reservation the step credit cannot cover: about 50k prompt tokens and the largest max_tokens of the mock
  // model come to more than HOUSE_STEP_MC.
  const bigCall = (who: { post: (path: string, body: unknown) => Promise<Response> }) =>
    who.post("/v1/chat/completions", {
      model: "mock-1",
      messages: [{ role: "user", content: "x".repeat(200_000) }],
      max_tokens: 32_768,
      stream: false,
    });

  it("no step credit when it cannot cover the call", async () => {
    const { db, account, ledgerRows } = houseWorld();
    ensureHouseJob(db);
    // The twin has spent its step credit already, so its 402 is the one the service gives without any step credit.
    const twin = account();
    postLedger(db, { address: twin.address, kind: "house_step", deltaMc: HOUSE_STEP_MC, ref: `house-step:${twin.address}` });
    postLedger(db, { address: twin.address, kind: "inference", deltaMc: -HOUSE_STEP_MC, ref: `spent-step-${twin.address}` });
    const expected = await (await bigCall(twin)).text();
    const customer = account();
    const ledger = ledgerRows();

    const res = await bigCall(customer);
    expect(res.status).toBe(402);
    expect(await res.text()).toBe(expected.split(twin.address).join(customer.address));
    expect(customer.rows("house_step")).toBe(0);
    expect(customer.balance()).toBe(0);
    expect(ledgerRows()).toBe(ledger);
  });

  it("step credit kept for a call it covers", async () => {
    const { db, account } = houseWorld();
    ensureHouseJob(db);
    const customer = account();
    expect((await bigCall(customer)).status).toBe(402);
    expect(customer.rows("house_step")).toBe(0);

    const res = await customer.chat();
    expect(res.status).toBe(200);
    expect(customer.rows("house_step")).toBe(1);
    expect(customer.balance()).toBeGreaterThan(0);
    expect(customer.balance()).toBeLessThan(HOUSE_STEP_MC);
  });

  it("not_open names the open house job", async () => {
    const { db, account } = houseWorld();
    const first = ensureHouseJob(db).bounty;
    expect((await account().submit(first.id, validReport())).status).toBe(201);
    const next = openHouseJob(db);
    expect(next).not.toBeNull();
    expect(next?.id).not.toBe(first.id);

    const res = await account().submit(first.id, validReport());
    expect(res.status).toBe(409);
    const body = (await res.json()) as Refusal;
    expect(body.error).toBe("not_open");
    expect(body.open_house_job).toEqual({ id: next?.id });
    expect(body.message).toContain(next?.id as string);
  });

  it("deadline_passed names the open house job", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
    const { db, account } = houseWorld();
    const old = ensureHouseJob(db).bounty;
    const customer = account();
    // A week and a minute later, before the ten-minute round has replaced the job: the old one is still open but past
    // its deadline.
    vi.setSystemTime(new Date(Date.parse(old.deadline) + 60_000));
    let refusal: unknown;
    try {
      submitHouseReport(db, { bountyId: old.id, agent: customer.address, body: validReport() });
    } catch (e) {
      refusal = e;
    }
    const e = refusal as { code: string; status: number; extra: { open_house_job?: { id: string } } };
    expect(e.code).toBe("deadline_passed");
    expect(e.status).toBe(409);
    const open = openHouseJob(db);
    expect(open).not.toBeNull();
    expect(open?.id).not.toBe(old.id);
    expect(e.extra.open_house_job).toEqual({ id: open?.id });
    expect(customer.rows("bounty_award")).toBe(0);
  });

  it("an expired house job answers not_open with the open one over HTTP", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
    const { db, account } = houseWorld();
    const old = ensureHouseJob(db).bounty;
    vi.setSystemTime(new Date(Date.parse(old.deadline) + 60_000));
    const res = await account().submit(old.id, validReport());
    expect(res.status).toBe(409);
    const body = (await res.json()) as Refusal;
    expect(body.error).toBe("not_open");
    expect(body.open_house_job?.id).toBe(openHouseJob(db)?.id);
    expect(body.open_house_job?.id).not.toBe(old.id);
  });
});
