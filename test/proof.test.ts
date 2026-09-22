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
  "eighteen", "nineteen", "twenty", "twenty-one", "twenty-two", "twenty-three", "twenty-four",
  "twenty-five", "twenty-six", "twenty-seven", "twenty-eight", "twenty-nine", "thirty"];

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
      // Only that agent's own row. Searching the whole page would pass on any run's numbers
      // appearing anywhere, which is how a page once "contained" a figure that was part of a
      // transaction hash.
      //
      // The rows are cut out first, rather than searching from the name. On 2026-09-22 a CSS
      // comment in the same file quoted `>klaus<` while explaining this very test, that comment
      // stands four hundred lines above the markup, and the slice then ran from the comment to the
      // next `</div>` and contained no number at all. A test that can be fooled by a comment about
      // itself is measuring the file, not the page.
      const zeilen = [...html.matchAll(/<div class="run">([\s\S]*?)<\/div>/g)].map((m) => m[0]);
      const zeile = zeilen.find((z) => z.includes(`>${e.agent}<`)) ?? "";
      expect(zeile, `${e.agent} has no run row on the page any more`).not.toBe("");
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

  /**
   * The headline counts the whole run, not the market that flatters it most.
   *
   * It read "Twelve invented claims in three answers" and twelve is the Austin brief, the highest
   * of three: the file it links carries 23 findings over nine answers, and the factual brief,
   * which is the case the product argument rests on, found four. An adversarial read got there by
   * clicking the link under the block (B10).
   *
   * Two words also had to go. Every finding in that file is classified `unbelegt`, and `/post`
   * defines unsupported as "the brief simply does not contain it", which is not the same as
   * invented; `/bounties.json` says in its own note that on creative work the check is a list to
   * confirm and not a gate. So the page uses the check's word and says which brief is which.
   */
  it("counts every finding the check made, across all three briefs", async () => {
    const html = await seite();
    const gesamt = daten.maerkte.reduce(
      (s, m) => s + m.einreichungen.reduce((t, e) => t + e.befunde.length, 0), 0);
    const antworten = daten.maerkte.reduce((s, m) => s + m.einreichungen.length, 0);
    const wort = ZAHLWORT[gesamt];
    expect(wort, `${gesamt} findings is outside the range this test can spell`).toBeTruthy();
    const h2 = html.slice(html.indexOf('id="proof"'), html.indexOf("</h2>", html.indexOf('id="proof"')));
    expect(h2.toLowerCase(), `the check made ${gesamt} findings across ${antworten} answers`)
      .toContain(wort);
    expect(h2.toLowerCase(), "and the number of answers they came from").toContain(ZAHLWORT[antworten]);

    // The block that follows shows one of the three briefs, so it has to say so and say what the
    // other kind found. Selecting is fine; selecting in silence is what the finding was about.
    const block = html.slice(html.indexOf('id="proof"'), html.indexOf("</section>", html.indexOf('id="proof"')));
    const schoepferisch = daten.maerkte.find((m) => m.auftragspreis === "5.00 USD")!;
    const faktisch = daten.maerkte.find((m) => m.auftragsart === "faktisch")!;
    const nFak = faktisch.einreichungen.reduce((t, e) => t + e.befunde.length, 0);
    expect(block.toLowerCase(), "the shown brief is named").toContain(schoepferisch.markt.toLowerCase());
    expect(block.toLowerCase(), `the factual brief found ${nFak}, and that belongs next to it`)
      .toContain(ZAHLWORT[nFak]);
  });

  it("uses the word the check uses, and not a stronger one", async () => {
    const html = await seite();
    const block = html.slice(html.indexOf('id="proof"'), html.indexOf("</section>", html.indexOf('id="proof"')));
    const arten = new Set(
      daten.maerkte.flatMap((m) => m.einreichungen.flatMap((e) => e.befunde.map((b) => b.art))),
    );
    expect(arten, "the run classified everything as unsupported").toEqual(new Set(["unbelegt"]));
    expect(block.toLowerCase(), "so the page says unsupported").toContain("unsupported");
    for (const stark of ["invented", "made up", "fabricated", "a lie"]) {
      expect(block.toLowerCase(), `"${stark}" is a harder claim than the data carries`).not.toContain(stark);
    }
  });

  it("quotes something an agent really wrote and the check really flagged", async () => {
    const html = await seite();
    const zitate = daten.maerkte.flatMap((m) => m.einreichungen.flatMap((e) => e.befunde.map((b) => b.zitat)));
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
