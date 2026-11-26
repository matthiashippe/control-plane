// Runs inside the cp container (node - < ops/db-report.cjs), reads the SQLite read-only.
// The path is overridable so the script can be run against a database built by a test. Production
// is unchanged: inside the container CP_DB_PATH is not set and /data/cp.db is where it lives.
// Without this the report was the one piece of the daily observation that nothing could check.
const db = require("better-sqlite3")(process.env.CP_DB_PATH || "/data/cp.db", { readonly: true });

// The pool's size and the grant sizes, read from the service instead of retyped here.
//
// They were three literals in this file: 500000, 15000, 50000. On 2026-09-29 the pool went from
// 500,000 mc to 1,500,000 because the old figure was the ceiling on the 02.10. goal rather than a
// budget, and this report kept reporting the old one. The test that holds "an untouched pool
// carries POOL_MC / GRANT_MC" went red on the spot, which is what it is for, and it found a
// duplication rather than a typo: a number that decides an offer has one home.
//
// Read from the compiled service when it is there, which it is in the container this runs in, and
// fall back to the values as they stood, so a report on a machine without a build still runs and
// says something rather than nothing.
let POOL_MC = 1_500_000;
let GRANT_MC = 15_000;
let BUYER_GRANT_MC = 50_000;
let poolSource = "fallback";
// ops/status.sh pipes this file into `node -` inside the container, so there is no __dirname to
// resolve against and `require` starts from the working directory, which is /app. The first
// attempt at this read used "../dist/..." and would have failed silently on every production run,
// leaving the fallback in place: the same quiet drift this block exists to end. Measured in the
// container before shipping, which is the only way that was ever going to be caught.
for (const candidate of ["./dist/credits/starter.js", "/app/dist/credits/starter.js", "../dist/credits/starter.js"]) {
  try {
    const starter = require(candidate);
    if (Number.isInteger(starter.POOL_MC)) POOL_MC = starter.POOL_MC;
    if (Number.isInteger(starter.GRANT_MC)) GRANT_MC = starter.GRANT_MC;
    if (Number.isInteger(starter.BUYER_GRANT_MC)) BUYER_GRANT_MC = starter.BUYER_GRANT_MC;
    poolSource = candidate;
    break;
  } catch {
    /* try the next one */
  }
}
const day = new Date(Date.now() - 86400e3).toISOString();
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const wallets = one("select count(*) n, coalesce(sum(balance_mc),0) s from wallets");
const report = {
  wallets: wallets.n,
  credits_mc: wallets.s,
  keys: one("select count(*) n from api_keys where revoked_at is null").n,
  automatons: one("select count(*) n from automatons").n,
  payments: all("select status, count(*) n from payments group by status"),
  stuck_payments: one("select count(*) n from payments where status='pending' and created_at < ?", new Date(Date.now() - 600e3).toISOString()).n,
  day: {},
};
const t = one("select count(*) n, coalesce(sum(delta_mc),0) s from ledger where kind='topup' and created_at > ?", day);
const i = one(
  "select count(*) n, coalesce(sum(delta_mc),0) s, coalesce(sum(json_extract(meta,'$.margin_mc')),0) m, coalesce(sum(json_extract(meta,'$.cost_usd')),0) c from ledger where kind='inference' and created_at > ?",
  day,
);
// What the token estimate failed to collect, over the whole life of the service.
//
// `src/inference/proxy.ts` charges min(actual, balance) and records the remainder as
// `uncollected_mc`. Until 2026-09-21 that number was written and never read, so it could have run
// to any size unseen. Measured the same day against the provider's tokenizer, the estimate is
// short by up to 64 percent on JSON-heavy prompts and over-reserves the dominant runtime shape by
// 40 percent, which is why the estimate was left alone; see .scratch/gtm/nacht-backlog.md B1. The
// decision only holds while this number stays small, so here it is.
report.uncollected_mc = one(
  "select coalesce(sum(json_extract(meta,'$.uncollected_mc')),0) s from ledger where kind='inference'",
).s;

report.day = { topups: t.n, topup_mc: t.s, calls: i.n, spend_mc: -i.s, margin_mc: i.m, purchase_usd: Number((i.c || 0).toFixed(4)) };

// Customers who paid and still do not think. That is the quietest way to lose a customer: the
// credit sits there, the runtime may still be polling, but not a single inference call arrives. We
// had exactly that case on 19.09.2026 and only noticed it because somebody happened to look into
// the ledger. Without this number nobody notices.
report.paying_without_thinking = all(
  `select w.address,
          w.balance_mc,
          (select max(created_at) from ledger l2 where l2.address = w.address and l2.kind = 'topup') as last_topup,
          (select max(created_at) from ledger l3 where l3.address = w.address and l3.kind = 'inference') as last_inference
     from wallets w
    where w.balance_mc > 0
      and exists (select 1 from ledger lt where lt.address = w.address and lt.kind = 'topup')
      and not exists (
        select 1 from ledger li
         where li.address = w.address and li.kind = 'inference'
           and li.created_at > (select max(created_at) from ledger l4 where l4.address = w.address and l4.kind = 'topup')
      )`,
).map((r) => ({
  address: r.address.slice(0, 10) + "…",
  balance_mc: r.balance_mc,
  hours_since_topup: Number(((Date.now() - Date.parse(r.last_topup)) / 3600e3).toFixed(1)),
  ever_thought: r.last_inference !== null,
}));

// The market, and the one number the whole plan hangs on.
//
// goals/2026-09-20-goal-13-gtm.md ends with it: a bounty_hold in the ledger from an address that
// is not ours, by 2026-10-19. Declaring a number decisive and then not reading it anywhere is the
// most comfortable way to miss it, so it is computed here and printed on every run.
//
// "Ours" is spelled out rather than inferred. The operator wallet posted the first cycle and the
// seed jobs, and the first-cycle agent was created by us; counting either as a stranger would be
// the same self-deception as the code-host showing up as a visitor in the traffic log.
const OURS = [
  "0xd24f37d0838e62621ed24111164485ded0f0924f", // operator wallet, posts the seed jobs
  "0xf6204b0662082d65d78eab79936a4d91744dee6b", // the agent from the first cycle on 2026-09-20
  // The operator's own fee address, added on 2026-09-21. It is where `bounty_fee` is booked, so it
  // appears in the ledger and in `wallets` like any other address, and it read as a stranger until
  // somebody counted the strangers and found three where there should have been one. It is also
  // the address printed in `/.well-known/x402` as the payment recipient, so it is ours by
  // construction and never anybody else's.
  "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614",
  // The handle ops/keyless-walk.sh minted on 2026-09-23 walking the keyless path against
  // production. Not an Ethereum address on purpose; see src/bounties/ours.ts, which test/ours.test.ts
  // holds against this list.
  "key:99e4d0eec698925fed5ac8099adf2f2263f1fe51",
  // The keyless AGENT handle from the supply-side cold start on 2026-09-23; its submission sits on
  // a live job. See src/bounties/ours.ts, which test/ours.test.ts holds against this list.
  "key:c6989cf4fc8217434c2c422ea6bc857f98291f2e",
  // The keyless AGENT handle minted on 2026-09-29 at 09:23:22, and the way it got here is the
  // point. No script in ops/ mints one: `ops/keyless-walk.sh --dry` stops before the step that
  // spends and `ops/stranger-client.sh` proves the door exists with a GET that answers 405. Both
  // were re-run that morning against production and the handle count did not move. It came from a
  // subagent of the loop's own derivation round, which had been told to check whether
  // `/v1/auth/keyless` still worked and checked it by using it.
  //
  // So the rule this list carries ("anything that provisions a key from ops/ belongs here in the
  // same commit that creates it") has a hole that no commit can close: an agent reading the repo
  // can call production without being a tool in it. The handle has a zero balance and an empty
  // ledger, so it changes no money, but `wallets_foreign` counted it and that is the number the
  // plan is read against.
  "key:1001d3d458a61eaeae0bc6a2ade41f8d424a31e8",
  // And the same thing again ninety minutes later, 2026-09-29 at 10:03:13, this time by the
  // cycle's own hand: a loop walking every path in the new /openapi.json against production, to
  // prove the document names nothing that answers 404. `POST /v1/auth/keyless` answers 201 by
  // minting, so proving it is there costs one.
  //
  // Twice in one morning is not two accidents, it is a shape: any liveness probe that walks a
  // list of endpoints will eventually POST to one that creates something. The check belongs in
  // the tests, where the database is in memory, and test/openapi.test.ts does exactly that walk.
  // Against production, a minting endpoint is looked at and not called.
  "key:165d85b0d51c24f46c17c2e6b931d34ab126d70f",
  // Und das dritte an diesem Tag, 10:52 und dann noch einmal beim Nachpruefen des Fixes, der
  // genau diese Tuer betrifft. Drei Handles an einem Morgen ist kein Zufall mehr, sondern der
  // Preis dafuer, dass `POST /v1/auth/keyless` nur durch Benutzen zu pruefen ist: ein GET
  // antwortet 405. Der Preis ist jetzt bekannt und klein (ein Handle, kein Geld aus dem Topf),
  // und seit die Kappe eine Notbremse ist statt eines Trichters sperrt er niemanden mehr aus.
  "key:a0722324659ba4e634e8ee6f084f74139dbd12f9",
  // The handle our own walk of the stranger's path used, 2026-09-29 at 11:46 UTC, and it is the
  // one keyless handle on this list that DID something: it took a key without a wallet, read its
  // balance, called /v1/chat/completions, drew the 15-cent starter grant on that call and spent
  // about a cent of it. That was the point, the whole funnel proved end to end against production
  // for the first time, and the receipt is that `thinking_wallets.not_ours` went from 2 to 3
  // within the minute.
  //
  // Three is a goal number. ops/claim-keyless.sh refuses to offer a handle that did anything,
  // exactly so this cannot be swept in with the quiet ones, and it is written here by hand with
  // what it did, which is the rule that refusal exists to enforce.
  "key:47a47c509827ede2fbc7294baf889d17e8e30a3b",
  // Minted 2026-09-29 by one of our own probes against production and claimed by
  // ops/claim-keyless.sh: no ledger, no submission, no bounty. It had to be called to be
  // proved, because a GET on that door answers 405.
  "key:0dfe81d95c4cdbdb24eeed91b80136baa1071692",
  // Minted 2026-09-29 by one of our own probes against production and claimed by
  // ops/claim-keyless.sh: no ledger, no submission, no bounty. It had to be called to be
  // proved, because a GET on that door answers 405.
  "key:30fcb94104676b5a0ff6c581e7512b4c4bb765b9",
  // Minted 2026-09-29 by one of our own probes against production and claimed by
  // ops/claim-keyless.sh: no ledger, no submission, no bounty. It had to be called to be
  // proved, because a GET on that door answers 405.
  "key:a774e555b538603b5b60d9dfd330f9d93f5cdf2f",
  // Minted 2026-09-29 by one of our own probes against production and claimed by
  // ops/claim-keyless.sh: no ledger, no submission, no bounty. It had to be called to be
  // proved, because a GET on that door answers 405.
  "key:6587e904da177a93d3b4ebcfc854763b6a263bdf",
  // live-sandbox: the own account of the live check of the sandbox API (ops/live.sh), 2026-11-12.
  "0x2f2817d4985991ba3c078edb4e7d328b051c8098",
];

// The hardcoded pair is not enough. Every production check provisions a throwaway wallet, and on
// 2026-09-21 the first full run of ops/check-all.sh proudly reported "foreign agents: 4", all four
// of them ours. That is the same self-deception as the code-host appearing as a visitor in the
// traffic log, one layer down, and it would have been read as the supply side waking up.
//
// So an address also counts as ours when the key it was given carries a name only our own tools
// use. The list is spelled out rather than pattern-matched on purpose: `conway-automaton` is the
// name a real runtime gives its key, and excluding that would hide exactly the people we are
// waiting for.
const OUR_KEY_NAMES = [
  "handsel-%",            // post-bounty.ts, first-cycle.ts
  "mcp-production-check%", // mcp-against-production.ts
  "skill-production-check", "skill-check-buyer",
  "harness-%",            // provisionierung.ts, markt.ts
  "provisioned-key", "cleanup",
  // ops/newcomer-probe.ts. Added on 2026-09-21, an hour too late: the probe ran, its wallet was not
  // on this list, and `foreign agents` read 1 when the truth was 0. That is the one number the
  // whole plan hangs on, and it lied because a new tool of ours arrived without its name.
  // Anything that provisions a key from ops/ belongs here in the same commit that creates it.
  "cold-start-probe",
  "doc-check", "my-agent", // the two runs that proved docs/api-key.md works, one of them verbatim
  // 2026-09-21, the fourth time in one day. A throwaway script verified that the example on /post
  // works for a first-time buyer, and its key was named after what it did rather than after who
  // ran it. `foreign_buyers` went from 0 to 1, which is THE number, and it was me.
  "first-buyer-check",
  // `harness/e2e/mainnet.ts` provisions "mainnet-acceptance". This list said "mainnet-abnahme",
  // the German name the script carried before the language pass. Nobody had run the acceptance
  // since, so the mismatch was still theoretical; the next run would have counted itself as a
  // stranger. Both spellings stay, because an old key in the database keeps its old name forever.
  "mainnet-abnahme", "mainnet-acceptance",
  // The reserved prefix, and the answer to doing this a fifth time. Anything ours provisions from
  // now on names its key `ops-<what it checks>`, and is classified by construction rather than by
  // somebody remembering to edit this list. The names above stay because keys already exist under
  // them.
  "ops-%",
  // 2026-09-29, and the convention above is four days old. A cycle verified the new 404 against
  // production with a hand-provisioned key and named it after the cycle instead of the prefix,
  // which is the fifth time this has happened and the first since the prefix existed. The check
  // caught it within the hour, which is what it is for. The name stays on the list because the
  // key exists and keys keep their names; the lesson is that `ops-` is not optional.
  "loop-payway-check",
];

// The one name among ours that is allowed on a live job, and the rest, which are not.
//
// `ops/compete.ts` names its key `ops-seed-<agent>`. Everything else of ours that ends up holding
// a submission on an open bounty is a tool that escaped its throwaway, which is the bug this pair
// was built to catch.
// Subtracting `ops-seed-%` from the list is not enough: `ops-%` is on it and matches the seed keys
// too, so a plain filter would have counted every seed agent as a stray. The exclusion has to be a
// second condition in the SQL, not an absence from the list.
const SEED_KEY_NAME = "ops-seed-%";

// Names that are not ours to claim.
//
// `conway-automaton` is what the upstream runtime calls the key it provisions, so it belongs to
// anybody who points a runtime here. On this database two addresses carry it: our own operator
// wallet from the acceptance run on 19.09., and the paying stranger 0x0629a685. That is exactly
// why it must never land on the list above. Our own use of it is already excluded one level up,
// by address, in `OURS`.
//
// Anything else that appears here is a decision a human makes, and the day this list grows for a
// reason other than the runtime's default is the day this project stops being a demonstration.
// `browser` is what the keyless door names every key it mints (src/auth/keyless.ts), for anybody
// who posts a job without a wallet since 2026-09-23. It is on this list for the same reason as
// `conway-automaton` and with the same safeguard: our own walk of that path is excluded one level
// up, by address, because its handle is in OURS. Putting it on the list above instead would claim
// every stranger who ever uses the front door as one of ours, which is the one error this report
// exists to prevent.
// `agent` joins them on 2026-09-23 with POST /v1/auth/keyless: it is the name every keyless key
// for the supply side carries, for anybody. Same safeguard as the other two, our own use is
// excluded one level up by address.
// `crawler` joins on 2026-11-14 (goals/anmeldung/01): the name a keyless key for a declared crawler carries, a stranger by definition.
const STRANGER_KEY_NAMES = ["conway-automaton", "browser", "agent", "crawler"];
const oursClause = `(
  address in (${OURS.map(() => "?").join(",")})
  or exists (select 1 from api_keys k where k.address = ledger.address
             and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")}))
)`;
const OURS_ARGS = [...OURS, ...OUR_KEY_NAMES];
const notOurs = `not ${oursClause}`;

// CP_REPORT=decline (goals/kunden/01): instead of the report, one JSON of every foreign address with
// inference in the window CP_SINCE..CP_UNTIL (ISO UTC, CP_UNTIL empty means now), numbered from 1 in
// the order of its first inference row there. ops/customer-decline.sh reads it on the code-host and
// matches it against the access log. No address, key or ref leaves this block: a customer is a number.
// Written synchronously and ended here, so without CP_REPORT nothing below changes by a single byte.
if (process.env.CP_REPORT === "decline") {
  const iso = (name, fallback) => {
    const raw = process.env[name];
    if (!raw) return fallback;
    const t = Date.parse(raw);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(raw) || Number.isNaN(t)) {
      require("fs").writeSync(2, `db-report: ${name} is no ISO time in UTC\n`);
      process.exit(1);
    }
    return new Date(t).toISOString();
  };
  const since = iso("CP_SINCE", new Date(0).toISOString());
  const until = iso("CP_UNTIL", new Date().toISOString());
  const inWindow = "created_at >= ? and created_at < ?";
  const customers = all(
    `select address, min(created_at) first_at from ledger
      where kind = 'inference' and ${inWindow} and ${notOurs}
      group by address order by first_at, min(id)`,
    since, until, ...OURS_ARGS,
  ).map((c, i) => ({
    n: i + 1,
    balance_mc: one("select balance_mc from wallets where address = ?", c.address)?.balance_mc ?? 0,
    last_topup: one("select max(created_at) at from ledger where address = ? and kind = 'topup'", c.address).at,
    rows: all(
      `select created_at, meta, delta_mc from ledger
        where address = ? and kind = 'inference' and ${inWindow} order by created_at, id`,
      c.address, since, until,
    ).map((r) => {
      let model = null;
      try {
        model = JSON.parse(r.meta || "{}").model ?? null;
      } catch {
        /* a row without readable meta keeps its charge, the model stays unknown */
      }
      return { at: r.created_at, model, charged_mc: -r.delta_mc };
    }),
  }));
  const hasAborts = one("select count(*) n from sqlite_master where type = 'table' and name = 'inference_aborts'").n > 0;
  const aborts = hasAborts
    ? all(
        `select created_at at, model, answered, purchase_mc from inference_aborts
          where ${inWindow} order by created_at, id`,
        since, until,
      )
    : [];
  // writeSync may write part of the buffer to a pipe, or meet EAGAIN on a non-blocking one.
  const out = Buffer.from(JSON.stringify({ since, until, customers, aborts }) + "\n");
  for (let off = 0; off < out.length; ) {
    try {
      off += require("fs").writeSync(1, out, off, out.length - off);
    } catch (e) {
      if (e.code !== "EAGAIN") throw e;
    }
  }
  process.exit(0);
}

// CP_REPORT=wallets (goals/kunden/02): instead of the report, one JSON that ops/conway-payers.sh matches
// against the transfers to Conway on the code-host. Every address leaves this block only as the
// SHA-256 (hex) of its lowercase form: `ours` for every address oursClause calls ours, `wallets` for
// every other address in `wallets` or paying in `payments` with status settled, with counts only.
// No address, key, ref or tx hash. Written synchronously and ended here, like the decline block.
if (process.env.CP_REPORT === "wallets") {
  const sha = (a) => require("crypto").createHash("sha256").update(String(a).toLowerCase()).digest("hex");
  // oursClause itself, on a one-row table named like the ledger; its placeholders come first in the text.
  const isOurs = (a) => one(`select ${oursClause} ours from (select ? address) ledger`, ...OURS_ARGS, a).ours === 1;
  const candidates = new Set([
    ...OURS,
    ...all("select address from wallets").map((r) => r.address),
    ...all("select from_address address from payments where status = 'settled'").map((r) => r.address),
    ...all("select address from api_keys").map((r) => r.address),
  ].map((a) => String(a).toLowerCase()));
  // Counted once per table rather than once per address: the production ledger is long and the server has one core.
  const inference = new Map(
    all("select lower(address) a, count(*) n from ledger where kind = 'inference' group by lower(address)").map((r) => [r.a, r.n]),
  );
  const payments = new Map(
    all(
      "select lower(from_address) a, count(*) n, max(settled_at) last from payments where status = 'settled' group by lower(from_address)",
    ).map((r) => [r.a, r]),
  );
  const known = new Set(all("select lower(address) a from wallets").map((r) => r.a));
  const ours = [];
  const wallets = [];
  for (const a of [...candidates].sort()) {
    if (isOurs(a)) {
      ours.push(sha(a));
      continue;
    }
    const paid = payments.get(a);
    if (!known.has(a) && !paid) continue; // a key without a wallet or a settled payment is no payer
    const last = paid && paid.last ? new Date(paid.last) : null;
    wallets.push({
      h: sha(a),
      wallet: known.has(a),
      inference_rows: inference.get(a) ?? 0,
      paid: paid ? paid.n : 0,
      last_paid_at: last && !Number.isNaN(last.getTime()) ? last.toISOString() : null,
    });
  }
  ours.sort();
  wallets.sort((x, y) => (x.h < y.h ? -1 : x.h > y.h ? 1 : 0));
  // writeSync may write part of the buffer to a pipe, or meet EAGAIN on a non-blocking one.
  const out = Buffer.from(JSON.stringify({ ours, wallets }) + "\n");
  for (let off = 0; off < out.length; ) {
    try {
      off += require("fs").writeSync(1, out, off, out.length - off);
    } catch (e) {
      if (e.code !== "EAGAIN") throw e;
    }
  }
  process.exit(0);
}

// CP_REPORT=starter-paths (goals/kunden/06): instead of the report, one JSON of every new foreign runtime in
// the window CP_SINCE..CP_UNTIL (ISO UTC, CP_UNTIL empty means now): the first `conway-automaton` key of an
// address that oursClause does not call ours (the list OURS and every key named after OUR_KEY_NAMES), like
// runtime_funnel, numbered from 1 in the order of that key. Each runtime leaves this block only as
// {n, key_at, granted, granted_at, funded_at}: funded_at is its first ledger row that raised the balance
// (a grant included), so ops/starter-paths.sh --own-check can tell an empty balance from a funded one.
// No address, key or ref. Written synchronously and ended here, like the decline block.
if (process.env.CP_REPORT === "starter-paths") {
  const iso = (name, fallback) => {
    const raw = process.env[name];
    if (!raw) return fallback;
    const t = Date.parse(raw);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(raw) || Number.isNaN(t)) {
      require("fs").writeSync(2, `db-report: ${name} is no ISO time in UTC\n`);
      process.exit(1);
    }
    return new Date(t).toISOString();
  };
  const since = iso("CP_SINCE", new Date(0).toISOString());
  const until = iso("CP_UNTIL", new Date().toISOString());
  // oursClause names ledger.address, so it runs here on a derived table of that name, as in the wallets block.
  const firstKeys = all(
    `select address, first_key from (
       select lower(rk.address) address, min(rk.created_at) first_key
         from api_keys rk where rk.name = 'conway-automaton' group by lower(rk.address)
     ) ledger
     where first_key >= ? and first_key < ? and not ${oursClause}
     order by first_key, address`,
    since, until, ...OURS_ARGS,
  );
  const at = (v) => {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  };
  const runtimes = firstKeys.map((r, i) => {
    const grant = one("select min(created_at) at from ledger where lower(address) = ? and kind = 'grant'", r.address).at;
    const funded = one("select min(created_at) at from ledger where lower(address) = ? and delta_mc > 0", r.address).at;
    return {
      n: i + 1,
      key_at: at(r.first_key),
      granted: grant !== null && grant < until,
      granted_at: grant ? at(grant) : null,
      funded_at: funded ? at(funded) : null,
    };
  });
  // writeSync may write part of the buffer to a pipe, or meet EAGAIN on a non-blocking one.
  const out = Buffer.from(JSON.stringify({ since, until, runtimes }) + "\n");
  for (let off = 0; off < out.length; ) {
    try {
      off += require("fs").writeSync(1, out, off, out.length - off);
    } catch (e) {
      if (e.code !== "EAGAIN") throw e;
    }
  }
  process.exit(0);
}

// CP_REPORT=customer-work (goals/kunden/08): instead of the report, one JSON of what one customer did on the
// way from a bounty to credit, per UTC day of the window CP_SINCE..CP_UNTIL (ISO UTC, CP_UNTIL empty means
// now). The customer's wallets come in CP_CUSTOMER_ADDRESSES (comma separated, held in memory by the caller);
// without it the block takes customer CP_CUSTOMER (default 1) numbered like the decline block, from
// CP_CUSTOMER_SINCE on, so the wallet need not leave the container at all. Per day: submissions stored for
// the customer, bounties open that day that are not the customer's (posted before the day ends, neither
// closed nor past the deadline before it begins), how many of those oursClause calls ours, bounty_award rows
// to the customer and its inference rows after its first bounty_award. `inference_at` lists the times of
// its inference rows from CP_CUSTOMER_SINCE on, for the match against the access log. No address, key, id,
// brief or amount leaves this block. Written synchronously and ended here, like the decline block.
if (process.env.CP_REPORT === "customer-work") {
  const fail = (msg) => {
    require("fs").writeSync(2, `db-report: ${msg}\n`);
    process.exit(1);
  };
  const iso = (name, fallback) => {
    const raw = process.env[name];
    if (!raw) return fallback;
    const t = Date.parse(raw);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(raw) || Number.isNaN(t)) fail(`${name} is no ISO time in UTC`);
    return new Date(t).toISOString();
  };
  const since = iso("CP_SINCE", new Date(0).toISOString());
  const until = iso("CP_UNTIL", new Date().toISOString());
  const numberedFrom = iso("CP_CUSTOMER_SINCE", since);
  if (until <= since) fail("CP_UNTIL is not after CP_SINCE");
  const n = Number(process.env.CP_CUSTOMER || "1");
  if (!Number.isInteger(n) || n < 1) fail("CP_CUSTOMER is no number from 1");
  const ms = (v) => {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  };
  let addresses = String(process.env.CP_CUSTOMER_ADDRESSES || "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (addresses.length === 0) {
    // The order of the decline block: foreign wallets by their first inference row in the window, then id.
    const customer = all(
      `select address, min(created_at) first_at from ledger
        where kind = 'inference' and created_at >= ? and created_at < ? and ${notOurs}
        group by address order by first_at, min(id)`,
      numberedFrom, until, ...OURS_ARGS,
    )[n - 1];
    if (customer) addresses = [customer.address.toLowerCase()];
  }
  const mine = new Set(addresses);
  const marks = addresses.map(() => "?").join(",");
  const rowsOf = (sql, ...args) => (addresses.length ? all(sql, ...addresses, ...args) : []);
  const inferenceAt = rowsOf(
    `select created_at at from ledger where lower(address) in (${marks}) and kind = 'inference'
      and created_at >= ? and created_at < ? order by created_at, id`,
    numberedFrom, until,
  ).map((r) => new Date(ms(r.at)).toISOString());
  const submissions = rowsOf(`select created_at at from submissions where lower(agent) in (${marks})`).map((r) => ms(r.at));
  const awards = rowsOf(
    `select created_at at from ledger where lower(address) in (${marks}) and kind = 'bounty_award'`,
  ).map((r) => ms(r.at));
  const firstAward = awards.filter((t) => t !== null && t < ms(until)).sort((a, b) => a - b)[0] ?? null;
  const inferenceAfter = firstAward === null
    ? []
    : rowsOf(`select created_at at from ledger where lower(address) in (${marks}) and kind = 'inference'`)
        .map((r) => ms(r.at))
        .filter((t) => t !== null && t > firstAward);
  // oursClause itself, on a one-row table named like the ledger, as in the wallets block.
  const oursCache = new Map();
  const isOurs = (a) => {
    if (!oursCache.has(a)) {
      oursCache.set(a, one(`select ${oursClause} ours from (select ? address) ledger`, ...OURS_ARGS, a).ours === 1);
    }
    return oursCache.get(a);
  };
  const bounties = all("select creator, created_at, closed_at, deadline from bounties")
    .filter((b) => !mine.has(String(b.creator).toLowerCase()))
    .map((b) => {
      const opened = ms(b.created_at);
      const ends = [ms(b.closed_at), ms(b.deadline)].filter((t) => t !== null);
      return { opened, closes: ends.length ? Math.min(...ends) : Infinity, ours: isOurs(b.creator) };
    })
    .filter((b) => b.opened !== null);
  const days = [];
  const startOfDay = new Date(since);
  startOfDay.setUTCHours(0, 0, 0, 0);
  for (let d = startOfDay.getTime(); d < ms(until); d += 86400e3) {
    const from = Math.max(d, ms(since));
    const to = Math.min(d + 86400e3, ms(until));
    const inDay = (t) => t !== null && t >= from && t < to;
    const open = bounties.filter((b) => b.opened < to && b.closes >= from);
    days.push({
      day: new Date(d).toISOString().slice(0, 10),
      submissions: submissions.filter(inDay).length,
      open: open.length,
      ours: open.filter((b) => b.ours).length,
      awards: awards.filter(inDay).length,
      inference_after_award: inferenceAfter.filter(inDay).length,
    });
  }
  // The house job (goals/kunden/11): a bounty with a `house_fund` row behind it, ref `house-fund:<id>`, the
  // rule of isHouseJob in src/bounties/house.ts. In the window: house jobs posted, valid house reports of
  // addresses that oursClause does not call ours, `bounty_award` rows of house jobs to such addresses and
  // those among them to the customer. The reports leave only as counts per method, path and status, each
  // path with every wallet (0x and 40 hex digits) and every IPv4 address replaced by <address> first. A
  // report counts only if checkHouseReport would take it; the service refuses any other with 422 before
  // anything is stored, so this copy of the rule only keeps a stray row out of the count.
  const HOUSE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  const houseCalls = (body) => {
    let raw;
    try {
      raw = JSON.parse(body);
    } catch {
      return null;
    }
    const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
    if (!isObject(raw) || Object.keys(raw).some((k) => k !== "runtime" && k !== "calls")) return null;
    if (typeof raw.runtime !== "string" || !/^[0-9a-fA-F]{7,40}$/.test(raw.runtime)) return null;
    if (!Array.isArray(raw.calls) || raw.calls.length < 1 || raw.calls.length > 20) return null;
    for (const c of raw.calls) {
      if (!isObject(c) || Object.keys(c).some((k) => k !== "method" && k !== "path" && k !== "status")) return null;
      if (typeof c.method !== "string" || !HOUSE_METHODS.includes(c.method)) return null;
      if (typeof c.path !== "string" || !c.path.startsWith("/") || c.path.length > 200) return null;
      if (typeof c.status !== "number" || !Number.isInteger(c.status) || c.status < 100 || c.status > 599) return null;
    }
    return raw.calls;
  };
  const redact = (path) => path.replace(/0x[0-9a-fA-F]{40}/g, "<address>").replace(/[0-9]{1,3}(\.[0-9]{1,3}){3}/g, "<address>");
  const inWindow = (v) => {
    const t = ms(v);
    return t !== null && t >= ms(since) && t < ms(until);
  };
  const foreign = (a) => !isOurs(String(a).toLowerCase());
  const houseJobs = all(
    `select b.created_at from bounties b
      where exists (select 1 from ledger l where l.kind = 'house_fund' and l.ref = 'house-fund:' || b.id)`,
  ).filter((b) => inWindow(b.created_at)).length;
  const houseReports = all(
    `select s.agent, s.body, s.created_at from submissions s
      where exists (select 1 from ledger l where l.kind = 'house_fund' and l.ref = 'house-fund:' || s.bounty_id)`,
  )
    .filter((s) => inWindow(s.created_at) && foreign(s.agent))
    .map((s) => houseCalls(s.body))
    .filter((calls) => calls !== null);
  // first_inference is the earliest `inference` row of the award's address (postLedger writes addresses in
  // lower case), for the count of awards to addresses without an inference before the award (kunden 13).
  const houseAwards = all(
    `select a.address, a.created_at,
            (select min(i.created_at) from ledger i where i.address = a.address and i.kind = 'inference') first_inference
       from ledger a
      where a.kind = 'bounty_award'
        and exists (select 1 from ledger l where l.kind = 'house_fund' and 'bounty-award:' || substr(l.ref, 12) = a.ref)`,
  ).filter((a) => inWindow(a.created_at) && foreign(a.address));
  // The step credit of goals/kunden/13: one `house_step` row per address, ref `house-step:<address>`, written by
  // grantForHouseJob while a house job is open. Counted in the window at addresses that oursClause does not
  // call ours, and those among them to the customer. Per UTC day of `days`: house awards by the day of the
  // award, those to an address with no `inference` row before the award, and step credits.
  const houseSteps = all("select address, created_at from ledger where kind = 'house_step'").filter(
    (s) => inWindow(s.created_at) && foreign(s.address),
  );
  // kunden 14: the customer's `inference` rows after his `house_step` row and before CP_UNTIL, 0 without a step
  // credit in the window. src/inference/proxy.ts writes an `inference` row only after a billed answer, so a count
  // above 0 means his next inference after the step credit ended with 200.
  const stepAt = houseSteps
    .filter((s) => mine.has(String(s.address).toLowerCase()))
    .map((s) => ms(s.created_at))
    .sort((a, b) => a - b)[0] ?? null;
  const stepsCustomerInference = stepAt === null
    ? 0
    : all("select address, created_at from ledger where kind = 'inference'")
        .filter((r) => mine.has(String(r.address).toLowerCase()))
        .map((r) => ms(r.created_at))
        .filter((t) => t !== null && t > stepAt && t < ms(until)).length;
  const withoutEarlierInference = (a) => {
    const first = a.first_inference === null ? null : ms(a.first_inference);
    return first === null || first >= ms(a.created_at);
  };
  const houseDays = days.map(({ day: d }) => {
    const from = Math.max(Date.parse(`${d}T00:00:00.000Z`), ms(since));
    const to = Math.min(Date.parse(`${d}T00:00:00.000Z`) + 86400e3, ms(until));
    const inDay = (v) => {
      const t = ms(v);
      return t !== null && t >= from && t < to;
    };
    const dayAwards = houseAwards.filter((a) => inDay(a.created_at));
    return {
      day: d,
      awards: dayAwards.length,
      awards_without_inference: dayAwards.filter(withoutEarlierInference).length,
      steps: houseSteps.filter((s) => inDay(s.created_at)).length,
    };
  });
  const callCount = new Map();
  for (const calls of houseReports) {
    for (const c of calls) {
      const key = JSON.stringify([c.method, redact(c.path), c.status]);
      callCount.set(key, (callCount.get(key) || 0) + 1);
    }
  }
  const house = {
    jobs: houseJobs,
    submissions: houseReports.length,
    awards: houseAwards.length,
    awards_customer: houseAwards.filter((a) => mine.has(String(a.address).toLowerCase())).length,
    steps: houseSteps.length,
    steps_customer: houseSteps.filter((s) => mine.has(String(s.address).toLowerCase())).length,
    steps_customer_inference: stepsCustomerInference,
    days: houseDays,
    calls: [...callCount.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, count]) => {
      const [method, path, status] = JSON.parse(key);
      return { method, path, status, n: count };
    }),
  };
  // writeSync may write part of the buffer to a pipe, or meet EAGAIN on a non-blocking one.
  const out = Buffer.from(
    JSON.stringify({ since, until, customer: n, found: addresses.length > 0, inference_at: inferenceAt, days, house }) + "\n",
  );
  for (let off = 0; off < out.length; ) {
    try {
      off += require("fs").writeSync(1, out, off, out.length - off);
    } catch (e) {
      if (e.code !== "EAGAIN") throw e;
    }
  }
  process.exit(0);
}

// CP_REPORT=sandbox-customer (goals/kunden/16): instead of the report, one JSON of every foreign address with a
// sandbox created in the window CP_SINCE..CP_UNTIL (ISO UTC, CP_UNTIL empty means now), numbered from 1 in the
// order of its first such sandbox. Per customer: balance and reservation from `wallets`, its sandboxes of the
// window with the time of the last `sandbox` ledger row of each (its last step), and its ledger rows of the
// window as time and kind only. ops/sandbox-customer.sh reads it on the code-host and matches it against the
// access log. No address, key, sandbox id, ref or ledger amount leaves this block: a customer is a number.
// Written synchronously and ended here, like the decline block.
if (process.env.CP_REPORT === "sandbox-customer") {
  const fail = (msg) => {
    require("fs").writeSync(2, `db-report: ${msg}\n`);
    process.exit(1);
  };
  const iso = (name, fallback) => {
    const raw = process.env[name];
    if (!raw) return fallback;
    const t = Date.parse(raw);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(raw) || Number.isNaN(t)) fail(`${name} is no ISO time in UTC`);
    return new Date(t).toISOString();
  };
  const since = iso("CP_SINCE", new Date(0).toISOString());
  const until = iso("CP_UNTIL", new Date().toISOString());
  if (until <= since) fail("CP_UNTIL is not after CP_SINCE");
  // HOLD_MC of src/sandbox/service.ts, which test/sandbox-customer.test.ts holds against this number.
  const HOLD_MC = 1000;
  const weekFrom = new Date(Date.parse(until) - 7 * 86400e3).toISOString();
  const foreignTopupsWeek = one(
    `select count(*) n from ledger where kind = 'topup' and created_at >= ? and created_at < ? and ${notOurs}`,
    weekFrom, until, ...OURS_ARGS,
  ).n;
  const hasSandboxes = one("select count(*) n from sqlite_master where type = 'table' and name = 'sandboxes'").n > 0;
  // oursClause names ledger.address, so it runs here on a derived table of that name, as in the wallets block.
  const owners = hasSandboxes
    ? all(
        `select address, first_at from (
           select address, min(created_at) first_at, min(rowid) first_row from sandboxes
            where created_at >= ? and created_at < ? group by address
         ) ledger where not ${oursClause} order by first_at, first_row`,
        since, until, ...OURS_ARGS,
      )
    : [];
  const customers = owners.map((c, i) => {
    const w = one("select balance_mc, reserved_mc from wallets where address = ?", c.address);
    const sandboxes = all(
      `select id, tier, status, stop_reason, steps_billed, created_at from sandboxes
        where address = ? and created_at >= ? and created_at < ? order by created_at, rowid`,
      c.address, since, until,
    ).map((s) => {
      // A step row carries the ref `sandbox:<id>:<step>` (src/sandbox/service.ts, bookStep); compared as a prefix
      // without LIKE, so an underscore or percent sign in an id matches only itself.
      const prefix = `sandbox:${s.id}:`;
      const last = one(
        "select max(created_at) at from ledger where kind = 'sandbox' and substr(ref, 1, length(?)) = ?",
        prefix, prefix,
      ).at;
      return {
        tier: s.tier,
        status: s.status,
        stop_reason: s.stop_reason ?? null,
        steps_billed: s.steps_billed,
        created_at: s.created_at,
        last_step_at: last ?? null,
      };
    });
    const ledger = all(
      `select created_at at, kind from ledger where address = ? and created_at >= ? and created_at < ?
        order by created_at, id`,
      c.address, since, until,
    );
    return { n: i + 1, balance_mc: w?.balance_mc ?? 0, reserved_mc: w?.reserved_mc ?? 0, sandboxes, ledger };
  });
  // writeSync may write part of the buffer to a pipe, or meet EAGAIN on a non-blocking one.
  const out = Buffer.from(
    JSON.stringify({ since, until, hold_mc: HOLD_MC, foreign_topups_week: foreignTopupsWeek, customers }) + "\n",
  );
  for (let off = 0; off < out.length; ) {
    try {
      off += require("fs").writeSync(1, out, off, out.length - off);
    } catch (e) {
      if (e.code !== "EAGAIN") throw e;
    }
  }
  process.exit(0);
}

// The same test against a column that is not ledger.address.
//
// oursClause names ledger.address, so it only works inside a query on the ledger. The one number
// the plan hangs on lives on bounties.creator, and writing the filter a second time by hand is
// how the two drift: this report has already had three occasions where a figure about the market
// quietly became a figure about us, each one a filter that did not cover a tool of ours.
const notOursOn = (column) => `not (
  ${column} in (${OURS.map(() => "?").join(",")})
  or exists (select 1 from api_keys k where k.address = ${column}
             and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")}))
)`;

// How many wallets are not ours.
//
// `wallets` is printed as a headline figure and reads as usage. On 2026-09-21 it said 280, and 248
// of those carried a key named `harness-markt-poster` or `harness-markt-applicant`: two per run of
// `ops/check-all.sh`, 110 runs in one day. The market check was 89 per cent of the number meant to
// show how many people are here. `harness/e2e/market.ts` keeps its two accounts from that day on,
// so it stops growing, but the 248 already in the database stay, because deleting rows from a
// production ledger to make a number look better is the opposite of the point.
const fremdeWallets = `select w.address from wallets w where not (
     w.address in (${OURS.map(() => "?").join(",")})
     or exists (select 1 from api_keys k where k.address = w.address
                and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")})))`;
// The addresses themselves while there are few enough to read. A bare count says "3" and every
// cycle has to go and find out what they are; on 2026-09-21 two of the three turned out to be our
// own fee address and an abandoned sign-in from our own machine. The one that matters is a real
// arrival, and it should be readable in the line that reports it.
report.wallets_foreign_list = all(
  fremdeWallets.replace("select w.address from", "select w.address, w.created_at from") +
    " order by w.created_at limit 6",
  ...OURS,
  ...OUR_KEY_NAMES,
).map((r) => ({ address: r.address, created_at: r.created_at }));

// A stranger provisioning is the second biggest thing that can happen here, after a payment.
//
// On 2026-09-22 at 02:05 UTC one did: three calls in one second from a Korean address, key named
// `conway-automaton`, which is what the unmodified upstream runtime calls its own. The cycle only
// noticed because `ops/traffic.sh` printed a new IP. The report had the fact all along, as a count
// that went from 2 to 3, and nothing said so.
report.wallets_foreign_new_24h = all(
  fremdeWallets.replace("select w.address from", "select w.address, w.created_at from") +
    " and w.created_at > ? order by w.created_at",
  ...OURS,
  ...OUR_KEY_NAMES,
  new Date(Date.now() - 86400e3).toISOString(),
).map((r) => ({
  address: r.address,
  created_at: r.created_at,
  key_names: all("select distinct name from api_keys where address = ?", r.address).map((k) => k.name),
  used: one("select count(*) n from ledger where address = ?", r.address).n,
}));
report.wallets_foreign = one(
  `select count(*) n from wallets w where not (
     w.address in (${OURS.map(() => "?").join(",")})
     or exists (select 1 from api_keys k where k.address = w.address
                and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")})))`,
  ...OURS,
  ...OUR_KEY_NAMES,
).n;

// Has anybody from outside ever thought here?
//
// Between "provisioned" and "paid" there is a step nothing counted. On 2026-09-22 at 02:05 a
// stranger took a key and then did nothing with it for an hour, and the only numbers that could
// have said so were a wallet count and a payment count, one of which moved and one of which did
// not. Inference is the step in between: it is what the service is for, it costs the operator
// real money the moment it happens, and it is the first thing a working runtime does.
//
// Zero today. The day this reads 1, somebody outside this house has had a thought on our bill.
report.wallets_foreign_active = one(
  `select count(distinct l.address) n from ledger l
    where l.kind = 'inference' and not (
      l.address in (${OURS.map(() => "?").join(",")})
      or exists (select 1 from api_keys k where k.address = l.address
                 and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")})))`,
  ...OURS,
  ...OUR_KEY_NAMES,
).n;

report.market = {
  open_bounties: one("select count(*) n from bounties where status='open' and deadline > ?", new Date().toISOString()).n,
  held_mc: one("select coalesce(sum(price_mc),0) s from bounties where status='open'").s,
  awarded: one("select count(*) n from bounties where status='awarded'").n,
  expired: one("select count(*) n from bounties where status='expired'").n,
  cancelled: one("select count(*) n from bounties where status='cancelled'").n,
  submissions: one("select count(*) n from submissions").n,
  fee_earned_mc: one("select coalesce(sum(delta_mc),0) s from ledger where kind='bounty_fee'").s,
  starter_granted: one("select count(*) n from ledger where kind='grant'").n,
  // How much of the giveaway went to us. Since 2026-09-21 the grant is taken automatically by the
  // first call that cannot pay for itself, which is right for a stranger's runtime and quietly
  // expensive for ours: every throwaway wallet a production check provisions and then makes think
  // draws 15 cents. The pool is 33 grants wide, so our own tooling can empty the cold-start budget
  // in an afternoon. Split out rather than filtered away, using the same definition of "ours" as
  // the numbers below, because the useful reading is not "the pool is shrinking" but "who by".
  starter_granted_ours: one(`select count(*) n from ledger where kind='grant' and ${oursClause}`, ...OURS_ARGS).n,
  // Nets `grant_returned`, like `poolLeftMc()` in src/credits/starter.ts and like the two
  // capacities below. It did not, and the report contradicted itself in two adjacent lines:
  // on 2026-09-29 it printed 120000 mc left next to `starter_grants_left: 11`, and eleven grants
  // of 15000 mc do not fit in 120000. The figure the service itself publishes was 170000. The
  // difference is the one cancelled job-scoped grant, 50000 mc, which went back to the pool and
  // was still being counted as spent here.
  //
  // The direction matters: this number is what a cycle reads to decide whether the free offer can
  // still be made, and understating it takes the offer off the pages while the money is there.
  // The same class of error emptied the offer for four hours on 2026-09-23, from the other end.
  // Where the three numbers above came from. "fallback" means this report is guessing at the
  // pool's size, and a guess about the pool is a guess about every offer the pages make.
  // Was ein fremder Zahler diesem Dienst bisher wirklich eingebracht hat.
  //
  // Fuer ops/anzeigen-rechnung.py, und der Grund, warum es hier steht und nicht dort: die erste
  // Fassung jener Rechnung trug die Zahlen vom 29.09. fest eingebaut. Matthias hat gesagt, die
  // Anzeigenfrage solle regelmaessig neu gestellt werden, und eine Rechnung mit eingemauerten
  // Zahlen stellt keine Frage, sie wiederholt eine Antwort. Von hier aus schlaegt sie um, sobald
  // ein Kunde mehr ausgibt.
  foreign_payers: one(
    `select count(distinct address) n from ledger where kind = 'topup' and ${notOurs}`,
    ...OURS_ARGS,
  ).n,
  foreign_topup_mc: one(
    `select coalesce(sum(delta_mc),0) s from ledger where kind = 'topup' and ${notOurs}`,
    ...OURS_ARGS,
  ).s,
  foreign_margin_mc: all(
    `select meta from ledger where kind = 'inference' and ${notOurs}`,
    ...OURS_ARGS,
  ).reduce((sum, r) => {
    try { return sum + (JSON.parse(r.meta || "{}").margin_mc || 0); } catch { return sum; }
  }, 0),
  // Die Abnahme von Goal 19, als Zahl statt als Vorsatz.
  //
  // Goal 19 fragt, ob ein fremder Client ueberhaupt je signiert, nachdem sich herausgestellt hat,
  // dass @x402/core jedes Angebot ueber einem Dollar vor dem Signieren verwirft. Die Einschraenkung
  // auf Nicht-Conway steht im Goal, weil deren Stufen fest verdrahtet sind und ein Treffer von
  // dort nichts ueber die neue Stufe beweisen wuerde: sie haben den Deckel nie gesehen.
  //
  // Gezaehlt werden abgerechnete Zahlungen, nicht Anfragen. Eine Anfrage sagt nur, dass jemand das
  // Angebot gelesen hat, und davon gab es 465 ohne eine einzige Signatur.
  settled_payments_foreign: one(
    `select count(*) n from payments p
       where p.status = 'settled'
         and not (p.from_address in (${OURS.map(() => "?").join(",")})
                  or exists (select 1 from api_keys k where k.address = p.from_address
                             and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")})))`,
    ...OURS, ...OUR_KEY_NAMES,
  ).n,
  // Und davon die, deren Schluessel NICHT conway-automaton heisst, also andere Clients.
  settled_payments_non_conway: one(
    `select count(*) n from payments p
       where p.status = 'settled'
         and not (p.from_address in (${OURS.map(() => "?").join(",")})
                  or exists (select 1 from api_keys k where k.address = p.from_address
                             and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")})))
         and not exists (select 1 from api_keys k2 where k2.address = p.from_address
                         and k2.name = 'conway-automaton')`,
    ...OURS, ...OUR_KEY_NAMES,
  ).n,
  // Was fremde Zahler wirklich verbraucht haben, fuer ops/anzeigen-rechnung.py. Ohne diese Zahl
  // konnte die Rechnung Einzahlung und Verbrauch nicht trennen und hat nur die verbrauchte Marge
  // als Wert je Kunde gelesen.
  foreign_inference_mc: one(
    `select coalesce(sum(-delta_mc),0) s from ledger where kind = 'inference' and ${notOurs}`,
    ...OURS_ARGS,
  ).s,
  pool_source: poolSource,
  starter_pool_left_mc:
    POOL_MC - one("select coalesce(sum(delta_mc),0) s from ledger where kind in ('grant','grant_returned')").s,

  // How many newcomers the giveaway still carries.
  //
  // `/fix`, the landing page and `/post` all promise a fresh wallet 15 cents of starter credit.
  // That promise is not a statement about the code, it is a statement about a fixed pot, and on
  // 2026-09-21 the pot was 45 per cent gone with every single grant having been taken by us: four
  // in one day, three seed agents and one cold-start probe. Nothing warned, because the report
  // printed a sum of millicents and a sum does not read as "four more people can start".
  //
  // So the number is the one the pages depend on, in the unit the promise is made in. It is not a
  // rate and not a forecast: consumption here comes in bursts, a probe run or a wave of seed
  // agents, and a per-day figure derived from that would be a made-up trend.
  // Two sides, two capacities, because since 2026-09-23 a grant is not one size any more. An agent
  // gets 15 c and a buyer's first job gets up to 50, so one figure of "newcomers left" hid a
  // threefold difference: at 150 c the pool carries ten agents or three buyers, and three buyers
  // is the number that decides whether the answers going out tomorrow meet an offer or a refusal.
  //
  // And it nets grant_returned, the way the service's own poolLeftMc does. A job posted and
  // cancelled gave nobody anything and its credit is back in the pool; counting it as spent made
  // this figure pessimistic after every cancellation, which is the direction that quietly shrinks
  // a promise the pages are still making.
  starter_grants_left: Math.floor((POOL_MC - one("select coalesce(sum(delta_mc),0) s from ledger where kind in ('grant','grant_returned')").s) / GRANT_MC),
  starter_buyer_grants_left: Math.floor((POOL_MC - one("select coalesce(sum(delta_mc),0) s from ledger where kind in ('grant','grant_returned')").s) / BUYER_GRANT_MC),
  // Money the buyer brought, against money we handed them.
  //
  // `foreign_gmv_30d_mc` below is the number the whole plan is measured by, and it was about to
  // become unreadable. The next sub-goal in ZIELE.md (T1.2) pays a stranger's FIRST job out of the
  // starter pool, so that the entry stops costing 15 cents of somebody else's USDC. That is the
  // right move and it would have made our own pool show up as foreign market volume: a job funded
  // by us, awarded by them, counted as proof that strangers are trading here.
  //
  // So the split is drawn where the money comes from, not where the wallet does. A buyer who has
  // never had a `topup` row in the ledger is spending what we gave them, and their volume is
  // counted separately and named separately. It is still worth watching -- a stranger who posts a
  // real job on a free credit is a real event -- it is simply not the number that says the market
  // pays for itself.
  //
  // Written as a clause next to notOursOn() rather than inside it: "is this address ours" and
  // "did this address bring its own money" are two questions, and one filter answering both is how
  // a figure quietly changes meaning.
  grant_funded_gmv_30d_mc: one(
    `select coalesce(sum(b.price_mc),0) s from bounties b
       where b.status='awarded' and b.closed_at > datetime('now','-30 day')
         and ${notOursOn("b.creator")}
         and not exists (select 1 from ledger l where l.address = b.creator and l.kind = 'topup')`,
    ...OURS_ARGS,
  ).s,
  // THE number, in money rather than in people.
  //
  // foreign_buyers counts somebody putting money down; this counts the whole round trip, because
  // it only moves when all three things have happened: a stranger funded a job, an agent handed
  // work in, and the buyer awarded it rather than taking the price back. A buyer who posts and
  // then cancels leaves foreign_buyers at 1 and this at 0, which is the honest difference.
  //
  // Rolling 30 days and not since-the-beginning: one award in September says nothing about
  // whether the market works in December, and a total that can only grow is a number that never
  // reports a decline.
  // Die Vision, als eine Zahl, die nein sagen kann.
  //
  // Matthias am 29.09.: "wir wollen ja im endeffekt das fiverr nur fuer agents bauen, die agents
  // bedienen die eine seite und die menschen die andere", mit drei Versprechen: Lieferung in
  // Minuten, Auswahl aus mehreren fertigen Arbeiten, Preisdruck. Eine Vision ohne Zahl ist in
  // zwei Wochen ein Wunsch, also ist das hier die Zahl.
  //
  // Ein Auftrag zaehlt, wenn ALLE DREI zutreffen: der Kaeufer ist fremd und hat selbst eingezahlt,
  // mindestens zwei fremde Agenten haben geliefert, und die Vergabe kam binnen einer Stunde nach
  // dem Ausschreiben. Die lockere Fassung waere heute erfuellt und wertlos: 44 der 47 Auftraege
  // hat unsere eigene Betreiber-Wallet ausgeschrieben, und alle 37 Einsendungen kommen von
  // Adressen, die der Klassifizierer als unsere fuehrt.
  //
  // Die drei Bedingungen stehen zusaetzlich einzeln da, weil die Gesamtzahl sonst nur sagt "nein"
  // und nicht "woran". Am 29.09. ist jede einzelne 0, und das ist die ehrliche Auskunft.
  fiverr_orders_30d: one(
    `select count(*) n from bounties b
       where b.status='awarded' and b.closed_at > datetime('now','-30 day')
         and ${notOursOn("b.creator")}
         and exists (select 1 from ledger l where l.address = b.creator and l.kind = 'topup')
         and (select count(*) from submissions s
               where s.bounty_id = b.id and ${notOursOn("s.agent")}) >= 2
         and (julianday(b.closed_at) - julianday(b.created_at)) * 24 * 60 <= 60`,
    ...OURS_ARGS, ...OURS_ARGS,
  ).n,
  // Woran es liegt, je Bedingung einzeln.
  fiverr_foreign_funded_orders_30d: one(
    `select count(*) n from bounties b
       where b.created_at > datetime('now','-30 day')
         and ${notOursOn("b.creator")}
         and exists (select 1 from ledger l where l.address = b.creator and l.kind = 'topup')`,
    ...OURS_ARGS,
  ).n,
  fiverr_orders_with_two_foreign_deliveries_30d: one(
    `select count(*) n from bounties b
       where b.created_at > datetime('now','-30 day')
         and (select count(*) from submissions s
               where s.bounty_id = b.id and ${notOursOn("s.agent")}) >= 2`,
    ...OURS_ARGS,
  ).n,
  fiverr_orders_awarded_within_the_hour_30d: one(
    `select count(*) n from bounties b
       where b.status='awarded' and b.closed_at > datetime('now','-30 day')
         and (julianday(b.closed_at) - julianday(b.created_at)) * 24 * 60 <= 60`,
  ).n,
  // Das Angebots-Glied der Org (ORG.md): hat ueberhaupt je ein fremder Agent geliefert.
  //
  // Absichtlich ohne Bedingung an den Auftraggeber: eine Lieferung von aussen auf einen unserer
  // eigenen Auftraege ist trotzdem eine Lieferung von aussen, und genau die hat es in dreissig
  // Tagen noch nie gegeben. Die strengere Zahl, die zwei fremde Lieferungen auf einem fremden
  // Auftrag verlangt, steht drei Zeilen weiter oben.
  foreign_submissions_30d: one(
    `select count(*) n from submissions s
       where s.created_at > datetime('now','-30 day') and ${notOursOn("s.agent")}`,
    ...OURS_ARGS,
  ).n,
  foreign_gmv_30d_mc: one(
    `select coalesce(sum(b.price_mc),0) s from bounties b
       where b.status='awarded' and b.closed_at > datetime('now','-30 day')
         and ${notOursOn("b.creator")}
         and exists (select 1 from ledger l where l.address = b.creator and l.kind = 'topup')`,
    ...OURS_ARGS,
  ).s,
  // The commission actually earned from those, which is what would pay for anything.
  // Joined on `ref` and not on a column: the ledger has no bounty_id. src/bounties/store.ts writes
  // `bounty-fee:<id>` into ref when it books the commission, which is the only link between the
  // two tables, and a query written against the column that ought to exist fails loudly rather
  // than returning a plausible zero.
  foreign_fee_30d_mc: one(
    `select coalesce(sum(l.delta_mc),0) s from ledger l
       join bounties b on l.ref = 'bounty-fee:' || b.id
       where l.kind='bounty_fee' and b.closed_at > datetime('now','-30 day')
         and ${notOursOn("b.creator")}
         and exists (select 1 from ledger t where t.address = b.creator and t.kind = 'topup')`,
    ...OURS_ARGS,
  ).s,
  // THE number. Anything above zero means this stopped being our own demonstration.
  foreign_buyers: one(
    `select count(distinct address) n from ledger where kind='bounty_hold' and ${notOurs}`,
    ...OURS_ARGS,
  ).n,
  // A key name this report has never been told about.
  //
  // Three times on 2026-09-21 a tool of ours arrived without its name on the list above, and each
  // time a number about the market quietly became a number about us: four check agents counted as
  // foreign agents, a check's submission sat on a live job, and the cold-start probe read as a
  // stranger for an hour. Fixing the instance three times is not fixing anything.
  //
  // So an unknown name is surfaced instead of silently bucketed. It is one of exactly two things,
  // and both are worth a human look: a tool of ours that forgot to register, which is a bug, or a
  // real stranger, which is the news this whole project is waiting for.
  unclassified_key_names: all(
    `select distinct name from api_keys
      where not (${OUR_KEY_NAMES.map(() => "name like ?").join(" or ")})
        ${STRANGER_KEY_NAMES.length ? `and name not in (${STRANGER_KEY_NAMES.map(() => "?").join(",")})` : ""}`,
    ...OUR_KEY_NAMES,
    ...STRANGER_KEY_NAMES,
  ).map((r) => r.name),

  // Our own litter on a live job.
  //
  // On 2026-09-20 at 23:01 the MCP production check submitted to a real 150-cent bounty instead of
  // to a throwaway of its own. The check was fixed the same night and the row stayed, harmless
  // until 2026-09-21, when the open list started publishing how many agents are already in. From
  // that moment a visiting agent read "1 competitor" on a job whose only competitor was us, which
  // discourages exactly the behaviour the number was published to encourage. Anything above zero
  // here means a tool of ours wandered onto a live job by accident.
  //
  // `ops/compete.ts` is the exception and is split out below rather than excused here, because the
  // two are different events. A production check on a live job is a bug in the check. A seed agent
  // on a live job is the operator supplying the side that does not exist yet, decided on
  // 2026-09-21 and written down on /terms. Both are ours, only one is a mistake.
  stray_submissions_on_open: one(
    `select count(*) n from submissions s
       join bounties b on b.id = s.bounty_id
      where b.status = 'open'
        and exists (select 1 from api_keys k where k.address = s.agent
                    and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")})
                    and k.name not like ?)`,
    ...OUR_KEY_NAMES,
    SEED_KEY_NAME,
  ).n,

  // The operator's own supply side, counted and never netted away.
  //
  // This number exists so that nobody, including whoever writes the next cycle, can read the
  // submission counts on the landing page as evidence of strangers. `foreign_agents` below is the
  // number that means something; this one is what has to be subtracted from the public count to
  // get there.
  seed_submissions_on_open: one(
    `select count(*) n from submissions s
       join bounties b on b.id = s.bounty_id
      where b.status = 'open'
        and exists (select 1 from api_keys k where k.address = s.agent and k.name like ?)`,
    SEED_KEY_NAME,
  ).n,
  foreign_agents: one(
    `select count(distinct s.agent) n from submissions s
      where s.agent not in (${OURS.map(() => "?").join(",")})
        and not exists (select 1 from api_keys k where k.address = s.agent
                        and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")}))`,
    ...OURS_ARGS,
  ).n,
};

// What people paid in thirty days, in euro cents (Goal 20, 2026-09-29). ORG.md calls it the number.
//
// Only `provider = 'stripe'`, which src/payments/stripe-key.ts writes for a live key alone: a
// purchase with Stripe's test card is a demonstration and carries `stripe_test` (Sperrliste 0, 2).
// Only rows with an offer, because a row with an address is credits for a wallet, not a person
// buying from the catalogue. The window is computed here in ISO, the format `settled_at` is written
// in; `datetime('now')` has a space where ISO has a T, and the two do not compare on the same day.
//
// Before the migration in src/db.ts has run there is no `offer` column, and then the field is left
// out rather than reported as 0: ops/ziele.py prints "kein Messweg" for a missing field, which is
// the truth, while a 0 would be a measurement that did not happen.
//
// Not yet excluded: our own purchases with a real card once a live key is set. That needs a list of
// our own buyers in ops/ with its counter-proof, before any live key (HAN-17).
if (db.prepare("PRAGMA table_info(checkouts)").all().some((c) => c.name === "offer")) {
  report.market.human_revenue_30d_cents = one(
    `select coalesce(sum(cents),0) s from checkouts
      where status = 'paid' and provider = 'stripe' and offer is not null and settled_at > ?`,
    new Date(Date.now() - 30 * 86400e3).toISOString(),
  ).s;
}

// Buyers who are us, or no person at all: a copy of ops/ours.txt (Goal 21, 2026-09-29), because
// this script runs on stdin inside the container and cannot read ops/. test/order-brief.test.ts
// holds the two equal. A domain matches the address's domain and every subdomain of it.
const OUR_EMAILS = [
];
const OUR_EMAIL_DOMAINS = [
  "postyourprice.com",
  "handsel.dev",
  // RFC 2606. An agent checking the path types these (HAN-25, condition 4).
  "example.com",
  "example.org",
  "example.net",
  "test",
  "invalid",
  "example",
];
const ourEmail = (email) => {
  const e = String(email).trim().toLowerCase();
  const domain = e.slice(e.lastIndexOf("@") + 1);
  return OUR_EMAILS.includes(e) || OUR_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
};

// Two numbers from what a buyer typed before paying (Goal 21). Counts only: no address and no
// brief leaves this script, not even in a debug line (HAN-25, condition 8).
//
//   order_briefs_30d       briefs of the last thirty days whose email is not ours: strangers who
//                          said what they need and were sent on to Stripe. Not a conversation and
//                          not goal 1's "Gespräch antwortet live": it is one fixed question in a
//                          form (HAN-25, condition 1).
//   human_orders_paid_30d  of those, paid with a live key in the last thirty days. `stripe_test`
//                          never counts: a test card is a demonstration (Sperrliste 0).
//   human_orders_pending_30d  the same buyers and the same live key, still `pending` more than an
//                          hour after they started. There is no webhook: a payment is booked only
//                          when the buyer comes back to /katalog/danke, and whoever closes the tab
//                          stays pending (HAN-24). This tells a 0 above from blindness.
//
// The email is one mark of "ours" only. ops/traffic.sh counts foreign 303s on POST /katalog/kaufen
// by IP, and order_briefs_30d above that count means one of ours slipped past this list.
if (db.prepare("select name from sqlite_master where type = 'table' and name = 'order_briefs'").get()) {
  const since30 = new Date(Date.now() - 30 * 86400e3).toISOString();
  const briefs = all(
    `select b.email, b.created_at, c.status, c.provider, c.settled_at
       from order_briefs b join checkouts c using (reference)`,
  ).filter((r) => !ourEmail(r.email));
  report.market.order_briefs_30d = briefs.filter((r) => r.created_at > since30).length;
  report.market.human_orders_paid_30d = briefs.filter(
    (r) => r.status === "paid" && r.provider === "stripe" && r.settled_at && r.settled_at > since30,
  ).length;
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  report.market.human_orders_pending_30d = briefs.filter(
    (r) => r.status === "pending" && r.provider === "stripe" && r.created_at > since30 && r.created_at < hourAgo,
  ).length;
}


// runtime_funnel (goals/kunden/03): where a runtime that moves to us drops out between its first
// `conway-automaton` key and its first payment. A cohort per week of the last four, by the week of
// that first key: keys, then of those with a starter grant, with inference and with a settled
// payment, each stage counted on its own. The window ends at CP_UNTIL (ISO UTC), else at the start
// of the current UTC hour, every week is seven days, `from` included and `to` excluded, the newest
// week first. Our own addresses never
// count (notOursOn, on an alias other than `k` because notOursOn names `api_keys k` inside). Only
// counts leave this block: no address, no hash, no key, no time of a single runtime.
{
  // Without CP_UNTIL the window ends at the start of the current UTC hour rather than at this
  // millisecond, so two runs of the standard report print the same bytes (test/customer-decline and
  // test/conway-payers compare them); an hour is nothing against a week.
  const rawUntil = process.env.CP_UNTIL;
  let funnelUntil = new Date(Math.floor(Date.now() / 3600e3) * 3600e3);
  if (rawUntil) {
    const t = Date.parse(rawUntil);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(rawUntil) || Number.isNaN(t)) {
      require("fs").writeSync(2, "db-report: CP_UNTIL is no ISO time in UTC\n");
      process.exit(1);
    }
    funnelUntil = new Date(t);
  }
  const untilIso = funnelUntil.toISOString();
  const weeks = [0, 1, 2, 3].map((i) => ({
    from: new Date(funnelUntil.getTime() - (i + 1) * 7 * 86400e3).toISOString(),
    to: new Date(funnelUntil.getTime() - i * 7 * 86400e3).toISOString(),
    keys: 0,
    starter_credit: 0,
    inference: 0,
    paid: 0,
  }));
  const runtimes = all(
    `select lower(rk.address) address, min(rk.created_at) first_key
       from api_keys rk
      where rk.name = 'conway-automaton' and ${notOursOn("rk.address")}
      group by lower(rk.address)`,
    ...OURS,
    ...OUR_KEY_NAMES,
  );
  const hasLedger = (address, kind) =>
    !!one("select 1 from ledger where address = ? and kind = ? and created_at < ? limit 1", address, kind, untilIso);
  const hasPaid = (address) =>
    !!one(
      `select 1 from payments
        where status = 'settled' and (lower(from_address) = ? or lower(to_address) = ?)
          and coalesce(settled_at, created_at) < ? limit 1`,
      address,
      address,
      untilIso,
    );
  for (const r of runtimes) {
    const firstKey = Date.parse(r.first_key);
    if (Number.isNaN(firstKey)) continue;
    const at = new Date(firstKey).toISOString();
    const week = weeks.find((w) => at >= w.from && at < w.to);
    if (!week) continue;
    week.keys += 1;
    if (hasLedger(r.address, "grant")) week.starter_credit += 1;
    if (hasLedger(r.address, "inference")) week.inference += 1;
    if (hasPaid(r.address)) week.paid += 1;
  }
  const total = { keys: 0, starter_credit: 0, inference: 0, paid: 0 };
  for (const w of weeks) for (const k of Object.keys(total)) total[k] += w[k];
  const losses = [
    ["starter_credit", total.keys - total.starter_credit],
    ["inference", total.starter_credit - total.inference],
    ["paid", total.inference - total.paid],
  ];
  let largestDrop = { stage: null, lost: 0 };
  for (const [stage, lost] of losses) if (lost > largestDrop.lost) largestDrop = { stage, lost };
  report.runtime_funnel = { until: untilIso, weeks, total, largest_drop: largestDrop };
}

// Sandboxes the sweep could not delete (goals/hosting/07): automatons still `failed` whose first failed delete in
// sweep_failures is more than an hour old. Each of them is a sandbox that may still book credits of its customer without an
// automaton running in it; the cp log has a line `sweep could not delete sandbox` for every round. null means the table is
// not there yet (a database from before that goal, opened readonly here, so the report cannot create it), not zero.
const hasSweepFailures = one("select count(*) n from sqlite_master where type = 'table' and name = 'sweep_failures'").n > 0;
report.undeleted_sandboxes = hasSweepFailures
  ? one(
      `select count(*) n from sweep_failures f join hosted_automatons h on h.id = f.automaton_id
        where h.status = 'failed' and f.first_failed_at < ?`,
      new Date(Date.now() - 3600e3).toISOString(),
    ).n
  : null;

console.log(JSON.stringify(report));
