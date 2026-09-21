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
      // And the finding that makes every total a floor.
      expect(html).toContain("floor, not a count");
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

  it("is reachable from the landing page and from llms.txt", async () => {
    const app = createApp({ db: openDb(":memory:") });
    expect(await (await app.request("/")).text()).toContain('href="/x402"');
    expect(await (await app.request("/llms.txt")).text()).toContain("/x402");
  });
});
