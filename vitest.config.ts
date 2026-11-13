import { defineConfig } from "vitest/config";

// The bare `pnpm -s vitest run` is a check command of its own (fehler 02 point 2, fehler 04 point 3), and the nightly audit
// runs it with HTTP_PROXY pointing at a dead port. It gets the same footing as scripts/check.mjs:
// - loopback stays outside the proxy, otherwise curl in ops/smoke.sh sends 127.0.0.1 to the dead proxy (audit 2026-11-13, line 146);
// - patience, not a threshold: vitest's default of 5 s with one worker per core timed out 23 tests at load 100 on the code-host.
//   No test asserts its own duration through these.
const LOOPBACK = "127.0.0.1,localhost,::1";
const withLoopback = (value: string | undefined) => (value ? `${value},${LOOPBACK}` : LOOPBACK);

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    setupFiles: ["test/yield-between-tests.ts"],
    env: { NO_PROXY: withLoopback(process.env.NO_PROXY), no_proxy: withLoopback(process.env.no_proxy) },
    testTimeout: 60_000,
    hookTimeout: 60_000,
    maxWorkers: 6,
  },
});
