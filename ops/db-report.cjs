// Runs inside the cp container (node - < ops/db-report.cjs), reads the SQLite read-only.
const db = require("better-sqlite3")("/data/cp.db", { readonly: true });
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

console.log(JSON.stringify(report));
