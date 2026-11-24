/**
 * goals/karte/01: the IPN of Digistore24 turns a card order into credit, once, at the ECB rate of the order day, and a refund or
 * chargeback takes back at most the free credit. Nothing here goes to the network: the ECB is a staged `fetch`, the clock is fixed,
 * the database lives in a folder from mkdtemp, and every address is generated per run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createApp } from "../src/app.js";
import { getBalanceMc, openDb, postLedger, reserveMc, type Db } from "../src/db.js";
import Database from "better-sqlite3";
import { CARD_BREAKER_SHORTFALL_MC } from "../src/payments/card-way.js";
import {
  bookPendingCardOrders,
  CARD_PACKAGES,
  handleDigistoreIpn,
  signatureString,
  signFields,
  type DigistoreDeps,
} from "../src/payments/digistore.js";

const PASS = "test-passphrase-0123456789";
const NOW = new Date("2026-11-22T12:00:00.000Z");
const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time='2026-11-20'><Cube currency='USD' rate='1.0512'/><Cube currency='JPY' rate='160.12'/></Cube>
    <Cube time='2026-11-19'><Cube currency='USD' rate='1.0498'/></Cube>
    <Cube time='2026-11-18'><Cube currency='JPY' rate='159.5'/><Cube currency='USD' rate='1.0470'/></Cube>
  </Cube>
</gesmes:Envelope>`;

const ecbUp = (() => {
  const f = vi.fn(async () => new Response(ECB_XML, { status: 200 }));
  return f;
})();
const ecbDown = vi.fn(async () => {
  throw new Error("network down");
});

let dir: string;
let db: Db;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "digistore-ipn-"));
  db = openDb(join(dir, "cp.db"));
  delete process.env.CP_DIGISTORE_IPN_PASSPHRASE;
  vi.clearAllMocks();
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const newAddress = () => privateKeyToAccount(generatePrivateKey()).address;
const P5 = () => CARD_PACKAGES[0].productId;
const P20 = () => CARD_PACKAGES[1].productId;

function appWith(deps: Partial<DigistoreDeps> | null = {}) {
  return createApp({
    db,
    rateLimit: null,
    digistore: deps === null ? null : { passphrase: PASS, fetch: ecbUp as unknown as typeof fetch, now: () => NOW, ...deps },
  });
}

function signed(fields: Record<string, string>, pass = PASS): Record<string, string> {
  return { ...fields, sha_sign: signFields(fields, pass) };
}

function payment(over: Record<string, string> = {}): Record<string, string> {
  return {
    event: "on_payment",
    api_mode: "live",
    order_id: "ORD1",
    order_date: "2026-11-20",
    product_id: P5(),
    currency: "EUR",
    amount_vendor: "4.06",
    transaction_type: "payment",
    custom: newAddress(),
    ...over,
  };
}

async function post(app: ReturnType<typeof createApp>, fields: Record<string, string>) {
  const res = await app.request("/pay/digistore", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  return { status: res.status, text: await res.text() };
}

const rows = () => db.prepare("SELECT * FROM card_orders ORDER BY order_id").all() as Record<string, unknown>[];
const ledger = (kind?: string) =>
  db.prepare(`SELECT * FROM ledger ${kind ? "WHERE kind = ?" : ""} ORDER BY id`).all(...(kind ? [kind] : [])) as {
    address: string;
    kind: string;
    delta_mc: number;
    ref: string;
    meta: string;
  }[];

describe("digistore24 ipn", () => {
  it("has three packages with real product ids", () => {
    expect(CARD_PACKAGES.map((p) => [p.grossEurCents, p.label])).toEqual([
      [500, "credit 5 EUR"],
      [2000, "credit 20 EUR"],
      [5000, "credit 50 EUR"],
    ]);
    for (const p of CARD_PACKAGES) expect(p.productId).toMatch(/^[1-9][0-9]{4,}$/);
  });

  it("matches the reference signature of the digistore24 documentation", () => {
    // The example of the IPN documentation of Digistore24, passphrase xxxxx.
    const example = {
      buyer_email: "claus@domain-xyz.de",
      order_id: "273732",
      payment_id: "PAYID-39-22012",
      transaction_amount: "17.00",
      transaction_currency: "USD",
    };
    expect(signFields(example, "xxxxx").startsWith("342770076245D14ED7DF4D2E5D82216D")).toBe(true);
    // Byte order (upper case before underscore before lower case), empty values left out, passphrase after every field.
    expect(signatureString({ b: "2", A: "1", _c: "3", d: "", sha_sign: "X" }, "p")).toBe("A=1p_c=3pb=2p");
  });

  it("refuses a wrong signature and stores nothing", async () => {
    const app = appWith();
    const bad = { ...signed(payment()), amount_vendor: "40.60" };
    expect((await post(app, bad)).status).toBe(403);
    expect((await post(app, signed(payment(), "another-passphrase"))).status).toBe(403);
    const { sha_sign: _drop, ...unsigned } = signed(payment());
    expect((await post(app, unsigned)).status).toBe(403);
    expect(rows()).toEqual([]);
    expect(ledger()).toEqual([]);
  });

  it("refuses every post without a passphrase and books nothing", async () => {
    for (const app of [
      appWith(null),
      appWith({ passphrase: "" }),
      appWith({ passphrase: undefined }),
      appWith({ passphrase: "x".repeat(41) }),
    ]) {
      const res = await post(app, signed(payment(), ""));
      expect(res.status).toBe(503);
      expect(JSON.parse(res.text)).toEqual({ error: "card_payments_unavailable" });
      expect((await post(app, signed(payment(), "x".repeat(41)))).status).toBe(503);
    }
    expect(rows()).toEqual([]);
    expect(ledger()).toEqual([]);
  });

  it("answers 200 on get without effect", async () => {
    for (const app of [appWith(), appWith(null)]) {
      const res = await app.request("/pay/digistore");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
    }
    // The x402 route next door answers 503 without a pay config: /pay/digistore never reaches it.
    expect((await appWith().request("/pay/5")).status).toBe(503);
    expect(rows()).toEqual([]);
    expect(ledger()).toEqual([]);
    expect(ecbUp).not.toHaveBeenCalled();
  });

  it("books the vendor share once at the ecb rate of the order day", async () => {
    const app = appWith();
    const f = payment();
    const res = await post(app, signed(f));
    expect(res).toEqual({ status: 200, text: "OK" });
    // 4.06 EUR at 1.0512: 406 cents * 10512 * 1000 mc per cent / 10000 = 426787.2, rounded down.
    expect(getBalanceMc(db, f.custom.toLowerCase())).toBe(426787);
    const [row] = rows();
    expect(row).toMatchObject({
      order_id: "ORD1",
      product_id: P5(),
      address: f.custom.toLowerCase(),
      mode: "live",
      status: "booked",
      vendor_eur_cents: 406,
      rate_e4: 10512,
      rate_date: "2026-11-20",
      credited_mc: 426787,
    });
    const [l] = ledger();
    expect(l).toMatchObject({ address: f.custom.toLowerCase(), kind: "topup", delta_mc: 426787, ref: "ds24:ORD1" });
    expect(JSON.parse(l.meta)).toMatchObject({ product_id: P5(), vendor_eur_cents: 406, rate_e4: 10512, rate_date: "2026-11-20" });
    // A connection test is answered and books nothing.
    expect(await post(app, signed({ event: "connection_test" }))).toEqual({ status: 200, text: "OK" });
    expect(ledger()).toHaveLength(1);
  });

  it("uses the last ecb rate before a day without one", async () => {
    const app = appWith();
    const sat = payment({ order_id: "SAT", order_date: "2026-11-21", product_id: P20(), amount_vendor: "16.5" });
    await post(app, signed(sat));
    expect(rows()[0]).toMatchObject({ status: "booked", rate_e4: 10512, rate_date: "2026-11-20", vendor_eur_cents: 1650 });
    expect(getBalanceMc(db, sat.custom)).toBe(1734480);
    // A day between two published ones takes the one before, not the one after.
    const gap = payment({ order_id: "GAP", order_date: "2026-11-19" });
    await post(app, signed(gap));
    expect(db.prepare("SELECT rate_e4, rate_date FROM card_orders WHERE order_id = 'GAP'").get()).toEqual({
      rate_e4: 10498,
      rate_date: "2026-11-19",
    });
  });

  it("a repeated ipn for the same order books nothing", async () => {
    const app = appWith();
    const f = signed(payment());
    expect((await post(app, f)).text).toBe("OK");
    expect((await post(app, f)).text).toBe("OK");
    const [first, second] = await Promise.all([post(app, f), post(app, f)]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(ledger("topup")).toHaveLength(1);
    expect(getBalanceMc(db, f.custom)).toBe(426787);
    expect(rows()).toHaveLength(1);
  });

  it("a test order is stored and books nothing", async () => {
    const app = appWith();
    const f = payment({ api_mode: "test", order_id: "T1" });
    expect((await post(app, signed(f))).text).toBe("OK");
    expect(rows()).toEqual([expect.objectContaining({ order_id: "T1", mode: "test", status: "test", credited_mc: 0 })]);
    expect(ledger()).toEqual([]);
    expect(getBalanceMc(db, f.custom)).toBe(0);
    expect(ecbUp).not.toHaveBeenCalled();
  });

  it("a live order without an address books nothing and is counted", async () => {
    const app = appWith();
    await post(app, signed(payment({ order_id: "N1", custom: "" })));
    await post(app, signed(payment({ order_id: "N2", custom: "my automaton" })));
    await post(app, signed(payment({ order_id: "N3", custom: "0x1234" })));
    await post(app, signed(payment({ order_id: "N4", currency: "USD" })));
    await post(app, signed(payment({ order_id: "N5", amount_vendor: "4,06" })));
    const counted = db.prepare("SELECT count(*) AS n FROM card_orders WHERE mode = 'live' AND status = 'unassigned'").get();
    expect(counted).toEqual({ n: 5 });
    expect(rows().map((r) => r.address).slice(0, 3)).toEqual([null, null, null]);
    expect(ledger()).toEqual([]);
  });

  it("ignores a product that is not ours", async () => {
    const app = appWith();
    for (const id of ["758179", "765137", "999999", ""]) {
      expect((await post(app, signed(payment({ order_id: `F${id}`, product_id: id })))).text).toBe("OK");
      expect((await post(app, signed(payment({ event: "on_refund", order_id: `F${id}`, product_id: id })))).text).toBe("OK");
    }
    expect(rows()).toEqual([]);
    expect(ledger()).toEqual([]);
  });

  it("keeps an order pending while the ecb is unreachable and books it later", async () => {
    const app = appWith({ fetch: ecbDown as unknown as typeof fetch });
    const f = payment({ order_id: "P1" });
    expect((await post(app, signed(f))).text).toBe("OK");
    expect(rows()[0]).toMatchObject({ status: "pending_rate", credited_mc: 0 });
    expect(ledger()).toEqual([]);
    // An ECB answer without a usable USD rate keeps it waiting too.
    const empty = vi.fn(async () => new Response("<html>maintenance</html>", { status: 200 }));
    expect(await bookPendingCardOrders(db, { fetch: empty as unknown as typeof fetch, log: () => {} })).toBe(0);
    expect(await bookPendingCardOrders(db, { fetch: ecbDown as unknown as typeof fetch, log: () => {} })).toBe(0);
    expect(rows()[0]).toMatchObject({ status: "pending_rate" });
    expect(await bookPendingCardOrders(db, { fetch: ecbUp as unknown as typeof fetch, now: () => NOW, log: () => {} })).toBe(1);
    expect(rows()[0]).toMatchObject({ status: "booked", rate_e4: 10512, credited_mc: 426787 });
    expect(getBalanceMc(db, f.custom)).toBe(426787);
    // The next run and the IPN coming again book nothing more.
    expect(await bookPendingCardOrders(db, { fetch: ecbUp as unknown as typeof fetch, log: () => {} })).toBe(0);
    await post(appWith(), signed(f));
    expect(ledger("topup")).toHaveLength(1);
  });

  it("a refund takes back at most the free balance and records the rest", async () => {
    const app = appWith();
    const f = payment({ order_id: "R1", product_id: P20(), amount_vendor: "16.50" });
    await post(app, signed(f));
    const addr = f.custom.toLowerCase();
    expect(getBalanceMc(db, addr)).toBe(1734480);
    // The customer spent 1000000 mc and has 100000 mc reserved by a call in flight: 634480 mc are free.
    postLedger(db, { address: addr, kind: "inference", deltaMc: -1000000, ref: "spent" });
    expect(reserveMc(db, addr, 100000)).toBe(true);
    expect((await post(app, signed({ ...f, event: "on_refund", transaction_type: "refund" }))).text).toBe("OK");
    expect(rows()[0]).toMatchObject({ status: "reversed", reversed_mc: 634480, shortfall_mc: 1100000 });
    expect(ledger("card_reversal")).toEqual([expect.objectContaining({ delta_mc: -634480, ref: "ds24:R1" })]);
    expect(getBalanceMc(db, addr)).toBe(100000);

    // A refund of an order that is still waiting for its rate books nothing and closes it.
    const waiting = payment({ order_id: "R2" });
    await post(appWith({ fetch: ecbDown as unknown as typeof fetch }), signed(waiting));
    await post(app, signed({ ...waiting, event: "on_refund" }));
    expect(db.prepare("SELECT status, credited_mc, reversed_mc FROM card_orders WHERE order_id = 'R2'").get()).toEqual({
      status: "reversed",
      credited_mc: 0,
      reversed_mc: 0,
    });
    expect(await bookPendingCardOrders(db, { fetch: ecbUp as unknown as typeof fetch, log: () => {} })).toBe(0);
    expect(getBalanceMc(db, waiting.custom)).toBe(0);
  });

  it("a chargeback after a refund books nothing more", async () => {
    const app = appWith();
    const f = payment({ order_id: "C1" });
    await post(app, signed(f));
    await post(app, signed({ ...f, event: "on_refund" }));
    expect(getBalanceMc(db, f.custom)).toBe(0);
    expect(rows()[0]).toMatchObject({ status: "reversed", reversed_mc: 426787, shortfall_mc: 0 });
    // New credit from elsewhere must not be taken by the second event.
    postLedger(db, { address: f.custom, kind: "topup", deltaMc: 500000, ref: "x402-nonce" });
    expect((await post(app, signed({ ...f, event: "on_chargeback" }))).text).toBe("OK");
    expect((await post(app, signed({ ...f, event: "on_refund" }))).text).toBe("OK");
    expect(ledger("card_reversal")).toHaveLength(1);
    expect(getBalanceMc(db, f.custom)).toBe(500000);
  });

  it("a payment ipn after its refund books nothing", async () => {
    const app = appWith();
    const f = payment({ order_id: "R1" });
    // Digistore24 retries a failed payment IPN for days, so the refund can arrive first.
    expect((await post(app, signed({ ...f, event: "on_refund" }))).text).toBe("OK");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ order_id: "R1", status: "reversed", address: null, credited_mc: 0 });
    expect((await post(app, signed(f))).text).toBe("OK");
    expect((await post(app, signed({ ...f, event: "on_chargeback" }))).text).toBe("OK");
    await bookPendingCardOrders(db, { fetch: ecbUp as unknown as typeof fetch });
    expect(ledger("topup")).toHaveLength(0);
    expect(ledger("card_reversal")).toHaveLength(0);
    expect(getBalanceMc(db, f.custom)).toBe(0);
    expect(rows()[0]).toMatchObject({ status: "reversed", credited_mc: 0 });
  });

  it("no log line carries the address or the passphrase", async () => {
    const lines: string[] = [];
    const keep = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
    vi.spyOn(console, "log").mockImplementation(keep);
    vi.spyOn(console, "error").mockImplementation(keep);
    vi.spyOn(console, "warn").mockImplementation(keep);
    vi.spyOn(console, "info").mockImplementation(keep);
    const up = createApp({ db, rateLimit: null, digistore: { passphrase: PASS, fetch: ecbUp as unknown as typeof fetch } });
    const down = createApp({ db, rateLimit: null, digistore: { passphrase: PASS, fetch: ecbDown as unknown as typeof fetch } });
    const f = payment({ order_id: "L1" });
    const answers: string[] = [];
    const keepAnswer = async (p: Promise<{ text: string }>) => answers.push((await p).text);
    await keepAnswer(post(up, { ...signed(f), amount_vendor: "99.00" }));
    await keepAnswer(post(up, signed(f)));
    await keepAnswer(post(up, signed(f)));
    await keepAnswer(post(up, signed({ ...f, event: "on_refund" })));
    await keepAnswer(post(up, signed({ ...f, event: "on_chargeback" })));
    const g = payment({ order_id: "L2" });
    await keepAnswer(post(down, signed(g)));
    await bookPendingCardOrders(db, { fetch: ecbDown as unknown as typeof fetch });
    await bookPendingCardOrders(db, { fetch: ecbUp as unknown as typeof fetch });
    await keepAnswer(post(up, signed(payment({ order_id: "L3", api_mode: "test" }))));
    await keepAnswer(post(createApp({ db, rateLimit: null, digistore: { passphrase: null } }), signed(f)));
    expect(lines.length).toBeGreaterThan(0);
    const all = [...lines, ...answers].join("\n").toLowerCase();
    for (const secret of [f.custom, g.custom, PASS, signed(f).sha_sign]) expect(all).not.toContain(secret.toLowerCase());
    expect(all).toContain("l1");
  });
});

// goals/wache/03: the checkout of Digistore24 can be called without `/card/<package>`, so the IPN itself holds a payment while
// the breaker is on or for a wallet that had a refund: status `held`, nothing credited, no ECB, and `OK` for Digistore24.
describe("digistore24 ipn while the card checkout is closed", () => {
  const lines: string[] = [];
  const deps = (): DigistoreDeps => ({
    passphrase: PASS,
    fetch: ecbUp as unknown as typeof fetch,
    now: () => NOW,
    log: (l: string) => void lines.push(l),
  });
  const ipn = (fields: Record<string, string>) => handleDigistoreIpn(db, deps(), signed(fields));
  const at = NOW.toISOString();
  function reversedOrder(orderId: string, address: string, shortfallMc: number) {
    db.prepare(
      "INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, " +
        "created_at, updated_at) VALUES (?, ?, ?, 'live', 'reversed', ?, 0, ?, ?, ?)",
    ).run(orderId, P5(), address.toLowerCase(), shortfallMc, shortfallMc, at, at);
  }
  const status = (orderId: string) =>
    (db.prepare("SELECT status FROM card_orders WHERE order_id = ?").get(orderId) as { status: string } | undefined)?.status;
  beforeEach(() => {
    lines.length = 0;
  });

  it("holds a payment while the card breaker is on and credits nothing", async () => {
    reversedOrder("TRIP", newAddress(), CARD_BREAKER_SHORTFALL_MC);
    const f = payment({ order_id: "H1" });
    expect(await ipn(f)).toEqual({ status: 200, body: "OK" });
    expect(status("H1")).toBe("held");
    expect(getBalanceMc(db, f.custom.toLowerCase())).toBe(0);
    expect(ledger()).toEqual([]);
    expect(ecbUp).not.toHaveBeenCalled();
    expect(lines).toContain("[digistore] order H1 held: card breaker on");
    expect(lines.join("\n").toLowerCase()).not.toContain(f.custom.toLowerCase());
  });

  it("holds a payment of a wallet that had a refund and credits nothing", async () => {
    const wallet = newAddress();
    reversedOrder("OLD", wallet, 0);
    const f = payment({ order_id: "H2", custom: wallet });
    expect(await ipn(f)).toEqual({ status: 200, body: "OK" });
    expect(status("H2")).toBe("held");
    expect(getBalanceMc(db, wallet.toLowerCase())).toBe(0);
    expect(ledger()).toEqual([]);
    expect(ecbUp).not.toHaveBeenCalled();
    expect(lines).toContain("[digistore] order H2 held: wallet had a refund");
    expect(lines.join("\n").toLowerCase()).not.toContain(wallet.toLowerCase());
  });

  it("still credits a payment while the card breaker is off", async () => {
    // A refund of another wallet below the limit leaves the breaker off.
    reversedOrder("SMALL", newAddress(), CARD_BREAKER_SHORTFALL_MC - 1);
    const f = payment({ order_id: "B1" });
    expect(await ipn(f)).toEqual({ status: 200, body: "OK" });
    expect(status("B1")).toBe("booked");
    expect(getBalanceMc(db, f.custom.toLowerCase())).toBe(426787);
    expect(lines).toContain("[digistore] order B1 booked");
  });

  it("a repeated ipn or a refund of a held order books nothing", async () => {
    reversedOrder("TRIP", newAddress(), CARD_BREAKER_SHORTFALL_MC);
    const f = payment({ order_id: "H3" });
    await ipn(f);
    expect(await ipn(f)).toEqual({ status: 200, body: "OK" });
    expect(await ipn({ ...f, event: "on_refund" })).toEqual({ status: 200, body: "OK" });
    expect(await ipn({ ...f, event: "on_chargeback" })).toEqual({ status: 200, body: "OK" });
    await bookPendingCardOrders(db, { fetch: ecbUp as unknown as typeof fetch, now: () => NOW });
    expect(status("H3")).toBe("held");
    expect(ledger()).toEqual([]);
    expect(getBalanceMc(db, f.custom.toLowerCase())).toBe(0);
    expect(db.prepare("SELECT credited_mc, reversed_mc, shortfall_mc FROM card_orders WHERE order_id = 'H3'").get()).toEqual({
      credited_mc: 0,
      reversed_mc: 0,
      shortfall_mc: 0,
    });
  });

  it("keeps every card order when an older database learns the status held", () => {
    const file = join(dir, "old.db");
    const old = new Database(file);
    old.exec(`
      CREATE TABLE card_orders (
        order_id TEXT PRIMARY KEY, product_id TEXT NOT NULL, address TEXT,
        mode TEXT NOT NULL CHECK (mode IN ('live', 'test')),
        status TEXT NOT NULL CHECK (status IN ('booked', 'test', 'unassigned', 'pending_rate', 'reversed')),
        vendor_eur_cents INTEGER, rate_e4 INTEGER, rate_date TEXT, credited_mc INTEGER NOT NULL DEFAULT 0,
        reversed_mc INTEGER NOT NULL DEFAULT 0, shortfall_mc INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    const insert = old.prepare("INSERT INTO card_orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const kept = [
      ["K1", P5(), "0x" + "ab".repeat(20), "live", "booked", 280, 10512, "2026-11-20", 306400, 0, 0, at, at],
      ["K2", P5(), "0x" + "cd".repeat(20), "live", "reversed", 280, 10512, "2026-11-20", 306400, 1000, 305400, at, at],
      ["K3", P20(), null, "live", "unassigned", null, null, "2026-11-20", 0, 0, 0, at, at],
      ["K4", P5(), "0x" + "ef".repeat(20), "test", "test", 280, null, "2026-11-20", 0, 0, 0, at, at],
      ["K5", P5(), "0x" + "12".repeat(20), "live", "pending_rate", 280, null, "2026-11-21", 0, 0, 0, at, at],
    ];
    for (const r of kept) insert.run(...r);
    const before = old.prepare("SELECT * FROM card_orders ORDER BY order_id").all();
    old.close();

    const learned = openDb(file);
    expect(learned.prepare("SELECT * FROM card_orders ORDER BY order_id").all()).toEqual(before);
    learned
      .prepare("INSERT INTO card_orders (order_id, product_id, mode, status, created_at, updated_at) VALUES ('H', ?, 'live', 'held', ?, ?)")
      .run(P5(), at, at);
    expect(() =>
      learned
        .prepare("INSERT INTO card_orders (order_id, product_id, mode, status, created_at, updated_at) VALUES ('X', ?, 'live', 'bogus', ?, ?)")
        .run(P5(), at, at),
    ).toThrow(/CHECK/);
    learned.close();

    // A second open rebuilds nothing and keeps the held order.
    const again = openDb(file);
    expect(again.prepare("SELECT order_id, status FROM card_orders ORDER BY order_id").all()).toEqual([
      { order_id: "H", status: "held" },
      ...before.map((r) => ({ order_id: (r as { order_id: string }).order_id, status: (r as { status: string }).status })),
    ]);
    expect(
      again.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name LIKE 'card_orders%'").get(),
    ).toEqual({ n: 1 });
    again.close();
  });
});
