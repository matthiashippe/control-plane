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
const TOLERANZ = 12;
/** Below this, a paragraph has no reliable wrap column and every break is taken as intended. */
const MINDESTBREITE = 40;

export function briefHtml(brief: string): string {
  return brief
    .split(/\n{2,}/)
    .map((absatz) => `<p>${absatzHtml(absatz.trim())}</p>`)
    .join("");
}

function absatzHtml(absatz: string): string {
  const zeilen = absatz.split("\n");
  if (zeilen.length === 1) return esc(absatz);

  const breite = Math.max(...zeilen.map((z) => z.length));
  if (breite < MINDESTBREITE) return zeilen.map((z) => esc(z)).join("<br>");

  let out = "";
  zeilen.forEach((zeile, i) => {
    out += esc(zeile);
    if (i === zeilen.length - 1) return;
    // Reached the wrap column, so the break belongs to the wrapper and the next line continues
    // this sentence. A space, not a break.
    out += zeile.length >= breite - TOLERANZ ? " " : "<br>";
  });
  return out;
}
