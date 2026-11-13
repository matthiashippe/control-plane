import { afterEach } from "vitest";

// Many tests here run a shell script with spawnSync. The runner awaits each test without giving the event loop a turn,
// so the synchronous tests of one file add up to one block: test/credit-runway.test.ts held its worker 51 s at load 120
// (audit 2026-11-13, line 146). vitest's worker RPC has a fixed 60 s timer, and an answer that waits behind such a
// block arrives after it: "Timeout calling onTaskUpdate", exit 1 with every test green. One turn of the loop after each
// test lets the answer in, so only a single test longer than 60 s could still block that long.
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
