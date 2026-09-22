/**
 * The measurement, as a page that earns a link.
 *
 * This is the only thing here nobody else has: both public x402 directories scanned daily, raw
 * data under CC0. Until 2026-09-21 it was a directory of CSV files in the repository, which is
 * invisible. A link that earns a link has to be a page.
 *
 * The way it breaks is quiet. The series is handed into the container by the scan script after
 * every run; if that hand-off fails, the page does not crash, it simply says nothing and nobody
 * notices that the one asset built to bring people here stopped saying anything.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { readSeries, renderX402 } from "../src/public/x402.js";

const PUNKT = {
  stichtag: "2026-09-21T04:40:36Z",
  dienste_gesamt: 21790,
  urls_eindeutig: 20789,
  dienste_cdp: 15192,
  dienste_payai: 6598,
  anbieter: 2639,
  aufrufe_30d: 867813,
  aufrufe_median: 2,
  anteil_top10: 76.35,
  anteil_top100: 88.8,
  mit_einem_zahler: 10561,
  mit_5_zahlern: 1042,
  mit_20_zahlern: 133,
  mit_100_zahlern: 40,
  ohne_nachfragedaten: 65,
  groesster_dienst: "https://blockrun.ai/api/v1/chat/completions",
  groesster_aufrufe: 346869,
  groesster_zahler: 182,
  groesster_anteil: 39.97,
};

function withSeries(punkte: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "cp-x402-"));
  const path = join(dir, "x402.ndjson");
  writeFileSync(path, punkte.map((p) => JSON.stringify(p)).join("\n") + "\n");
  return path;
}

describe("the direction of a number that moves", () => {
  it("says which way the count without demand data went, from the data", async () => {
    // The page said "and that number climbs" from the day it was built. On 2026-09-22 the series
    // read 42, 65, 46: the sentence was still there and the number was falling. A phrase that
    // asserts a direction has to be computed or it ages into a lie, and this one sits next to the
    // argument that every total on the page is a floor.
    const punkt = (stichtag: string, ohne: number) => ({
      ...PUNKT,
      stichtag,
      ohne_nachfragedaten: ohne,
    });

    const faellt = renderX402([punkt("2026-09-21T04:40:00Z", 65), punkt("2026-09-22T04:40:00Z", 46)]);
    expect(faellt).toContain("down from 65 yesterday");
    expect(faellt, "the old unconditional claim is gone").not.toContain("that number climbs");

    const steigt = renderX402([punkt("2026-09-21T04:40:00Z", 42), punkt("2026-09-22T04:40:00Z", 65)]);
    expect(steigt).toContain("up from 42 yesterday");

    const gleich = renderX402([punkt("2026-09-21T04:40:00Z", 50), punkt("2026-09-22T04:40:00Z", 50)]);
    expect(gleich, "no movement, no claim about movement").not.toMatch(/up from|down from/);

    const allein = renderX402([punkt("2026-09-22T04:40:00Z", 46)]);
    expect(allein, "one point is no direction").not.toMatch(/up from|down from/);
  });
});

describe("what the totals did since the scan before", () => {
  /**
   * The page called its totals "a floor, not a count" while its own table showed them falling.
   *
   * On 2026-09-22 the series read 490,044 / 867,813 / 802,808 calls: a drop of 7.5 per cent in a
   * day, three lines under a sentence saying the numbers could only be too low. Coinbase's demand
   * figure is a trailing 30-day window, so it falls whenever the days leaving the back outweigh
   * the days arriving at the front. The page prints the movement now, and printing it is the only
   * way it cannot contradict the table.
   */
  it("prints the movement instead of asserting a direction", () => {
    const punkt = (stichtag: string, aufrufe: number) => ({ ...PUNKT, stichtag, aufrufe_30d: aufrufe });

    const gefallen = renderX402([punkt("2026-09-21T04:40:00Z", 867813), punkt("2026-09-22T04:40:00Z", 802808)]);
    expect(gefallen.replace(/\s+/g, " ")).toContain("802,808 calls today against 867,813 on 2026-09-21");
    expect(gefallen, "the claim that could only ever be too low is gone").not.toContain("floor, not a count");

    const gestiegen = renderX402([punkt("2026-09-21T04:40:00Z", 490044), punkt("2026-09-22T04:40:00Z", 867813)]);
    expect(gestiegen.replace(/\s+/g, " ")).toContain("867,813 calls today against 490,044 on 2026-09-21");

    const gleich = renderX402([punkt("2026-09-21T04:40:00Z", 500), punkt("2026-09-22T04:40:00Z", 500)]);
    expect(gleich.replace(/\s+/g, " "), "no movement is also a reading").toContain("unchanged since 2026-09-21");

    const allein = renderX402([punkt("2026-09-22T04:40:00Z", 802808)]);
    expect(allein.replace(/\s+/g, " "), "one point is no series").toContain("one scan is a reading, not a series");
  });
});

describe("/x402", () => {
  it("leads with the numbers a reader came for", async () => {
    const path = withSeries([{ ...PUNKT, stichtag: "2026-09-20T10:24:18Z", aufrufe_30d: 490044, anteil_top10: 58.75 }, PUNKT]);
    try {
      process.env.CP_X402_SERIES = path;
      const html = await (await createApp({ db: openDb(":memory:") }).request("/x402")).text();

      expect(html).toContain("20,789");
      expect(html).toContain("867,813");
      expect(html).toContain("76.35%");
      // The share with a single paying wallet is computed, not copied: 10,561 of 15,192 minus 65.
      expect(html, "10561 / (15192 - 65)").toContain("69.8%");
      // Both scans are in the table, newest first.
      expect(html.indexOf("2026-09-21")).toBeLessThan(html.indexOf("2026-09-20"));
      // And what the late filling really costs: coverage, not a floor. The page claimed the
      // totals were "a floor, not a count" while its own table showed them falling by 7.5 per
      // cent in a day. A trailing 30-day window drops whenever the days leaving the back outweigh
      // the days arriving at the front, which is not evidence about late filling at all.
      expect(html, "what the missing fields actually cost is coverage").toMatch(
        /covers only the [\d,]+ of [\d,]+ services/,
      );
      expect(html.replace(/\s+/g, " "), "and the window is named as a window").toContain(
        "one day's reading of a trailing 30-day window",
      );
      expect(html, "the raw data has to be one click away or the page is a claim").toContain("docs/research/data");
    } finally {
      delete process.env.CP_X402_SERIES;
      rmSync(path, { force: true });
    }
  });

  it("says the scan has not run rather than showing an empty frame", () => {
    expect(renderX402([])).toContain("has not run yet");
    expect(readSeries("/nowhere/at/all.ndjson"), "a missing series is not a 500").toEqual([]);
  });

  /**
   * The data page is the link meant to travel, so it must not travel under the market's headline.
   *
   * Until 2026-09-21 every page inherited the landing page's card, which says "post the job,
   * agents compete". A link to a measurement that unfurls as an advertisement for a marketplace
   * argues the wrong point in the thread where it lands.
   */
  it("shares under its own headline and its own card", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const html = await (await app.request("/x402")).text();

    expect(html).toContain('content="https://cp.hippe.eu/og-x402.png"');
    expect(html, "the landing page's card must not follow it").not.toContain("/og.png");
    expect(html).toMatch(/og:title" content="How big the paid-API market/);
    expect(html).toMatch(/og:url" content="https:\/\/cp\.hippe\.eu\/x402"/);
    expect(html).toMatch(/canonical" href="https:\/\/cp\.hippe\.eu\/x402"/);

    const bild = await app.request("/og-x402.png");
    expect(bild.status).toBe(200);
    expect(bild.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array(await bild.arrayBuffer()).slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("is reachable from the landing page and from llms.txt", async () => {
    const app = createApp({ db: openDb(":memory:") });
    expect(await (await app.request("/")).text()).toContain('href="/x402"');
    expect(await (await app.request("/llms.txt")).text()).toContain("/x402");
  });
});
