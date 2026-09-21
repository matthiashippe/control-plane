/**
 * A brief, as a reader sees it rather than as it was typed.
 *
 * Briefs arrive hard-wrapped from an editor at some column. Turning every newline into a `<br>`
 * preserved that column faithfully and read terribly: the column the text was wrapped at is not
 * the column the page renders at, so every source line wrapped a second time. On /jobs on
 * 2026-09-21 one sentence about the fabrication check arrived in four ragged pieces, broken
 * mid-clause twice, and nothing was wrong with the data.
 *
 * Dropping every break is worse in the other direction, so the rule is: a line that reached the
 * paragraph's wrap column was ended by the wrapper and joins the next one; a line that stopped
 * well short of it was ended by the writer and keeps its break.
 */
import { describe, expect, it } from "vitest";
import { briefHtml } from "../src/public/brief.js";

describe("briefHtml", () => {
  it("joins lines the wrapper broke, so a sentence arrives as a sentence", () => {
    const brief = [
      "POST /v1/check takes a briefing and a submission and answers with every claim in the",
      "submission that the briefing does not support. Each finding carries the exact sentence it",
      "came from.",
    ].join("\n");
    const html = briefHtml(brief);
    expect(html, "the wrapper's breaks are not the writer's").not.toContain("<br>");
    expect(html).toContain("every claim in the submission that the briefing");
    expect(html).toContain("the exact sentence it came from.");
  });

  it("keeps a break the writer meant", () => {
    // Three rules, one per line, none of them near the wrap column of the paragraph above them.
    const brief = [
      "Do not use the words platform, seamless or revolutionary anywhere in the delivered text at",
      "all.",
      "No lists of three.",
      "No exclamation marks.",
    ].join("\n");
    const html = briefHtml(brief);
    expect(html, "a short line ended on purpose keeps its break").toContain("No lists of three.<br>");
    expect(html).toContain("No exclamation marks.");
    // And the wrapped first line still joins its continuation.
    expect(html).toContain("in the delivered text at all.");
  });

  it("separates paragraphs on blank lines, because nobody types those by accident", () => {
    const html = briefHtml("First paragraph.\n\nSecond paragraph.");
    expect(html).toBe("<p>First paragraph.</p><p>Second paragraph.</p>");
  });

  it("treats every break as meant when the paragraph is too narrow to have a wrap column", () => {
    const html = briefHtml("red\ngreen\nblue");
    expect(html).toBe("<p>red<br>green<br>blue</p>");
  });

  /** The reason this function exists at all: not one character of a brief may become markup. */
  it("lets no character of a brief become markup", () => {
    const html = briefHtml('<script>alert(1)</script>\n\n"quoted" & <b>bold</b>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
});
