// The planted database for `ops/customer-work.sh --selftest` (kunden 08), built with the real schema
// from src/db.ts. Wallets are made up; the operator wallet is in OURS of ops/db-report.cjs.
//
//   node --import tsx ops/fixtures/customer-work-plant.mts <db path> [plain|foreign-operator|house|house-foreign]
//
// `foreign-operator` posts the operator's bounty from a foreign wallet instead, the counter-proof of `ours`.
// `house` adds the house job of kunden 11 to `plain`, posted and awarded by the real functions of
// src/bounties/house.ts on a planted clock: a valid report of the customer with its wallet in a path, one
// of a stranger with an IPv4 address in a path, one of our own address (a key named ops-%), an invalid one
// and one after the window. `house-foreign` gives the key of our own address a foreign name instead, the
// counter-proof that the same report is counted when it is not ours.
import { openDb } from "../../src/db.js";

const CUSTOMER = "0x1111111111111111111111111111111111111111"; // customer 1: first inference on 11-05
const LATER = "0x3333333333333333333333333333333333333333"; // customer 2: first inference on 11-06
const BUYER = "0x4444444444444444444444444444444444444444"; // a foreign automaton that posts work
const OPERATOR = "0xd24f37d0838e62621ed24111164485ded0f0924f"; // ours

const [path, variant = "plain"] = process.argv.slice(2);
if (!path || !["plain", "foreign-operator", "house", "house-foreign"].includes(variant)) {
  console.error("usage: customer-work-plant.mts <db path> [plain|foreign-operator|house|house-foreign]");
  process.exit(1);
}
const db = openDb(path);
const wallet = (a: string) =>
  db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(a, "2026-11-01T00:00:00.000Z");
for (const a of [CUSTOMER, LATER, BUYER, OPERATOR]) wallet(a);
let n = 0;
const row = (address: string, kind: string, deltaMc: number, at: string) =>
  db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref, meta, created_at) VALUES (?, ?, ?, ?, '{}', ?)").run(
    address, kind, deltaMc, `plant-${++n}`, at,
  );
const bounty = (id: string, creator: string, createdAt: string, deadline: string, closedAt: string | null, status: string) =>
  db.prepare(
    "INSERT INTO bounties (id, creator, kind, brief, price_mc, deadline, status, created_at, closed_at) VALUES (?, ?, 'factual', 'b', 1000, ?, ?, ?, ?)",
  ).run(id, creator, deadline, status, createdAt, closedAt);
const submission = (id: string, bountyId: string, agent: string, at: string) =>
  db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES (?, ?, ?, 's', ?)").run(id, bountyId, agent, at);

// Inference: ours first in time and never numbered, then customer 1, then customer 2.
row(OPERATOR, "inference", -100, "2026-11-05T09:00:00.000Z");
row(CUSTOMER, "inference", -100, "2026-11-05T10:00:00.000Z");
row(CUSTOMER, "inference", -100, "2026-11-05T10:05:00.000Z");
row(LATER, "inference", -100, "2026-11-06T12:00:00.000Z");
row(CUSTOMER, "inference", -100, "2026-11-14T14:00:00.000Z"); // before its award: not counted after it
row(CUSTOMER, "inference", -100, "2026-11-15T09:00:00.000Z"); // after its award
row(LATER, "inference", -100, "2026-11-15T11:00:00.000Z"); // after the other wallet's award

// Bounties. The window of the selftest is 11-13 to 11-16.
bounty("b1", BUYER, "2026-11-12T12:00:00.000Z", "2026-11-14T12:00:00.000Z", null, "open"); // past its deadline on 11-14, never expired
bounty("b2", variant === "plain" ? OPERATOR : BUYER, "2026-11-13T08:00:00.000Z", "2026-11-20T00:00:00.000Z", "2026-11-13T20:00:00.000Z", "cancelled");
bounty("b3", CUSTOMER, "2026-11-13T09:00:00.000Z", "2026-11-20T00:00:00.000Z", null, "open"); // the customer's own
bounty("b4", BUYER, "2026-11-14T09:00:00.000Z", "2026-11-20T00:00:00.000Z", "2026-11-14T15:00:00.000Z", "awarded");
bounty("b5", BUYER, "2026-11-10T00:00:00.000Z", "2026-11-20T00:00:00.000Z", "2026-11-12T23:00:00.000Z", "cancelled"); // closed before the window

submission("s1", "b4", CUSTOMER, "2026-11-14T10:00:00.000Z");
submission("s2", "b1", LATER, "2026-11-13T10:00:00.000Z");
row(BUYER, "bounty_hold", -1000, "2026-11-14T09:00:00.000Z");
row(CUSTOMER, "bounty_award", 900, "2026-11-14T15:00:00.000Z");
row(LATER, "bounty_award", 900, "2026-11-15T10:00:00.000Z");

if (variant === "house" || variant === "house-foreign") {
  const STRANGER = "0x6666666666666666666666666666666666666666"; // a foreign runtime, never numbered (no inference)
  const OWN = "0x5555555555555555555555555555555555555555"; // ours by its key name ops-%, not by the list
  const LATE = "0x7777777777777777777777777777777777777777"; // a foreign runtime after the window
  const house = await import("../../src/bounties/house.js");
  const store = await import("../../src/bounties/store.js");
  // The service stamps its rows with the time of the call, so the clock is planted for each step.
  const RealDate = Date;
  let clock = 0;
  class PlantedDate extends RealDate {
    constructor(...a: ConstructorParameters<typeof Date>) {
      if (a.length === 0) super(clock);
      else super(...a);
    }
    static now() {
      return clock;
    }
  }
  globalThis.Date = PlantedDate as DateConstructor;
  const at = (iso: string) => {
    clock = RealDate.parse(iso);
    return new RealDate(clock);
  };
  let keys = 0;
  const key = (address: string, name: string) =>
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, 'plant', ?, ?)").run(
      address, `plant-key-${++keys}`, name, "2026-11-01T00:00:00.000Z",
    );
  for (const a of [STRANGER, OWN, LATE]) wallet(a);
  key(CUSTOMER, "conway-automaton");
  key(STRANGER, "conway-automaton");
  key(LATE, "conway-automaton");
  key(OWN, variant === "house" ? "ops-house-check" : "conway-automaton");
  const report = (valid: boolean, calls: { method: string; path: string; status: number }[]) => {
    const body = JSON.stringify({ runtime: "d8f8168", calls });
    // The fixture follows the real rule, so the copy in ops/db-report.cjs is held against it.
    if (house.checkHouseReport(body).ok !== valid) throw new Error(`planted report is not ${valid ? "valid" : "invalid"}: ${body}`);
    return body;
  };
  const job = () => house.openHouseJob(db, new RealDate(clock))!.id;

  house.ensureHouseJob(db, at("2026-11-13T06:00:00.000Z"));
  house.submitHouseReport(db, {
    bountyId: job(), agent: CUSTOMER, now: at("2026-11-14T08:00:00.000Z"),
    body: report(true, [
      { method: "GET", path: `/pay/5/${CUSTOMER}`, status: 404 },
      { method: "POST", path: "/v1/chat/completions", status: 402 },
    ]),
  });
  house.ensureHouseJob(db, new RealDate(clock));
  // Our own report goes past the refusal in submitHouseReport, as a stray row would.
  at("2026-11-14T09:00:00.000Z");
  store.submitWork(db, {
    bountyId: job(), agent: OWN,
    body: report(true, [
      { method: "GET", path: `/pay/5/${OWN}`, status: 404 },
      { method: "POST", path: "/v1/ours-only", status: 500 },
    ]),
  });
  house.submitHouseReport(db, {
    bountyId: job(), agent: STRANGER, now: at("2026-11-15T10:00:00.000Z"),
    body: report(true, [
      { method: "GET", path: "/v1/node/203.0.113.7/status", status: 502 },
      { method: "POST", path: "/v1/chat/completions", status: 402 },
    ]),
  });
  house.ensureHouseJob(db, new RealDate(clock));
  at("2026-11-15T12:00:00.000Z");
  store.submitWork(db, { bountyId: job(), agent: BUYER, body: report(false, [{ method: "GET", path: "/v1/invalid-report", status: 999 }]) });
  at("2026-11-16T02:00:00.000Z");
  store.submitWork(db, { bountyId: job(), agent: LATE, body: report(true, [{ method: "GET", path: "/v1/after-window", status: 404 }]) });
  globalThis.Date = RealDate;
}
db.close();
