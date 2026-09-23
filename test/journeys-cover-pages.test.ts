/**
 * docs/journeys.md calls itself "the reference the rest of the project is checked against", and it
 * did not know about the page this project added on the night of 2026-09-22.
 *
 * ops/check-journeys.sh already walks it in one direction: every path the document names has to
 * exist. This is the other direction, which is the one that lets a new page go unnoticed: every
 * page the service publishes has to appear in the map of the journeys, or the map is a picture of
 * a smaller service than the one that is running.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { sitemapPages } from "./site-pages.js";

describe("docs/journeys.md", () => {
  it("mentions every page the service publishes", async () => {
    const doc = readFileSync("docs/journeys.md", "utf8");
    for (const path of await sitemapPages(createApp({ db: openDb(":memory:") }))) {
      if (path === "/") continue; // the landing page is the subject of the whole document
      expect(
        doc.includes(path),
        `${path} is published and does not appear in the journeys. Either it is a step somebody ` +
          `walks, and belongs on the map, or it should not be in the sitemap.`,
      ).toBe(true);
    }
  });

  /**
   * The blocked step is the one worth naming out loud. A0.4 needs a form, and form-action 'none'
   * in a locked path refuses every submission; the endpoint behind it has taken form bodies since
   * 2026-09-22. If that word changes, this test should start failing and the document should say
   * "works" instead.
   */
  it("says the same thing about the form as the policy does", () => {
    const doc = readFileSync("docs/journeys.md", "utf8");
    const caddy = readFileSync("deploy/Caddyfile", "utf8");
    // The TABLE ROW, not the first 200 characters after any mention of A0.4.
    //
    // The row is the claim; the prose around it describes how the step got there and is allowed to
    // say "blocked" about the past. On 2026-09-23 the policy opened, the row was changed to
    // "works", and this test stayed red because the paragraph below it begins "What A0.4 cost
    // while it was blocked", which is true and which the old pattern read as the state.
    const row = doc.split("\n").find((l) => l.startsWith("| A0.4 |")) ?? "";
    expect(row, "no A0.4 row in docs/journeys.md at all").not.toBe("");
    const blockedInDoc = /blocked/i.test(row);
    const blockedInPolicy = /form-action 'none'/.test(caddy);
    expect(
      blockedInDoc,
      blockedInPolicy
        ? "the policy still says form-action 'none', so A0.4 has to stay marked blocked"
        : "the policy no longer blocks forms: mark A0.4 as working and set CP_FORM_ON_CHECK=1",
    ).toBe(blockedInPolicy);
  });
});
