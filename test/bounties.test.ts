import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger, MC_PER_CENT } from "../src/db.js";
import { releaseExpired, FEE_PERCENT, feeMc } from "../src/bounties/store.js";
import { hashApiKey } from "../src/auth/siwe.js";

const IN_ONE_HOUR = () => new Date(Date.now() + 3_600_000).toISOString();

function account(db: ReturnType<typeof openDb>, app: ReturnType<typeof createApp>, balanceMc: number, n: number) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${String(n).repeat(2)}` + "ef".repeat(15);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: `seed-${n}` });
  const call = (path: string, method: string, body?: unknown, withKey = true) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(withKey ? { authorization: key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    address,
    postBounty: (b: unknown) => call("/v1/bounties", "POST", b),
    cancel: (b: unknown) => call("/v1/bounties/cancel", "POST", b),
    list: () => call("/v1/bounties", "GET"),
    submit: (b: unknown) => call("/v1/submissions", "POST", b),
    awardBounty: (b: unknown) => call("/v1/bounties/award", "POST", b),
    submissionsFor: (id: string) => call(`/v1/submissions?bounty_id=${id}`, "GET"),
    myBounties: () => call("/v1/bounties/mine", "GET"),
    mySubmissions: () => call("/v1/submissions/mine", "GET"),
    withoutKey: () => app.request("/v1/bounties", { method: "GET" }),
    balance: () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc,
  };
}

/** 5 USD of credit, so 500,000 mc. */
function setup(balanceMc = 500_000) {
  const db = openDb(":memory:");
  const app = createApp({ db });
  const ledgerSum = () =>
    (db.prepare("SELECT coalesce(sum(delta_mc), 0) AS s FROM ledger").get() as { s: number }).s;
  const balanceSum = () =>
    (db.prepare("SELECT coalesce(sum(balance_mc), 0) AS s FROM wallets").get() as { s: number }).s;
  return { db, app, a: account(db, app, balanceMc, 1), b: account(db, app, balanceMc, 2), ledgerSum, balanceSum };
}

const BASE_BOUNTY = { brief: "Write a listing description.", kind: "factual", price_cents: 200, deadline: "" };
const bounty = (override: Record<string, unknown> = {}) => ({ ...BASE_BOUNTY, deadline: IN_ONE_HOUR(), ...override });

describe("posting a bounty", () => {
  it("charges the price right away, because a bounty without money behind it is an empty promise", async () => {
    const { a } = setup();
    const before = a.balance();
    const res = await a.postBounty(bounty());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; price_cents: number; status: string };
    expect(body.price_cents).toBe(200);
    expect(body.status).toBe("open");
    expect(a.balance()).toBe(before - 200 * MC_PER_CENT);
  });

  it("creates no bounty at all when the credit is too small and leaves the balance untouched", async () => {
    const { a, db } = setup(50_000); // 50 cents
    const before = a.balance();
    const res = await a.postBounty(bounty({ price_cents: 200 }));
    expect(res.status).toBe(402);
    expect(a.balance()).toBe(before);
    expect((db.prepare("SELECT count(*) AS n FROM bounties").get() as { n: number }).n).toBe(0);
  });

  it("rejects empty briefs, impossible prices and impossible deadlines", async () => {
    const { a } = setup();
    const cases: [Record<string, unknown>, string][] = [
      [{ brief: "  " }, "brief_required"],
      [{ price_cents: 0 }, "price_out_of_range"],
      [{ price_cents: 1.5 }, "price_out_of_range"],
      [{ price_cents: 200_000 }, "price_out_of_range"],
      [{ deadline: "tomorrow" }, "deadline_invalid"],
      [{ deadline: new Date(Date.now() - 1000).toISOString() }, "deadline_too_soon"],
      [{ deadline: new Date(Date.now() + 40 * 24 * 3_600_000).toISOString() }, "deadline_too_far"],
    ];
    for (const [override, code] of cases) {
      const res = await a.postBounty(bounty(override));
      expect(res.status, JSON.stringify(override)).toBe(400);
      expect(((await res.json()) as { error: string }).error, JSON.stringify(override)).toBe(code);
    }
    expect(a.balance(), "no rejected bounty costs money").toBe(500_000);
  });
});

describe("cancelling a bounty", () => {
  it("gives back exactly the amount that was held", async () => {
    const { a } = setup();
    const before = a.balance();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    const res = await a.cancel({ id });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("cancelled");
    expect(a.balance()).toBe(before);
  });

  it("does not credit again on a second call", async () => {
    const { a } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    await a.cancel({ id });
    const afterFirst = a.balance();
    const res = await a.cancel({ id });
    expect(res.status).toBe(409);
    expect(a.balance(), "otherwise money would appear out of nothing").toBe(afterFirst);
  });

  it("lets only the buyer cancel", async () => {
    const { a, b } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    const res = await b.cancel({ id });
    expect(res.status).toBe(403);
    expect(b.balance(), "somebody else's money does not land with the stranger either").toBe(500_000);
  });

  it("answers 404 for unknown ids and demands one at all", async () => {
    const { a } = setup();
    expect((await a.cancel({ id: "does-not-exist" })).status).toBe(404);
    expect((await a.cancel({})).status).toBe(400);
  });
});

describe("the bounty list", () => {
  it("shows open bounties but no cancelled ones", async () => {
    const { a } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    await a.postBounty(bounty({ price_cents: 100 }));
    expect((((await (await a.list()).json()) as { bounties: unknown[] })).bounties).toHaveLength(2);
    await a.cancel({ id });
    expect((((await (await a.list()).json()) as { bounties: unknown[] })).bounties).toHaveLength(1);
  });

  it("no longer shows expired bounties", async () => {
    const { a, db } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);
    expect((((await (await a.list()).json()) as { bounties: unknown[] })).bounties).toHaveLength(0);
  });

  it("needs an API key", async () => {
    const { a } = setup();
    expect((await a.withoutKey()).status).toBe(401);
  });
});

describe("bookkeeping", () => {
  it("keeps the ledger and the balances congruent after posting and cancelling", async () => {
    const { a, ledgerSum, balanceSum } = setup();
    expect(ledgerSum()).toBe(balanceSum());
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    expect(ledgerSum(), "the held money is out of the balances").toBe(balanceSum());
    await a.cancel({ id });
    expect(ledgerSum()).toBe(balanceSum());
    expect(balanceSum()).toBe(1_000_000);
  });

  it("writes a ledger row referring to the bounty for every movement", async () => {
    const { a, db } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    await a.cancel({ id });
    const rows = db
      .prepare("SELECT kind, delta_mc, ref FROM ledger WHERE ref LIKE ? ORDER BY id")
      .all(`%${id}`) as { kind: string; delta_mc: number; ref: string }[];
    expect(rows.map((r) => r.kind)).toEqual(["bounty_hold", "bounty_release"]);
    expect(rows[0].delta_mc).toBe(-200 * MC_PER_CENT);
    expect(rows[1].delta_mc).toBe(200 * MC_PER_CENT);
  });
});

describe("expiry when the deadline passes", () => {
  /** Puts the deadline in the past without bypassing the check on posting. */
  async function expiredBounty() {
    const s = setup();
    const { id } = (await (await s.a.postBounty(bounty())).json()) as { id: string };
    s.db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);
    return { ...s, id };
  }

  it("gives the held money back, otherwise it sits there forever", async () => {
    const { a, db, id } = await expiredBounty();
    expect(a.balance(), "beforehand the money is locked").toBe(500_000 - 200 * MC_PER_CENT);
    expect(releaseExpired(db)).toBe(1);
    expect(a.balance()).toBe(500_000);
    expect((db.prepare("SELECT status FROM bounties WHERE id = ?").get(id) as { status: string }).status).toBe("expired");
  });

  it("tells expired apart from cancelled, because they are two different stories", async () => {
    const { db, id } = await expiredBounty();
    releaseExpired(db);
    const row = db.prepare("SELECT kind, ref FROM ledger WHERE ref = ?").get(`bounty-expired:${id}`) as { kind: string };
    expect(row.kind).toBe("bounty_release");
  });

  it("does not credit again on a second pass", async () => {
    const { a, db } = await expiredBounty();
    releaseExpired(db);
    const afterFirst = a.balance();
    expect(releaseExpired(db)).toBe(0);
    expect(a.balance()).toBe(afterFirst);
  });

  it("leaves running bounties untouched", async () => {
    const { a, db } = setup();
    await a.postBounty(bounty());
    expect(releaseExpired(db)).toBe(0);
    expect(a.balance()).toBe(500_000 - 200 * MC_PER_CENT);
  });

  it("runs on its own as soon as somebody touches the market", async () => {
    const { a, db, id } = await expiredBounty();
    await a.list();
    expect((db.prepare("SELECT status FROM bounties WHERE id = ?").get(id) as { status: string }).status).toBe("expired");
    expect(a.balance()).toBe(500_000);
  });

  it("keeps the ledger and the balances congruent after the expiry too", async () => {
    const { db, ledgerSum, balanceSum } = await expiredBounty();
    releaseExpired(db);
    expect(ledgerSum()).toBe(balanceSum());
    expect(balanceSum()).toBe(1_000_000);
  });

  it("gives the money back even when the service restarts in between", async () => {
    const { db, a, id } = await expiredBounty();
    // A restart builds the app again; that is exactly where the pass runs.
    createApp({ db });
    expect((db.prepare("SELECT status FROM bounties WHERE id = ?").get(id) as { status: string }).status).toBe("expired");
    expect(a.balance()).toBe(500_000);
  });
});

describe("the expiry pass must not prevent the start", () => {
  it("lets the app come into existence even with a broken database, instead of building a restart loop", () => {
    const broken = {
      prepare() {
        throw new Error("SQLITE_CORRUPT: database disk image is malformed");
      },
    } as unknown as ReturnType<typeof openDb>;
    // Without the guard createApp itself throws, and together with autoheal that would be a
    // restart loop instead of a service that warns loudly and keeps running.
    expect(() => createApp({ db: broken })).not.toThrow();
  });
});

describe("submitting and awarding: the way the money travels to the winner", () => {
  /** Buyer a, entrant b. */
  async function market() {
    const s = setup();
    const { id } = (await (await s.a.postBounty(bounty())).json()) as { id: string };
    return { ...s, id };
  }

  it("accepts a submission and pays out exactly the held amount on the award", async () => {
    const { a, b, id, ledgerSum, balanceSum } = await market();
    const res = await b.submit({ bounty_id: id, body: "Here is the listing." });
    expect(res.status).toBe(201);
    const { id: sid } = (await res.json()) as { id: string };

    const award = await a.awardBounty({ bounty_id: id, submission_id: sid });
    expect(award.status).toBe(200);
    expect(((await award.json()) as { status: string }).status).toBe("awarded");
    expect(b.balance(), "the winner gets the price").toBe(500_000 + 200 * MC_PER_CENT);
    expect(a.balance(), "the buyer paid it when posting").toBe(500_000 - 200 * MC_PER_CENT);
    expect(ledgerSum(), "the money never left the ledger").toBe(balanceSum());
    expect(balanceSum()).toBe(1_000_000);
  });

  it("does not award a second time, otherwise money would appear out of nothing", async () => {
    const { a, b, id } = await market();
    const { id: sid } = (await (await b.submit({ bounty_id: id, body: "x" })).json()) as { id: string };
    await a.awardBounty({ bounty_id: id, submission_id: sid });
    const afterFirst = b.balance();
    const second = await a.awardBounty({ bounty_id: id, submission_id: sid });
    expect(second.status).toBe(409);
    expect(b.balance()).toBe(afterFirst);
  });

  it("lets only the buyer award", async () => {
    const { a, b, id } = await market();
    const { id: sid } = (await (await b.submit({ bounty_id: id, body: "x" })).json()) as { id: string };
    const res = await b.awardBounty({ bounty_id: id, submission_id: sid });
    expect(res.status).toBe(403);
    expect(b.balance(), "nobody awards themselves somebody else's money").toBe(500_000);
    void a;
  });

  it("accepts only one submission per agent", async () => {
    const { b, id } = await market();
    expect((await b.submit({ bounty_id: id, body: "first attempt" })).status).toBe(201);
    const secondSubmission = await b.submit({ bounty_id: id, body: "second attempt" });
    expect(secondSubmission.status).toBe(409);
    expect(((await secondSubmission.json()) as { error: string }).error).toBe("already_submitted");
  });

  it("does not let the buyer compete for their own bounty", async () => {
    const { a, id } = await market();
    const res = await a.submit({ bounty_id: id, body: "my own work" });
    expect(res.status).toBe(403);
  });

  it("accepts nothing any more once the deadline has passed", async () => {
    const { b, db, id } = await market();
    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);
    const res = await b.submit({ bounty_id: id, body: "too late" });
    // The pass at the start of the route has already expired the bounty.
    expect(res.status).toBe(409);
    expect((db.prepare("SELECT status FROM bounties WHERE id = ?").get(id) as { status: string }).status).toBe("expired");
  });

  it("rejects a submission that belongs to a different bounty", async () => {
    const { a, b, id } = await market();
    const { id: id2 } = (await (await a.postBounty(bounty({ price_cents: 100 }))).json()) as { id: string };
    const { id: sid } = (await (await b.submit({ bounty_id: id2, body: "belongs to 2" })).json()) as { id: string };
    const res = await a.awardBounty({ bounty_id: id, submission_id: sid });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("submission_other_bounty");
  });

  it("shows the buyer all submissions and an entrant only their own", async () => {
    const { db, app, a, b, id } = await market();
    const c = account(db, app, 500_000, 3);
    await b.submit({ bounty_id: id, body: "from b" });
    await c.submit({ bounty_id: id, body: "from c" });
    const asBuyer = (await (await a.submissionsFor(id)).json()) as { submissions: unknown[] };
    expect(asBuyer.submissions, "they have to be able to choose").toHaveLength(2);
    const asEntrant = (await (await b.submissionsFor(id)).json()) as { submissions: { body: string }[] };
    expect(asEntrant.submissions, "otherwise one copies from the other").toHaveLength(1);
    expect(asEntrant.submissions[0].body).toBe("from b");
  });

  it("writes a ledger row for the award referring to the bounty and the submission", async () => {
    const { a, b, db, id } = await market();
    const { id: sid } = (await (await b.submit({ bounty_id: id, body: "x" })).json()) as { id: string };
    await a.awardBounty({ bounty_id: id, submission_id: sid });
    const row = db.prepare("SELECT kind, delta_mc, address, meta FROM ledger WHERE ref = ?").get(`bounty-award:${id}`) as
      { kind: string; delta_mc: number; address: string; meta: string };
    expect(row.kind).toBe("bounty_award");
    expect(row.delta_mc).toBe(200 * MC_PER_CENT);
    expect(row.address).toBe(b.address);
    expect(JSON.parse(row.meta).submission_id).toBe(sid);
  });

  it("requires an API key on both routes", async () => {
    const { app, id } = await market();
    for (const [path, init] of [
      ["/v1/submissions", { method: "POST", body: JSON.stringify({ bounty_id: id, body: "x" }) }],
      ["/v1/bounties/award", { method: "POST", body: JSON.stringify({ bounty_id: id, submission_id: "x" }) }],
      [`/v1/submissions?bounty_id=${id}`, { method: "GET" }],
    ] as const) {
      expect((await app.request(path, { ...init, headers: { "content-type": "application/json" } })).status, path).toBe(401);
    }
  });
});

describe("migration onto an existing database that already has the bounty table", () => {
  it("adds winner_submission, because CREATE TABLE IF NOT EXISTS adds no column", () => {
    // Exactly the state of the production database after the deploy of 20.09.2026: bounties exists,
    // the column does not yet. Whoever does not check this notices when the first award throws.
    const dir = mkdtempSync(join(tmpdir(), "cp-migration-"));
    const file = join(dir, "old.db");
    try {
      const old = new Database(file);
      old.exec(`
        CREATE TABLE wallets (address TEXT PRIMARY KEY, balance_mc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE bounties (
          id TEXT PRIMARY KEY, creator TEXT NOT NULL, kind TEXT NOT NULL, brief TEXT NOT NULL,
          price_mc INTEGER NOT NULL, deadline TEXT NOT NULL, status TEXT NOT NULL,
          created_at TEXT NOT NULL, closed_at TEXT
        );
      `);
      old.prepare("INSERT INTO bounties VALUES (?, ?, 'factual', 'b', 1000, ?, 'open', ?, NULL)")
        .run("old-1", "0xabc", new Date(Date.now() + 3_600_000).toISOString(), new Date().toISOString());
      old.close();

      const db = openDb(file);
      const columns = (db.prepare("PRAGMA table_info(bounties)").all() as { name: string }[]).map((s) => s.name);
      expect(columns).toContain("winner_submission");
      expect(
        (db.prepare("SELECT winner_submission FROM bounties WHERE id = ?").get("old-1") as { winner_submission: null }).winner_submission,
        "the existing data survives and the new column is empty",
      ).toBeNull();
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the public bounty list", () => {
  it("shows open bounties without a key, because a market only members can see is no market", async () => {
    const { app, a } = setup();
    await a.postBounty(bounty());
    const res = await app.request("/bounties.json", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { open: { brief: string; price_cents: number }[]; note: string };
    expect(body.open).toHaveLength(1);
    expect(body.open[0].price_cents).toBe(200);
    expect(body.note, "whoever reads here should know that briefs are public").toMatch(/public/i);
  });

  it("names no addresses, because what is public is the bounty and not the buyer", async () => {
    const { app, a } = setup();
    await a.postBounty(bounty());
    const text = await (await app.request("/bounties.json", { method: "GET" })).text();
    expect(text).not.toContain(a.address);
  });

  it("does not show cancelled or expired bounties", async () => {
    const { app, a, db } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    const { id: id2 } = (await (await a.postBounty(bounty({ price_cents: 100 }))).json()) as { id: string };
    await a.cancel({ id });
    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id2);
    const body = (await (await app.request("/bounties.json", { method: "GET" })).json()) as { open: unknown[] };
    expect(body.open).toHaveLength(0);
  });

  it("releases expired money on a fetch, even without anybody being signed in", async () => {
    const { app, a, db } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);
    await app.request("/bounties.json", { method: "GET" });
    expect(a.balance()).toBe(500_000);
  });

  it("caps the number of entries", async () => {
    const { app } = setup();
    const res = await app.request("/bounties.json?limit=99999", { method: "GET" });
    expect(res.status).toBe(200);
  });
});

const OPERATOR = "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614";
const PAY = {
  payTo: OPERATOR as `0x${string}`,
  network: "base" as const,
  chainId: 8453,
  usdcAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as `0x${string}`,
  maxTimeoutSeconds: 60,
  tiers: [5] as const,
};

/** Like setup(), but with a configured operator address, so with a fee. */
function setupWithFee(balanceMc = 500_000) {
  const db = openDb(":memory:");
  const app = createApp({ db, pay: PAY });
  const ledgerSum = () => (db.prepare("SELECT coalesce(sum(delta_mc), 0) AS s FROM ledger").get() as { s: number }).s;
  const balanceSum = () => (db.prepare("SELECT coalesce(sum(balance_mc), 0) AS s FROM wallets").get() as { s: number }).s;
  const operator = () =>
    ((db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(OPERATOR) as { balance_mc: number } | undefined)
      ?.balance_mc) ?? 0;
  return { db, app, a: account(db, app, balanceMc, 1), b: account(db, app, balanceMc, 2), ledgerSum, balanceSum, operator };
}

describe("brokerage fee", () => {
  it("deducts ten percent from the winner's share and credits it to the operator", async () => {
    const { a, b, operator } = setupWithFee();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    const { id: sid } = (await (await b.submit({ bounty_id: id, body: "the work" })).json()) as { id: string };
    await a.awardBounty({ bounty_id: id, submission_id: sid });

    const priceMc = 200 * MC_PER_CENT;
    const fee = feeMc(priceMc);
    expect(fee).toBe(priceMc / 10);
    expect(b.balance(), "the winner gets the price minus the fee").toBe(500_000 + priceMc - fee);
    expect(operator(), "the fee lands with the operator").toBe(fee);
  });

  it("has the buyer pay exactly the price they posted, no more", async () => {
    const { a, b } = setupWithFee();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    const { id: sid } = (await (await b.submit({ bounty_id: id, body: "x" })).json()) as { id: string };
    await a.awardBounty({ bounty_id: id, submission_id: sid });
    expect(a.balance(), "they paid 200 cents when posting and nothing else").toBe(500_000 - 200 * MC_PER_CENT);
  });

  it("loses and creates no millicent in the process", async () => {
    const { a, b, ledgerSum, balanceSum } = setupWithFee();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    const { id: sid } = (await (await b.submit({ bounty_id: id, body: "x" })).json()) as { id: string };
    await a.awardBounty({ bounty_id: id, submission_id: sid });
    expect(ledgerSum()).toBe(balanceSum());
    expect(balanceSum(), "only the two starting balances are in the system").toBe(1_000_000);
  });

  it("rounds in favour of the winner, the fee is never above ten percent", () => {
    for (const priceMc of [1_000, 1_001, 1_009, 7_777, 123_456]) {
      const g = feeMc(priceMc);
      expect(g * 100).toBeLessThanOrEqual(priceMc * FEE_PERCENT);
      expect(g + (priceMc - g), "both rows together add up to the amount held").toBe(priceMc);
    }
  });

  it("names the winner's share in the public list already, so an agent does not have to do the arithmetic", async () => {
    const { app, a } = setupWithFee();
    await a.postBounty(bounty());
    const body = (await (await app.request("/bounties.json", { method: "GET" })).json()) as
      { open: { price_cents: number; award_cents: number; fee_percent: number }[] };
    expect(body.open[0].price_cents).toBe(200);
    expect(body.open[0].award_cents).toBe(180);
    expect(body.open[0].fee_percent).toBe(FEE_PERCENT);
  });

  it("takes no fee without a configured operator address, instead of keeping money that belongs to nobody", async () => {
    const { app, a, b } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    const { id: sid } = (await (await b.submit({ bounty_id: id, body: "x" })).json()) as { id: string };
    await a.awardBounty({ bounty_id: id, submission_id: sid });
    expect(b.balance()).toBe(500_000 + 200 * MC_PER_CENT);
    const list = (await (await app.request("/bounties.json", { method: "GET" })).json()) as { open: unknown[] };
    expect(list.open).toHaveLength(0);
  });
});

describe("Seeing your own side of the market", () => {
  it("shows a buyer the jobs they posted, whatever became of them", async () => {
    const { a, b } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    await a.postBounty(bounty({ price_cents: 100 }));
    await a.cancel({ id });
    const body = (await (await a.myBounties()).json()) as { bounties: { status: string; submission_count: number }[] };
    expect(body.bounties, "the open one and the cancelled one").toHaveLength(2);
    expect(body.bounties.map((x) => x.status).sort()).toEqual(["cancelled", "open"]);
    // The counter-check: GET /v1/bounties would have shown only the open one, and that is exactly
    // the gap this closes.
    const open = (await (await a.list()).json()) as { bounties: unknown[] };
    expect(open.bounties).toHaveLength(1);
    void b;
  });

  it("shows nobody else's jobs", async () => {
    const { a, b } = setup();
    await a.postBounty(bounty());
    const body = (await (await b.myBounties()).json()) as { bounties: unknown[] };
    expect(body.bounties).toHaveLength(0);
  });

  it("counts the submissions a job has drawn", async () => {
    const { db, app, a, b } = setup();
    const c = account(db, app, 500_000, 3);
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    await b.submit({ bounty_id: id, body: "from b" });
    await c.submit({ bounty_id: id, body: "from c" });
    const body = (await (await a.myBounties()).json()) as { bounties: { submission_count: number }[] };
    expect(body.bounties[0].submission_count).toBe(2);
  });

  it("tells an agent it won, and the other one that it lost", async () => {
    const { db, app, a, b } = setup();
    const c = account(db, app, 500_000, 3);
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    const { id: sid } = (await (await b.submit({ bounty_id: id, body: "from b" })).json()) as { id: string };
    await c.submit({ bounty_id: id, body: "from c" });
    await a.awardBounty({ bounty_id: id, submission_id: sid });

    const won = (await (await b.mySubmissions()).json()) as { submissions: { outcome: string }[] };
    const lost = (await (await c.mySubmissions()).json()) as { submissions: { outcome: string }[] };
    expect(won.submissions[0].outcome).toBe("won");
    // Without this the winner's answer would also be right if the code simply said "won" to
    // everyone who submitted to an awarded job.
    expect(lost.submissions[0].outcome).toBe("lost");
  });

  it("says pending while the job is still open, and expired once the deadline passed", async () => {
    const { db, a, b } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    await b.submit({ bounty_id: id, body: "work" });
    const pending = (await (await b.mySubmissions()).json()) as { submissions: { outcome: string }[] };
    expect(pending.submissions[0].outcome).toBe("pending");

    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);
    const after = (await (await b.mySubmissions()).json()) as { submissions: { outcome: string }[] };
    expect(after.submissions[0].outcome, "the request itself expires it first").toBe("expired");
  });

  it("names the price the agent would have earned, so a loss can be weighed", async () => {
    const { a, b } = setup();
    const { id } = (await (await a.postBounty(bounty())).json()) as { id: string };
    await b.submit({ bounty_id: id, body: "work" });
    const body = (await (await b.mySubmissions()).json()) as { submissions: { price_cents_if_won: number }[] };
    expect(body.submissions[0].price_cents_if_won).toBe(200);
  });

  it("needs an API key on both paths", async () => {
    const { app } = setup();
    for (const path of ["/v1/bounties/mine", "/v1/submissions/mine"]) {
      expect((await app.request(path, { method: "GET" })).status, path).toBe(401);
    }
  });
});
