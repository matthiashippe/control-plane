import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureHouseJob, HOUSE_POSTER, HOUSE_PRICE_MC, openHouseJob } from "../src/bounties/house.js";
import { getBounty, openBountyCount } from "../src/bounties/store.js";
import { houseWorld, validReport } from "./house-helpers.js";

// goals/kunden/11 points 1 and 3: the service keeps exactly one house job of the operator wallet on the board, covered
// by a house_fund row in the same transaction, and the 402 of a foreign wallet without credit names it.

afterEach(() => {
  vi.useRealTimers();
});

describe("house job (goals/kunden/11)", () => {
  it("keeps one house job open: a second call changes nothing", () => {
    const { db, count } = houseWorld();
    expect(openBountyCount(db)).toBe(0);
    const first = ensureHouseJob(db);
    expect(first.posted).toBe(true);
    expect(first.bounty.creator).toBe(HOUSE_POSTER);
    expect(first.bounty.price_mc).toBe(HOUSE_PRICE_MC);
    const second = ensureHouseJob(db);
    expect(second.posted).toBe(false);
    expect(second.bounty.id).toBe(first.bounty.id);
    expect(openBountyCount(db)).toBe(1);
    expect(count("SELECT count(*) AS n FROM bounties")).toBe(1);
    expect(count("SELECT count(*) AS n FROM ledger WHERE kind = 'house_fund'")).toBe(1);
  });

  it("funds the house job with house_fund in the same transaction as its hold", () => {
    const { db, count } = houseWorld();
    const { bounty } = ensureHouseJob(db);
    const rows = db
      .prepare("SELECT address, kind, delta_mc, ref FROM ledger WHERE address = ? ORDER BY id")
      .all(HOUSE_POSTER) as { address: string; kind: string; delta_mc: number; ref: string }[];
    expect(rows).toEqual([
      { address: HOUSE_POSTER, kind: "house_fund", delta_mc: HOUSE_PRICE_MC, ref: `house-fund:${bounty.id}` },
      { address: HOUSE_POSTER, kind: "bounty_hold", delta_mc: -HOUSE_PRICE_MC, ref: `bounty:${bounty.id}` },
    ]);
    // The operator wallet carries nothing loose: the fund is inside the hold.
    expect((db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(HOUSE_POSTER) as { balance_mc: number }).balance_mc).toBe(0);

    // Counter-proof: when the bounty cannot be written, the fund is not written either.
    const fresh = houseWorld();
    fresh.db.exec("CREATE TRIGGER no_bounty BEFORE INSERT ON bounties BEGIN SELECT RAISE(ABORT, 'refused'); END;");
    expect(() => ensureHouseJob(fresh.db)).toThrow(/refused/);
    expect(fresh.count("SELECT count(*) AS n FROM ledger")).toBe(0);
    expect(count("SELECT count(*) AS n FROM ledger WHERE kind = 'house_fund'")).toBe(1);
  });

  it("posts the next house job after expiry and gives the old hold back", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    const { db, count } = houseWorld();
    const first = ensureHouseJob(db).bounty;
    // Six days on, the job still runs.
    vi.setSystemTime(new Date("2026-11-29T10:00:00Z"));
    expect(ensureHouseJob(db).posted).toBe(false);
    // Past its seven days it is closed and the next one stands.
    vi.setSystemTime(new Date("2026-11-30T10:00:01Z"));
    const next = ensureHouseJob(db);
    expect(next.posted).toBe(true);
    expect(next.bounty.id).not.toBe(first.id);
    expect(getBounty(db, first.id)?.status).toBe("expired");
    expect(openHouseJob(db)?.id).toBe(next.bounty.id);
    expect(openBountyCount(db)).toBe(1);
    expect(count("SELECT count(*) AS n FROM ledger WHERE kind = 'bounty_release' AND ref = ?", `bounty-expired:${first.id}`)).toBe(1);
  });

  it("posts the next house job after an award", async () => {
    const { db, account } = houseWorld();
    const first = ensureHouseJob(db).bounty;
    const customer = account();
    const res = await customer.submit(first.id, validReport());
    expect(res.status).toBe(201);
    expect(getBounty(db, first.id)?.status).toBe("awarded");
    const next = openHouseJob(db);
    expect(next).not.toBeNull();
    expect(next!.id).not.toBe(first.id);
    expect(openBountyCount(db)).toBe(1);
  });

  it("board shows the house job on /bounties.json and /v1/bounties", async () => {
    const { db, app, account } = houseWorld();
    const { bounty } = ensureHouseJob(db);
    const pub = (await (await app.request("/bounties.json")).json()) as { open: { id: string; brief: string; price_cents: number }[] };
    expect(pub.open.map((b) => b.id)).toEqual([bounty.id]);
    expect(pub.open[0].price_cents).toBe(HOUSE_PRICE_MC / 1000);
    expect(pub.open[0].brief).toMatch(/"runtime"/);
    const customer = account();
    const v1 = (await (await customer.get("/v1/bounties")).json()) as { bounties: { id: string }[] };
    expect(v1.bounties.map((b) => b.id)).toEqual([bounty.id]);
  });

  it("402 names the house job with open_bounties and bounties_url", async () => {
    const { db, account } = houseWorld();
    const customer = account();
    // Counter-proof first: without the house job the board is empty and the 402 stays quiet about it.
    const before = (await (await customer.chat()).json()) as { error: string; details: Record<string, unknown> };
    expect(before.error).toBe("INSUFFICIENT_CREDITS");
    expect(before.details.open_bounties).toBeUndefined();

    ensureHouseJob(db);
    const res = await customer.chat();
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; details: { open_bounties?: number; bounties_url?: string } };
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
    expect(body.details.open_bounties).toBe(1);
    expect(body.details.bounties_url).toMatch(/\/bounties\.json$/);
    expect(customer.balance()).toBe(0);
  });
});
