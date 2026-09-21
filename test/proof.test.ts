/**
 * The proof section on the landing page, against the data it is a summary of.
 *
 * "What came back. Our own run, 20 September 2026" is the only thing on that page that is not a
 * claim, and it names six numbers and one quote. The raw run is in the repository under CC0, the
 * page links to it, and the article going out sends readers there. So a reader can check these,
 * and until now nothing on this side did.
 *
 * That matters more than it sounds. The landing page was rewritten twice on 2026-09-21, and every
 * other rewrite that day left something behind: /llms.txt kept the old headline, og.png kept the
 * old card, README and docs/bounties.md kept a promise the service does not make. A number in the
 * proof section that survived a rewrite by a digit would be the same failure on the one part of
 * the page that exists to be checkable.
 *
 * Pinned as a derivation, not as strings: every figure is computed from the file and then looked
 * for next to the agent it belongs to. Reworded prose keeps passing, a moved decimal does not.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

interface Einreichung {
  agent: string;
  sekunden: number;
  verkauf_usd: number;
  befunde: { zitat: string }[];
}
interface Markt {
  markt: string;
  auftragspreis: string;
  einreichungen: Einreichung[];
}

const daten = JSON.parse(
  readFileSync("docs/research/data/2026-09-20-auftragstest.json", "utf-8"),
) as { maerkte: Markt[] };

/** The one the page shows: "One $5 brief. Three answers." */
const markt = daten.maerkte.find((m) => m.auftragspreis === "5.00 USD");

const ZAHLWORT = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen", "twenty"];

describe("the proof on the landing page", () => {
  const seite = async (): Promise<string> =>
    (await createApp({ db: openDb(":memory:") }).request("/")).text();

  it("has a run to be about", () => {
    expect(markt, "no 5.00 USD market in the run the page summarises").toBeTruthy();
    expect(markt!.einreichungen).toHaveLength(3);
  });

  it("gives each agent the seconds and the cents that agent actually cost", async () => {
    const html = await seite();
    for (const e of markt!.einreichungen) {
      const wo = html.indexOf(`>${e.agent}<`);
      expect(wo, `${e.agent} is not on the page any more`).toBeGreaterThan(-1);
      // Only that agent's own row. Searching the whole page would pass on any run's numbers
      // appearing anywhere, which is how a page once "contained" a figure that was part of a
      // transaction hash.
      const zeile = html.slice(wo, html.indexOf("</div>", wo));
      expect(zeile, `${e.agent} took ${e.sekunden} s in the data`).toContain(`${e.sekunden}`);
      const cent = (e.verkauf_usd * 100).toFixed(1);
      expect(zeile, `${e.agent} cost ${cent} cents in the data`).toContain(cent);
    }
  });

  it("draws the bars in proportion to the seconds they stand for", async () => {
    const html = await seite();
    // The bars are the only part of the proof a reader takes in without reading, so a set of
    // numbers changed without them is a chart that contradicts its own labels. Pinned loosely on
    // purpose: the widths are scaled so the longest does not touch the edge, and that is design,
    // not data. What must hold is the ratio between them.
    const breiten = [...html.matchAll(/\.f(\d)\s*\{\s*transform:\s*scaleX\(([\d.]+)\)/g)]
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((m) => Number(m[2]));
    expect(breiten, "the three bars are not in the stylesheet any more").toHaveLength(3);

    const sekunden = markt!.einreichungen.map((e) => e.sekunden);
    const laengste = Math.max(...sekunden);
    const breiteste = Math.max(...breiten);
    for (let i = 0; i < 3; i++) {
      const soll = sekunden[i] / laengste;
      const ist = breiten[i] / breiteste;
      expect(
        Math.abs(ist - soll),
        `bar ${i + 1} is ${(ist * 100).toFixed(0)} per cent of the longest while its agent took ` +
          `${(soll * 100).toFixed(0)} per cent of the longest time`,
      ).toBeLessThan(0.1);
    }
  });

  it("counts every invented claim the check found, and no more", async () => {
    const html = await seite();
    const gesamt = markt!.einreichungen.reduce((s, e) => s + e.befunde.length, 0);
    const wort = ZAHLWORT[gesamt];
    expect(wort, `${gesamt} findings is outside the range this test can spell`).toBeTruthy();
    const h2 = html.slice(html.indexOf('id="proof"'), html.indexOf("</h2>", html.indexOf('id="proof"')));
    expect(h2.toLowerCase(), `the check found ${gesamt} invented claims across the three answers`)
      .toContain(wort);
  });

  it("quotes something an agent really wrote and the check really flagged", async () => {
    const html = await seite();
    const zitate = markt!.einreichungen.flatMap((e) => e.befunde.map((b) => b.zitat));
    const block = html.slice(html.indexOf('id="proof"'), html.indexOf("</section>", html.indexOf('id="proof"')));
    const gezeigt = [...block.matchAll(/<blockquote>&ldquo;([^&]+)&rdquo;<\/blockquote>/g)].map((m) => m[1]);
    expect(gezeigt.length, "the proof section shows no quote any more").toBeGreaterThan(0);
    for (const q of gezeigt) {
      expect(
        zitate.some((z) => z.includes(q)),
        `"${q}" is on the page but no agent in the run wrote it`,
      ).toBe(true);
    }
  });
});
