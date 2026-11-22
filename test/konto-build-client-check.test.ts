/**
 * goals/konto/13, Punkt 3: `node ops/konto/build-client.mjs --check; echo "exit=$?"` must print exactly `exit=0`, so the check
 * stays silent on stdout when the committed bundle matches its sources. A mismatch still goes to stderr with exit 1.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("build-client --check", () => {
  it("prints nothing on stdout and exits 0 when the bundle is current", () => {
    const r = spawnSync(process.execPath, ["ops/konto/build-client.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});
