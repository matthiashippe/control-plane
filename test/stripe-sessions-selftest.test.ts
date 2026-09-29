/**
 * `ops/stripe-sessions.cjs` is the measurement that can refute Goal 22. Its selftest plants every
 * case GOAL.md names and wants exit 1 or 0 for each; running it here means a change to the script
 * that blinds it turns `pnpm test` red, not just a check-all run somebody may not start.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, it } from "vitest";

const SCRIPT = join(__dirname, "..", "ops", "stripe-sessions.cjs");

it("the Stripe sessions check passes its selftest in both directions", () => {
  const out = execFileSync(process.execPath, [SCRIPT, "--selftest"], { encoding: "utf8" });
  expect(out).toContain("STRIPE SESSIONS SELFTEST OK");
  expect(out).not.toContain("FAIL");
  // Both answers occur, so the selftest is not a constant.
  expect(out).toContain("ok   paid, not booked");
  expect(out).toContain("ok   paid, booked");
});

it("says it could not look, with exit 2, when there is no key", () => {
  const env = { ...process.env };
  delete env.CP_STRIPE_SECRET_KEY;
  let code = 0;
  let out = "";
  try {
    execFileSync(process.execPath, [SCRIPT], { encoding: "utf8", env });
  } catch (e) {
    code = (e as { status: number }).status;
    out = String((e as { stdout: string }).stdout);
  }
  expect(code).toBe(2);
  expect(out).toContain("could not look");
});
