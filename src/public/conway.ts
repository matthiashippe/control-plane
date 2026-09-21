/**
 * What is still being paid into Conway, as a page that updates itself.
 *
 * The landing page and the article both claim that money keeps going into a service that cannot
 * issue an API key. That claim is the load-bearing one for everything else here, and until
 * 2026-09-21 it rested on a single scan from 19 September sitting in a CSV in the repository. A
 * number from one day cannot be told apart from a number that has quietly stopped being true, so
 * `ops/conway-money-series.sh` measures it daily and this page shows what it found.
 *
 * Two files arrive from that script, handed into the container because the series lives outside
 * the repo directory `deploy/rollout.sh` mirrors with --delete:
 *
 *   /data/conway-money.ndjson   one line per scan, the series
 *   /data/conway-recent.csv     the newest purchases, the receipts behind the claim
 *
 * Purchases and transfers are counted separately on purpose. The smallest tier Conway sells is
 * 5 USD, so anything below that is not somebody buying credits; in the 30 days to 20 September
 * 2026, 18 of 104 transfers were dust from two wallets worth 0.05 USDC together. Counting those as
 * payments inflates the transfer count by a fifth, and it was the first number we published.
 */
import fs from "node:fs";
import { esc } from "./market.js";

export interface MoneyPoint {
  measured_at: string;
  data_through: string;
  window_from: string;
  transfers_30d: number;
  usdc_30d: number;
  wallets_30d: number;
  topups_30d: number;
  topup_usdc_30d: number;
  topup_wallets_30d: number;
  first_time_topup_wallets_30d: number;
  topups_per_wallet_30d: number;
  dust_transfers_30d: number;
  topup_tiers_30d: Record<string, number>;
  topup_tiers_total?: Record<string, number>;
  transfers_total: number;
  usdc_total: number;
  wallets_total: number;
  last_block: number;
  pay_endpoint_status?: number;
}

export interface Receipt {
  timestamp_utc: string;
  from: string;
  usdc: string;
  tx_hash: string;
}

/** Reads the series the daily scan hands over. Missing or broken is not an error worth a 500. */
export function readMoneySeries(path = process.env.CP_CONWAY_SERIES || "/data/conway-money.ndjson"): MoneyPoint[] {
  try {
    return fs
      .readFileSync(path, "utf-8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as MoneyPoint);
  } catch {
    return [];
  }
}

/** The newest purchases, as the scan wrote them. Same tolerance: no file, no receipts, no error. */
export function readReceipts(path = process.env.CP_CONWAY_RECEIPTS || "/data/conway-recent.csv"): Receipt[] {
  try {
    const [header, ...rest] = fs.readFileSync(path, "utf-8").split("\n").filter((line) => line.trim());
    const columns = header.split(",");
    return rest.map((line) => {
      const values = line.split(",");
      const row: Record<string, string> = {};
      columns.forEach((column, index) => (row[column] = values[index] ?? ""));
      return row as unknown as Receipt;
    });
  } catch {
    return [];
  }
}

const n = (x: number): string => x.toLocaleString("en-US");
const day = (iso: string): string => iso.slice(0, 10);
const minute = (iso: string): string => iso.slice(0, 16).replace("T", " ");
const short = (address: string): string => `${address.slice(0, 8)}…${address.slice(-4)}`;
const usd = (x: number): string => `$${x.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** "5,837 × $5, 700 × $25, 63 × $100" and so on, largest tier last. */
function tierMix(tiers: Record<string, number> | undefined, minimumCount = 10): string {
  if (!tiers) return "";
  return Object.entries(tiers)
    .filter(([, count]) => count >= minimumCount)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([amount, count]) => `${n(count)} at ${usd(Number(amount))}`)
    .join(", ");
}

export function renderConway(points: MoneyPoint[], receipts: Receipt[]): string {
  if (!points.length) {
    return `<section><div class="wrap narrow"><h1 class="ph">The scan has not run yet</h1>
      <p class="sub">It runs daily at 05:00 UTC. The transfers it builds on are
      <a href="https://github.com/matthiashippe/control-plane/tree/main/docs/research/data">in the repository under CC0</a>.</p>
      </div></section>`;
  }
  const last = points[points.length - 1];
  const first = points[0];
  const onlyMinimum = Object.keys(last.topup_tiers_30d ?? {}).length === 1
    && Object.keys(last.topup_tiers_30d)[0] === "5";

  const receiptRows = receipts
    .map(
      (r) =>
        `<tr><td>${esc(minute(r.timestamp_utc))}</td><td><code>${esc(short(r.from))}</code></td>` +
        `<td>$${esc(String(Math.round(Number(r.usdc))))}</td>` +
        `<td><a href="https://basescan.org/tx/${esc(r.tx_hash)}">${esc(r.tx_hash.slice(0, 10))}…</a></td></tr>`,
    )
    .join("");

  const series = points
    .slice()
    .reverse()
    .map(
      (p) =>
        `<tr><td>${esc(day(p.measured_at))}</td><td>${n(p.topups_30d)}</td>` +
        `<td>$${n(Math.round(p.topup_usdc_30d))}</td><td>${n(p.topup_wallets_30d)}</td>` +
        `<td>${n(p.first_time_topup_wallets_30d)}</td>` +
        `<td>${p.pay_endpoint_status === 402 ? "402, still asking" : esc(String(p.pay_endpoint_status ?? "—"))}</td></tr>`,
    )
    .join("");

  return `
  <section>
    <div class="wrap">
      <p class="kicker">Measured daily, not claimed</p>
      <h1 class="ph">People are still paying Conway for credits it cannot deliver</h1>
      <p class="sub">
        Every USDC transfer into Conway's receiving address on Base, scanned daily at 05:00 UTC.
        Conway's sign-up has returned <code>500 Database error</code> for every fresh wallet since
        July 2026, and its payment endpoint has never stopped working. The transfers below are what
        that combination looks like. Data through ${esc(minute(last.data_through))} UTC, under CC0,
        <a href="https://github.com/matthiashippe/control-plane/tree/main/docs/research/data">scripts in the repository</a>.
      </p>

      <div class="stats">
        <div><span class="n bad">$${n(Math.round(last.topup_usdc_30d))}</span><span class="l">paid in over the last 30 days</span></div>
        <div><span class="n">${n(last.topup_wallets_30d)}</span><span class="l">wallets paid it, ${n(last.first_time_topup_wallets_30d)} of them for the first time</span></div>
        <div><span class="n">${n(last.topups_30d)}</span><span class="l">separate purchases, ${last.topups_per_wallet_30d} per wallet</span></div>
        <div><span class="n">$${n(Math.round(last.usdc_total))}</span><span class="l">since 1 February 2026, from ${n(last.wallets_total)} wallets</span></div>
      </div>

      <div class="claims" style="margin-top:1rem">
        <div>
          <span><b>${onlyMinimum
            ? `All ${n(last.topups_30d)} purchases in the last 30 days were the ${usd(5)} minimum tier`
            : `The tier mix in the last 30 days: ${esc(tierMix(last.topup_tiers_30d, 1))}`}</b>
          <span class="w">Across the whole history the mix is ${esc(tierMix(last.topup_tiers_total))}, so people used to choose. Nobody choosing buys the smallest thing on the menu ${n(last.topups_30d)} times in a row. That is what an unattended runtime buying for itself looks like.</span></span>
          <a href="https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md#do-this-first-stop-the-runtime-from-buying-credits-it-will-never-receive">why it buys</a>
        </div>
        <div>
          <span><b>The runtime pays ${usd(5)} at every start, and again every five minutes</b>
          <span class="w">A failed balance call is handled three ways upstream. The thinking path substitutes <code>-1</code>, resolves to tier <code>dead</code> and stops. The startup path substitutes <code>0</code> and buys. The heartbeat substitutes <code>0</code>, reads that as <code>critical</code>, and buys again every five minutes for as long as the wallet holds ${usd(5)}. Only the fallback that costs nothing refuses to act.</span></span>
          <a href="https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md">what to do instead</a>
        </div>
        <div>
          <span><b>${last.pay_endpoint_status === 402
            ? "The payment endpoint was still asking for money at the last scan"
            : `The payment endpoint answered ${esc(String(last.pay_endpoint_status ?? "nothing"))} at the last scan`}</b>
          <span class="w">Checked with a plain <code>GET /pay/5/&lt;address&gt;</code> on every run, which signs nothing and pays nothing: an x402 demand is a 402 with a description of what it wants. ${last.pay_endpoint_status === 402 ? "It still wants 5 USDC." : "That is a change worth reading the raw data for."}</span></span>
          <a href="https://github.com/Conway-Research/automaton/issues/293">the 30 USDC someone lost</a>
        </div>
      </div>

      ${receiptRows
        ? `<h3 style="margin:2.5rem 0 .6rem">The last ${receipts.length} purchases</h3>
      <table>
        <thead><tr><th>when (UTC)</th><th>wallet</th><th>paid</th><th>transaction</th></tr></thead>
        <tbody>${receiptRows}</tbody>
      </table>
      <p class="sub" style="margin-top:1rem">
        Every one of these is a real transfer on Base and every hash goes to a block explorer. What
        none of them bought is an API key.
      </p>`
        : ""}

      <h3 style="margin:2.5rem 0 .6rem">Every scan since ${esc(day(first.measured_at))}</h3>
      <table>
        <thead><tr><th>day</th><th>purchases / 30d</th><th>paid / 30d</th><th>wallets</th><th>first time</th><th>payment endpoint</th></tr></thead>
        <tbody>${series}</tbody>
      </table>
      <p class="sub" style="margin-top:1rem">
        Transfers below the ${usd(5)} minimum tier are counted but not called purchases: ${n(last.dust_transfers_30d)}
        of the ${n(last.transfers_30d)} transfers in this window are dust, worth
        $${(last.usdc_30d - last.topup_usdc_30d).toFixed(2)} together. The history before
        20 September 2026 comes from one full scan of ${n(last.transfers_total)} transfers; every day
        since is scanned forward from the newest block already held.
      </p>
    </div>
  </section>`;
}
