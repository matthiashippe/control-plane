/**
 * The short link as a QR code in text, for a terminal that cannot show a picture (goals/konto/02).
 *
 * Half blocks: every line of text carries two rows of modules, the upper one in the top half of the character and the lower one
 * in the bottom half, so the code stays square in a terminal whose characters are about twice as high as wide. Dark modules are
 * drawn as blocks, light ones as spaces, with a quiet zone of four modules all round, as the standard asks. A terminal with a dark
 * background shows it inverted, which phone cameras read as well.
 */
import { encode } from "uqr";

export const QUIET_ZONE = 4;

/** The modules of `text` with the quiet zone, true for dark. */
export function qrModules(text: string): boolean[][] {
  const { data } = encode(text, { ecc: "M", border: 0 });
  const size = data.length + 2 * QUIET_ZONE;
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => data[y - QUIET_ZONE]?.[x - QUIET_ZONE] === true),
  );
}

/** `text` as lines of half blocks. */
export function qrText(text: string): string {
  const m = qrModules(text);
  const lines: string[] = [];
  for (let y = 0; y < m.length; y += 2) {
    let line = "";
    for (let x = 0; x < m.length; x++) {
      const top = m[y][x];
      const bottom = m[y + 1]?.[x] ?? false;
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}
