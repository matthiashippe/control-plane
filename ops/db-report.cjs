// Läuft im cp-Container (node - < ops/db-report.cjs), liest die SQLite read-only.
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
console.log(JSON.stringify(report));
