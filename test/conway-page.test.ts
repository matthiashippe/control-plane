/**
 * What is still being paid into Conway, as a page.
 *
 * The page exists because the claim under it is the load-bearing one for this whole project: a
 * service that cannot issue an API key still takes money. Until 2026-09-21 that rested on a single
 * scan sitting in a CSV, and a number from one day cannot be told apart from a number that quietly
 * stopped being true.
 *
 * The way it breaks is quiet, in two ways. The scan hands two files into the container after every
 * run, and if that fails the page does not crash, it just stops saying anything. And the numbers it
 * prints have to be the purchases, not the transfers: 18 of the 104 transfers in the first window
 * were dust from two wallets worth five cents together, and counting those as payments was the
 * first thing we published about this.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { readMoneySeries, readReceipts, renderConway } from "../src/public/conway.js";

const POINT = {
  measured_at: "2026-09-21T11:43:32Z",
  data_through: "2026-09-20T19:37:57Z",
  window_from: "2026-08-21T19:37:57Z",
  transfers_30d: 105,
  usdc_30d: 462.048895,
  wallets_30d: 45,
  first_time_wallets_30d: 43,
  payments_per_wallet_30d: 2.33,
  topups_30d: 87,
  topup_usdc_30d: 435,
  topup_wallets_30d: 43,
  first_time_topup_wallets_30d: 41,
  topups_per_wallet_30d: 2.02,
  dust_transfers_30d: 18,
  topup_tiers_30d: { "5": 87 },
  topup_tiers_total: { "5": 5837, "7": 1, "25": 700, "100": 63, "2500": 3 },
  largest_wallet_share_30d: 15.2,
  transfers_total: 9028,
  usdc_total: 62626.135927,
  wallets_total: 2493,
  last_block: 51571865,
  pay_endpoint_status: 402,
};

const RECEIPTS =
  "block,timestamp_utc,from,usdc,tx_hash\n" +
  "51571865,2026-09-20T19:37:57Z,0x80a1557ccd00fd5e51a4263171a9347790bce126,5.000000,0x3dc858addb8e2ab8cb0eb2639d6135954607c89d039b40b53884ecd99a4ff9c1\n" +
  "51543584,2026-09-20T03:55:15Z,0xdea9c332d309ce2003b073aba2c48fd285c36158,5.000000,0xed9eb289dadacf450c8f057ff66822d28e74be890921c8266bb87cb609c9ac16\n";

function withFiles(points: unknown[], receipts = RECEIPTS): { series: string; recent: string } {
  const dir = mkdtempSync(join(tmpdir(), "cp-conway-"));
  const series = join(dir, "conway-money.ndjson");
  const recent = join(dir, "conway-recent.csv");
  writeFileSync(series, points.map((p) => JSON.stringify(p)).join("\n") + "\n");
  writeFileSync(recent, receipts);
  return { series, recent };
}

async function page(points: unknown[], receipts = RECEIPTS): Promise<string> {
  const { series, recent } = withFiles(points, receipts);
  try {
    process.env.CP_CONWAY_SERIES = series;
    process.env.CP_CONWAY_RECEIPTS = recent;
    return await (await createApp({ db: openDb(":memory:") }).request("/conway")).text();
  } finally {
    delete process.env.CP_CONWAY_SERIES;
    delete process.env.CP_CONWAY_RECEIPTS;
    rmSync(series, { force: true });
    rmSync(recent, { force: true });
  }
}

describe("/conway", () => {
  /**
   * The distinction the page exists to keep straight: what arrived is not what was bought, and the
   * headline has to be what was bought.
   *
   * The fixture deliberately carries more dust than production does. With the real five cents,
   * 462.05 and 435.00 both round to the same dollar figure, so swapping one field for the other in
   * the page changed nothing a test could see. That is how this assertion passed against a page
   * printing the wrong number, which was found by breaking it on purpose.
   */
  it("counts purchases, not transfers", async () => {
    const html = await page([POINT]);

    // Each figure is tied to the label it sits under. A bare toContain("43") passed against a page
    // printing 45, because a transaction hash on the same page happens to contain those digits.
    expect(html, "the headline is what was actually bought").toMatch(
      /\$435<\/span><span class="l">paid in over the last 30 days/,
    );
    expect(html, "not what arrived").not.toContain("$462");
    expect(html, "43 wallets bought, 45 sent something").toMatch(
      />43<\/span><span class="l">wallets paid it/,
    );
    expect(html, "87 purchases, not 105 transfers").toMatch(
      />87<\/span><span class="l">separate purchases/,
    );
    expect(html, "the dust is named, with its count").toMatch(/18\s*\n?\s*of the 105 transfers/);
    expect(html, "and with what it is worth, computed rather than copied").toContain("$27.05");
  });

  /**
   * The finding that turns a number into an argument: since the sign-up broke, every purchase is
   * the minimum tier, and it did not use to be. A page that printed the same sentence when the mix
   * changes would be worse than one that printed nothing.
   */
  it("says all purchases were the minimum tier only while that is true", async () => {
    const einheitlich = await page([POINT]);
    expect(einheitlich).toContain("All 87 purchases in the last 30 days were the $5 minimum tier");
    expect(einheitlich, "the historical mix is the contrast that makes it mean something")
      .toContain("5,837 at $5, 700 at $25, 63 at $100");
    expect(einheitlich, "one-off amounts are noise in that sentence").not.toContain("1 at $7");

    const gemischt = await page([{ ...POINT, topup_tiers_30d: { "5": 80, "25": 7 } }]);
    expect(gemischt).not.toContain("were the $5 minimum tier");
    expect(gemischt).toContain("80 at $5, 7 at $25");
  });

  /** A receipt nobody can look up is a claim. Every row carries the full hash to an explorer. */
  it("gives every purchase a transaction a reader can open", async () => {
    const html = await page([POINT]);
    expect(html).toContain(
      'href="https://basescan.org/tx/0x3dc858addb8e2ab8cb0eb2639d6135954607c89d039b40b53884ecd99a4ff9c1"',
    );
    expect(html, "the wallet is shortened, not invented").toContain("0x80a155…e126");
    expect(html).toContain("The last 2 purchases");
  });

  /**
   * The payment endpoint is the other half of the claim, and it is the half that can change
   * without warning. The page must not keep saying "still asking" once it stops.
   */
  it("reports the payment endpoint as it was last measured", async () => {
    expect(await page([POINT])).toContain("still asking for money at the last scan");

    const tot = await page([{ ...POINT, pay_endpoint_status: 503 }]);
    expect(tot, "a changed endpoint must change the sentence").not.toContain("still asking for money");
    expect(tot).toContain("answered 503 at the last scan");
  });

  /**
   * Scoped to the table body on purpose. The first attempt compared positions in the whole page
   * and failed against a correct page, because the heading above the table names the FIRST scan
   * and therefore contains the older date earlier than any row does.
   */
  it("puts the newest scan on top of the series table", async () => {
    const html = await page([
      { ...POINT, measured_at: "2026-09-21T11:00:00Z" },
      { ...POINT, measured_at: "2026-09-22T05:00:00Z" },
    ]);
    const bodies = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((m) => m[1]);
    const series = bodies[bodies.length - 1];
    expect(series.indexOf("2026-09-22")).toBeGreaterThanOrEqual(0);
    expect(series.indexOf("2026-09-22")).toBeLessThan(series.indexOf("2026-09-21"));
  });

  /**
   * The bug that took the page down within a minute of its first deploy. The series is
   * append-only, so a line written before a field existed keeps missing it for good, and the file
   * in production held exactly one such line from the day before.
   */
  it("survives a scan from before the fields it prints existed", async () => {
    const alt = {
      measured_at: "2026-09-20T05:00:00Z",
      data_through: "2026-09-19T14:05:17Z",
      window_from: "2026-08-20T14:05:17Z",
      transfers_30d: 104,
      usdc_30d: 430.048895,
      wallets_30d: 44,
      transfers_total: 9027,
      usdc_total: 62621.135927,
      wallets_total: 2492,
      last_block: 51543584,
    };
    const html = await page([alt, POINT]);

    expect(html, "the newest complete scan still fills the headline").toMatch(
      /\$435<\/span><span class="l">paid in over the last 30 days/,
    );
    expect(html, "the older scan is shown as a row, with a dash where it measured nothing")
      .toMatch(/<td>2026-09-20<\/td><td>—<\/td>/);

    // And with nothing but old-format scans, a sentence instead of a 500.
    const nurAlt = await page([alt]);
    // Matched inside one source line: the sentence wraps in the template, so the full phrase
    // never appears with single spaces in the HTML.
    expect(nurAlt).toContain("1 older scan(s) on file, none of them in a shape");
  });

  it("says the scan has not run rather than showing an empty frame", () => {
    expect(renderConway([], [])).toContain("has not run yet");
    expect(readMoneySeries("/nowhere/at/all.ndjson"), "a missing series is not a 500").toEqual([]);
    expect(readReceipts("/nowhere/at/all.csv"), "missing receipts are not a 500").toEqual([]);
  });

  /** Same reason as /x402: a measurement must not unfurl under the marketplace's headline. */
  it("shares under its own headline and its own card", async () => {
    const html = await (await createApp({ db: openDb(":memory:") }).request("/conway")).text();
    expect(html).toContain('content="https://cp.hippe.eu/og-x402.png"');
    expect(html).not.toContain("/og.png");
    expect(html).toMatch(/og:title" content="People are still paying Conway/);
    expect(html).toContain('href="https://cp.hippe.eu/conway"');
  });
});
