// Every session paid in Stripe against `checkouts`, counted (Goal 22, 2026-09-29).
//
// This is the measurement that can refute Goal 22: a session Stripe calls paid that our table does
// not call paid, more than ten minutes after the payment. Before it there was no tool for that at
// all, so "every paid session is booked" was a belief.
//
// Runs inside the cp container like ops/db-report.cjs:
//
//   ssh ... 'cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml exec -T cp node -' < ops/stripe-sessions.cjs
//
// Reads CP_STRIPE_SECRET_KEY and CP_PUBLIC_URL from the container's environment. The key goes into
// the Authorization header and nowhere else: no output line, no error message here contains it.
// The output is numbers only, no session id and no email.
//
// Which sessions count (HAN-38, condition 7). The Stripe account belongs to HTC and may carry
// sessions that are not ours. Ours are the ones whose success_url starts with
// <CP_PUBLIC_URL>/katalog/danke and whose metadata[offer] names an offer from OFFERS; every other
// session is `foreign`, a number of its own, so a stranger's payment is neither missing from our
// books nor hidden.
//
// Which rows count (condition 8). Only rows whose provider matches the key's mode, so the old
// `stripe_test` rows say nothing under a live key. A paid row whose session is not in the listed
// window (the session can be a second older than the row) is fetched on its own before it counts as
// `booked_not_paid`.
//
//   stripe_paid      our sessions Stripe calls paid, in the window
//   booked_paid      of those, the ones our table calls paid, plus paid rows confirmed one by one
//   paid_not_booked  Stripe says paid, the row exists and is not paid        -> exit 1
//   paid_no_row      Stripe says paid, no row at all (only a human can fix)  -> exit 1
//   booked_not_paid  our row says paid, Stripe does not                      -> exit 1
//   foreign          sessions in the window that are not ours
//
// Exit 0 when the three mismatches are 0, exit 1 when one is not, exit 2 when it could not look.
//
// Env:
//   CP_STRIPE_SESSIONS_DAYS     window in days, default 30
//   CP_NOW                      the end of the window, ISO; default now
//   CP_DB_PATH                  default /data/cp.db
//   CP_STRIPE_SESSIONS_FIXTURE  a JSON file standing in for Stripe: { offers, sessions }
//
//   node ops/stripe-sessions.cjs --selftest   proves it can say both 0 and 1 (runs locally)
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const API = "https://api.stripe.com/v1";
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]+$/;
// src/public/site.ts: the same fallback, so the script and the service agree on the origin.
const FALLBACK_ORIGIN = "https://cp.hippe.eu";

// src/payments/stripe-key.ts, one line. Retyped because this runs as a lone file on stdin.
const providerName = (key) => (/^(sk|rk)_live_/.test(key) ? "stripe" : "stripe_test");

function origin() {
  const set = (process.env.CP_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(set) ? set : FALLBACK_ORIGIN;
}

class CannotLook extends Error {}

/** The offer ids, read from the service that is running, never retyped here. */
async function loadOffers(fixture) {
  if (fixture) return fixture.offers || [];
  const { pathToFileURL } = require("node:url");
  for (const c of ["./dist/public/catalog.js", "/app/dist/public/catalog.js"]) {
    try {
      const m = await import(pathToFileURL(path.resolve(c)).href);
      if (Array.isArray(m.OFFERS)) return m.OFFERS.map((o) => o.id);
    } catch {
      /* try the next one */
    }
  }
  // Without the offers every session would be foreign and the mismatches would read 0.
  throw new CannotLook("could not load OFFERS from dist/public/catalog.js");
}

/** GET against Stripe, or against the fixture, which answers the same two calls the same way. */
function stripeGetter(key, fixture) {
  if (fixture) {
    return async (p, query) => {
      if (p === "/checkout/sessions") {
        const gte = Number(query.get("created[gte]"));
        const limit = Number(query.get("limit"));
        const after = query.get("starting_after");
        let all = fixture.sessions.filter((s) => s.created >= gte).sort((a, b) => b.created - a.created || (a.id < b.id ? 1 : -1));
        if (after) all = all.slice(all.findIndex((s) => s.id === after) + 1);
        return { data: all.slice(0, limit), has_more: all.length > limit };
      }
      const id = p.split("/").pop();
      return fixture.sessions.find((x) => x.id === id) || null;
    };
  }
  return async (p, query) => {
    const url = `${API}${p}${query ? `?${query}` : ""}`;
    let res;
    try {
      res = await fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new CannotLook("Stripe could not be reached");
    }
    if (res.status === 404 && !query) return null;
    if (!res.ok) throw new CannotLook(`Stripe answered ${res.status}`);
    return res.json();
  };
}

async function measure() {
  const key = process.env.CP_STRIPE_SECRET_KEY || "";
  if (!key) throw new CannotLook("CP_STRIPE_SECRET_KEY is not set");
  const fixturePath = process.env.CP_STRIPE_SESSIONS_FIXTURE;
  const fixture = fixturePath ? JSON.parse(fs.readFileSync(fixturePath, "utf8")) : null;
  const offers = new Set(await loadOffers(fixture));
  if (offers.size === 0) throw new CannotLook("no offers known");
  const get = stripeGetter(key, fixture);

  const end = process.env.CP_NOW ? new Date(process.env.CP_NOW) : new Date();
  if (Number.isNaN(end.getTime())) throw new CannotLook("CP_NOW is not a date");
  const days = Number(process.env.CP_STRIPE_SESSIONS_DAYS || 30);
  const start = new Date(end.getTime() - days * 86400e3);
  const mode = providerName(key);
  const danke = `${origin()}/katalog/danke`;

  // Every session of the window, pages of 100, newest first as Stripe lists them.
  const sessions = [];
  let after = "";
  for (;;) {
    const q = new URLSearchParams({ limit: "100", "created[gte]": String(Math.floor(start.getTime() / 1000)) });
    if (after) q.set("starting_after", after);
    const page = await get("/checkout/sessions", q);
    const data = Array.isArray(page.data) ? page.data : [];
    sessions.push(...data);
    if (!page.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
  }
  const ours = (s) =>
    typeof s.success_url === "string" && s.success_url.startsWith(danke) && offers.has(s.metadata && s.metadata.offer);
  const listed = new Map(sessions.map((s) => [s.id, s]));

  const db = require("better-sqlite3")(process.env.CP_DB_PATH || "/data/cp.db", { readonly: true });
  const rows = db
    .prepare("SELECT reference, status FROM checkouts WHERE provider = ? AND created_at >= ?")
    .all(mode, start.toISOString());
  const byRef = new Map(rows.map((r) => [r.reference, r.status]));
  // A paid session may belong to a row slightly older than the window: look it up across all time.
  const rowOf = db.prepare("SELECT status FROM checkouts WHERE reference = ? AND provider = ?");

  const n = { stripe_paid: 0, booked_paid: 0, paid_not_booked: 0, paid_no_row: 0, booked_not_paid: 0, foreign: 0 };
  for (const s of sessions) {
    if (!ours(s)) {
      n.foreign += 1;
      continue;
    }
    if (s.payment_status !== "paid") continue;
    n.stripe_paid += 1;
    const status = byRef.has(s.id) ? byRef.get(s.id) : (rowOf.get(s.id, mode) || {}).status;
    if (status === "paid") n.booked_paid += 1;
    else if (status === undefined) n.paid_no_row += 1;
    else n.paid_not_booked += 1;
  }
  for (const r of rows) {
    if (r.status !== "paid") continue;
    const s = listed.get(r.reference);
    if (s) {
      if (s.payment_status !== "paid") n.booked_not_paid += 1;
      // A listed paid one is already counted above, or it is foreign, which a paid row should not be.
      else if (!ours(s)) n.booked_not_paid += 1;
      continue;
    }
    // Not in the list: the session is older than the window. Ask for it on its own (condition 8).
    if (!SESSION_ID.test(r.reference)) {
      n.booked_not_paid += 1;
      continue;
    }
    const one = await get(`/checkout/sessions/${encodeURIComponent(r.reference)}`);
    // null is a 404: Stripe has no such session, so nothing was paid for this row.
    if (one && one.payment_status === "paid") n.booked_paid += 1;
    else n.booked_not_paid += 1;
  }
  db.close();
  return { n, window: `${start.toISOString()}..${end.toISOString()}`, mode };
}

async function main() {
  let r;
  try {
    r = await measure();
  } catch (e) {
    // The message is ours (CannotLook) or a library's; neither carries the key, which is only ever
    // in a header.
    console.log(`STRIPE SESSIONS: could not look: ${e instanceof CannotLook ? e.message : e && e.name}`);
    return 2;
  }
  console.log(`window ${r.window}`);
  console.log(`mode ${r.mode}`);
  for (const [k, v] of Object.entries(r.n)) console.log(`${k} ${v}`);
  const bad = r.n.paid_not_booked + r.n.paid_no_row + r.n.booked_not_paid;
  console.log(bad ? "STRIPE SESSIONS: MISMATCH" : "STRIPE SESSIONS OK");
  return bad ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// --selftest: the same script, run as a child against a fixture and a throwaway database, once
// for every case GOAL.md names. Each case is held from both sides, so a 0 is shown to be a
// measured 0 and not a script that cannot see.
async function selftest() {
  const os = require("node:os");
  const { execFileSync } = require("node:child_process");
  const Database = require("better-sqlite3");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-stripe-sessions-"));
  const NOW = "2026-09-29T12:00:00.000Z";
  const T = Date.parse(NOW) / 1000;
  const START = T - 30 * 86400;
  const ORIGIN = "https://postyourprice.com";
  const TEST_KEY = "sk_test_selftestplaceholder";
  const LIVE_KEY = "sk_live_selftestplaceholder";
  const EMAIL = "selftest@postyourprice.com";
  let failed = 0;

  const session = (id, o = {}) => ({
    id,
    created: T - 3600,
    payment_status: "paid",
    status: "complete",
    success_url: `${ORIGIN}/katalog/danke?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { offer: "rede-zum-fest" },
    customer_email: EMAIL,
    ...o,
  });
  const rowAt = (ref, status, o = {}) => ({ ref, status, provider: "stripe_test", created: new Date((T - 3600) * 1000).toISOString(), ...o });

  function run(name, { key = TEST_KEY, sessions = [], rows = [] }, want) {
    const db = path.join(dir, `${name.replace(/\W+/g, "-")}.db`);
    const d = new Database(db);
    d.exec(`CREATE TABLE checkouts (reference TEXT PRIMARY KEY, address TEXT, offer TEXT, cents INTEGER NOT NULL,
            provider TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, settled_at TEXT)`);
    for (const r of rows) {
      d.prepare("INSERT INTO checkouts VALUES (?, NULL, 'rede-zum-fest', 1900, ?, ?, ?, NULL)").run(r.ref, r.provider, r.status, r.created);
    }
    d.close();
    const fixture = path.join(dir, `${name.replace(/\W+/g, "-")}.json`);
    fs.writeFileSync(fixture, JSON.stringify({ offers: ["rede-zum-fest"], sessions }));
    let out = "";
    let code = 0;
    try {
      out = execFileSync(process.execPath, [__filename], {
        env: { ...process.env, CP_STRIPE_SECRET_KEY: key, CP_PUBLIC_URL: ORIGIN, CP_DB_PATH: db, CP_NOW: NOW, CP_STRIPE_SESSIONS_FIXTURE: fixture },
        encoding: "utf8",
      });
    } catch (e) {
      out = String(e.stdout || "");
      code = e.status;
    }
    const got = Object.fromEntries(out.trim().split("\n").map((l) => l.split(" ")).filter((p) => p.length === 2));
    const problems = [];
    if (code !== want.exit) problems.push(`exit ${code}, wanted ${want.exit}`);
    for (const [k, v] of Object.entries(want)) if (k !== "exit" && got[k] !== String(v)) problems.push(`${k}=${got[k]}, wanted ${v}`);
    for (const secret of [key, EMAIL, ...sessions.map((s) => s.id)]) if (out.includes(secret)) problems.push("output names a key, an email or a session id");
    if (problems.length) {
      failed += 1;
      console.log(`FAIL ${name}: ${problems.join("; ")}\n${out}`);
    } else console.log(`ok   ${name}`);
  }

  // A paid session without a booking is found; the same one booked is not.
  run("paid, not booked", { sessions: [session("cs_test_a")], rows: [rowAt("cs_test_a", "pending")] }, { exit: 1, paid_not_booked: 1 });
  run("paid, booked", { sessions: [session("cs_test_a")], rows: [rowAt("cs_test_a", "paid")] }, { exit: 0, stripe_paid: 1, booked_paid: 1 });
  run("paid, no row at all", { sessions: [session("cs_test_a")] }, { exit: 1, paid_no_row: 1 });
  // An open session is nobody's mismatch.
  run("open, pending", { sessions: [session("cs_test_a", { payment_status: "unpaid", status: "open" })], rows: [rowAt("cs_test_a", "pending")] }, { exit: 0, stripe_paid: 0 });
  // A stranger's paid session is foreign, not missing; with our success_url and our offer it is ours.
  run("foreign paid session", { sessions: [session("cs_test_f", { success_url: "https://elsewhere.example/thanks", metadata: {} })] }, { exit: 0, foreign: 1, paid_no_row: 0 });
  run("foreign offer on our page", { sessions: [session("cs_test_f", { metadata: { offer: "not-ours" } })] }, { exit: 0, foreign: 1, paid_no_row: 0 });
  run("ours, counted", { sessions: [session("cs_test_f")] }, { exit: 1, foreign: 0, paid_no_row: 1 });
  // A paid stripe_test row says nothing under a live key; under a test key it is checked.
  const oldUnpaid = [session("cs_test_old", { payment_status: "unpaid", status: "expired" })];
  run("stripe_test row, live key", { key: LIVE_KEY, sessions: oldUnpaid, rows: [rowAt("cs_test_old", "paid")] }, { exit: 0, mode: "stripe", booked_not_paid: 0 });
  run("stripe_test row, test key", { sessions: oldUnpaid, rows: [rowAt("cs_test_old", "paid")] }, { exit: 1, mode: "stripe_test", booked_not_paid: 1 });
  // A paid row Stripe has never heard of.
  run("booked, unknown to Stripe", { rows: [rowAt("cs_test_ghost", "paid")] }, { exit: 1, booked_not_paid: 1 });
  // A booked row whose session is a second before the window: fetched on its own, paid, so 0.
  const edge = session("cs_test_edge", { created: START - 1 });
  const edgeRow = rowAt("cs_test_edge", "paid", { created: new Date((START + 1) * 1000).toISOString() });
  run("booked, session just before the window, paid", { sessions: [edge], rows: [edgeRow] }, { exit: 0, booked_not_paid: 0, booked_paid: 1 });
  run("booked, session just before the window, unpaid", { sessions: [{ ...edge, payment_status: "unpaid", status: "expired" }], rows: [edgeRow] }, { exit: 1, booked_not_paid: 1 });
  // Booked here, Stripe says unpaid.
  run("booked, not paid", { sessions: [session("cs_test_a", { payment_status: "unpaid", status: "expired" })], rows: [rowAt("cs_test_a", "paid")] }, { exit: 1, booked_not_paid: 1 });
  // Paging: the one unbooked paid session sits on the third page.
  const many = Array.from({ length: 230 }, (_, i) => session(`cs_test_p${i}`, { created: T - 7200 - i, success_url: "https://elsewhere.example/" }));
  many.push(session("cs_test_last", { created: START + 10 }));
  run("paged, found on page three", { sessions: many }, { exit: 1, foreign: 230, paid_no_row: 1 });
  run("paged, booked", { sessions: many, rows: [rowAt("cs_test_last", "paid")] }, { exit: 0, foreign: 230, booked_paid: 1 });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failed ? `STRIPE SESSIONS SELFTEST FAILED (${failed})` : "STRIPE SESSIONS SELFTEST OK");
  return failed ? 1 : 0;
}

(process.argv.includes("--selftest") ? selftest() : main()).then(
  (code) => process.exit(code),
  (e) => {
    console.log(`STRIPE SESSIONS: could not look: ${e && e.name}`);
    process.exit(2);
  },
);
