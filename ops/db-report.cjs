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
  "mainnet-abnahme", "provisioned-key", "cleanup",
];
const oursClause = `(
  address in (${OURS.map(() => "?").join(",")})
  or exists (select 1 from api_keys k where k.address = ledger.address
             and (${OUR_KEY_NAMES.map(() => "k.name like ?").join(" or ")}))
)`;
const OURS_ARGS = [...OURS, ...OUR_KEY_NAMES];
const notOurs = `not ${oursClause}`;

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
  // THE number. Anything above zero means this stopped being our own demonstration.
  foreign_buyers: one(
    `select count(distinct address) n from ledger where kind='bounty_hold' and ${notOurs}`,
    ...OURS_ARGS,
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
