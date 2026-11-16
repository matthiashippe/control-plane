/**
 * The QR code of POST /v1/handoff as a dark terminal shows it (goals/konto/05, point 6): Claude Code starts dark, so every
 * character of the text appears light on a dark background. A phone camera reads a code only with dark modules on light, and
 * many readers do not try the inverted picture, so the reading here never inverts (`dontInvert`).
 */
import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { QUIET_ZONE } from "../src/handoff/qr.js";
import { ATLAS, handoffApp, post } from "./handoff-helpers.js";

const SCALE = 4;

/** Which modules of the text a character lights up: the upper half of a line is one row, the lower half the next. */
function litRows(text: string): boolean[][] {
  const rows: boolean[][] = [];
  for (const line of text.split("\n")) {
    const top: boolean[] = [], bottom: boolean[] = [];
    for (const ch of line) {
      top.push(ch === "█" || ch === "▀");
      bottom.push(ch === "█" || ch === "▄");
    }
    rows.push(top, bottom);
  }
  return rows;
}

/** The text drawn in a terminal: characters in `ink` on a `paper` background, four pixels a module. */
function draw(text: string, ink: number, paper: number): { data: Uint8ClampedArray; w: number; h: number } {
  const rows = litRows(text);
  const w = rows[0].length * SCALE, h = rows.length * SCALE;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const lit = rows[Math.floor(y / SCALE)][Math.floor(x / SCALE)];
    const i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = lit ? ink : paper;
    data[i + 3] = 255;
  }
  return { data, w, h };
}

async function handoffQr(): Promise<{ qr: string; url: string }> {
  const { app } = handoffApp();
  const res = await post(app, ATLAS);
  expect(res.status).toBe(201);
  return (await res.json()) as { qr: string; url: string };
}

describe("the QR code of POST /v1/handoff in a dark terminal", () => {
  it("drawn as light characters on a dark background, it reads as the url without inverting", async () => {
    const h = await handoffQr();
    const { data, w, h: height } = draw(h.qr, 230, 20);
    expect(jsQR(data, w, height, { inversionAttempts: "dontInvert" })?.data ?? null).toBe(h.url);
  });

  it("drawn as dark characters on a light background, it does not read without inverting", async () => {
    const h = await handoffQr();
    const { data, w, h: height } = draw(h.qr, 20, 230);
    expect(jsQR(data, w, height, { inversionAttempts: "dontInvert" })).toBeNull();
  });

  it("has a quiet zone of at least four light modules on every side", async () => {
    const h = await handoffQr();
    const rows = litRows(h.qr);
    const size = rows[0].length;
    expect(QUIET_ZONE).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < 4; i++) {
      expect(rows[i].every(Boolean), `top row ${i}`).toBe(true);
      expect(rows[rows.length - 1 - i].every(Boolean), `bottom row ${i}`).toBe(true);
    }
    for (const [y, row] of rows.entries()) {
      expect(row.slice(0, 4).every(Boolean), `left of row ${y}`).toBe(true);
      expect(row.slice(size - 4).every(Boolean), `right of row ${y}`).toBe(true);
    }
  });

  it("has lines of equal width, so the terminal cannot shift a row", async () => {
    const h = await handoffQr();
    const widths = new Set(h.qr.split("\n").map((l) => [...l].length));
    expect(widths.size).toBe(1);
    expect(h.qr).toMatch(/^[ ▀▄█\n]+$/);
  });
});
