/**
 * The measurement of the x402 market, as a page that updates itself.
 *
 * This is the one thing here that nobody else has: both public directories scanned every day at
 * 04:40 UTC, with the raw CSV kept for sixty days, under CC0. Until 2026-09-21 it lived as files
 * in `docs/research/data/`, which means it was invisible: a link that earns a link has to be a
 * page, not a repository directory.
 *
 * It is also the most honest kind of marketing this project can do. The numbers are unflattering
 * to everybody selling in this space, us included, and the page says so. What it buys is a reason
 * for somebody to point at us that is not "look at my startup".
 *
 * The series is handed into the container by `ops/x402-series.sh` after each scan, because it
 * lives outside the repo directory that `deploy/rollout.sh` mirrors with --delete, and adding a
 * bind mount would mean touching `deploy/**`, which is not done without a human.
 */
import fs from "node:fs";
import { esc } from "./market.js";

export interface X402Point {
  stichtag: string;
  urls_eindeutig: number;
  dienste_cdp: number;
  dienste_payai: number;
  anbieter: number;
  aufrufe_30d: number;
  aufrufe_median: number;
  anteil_top10: number;
  anteil_top100: number;
  mit_einem_zahler: number;
  mit_5_zahlern: number;
  mit_20_zahlern: number;
  mit_100_zahlern: number;
  ohne_nachfragedaten?: number;
  groesster_dienst?: string | null;
  groesster_aufrufe?: number;
  groesster_zahler?: number;
  groesster_anteil?: number;
}

/** Reads the series the scan hands over. Missing or broken is not an error worth a 500. */
export function readSeries(path = process.env.CP_X402_SERIES || "/data/x402.ndjson"): X402Point[] {
  try {
    return fs
      .readFileSync(path, "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as X402Point);
  } catch {
    return [];
  }
}

const n = (x: number): string => x.toLocaleString("en-US");
const day = (iso: string): string => iso.slice(0, 10);

export function renderX402(points: X402Point[]): string {
  if (!points.length) {
    return `<section><div class="wrap narrow"><h1 class="ph">The scan has not run yet</h1>
      <p class="sub">It runs daily at 04:40 UTC. The raw data is
      <a href="https://github.com/matthiashippe/control-plane/tree/main/docs/research/data">in the repository under CC0</a>.</p>
      </div></section>`;
  }
  const last = points[points.length - 1];
  const first = points[0];
  const withDemand = last.dienste_cdp - (last.ohne_nachfragedaten ?? 0);
  const shareWithOnePayer = ((last.mit_einem_zahler / withDemand) * 100).toFixed(1);

  // Which way the count of entries without demand data is going, taken from the data rather than
  // written down once. It said "and that number climbs" from the day the page was built. On
  // 2026-09-22 it had gone 42, 65, 46: the sentence was still there and the number was falling.
  //
  // A phrase that asserts a direction has to be computed or it is a guess that ages into a lie,
  // and this one sits next to the argument that every total here is a floor.
  // What the totals did since the scan before, for the same reason.
  //
  // The page said "every total here is a floor, not a count", and three lines under that sentence
  // its own table showed the totals falling: 867,813 calls on 21 September against 802,808 on the
  // 22nd, and the largest service down from 346,869 to 275,522. A floor does not fall. An
  // adversarial read on 2026-09-22 found it (B1) by clicking the link the article itself gives.
  //
  // The claim was wrong rather than out of date. Coinbase's demand figure is a trailing 30-day
  // window, so it drops whenever the days falling off the back outweigh the days arriving at the
  // front; that is the normal behaviour of a window and says nothing about late filling. What late
  // filling really costs is coverage: a service whose fields are still empty is in no demand total
  // at all. So the page now says that, and prints the movement instead of asserting a direction.
  const previousPoint = points.length > 1 ? points[points.length - 2] : undefined;
  const movement =
    previousPoint === undefined
      ? "one scan is a reading, not a series"
      : previousPoint.aufrufe_30d === last.aufrufe_30d
        ? `unchanged since ${esc(day(previousPoint.stichtag))}`
        : `${n(last.aufrufe_30d)} calls today against ${n(previousPoint.aufrufe_30d)} on ${esc(day(previousPoint.stichtag))}`;

  const withoutBefore = points.length > 1 ? points[points.length - 2].ohne_nachfragedaten : undefined;
  const withoutNow = last.ohne_nachfragedaten;
  const direction =
    withoutBefore === undefined || withoutNow === undefined || withoutBefore === withoutNow
      ? ""
      : withoutNow > withoutBefore
        ? `, up from ${n(withoutBefore)} yesterday`
        : `, down from ${n(withoutBefore)} yesterday`;

  const rowsHtml = points
    .slice()
    .reverse()
    .map(
      (p) =>
        `<tr><td>${esc(day(p.stichtag))}</td><td>${n(p.urls_eindeutig)}</td><td>${n(p.aufrufe_30d)}</td>` +
        `<td>${p.anteil_top10}%</td><td>${n(p.ohne_nachfragedaten ?? 0)}</td>` +
        `<td>${p.groesster_dienst ? esc(p.groesster_dienst.replace(/^https?:\/\//, "").slice(0, 44)) : "—"}</td></tr>`,
    )
    .join("");

  return `
  <section>
    <div class="wrap">
      <p class="kicker">Measured daily, not claimed</p>
      <h1 class="ph">How big the paid-API market for agents actually is</h1>
      <p class="sub">
        Both public x402 directories, scanned every day at 04:40 UTC. Coinbase publishes a demand
        figure per service, which is rare enough to be worth keeping: calls in the last 30 days and
        distinct paying wallets. Everything below re-runs from
        <a href="https://github.com/matthiashippe/control-plane/tree/main/docs/research/data">scripts in the repository</a>,
        under CC0, without a key. Last scan ${esc(day(last.stichtag))}.
      </p>

      <div class="stats">
        <div><span class="n">${n(last.urls_eindeutig)}</span><span class="l">distinct paid services, behind ${n(last.anbieter)} providers</span></div>
        <div><span class="n">${n(last.aufrufe_30d)}</span><span class="l">calls paid for across all of them in 30 days</span></div>
        <div><span class="n bad">${last.anteil_top10}%</span><span class="l">of those calls go to the ten largest services</span></div>
        <div><span class="n bad">${n(last.mit_20_zahlern)}</span><span class="l">services have twenty or more paying wallets a month</span></div>
      </div>

      <div class="claims" style="margin-top:1rem">
        <div>
          <span><b>${shareWithOnePayer}% of services with published demand had exactly one paying wallet</b>
          <span class="w">${n(last.mit_einem_zahler)} of ${n(withDemand)}. A market does not consist of that many services with one payer each. What it looks like instead is a lot of people testing their own deployment.</span></span>
          <a href="https://github.com/matthiashippe/control-plane/tree/main/docs/research/data">the raw scan</a>
        </div>
        <div>
          <span><b>The median paid service is called ${last.aufrufe_median} times a month</b>
          <span class="w">Supply is essentially free and demand is the entire problem. Any number in this space that counts services, listings or integrations is counting the cheap half.</span></span>
          <a href="/">what we built instead</a>
        </div>
        <div>
          <span><b>${n(last.ohne_nachfragedaten ?? 0)} entries carry no demand data at all${direction}</b>
          <span class="w">Coinbase fills those fields in late, so every demand figure on this page
          covers only the ${n(withDemand)} of ${n(last.dienste_cdp)} services in this scan that have them.
          The largest single service is ${n(last.groesster_aufrufe ?? 0)} calls,
          ${last.groesster_anteil}% of everything, and on 20 September that same service sat in the
          directory with its demand fields empty. The totals are one day's reading of a trailing
          30-day window and not a running count, so they move both ways: ${movement}.</span></span>
          <a href="https://github.com/matthiashippe/control-plane/tree/main/docs/research/data">check it</a>
        </div>
      </div>

      <h3 style="margin:2.5rem 0 .6rem">Every scan since ${esc(day(first.stichtag))}</h3>
      <div class="scroll-x"><table>
        <thead><tr><th>day</th><th>services</th><th>calls / 30d</th><th>top ten</th><th>no demand data</th><th>largest service</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>
      <p class="sub" style="margin-top:1rem">
        The series is kept for good and the raw CSV of each day for sixty. If you want the whole
        thing, take it: CC0, no attribution required, no key, no rate limit worth mentioning.
      </p>
    </div>
  </section>`;
}
