import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

/**
 * The move from Conway, first on the start page (goals/seite/02).
 *
 * Operators arrive on / from our answers in Conway issues with an automaton that stopped thinking. The page used to show them
 * the one line and the one command only in a block at its end, behind the whole buyer's argument. The SOLL pictures of seite 01
 * (docs/soll/startseite-390.png and -1440.png) put that block first, above the catalogue for people, and these tests pin what
 * the pictures cannot: the order for every browser language, the address of the request, and the control mark of ops/depth.sh.
 */

async function home(lang = "en-US,en;q=0.9"): Promise<string> {
  const app = createApp({ db: openDb(":memory:") });
  const res = await app.request("/", { headers: { "accept-language": lang } });
  expect(res.status).toBe(200);
  return res.text();
}

function moveBlock(html: string): string {
  const start = html.indexOf('<section class="hero" id="umzug"');
  expect(start, "the move block is missing").toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
}

describe("the start page leads with the move from Conway", () => {
  let before: string | undefined;
  beforeEach(() => {
    before = process.env.CP_PUBLIC_URL;
  });
  afterEach(() => {
    if (before === undefined) delete process.env.CP_PUBLIC_URL;
    else process.env.CP_PUBLIC_URL = before;
  });

  it("puts the move before the catalogue for people and that before the agent path, for an English browser", async () => {
    const html = await home();
    const move = html.indexOf('id="umzug"');
    const human = html.indexOf('class="human"');
    const agents = html.indexOf('id="fuer-agenten"');
    expect(move, "the move block is missing").toBeGreaterThan(-1);
    expect(human, "the catalogue for people is missing").toBeGreaterThan(-1);
    expect(agents, "the agent path is missing").toBeGreaterThan(-1);
    expect(move, "the move comes first").toBeLessThan(human);
    expect(human, "the catalogue for people stays above the agent path").toBeLessThan(agents);
  });

  it("keeps the same order for a German browser, because the move is English for everybody", async () => {
    // goals/seite/ANNAHMEN.md (seite 01): readers from Conway issues write English, so germanFirstScreen leaves the block
    // alone and it stays above the German first screen.
    const html = await home("de-DE,de;q=0.9");
    const move = html.indexOf('id="umzug"');
    const human = html.indexOf('class="human"');
    const agents = html.indexOf('id="fuer-agenten"');
    expect(move, "the move block is missing for a German browser").toBeGreaterThan(-1);
    expect(human).toBeGreaterThan(-1);
    expect(agents).toBeGreaterThan(-1);
    expect(move, "the move comes first for a German browser too").toBeLessThan(human);
    expect(human).toBeLessThan(agents);
    expect(moveBlock(html), "the move block is not translated").toContain("Conway not answering?");
  });

  it("shows the line, the command and the way to every step with the address of the request", async () => {
    process.env.CP_PUBLIC_URL = "https://postyourprice.com";
    const block = moveBlock(await home());
    expect(block).toContain("conwayApiUrl");
    expect(block, "the address the reader puts in is the one they came to").toContain("https://postyourprice.com");
    expect(block, "and not the old host name").not.toContain("cp.hippe.eu");
    expect(block).toContain("automaton --provision");
    expect(block).toContain('href="/fix"');
  });

  it("has no second agent block left at the end of the page", async () => {
    const html = await home();
    // The block at the end moved up; two copies of the config line would drift apart the way /llms.txt and README did.
    expect(html).not.toMatch(/\sid=["']agents["']/);
    expect(html.match(/automaton --provision/g)?.length, "the command stands once on the page").toBe(1);
  });

  it("keeps the control mark of ops/depth.sh inside the move block, the first screen on every width", async () => {
    const html = await home();
    const start = html.indexOf('id="umzug"');
    const end = html.indexOf("</section>", start);
    const top = html.indexOf("/px/top.png");
    expect(top, "the control mark is gone").toBeGreaterThan(-1);
    expect(top, "the control mark has to come after the start of the move block").toBeGreaterThan(start);
    expect(top, "and before its </section>").toBeLessThan(end);
    expect(html.match(/\/px\/top\.png/g)?.length, "one control, not two").toBe(1);
  });
});
