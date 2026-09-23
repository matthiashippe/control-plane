/**
 * What the service writes into the log when a request fails, and what ops/status.sh counts there.
 *
 * `errors_24h` in the status report counted lines matching "provider_unavailable|settlement_failed|
 * internal_error" until 2026-09-22. "internal_error" is the word in the response BODY of a 500 and
 * never appears in the log: app.onError writes `[app] <method> <path>: <stack>`. So the number that
 * exists to report failures could only ever be zero for the failures it exists to report, and it
 * had been zero for days. There really were none in seven days, which is why nobody noticed.
 *
 * The pattern is read out of ops/status.sh rather than written down again here. Two copies of one
 * rule drift, and the one that drifts is always the one nobody is looking at.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

function patternFromStatusSh(): RegExp {
  const line = readFileSync("ops/status.sh", "utf8")
    .split("\n")
    .find((l) => l.startsWith("CP_ERROR_PATTERN="));
  expect(line, "ops/status.sh has to carry the pattern on one line of its own").toBeTruthy();
  const pattern = line!.match(/:-(.*)\}"/)?.[1];
  expect(pattern, "and it has to be readable out of that line").toBeTruthy();
  return new RegExp(pattern!, "i");
}

describe("the error counter counts what the service writes", () => {
  it("matches the line a failed request actually produces", () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const written: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      written.push(args.map(String).join(" "));
    });
    try {
      // A failure the service cannot handle, caused where it has to go through app.onError.
      db.prepare("DROP TABLE bounties").run();
      return app.request("/bounties.json").then((res) => {
        expect(res.status, "this has to be a 500, or the test proves nothing").toBe(500);
        expect(written.length, "and a 500 has to leave a line in the log").toBeGreaterThan(0);
        const pattern = patternFromStatusSh();
        expect(
          written.some((l) => pattern.test(l)),
          `ops/status.sh counts /${pattern.source}/i and the service wrote: ${written[0]?.slice(0, 120)}`,
        ).toBe(true);
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("does not match an ordinary line, or every log line would be an error", () => {
    const pattern = patternFromStatusSh();
    expect(pattern.test("[cleanup] removed 0 nonces, 2 sessions, 0 old failed payments")).toBe(false);
    expect(pattern.test("listening on 0.0.0.0:8402")).toBe(false);
  });
});
