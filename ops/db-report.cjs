// Runs inside the cp container (node - < ops/db-report.cjs), reads the SQLite read-only.
// The path is overridable so the script can be run against a database built by a test. Production
// is unchanged: inside the container CP_DB_PATH is not set and /data/cp.db is where it lives.
// Without this the report was the one piece of the daily observation that nothing could check.
const db = require("better-sqlite3")(process.env.CP_DB_PATH || "/data/cp.db", { readonly: true });
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
const STRANGER_KEY_NAMES = ["conway-automaton"];
const oursClause = `(
  address in (${OURS.map(() => "?").join(",")})
  or exists (select 1 from api_keys k where k.address = ledger.address
             and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")}))
)`;
const OURS_ARGS = [...OURS, ...OUR_KEY_NAMES];
const notOurs = `not ${oursClause}`;

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
  starter_pool_left_mc: 500000 - one("select coalesce(sum(delta_mc),0) s from ledger where kind='grant'").s,

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
  starter_grants_left: Math.floor((500000 - one("select coalesce(sum(delta_mc),0) s from ledger where kind='grant'").s) / 15000),
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

console.log(JSON.stringify(report));
