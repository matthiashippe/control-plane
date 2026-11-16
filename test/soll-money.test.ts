import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { FOLD, MONEY_BLOCKS, MONEY_STATES, assessMoney, pixelDiffCount, summaryMoney } from "../ops/soll-assess.mjs";

/**
 * The judgement of ops/soll-money.mjs over money in and out on the phone page /h/{code}, without a browser (goals/konto/05,
 * Punkt 3). One case per defect the goal names, each planted on an otherwise clean render, the clean render itself, which must
 * pass with nothing, and an unknown argument, which must end the tool before it writes a single picture.
 */

type Picture = { width: number; height: number; data: Buffer };

function picture(width: number, height: number, paint?: (x: number, y: number) => [number, number, number]): Picture {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = paint ? paint(x, y) : [10, 11, 9];
    data.set([r, g, b, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

/** A render of the state payout-passkey at 390 px that is clean on every count. */
const clean = (over: Record<string, unknown> = {}) => ({
  state: "payout-passkey",
  width: 390,
  pngWidth: 390,
  diffPixels: 0,
  scrollWidth: 390,
  text: "Last step\nAllow payouts to your bank account\nPostYourPrice can send money from Atlas only to your bank account ending 3000.\nConfirm with passkey",
  foreign: [] as string[],
  blockBottom: 512,
  ...over,
});

describe("soll judgement of money in and out", () => {
  it("passes a clean render of all seven states at both widths with no defect", () => {
    expect(MONEY_STATES).toEqual(["deposit-approve", "deposit-card", "payout-approve", "payout-verify", "payout-bank", "payout-passkey", "retry"]);
    expect(MONEY_BLOCKS).toEqual({
      "deposit-approve": "approve", "deposit-card": "card", "payout-approve": "approve", "payout-verify": "verify",
      "payout-bank": "bank", "payout-passkey": "payout", retry: "retry",
    });
    const results = [];
    for (const state of MONEY_STATES) for (const width of [390, 1440]) {
      const blockBottom = (width === 390 ? 500 : 480) + MONEY_STATES.indexOf(state) * 10;
      const defects = assessMoney(clean({ state, width, pngWidth: width, scrollWidth: width, blockBottom }));
      expect(defects).toEqual([]);
      results.push({ state, width, blockBottom, defects });
    }
    expect(summaryMoney(results)).toBe("soll money: 14 images, blocks end 390=560 1440=540, 0 defects");
    expect(summaryMoney([{ state: "retry", width: 390, blockBottom: 486, defects: ["x"] }, { state: "payout-bank", width: 390, blockBottom: null, defects: [] }]))
      .toBe("soll money: 2 images, blocks end 390=missing 1440=missing, 1 defects");
  });

  it("rejects a picture with even one pixel that differs from a fresh render", () => {
    const changed = picture(100, 100, (x, y) => (x === 3 && y === 5 ? [240, 240, 240] : [10, 11, 9]));
    const diff = pixelDiffCount(picture(100, 100), changed);
    expect(diff).toBe(1);
    expect(assessMoney(clean({ diffPixels: diff })).join("\n")).toMatch(/^payout-passkey 390: 1 pixels differ from a fresh render$/m);
    expect(assessMoney(clean({ state: "deposit-card", diffPixels: null })).join("\n")).toMatch(/deposit-card 390: no committed picture/);
  });

  it("rejects horizontal overflow", () => {
    expect(assessMoney(clean({ scrollWidth: 412 })).join("\n")).toMatch(/payout-passkey 390: horizontal overflow, scrollWidth 412/);
    expect(assessMoney(clean({ state: "payout-bank", width: 1440, pngWidth: 1440, scrollWidth: 1441 })).join("\n"))
      .toMatch(/payout-bank 1440: horizontal overflow, scrollWidth 1441/);
  });

  it("rejects a dash in the visible text", () => {
    expect(assessMoney(clean({ state: "deposit-approve", text: "Add $20.00 \u2013 to Atlas" })).join("\n"))
      .toMatch(/deposit-approve 390: dash in the visible text/);
    expect(assessMoney(clean({ state: "retry", text: "Tap again \u2014 now" })).join("\n")).toMatch(/retry 390: dash in the visible text/);
  });

  it("rejects a foreign address, requested or named in an attribute", () => {
    expect(assessMoney(clean({ foreign: ["https://fonts.example.com/a.woff2"] })).join("\n"))
      .toMatch(/payout-passkey 390: request to a foreign address: https:\/\/fonts\.example\.com/);
    expect(assessMoney(clean({ state: "payout-verify", foreign: ["href=https://bridge.example.com/verify"] })).join("\n"))
      .toMatch(/payout-verify 390: request to a foreign address: href=https:\/\/bridge\.example\.com/);
  });

  it("rejects a block that ends below the first screen, or is missing, and names the block of the state", () => {
    expect(FOLD[390]).toBe(844);
    expect(FOLD[1440]).toBe(900);
    expect(assessMoney(clean({ blockBottom: 844 }))).toEqual([]);
    expect(assessMoney(clean({ blockBottom: 845 })).join("\n")).toMatch(/payout-passkey 390: block payout ends at 845 px, below the first screen at 844/);
    expect(assessMoney(clean({ state: "payout-bank", width: 1440, pngWidth: 1440, scrollWidth: 1440, blockBottom: 901 })).join("\n"))
      .toMatch(/payout-bank 1440: block bank ends at 901 px, below the first screen at 900/);
    expect(assessMoney(clean({ state: "deposit-card", blockBottom: null })).join("\n")).toMatch(/deposit-card 390: block data-soll="card" is missing/);
    expect(assessMoney(clean({ state: "payout-approve", blockBottom: undefined })).join("\n")).toMatch(/payout-approve 390: block data-soll="approve" is missing/);
    expect(assessMoney(clean({ state: "retry", blockBottom: null })).join("\n")).toMatch(/retry 390: block data-soll="retry" is missing/);
  });

  it("rejects a word from the list in the visible text, in any case and inside a longer word", () => {
    const words = ["Handoff", "tokens", "Wallet", "Smart account", "spend permission", "Base Sepolia", "Turnkey", "ERC-20", "allowance",
      "liquidation address", "onramp", "On-ramp", "KYC", "Forwarder", "spender", "USDC"];
    for (const word of words) {
      expect(assessMoney(clean({ text: `Confirm with passkey\n${word} ready` })).join("\n"), word)
        .toMatch(/payout-passkey 390: word the reader has to translate in the visible text/);
      expect(assessMoney(clean({ state: "deposit-card", text: `Pay by ${word}` })).join("\n"), word)
        .toMatch(/deposit-card 390: word the reader has to translate/);
    }
    // The known words stand, and "erc" and "kyc" count only at the start of a word: commerce is an ordinary word.
    expect(assessMoney(clean({ text: "Pay by card with MoonPay. Bridge checks your identity once. IBAN, passkey, bank account. Built for commerce." }))).toEqual([]);
  });

  it("rejects a state money in and out does not have", () => {
    expect(assessMoney(clean({ state: "payout", blockBottom: null })).join("\n")).toMatch(/payout 390: unknown state/);
  });

  it("ends with exit 1 on an unknown argument and writes no picture", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "soll-money-args-"));
    try {
      const tool = fileURLToPath(new URL("../ops/soll-money.mjs", import.meta.url));
      for (const args of [["--bogus", "--pictures", dir], ["--pruefen", "--pictures", dir], ["--check", "--pictures"]]) {
        const run = spawnSync(process.execPath, [tool, ...args], { encoding: "utf8", timeout: 30000 });
        expect(run.status, args.join(" ")).toBe(1);
        expect(run.stderr, args.join(" ")).toMatch(/^usage: node ops\/soll-money\.mjs/);
        expect(readdirSync(dir), args.join(" ")).toEqual([]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
