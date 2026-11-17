import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startBillingRound } from "../src/sandbox/round.js";

const FIRST = 3 * 60 * 1000;
const EVERY = 60 * 1000;

function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("billing round (tick, then sweep)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs neither tick nor sweep before the first delay of three minutes", async () => {
    const tick = vi.fn(async () => {});
    const sweep = vi.fn(async () => {});
    const round = startBillingRound({ tick, sweep, firstDelayMs: FIRST, intervalMs: EVERY, log: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(sweep).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FIRST - 1);
    expect(tick).not.toHaveBeenCalled();
    expect(sweep).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(sweep).toHaveBeenCalledTimes(1);
    round.stop();
  });

  it("starts the sweep only after the tick has settled", async () => {
    const pending = deferred();
    const order: string[] = [];
    const tick = vi.fn(() => {
      order.push("tick");
      return pending.promise;
    });
    const sweep = vi.fn(async () => {
      order.push("sweep");
    });
    const round = startBillingRound({ tick, sweep, firstDelayMs: FIRST, intervalMs: EVERY, log: () => {} });
    await vi.advanceTimersByTimeAsync(FIRST);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(sweep).not.toHaveBeenCalled();
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(["tick", "sweep"]);
    round.stop();
  });

  it("still sweeps after a failed tick and logs the failure", async () => {
    const lines: string[] = [];
    const tick = vi.fn(async () => {
      throw new Error("sandboxd down");
    });
    const sweep = vi.fn(async () => {});
    const round = startBillingRound({ tick, sweep, firstDelayMs: FIRST, intervalMs: EVERY, log: (l) => lines.push(l) });
    await vi.advanceTimersByTimeAsync(FIRST);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(lines.some((l) => l.includes("tick failed") && l.includes("sandboxd down"))).toBe(true);
    round.stop();
  });

  it("repeats tick and sweep every minute after the first round", async () => {
    const tick = vi.fn(async () => {});
    const sweep = vi.fn(async () => {});
    const round = startBillingRound({ tick, sweep, firstDelayMs: FIRST, intervalMs: EVERY, log: () => {} });
    await vi.advanceTimersByTimeAsync(FIRST + 2 * EVERY);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(sweep).toHaveBeenCalledTimes(3);
    round.stop();
    await vi.advanceTimersByTimeAsync(5 * EVERY);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("runs without a sweep when there is no automaton service", async () => {
    const tick = vi.fn(async () => {});
    const round = startBillingRound({ tick, sweep: undefined, firstDelayMs: FIRST, intervalMs: EVERY, log: () => {} });
    await vi.advanceTimersByTimeAsync(FIRST);
    expect(tick).toHaveBeenCalledTimes(1);
    round.stop();
  });

  it("src/index.ts reaches the sweep only through the billing round with the delay of three minutes", () => {
    const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const lines = src.split("\n");
    const start = lines.findIndex((l) => l.includes("const billing = "));
    expect(start).toBeGreaterThan(-1);
    const end = lines.findIndex((l, i) => i > start && l.startsWith("}"));
    const block = lines.slice(start, end).join("\n");
    expect(block).toContain("startBillingRound(");
    expect(block).toContain("firstDelayMs: 3 * 60 * 1000");
    // Exactly one line of the whole file names the sweep, and it is the one that hands it to the round.
    const sweepLines = lines.filter((l) => l.includes("sweep"));
    expect(sweepLines).toHaveLength(1);
    expect(sweepLines[0]).toMatch(/^\s*sweep: automatons \? \(\) => automatons\.sweep\(\) : undefined,$/);
    expect(block).toContain(sweepLines[0]);
  });
});
