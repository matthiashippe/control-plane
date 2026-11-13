import { describe, expect, it } from "vitest";

// Proves test/yield-between-tests.ts (setupFiles in vitest.config.ts): without it, the runner goes from one test to the
// next without a turn of the event loop, and a worker that runs synchronous tests back to back misses vitest's 60 s RPC timer.
describe("the event loop between two synchronous tests", () => {
  let turned = false;

  it("schedules work for the next turn of the loop and returns synchronously", () => {
    setImmediate(() => (turned = true));
  });

  it("finds that work done, so the loop turned in between", () => {
    expect(turned).toBe(true);
  });
});
