/**
 * A brief, as a reader sees it rather than as it was typed.
 *
 * Briefs arrive hard-wrapped, because they are written in an editor at some column and handed in
 * as plain text. Turning every newline in them into a `<br>` preserves that column faithfully and
 * reads terribly: the column the text was wrapped at is not the column the page renders at, so
 * every source line wraps a second time and a sentence arrives in three ragged pieces. On /jobs on
 * 2026-09-21 a single sentence about the fabrication check broke across four lines, mid-clause
 * twice.
 *
 * Dropping the breaks entirely is worse in the other direction: a brief that lists its rules one
 * per line ("No lists of three." on its own) would be run together into a paragraph.
 *
 * So a break is kept when it was meant and dropped when it was the wrapper's. A line that reached
 * the paragraph's wrap column was ended by the wrapper; a line that stopped well short of it was
 * ended by the writer. Blank lines always separate paragraphs, because nobody produces those by
 * accident.
 */
import { esc } from "./market.js";

/** How far short of the longest line a line may stop and still count as wrapped, not ended. */
const TOLERANCE = 12;
/** Below this, a paragraph has no reliable wrap column and every break is taken as intended. */
const MIN_WIDTH = 40;

export function briefHtml(brief: string): string {
  return brief
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraphHtml(paragraph.trim())}</p>`)
    .join("");
}

function paragraphHtml(paragraph: string): string {
  const lines = paragraph.split("\n");
  if (lines.length === 1) return esc(paragraph);

  const width = Math.max(...lines.map((ln) => ln.length));
  if (width < MIN_WIDTH) return lines.map((ln) => esc(ln)).join("<br>");

  let out = "";
  lines.forEach((line, i) => {
    out += esc(line);
    if (i === lines.length - 1) return;
    // Reached the wrap column, so the break belongs to the wrapper and the next line continues
    // this sentence. A space, not a break.
    out += line.length >= width - TOLERANCE ? " " : "<br>";
  });
  return out;
}
