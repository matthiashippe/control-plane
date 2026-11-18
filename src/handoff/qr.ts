/**
 * The short link as a QR code in text, for a terminal that cannot show a picture (goals/konto/02, goals/konto/05 point 6).
 *
 * Half blocks: every line of text carries two rows of modules, the upper one in the top half of the character and the lower one
 * in the bottom half, so the code stays square in a terminal whose characters are about twice as high as wide. Claude Code and
 * most terminals start dark and show a character light on a dark background, so the light modules are drawn as blocks and the
 * dark ones as spaces: what the camera sees is dark modules on light, the polarity every reader takes without inverting. A quiet
 * zone of four light modules goes all round, as the standard asks; a last line with only one row of modules gets a light lower
 * half, so the quiet zone below is never thinner than above.
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

/** `text` as lines of half blocks, light modules lit. */
export function qrText(text: string): string {
  const m = qrModules(text);
  const lines: string[] = [];
  for (let y = 0; y < m.length; y += 2) {
    let line = "";
    for (let x = 0; x < m.length; x++) {
      const top = !m[y][x];
      const bottom = y + 1 < m.length ? !m[y + 1][x] : true;
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}
