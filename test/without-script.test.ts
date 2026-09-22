/**
 * What the page says when its one script does not run.
 *
 * Measured against the live page on 2026-09-23: the inline script fills six ids and a table body,
 * and without it a reader saw "checking", three "…" and an empty price table, for good. A script
 * blocker, a text browser and any crawler that does not render all land there. The prices are the
 * one thing in that panel somebody opens it for.
 *
 * The script is deliberately untouched, so its CSP hash in deploy/Caddyfile stays valid. It
 * overwrites all of this on load, which is right: its numbers are fresher. This holds what stands
 * there until it does.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

const CATALOG = {
  listModels: () => ({
    data: [
      { id: "gpt-5.2", upstream_model: "openai/gpt-5.2", pricing: { input_per_million: 2.275, output_per_million: 18.2 } },
      { id: "openai/gpt-5.2", upstream_model: "openai/gpt-5.2", pricing: { input_per_million: 2.275, output_per_million: 18.2 } },
      { id: "gpt-5-mini", upstream_model: "openai/gpt-5-mini", pricing: { input_per_million: 0.325, output_per_million: 2.6 } },
    ],
  }),
};

function app() {
  return createApp({
    db: openDb(":memory:"),
    catalog: CATALOG as never,
    pay: { payTo: "0x" + "1".repeat(40), tiers: [5, 25, 100] } as never,
  });
}

describe("The landing page without its script", () => {
  it("shows the prices instead of three dots and an empty table", async () => {
    const html = await (await app().request("/")).text();
    expect(html, "the model id belongs in the table").toContain("openai/gpt-5.2");
    expect(html, "and its alias beside it").toContain("gpt-5-mini");
    expect(html, "the input price, rendered not fetched").toContain("$2.275");
    expect(html, "and the output price").toContain("$18.200");
    expect(html, "an empty tbody is what this replaced").not.toMatch(/<tbody><\/tbody>/);
  });

  it("counts the models and names the version and the tiers", async () => {
    const html = await (await app().request("/")).text();
    // Two ids collapse onto one upstream model, so the count is 2 and not 3.
    expect(html).toMatch(/<span id="s-models">2<\/span>/);
    expect(html).toMatch(/<span id="s-version">[0-9]+\.[0-9]+\.[0-9]+<\/span>/);
    expect(html).toMatch(/<span id="s-tiers">5, 25, 100<\/span>/);
    expect(html, "the placeholders are gone").not.toMatch(/<span id="s-models">&hellip;<\/span>/);
  });

  it("says out loud that the one client-side line is not running", async () => {
    const html = await (await app().request("/")).text();
    const at = html.indexOf('id="s-health"');
    expect(at).toBeGreaterThan(-1);
    const after = html.slice(at, at + 260);
    expect(after, "checking forever is a lie when nothing is checking").toContain("<noscript>");
    expect(after).toMatch(/needs the page script/i);
  });

  it("leaves the pinned script alone, because deploy/ is locked", async () => {
    const html = await (await app().request("/")).text();
    // The hash in deploy/Caddyfile covers exactly this text. Changing a character of it takes the
    // whole page down to a CSP error, and deploy/** is not touched without a human.
    expect(html).toMatch(/const set = \(id, v\) =>/);
    expect(html).toMatch(/set\("s-models", s\.models\.length\)/);
  });
});
