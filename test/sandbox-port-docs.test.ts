import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { MockProvider } from "../src/inference/mock.js";
import { Catalog } from "../src/inference/proxy.js";

/**
 * What an automaton and its operator read about sandbox ports has to match what the control plane answers
 * (goals/sandbox/07, point 11): every error answer links docs/errors.md, and /fix is the page a stuck operator reads.
 * Reads files and renders /fix in memory; no network, no port.
 */
const REPO = join(__dirname, "..");
const ERRORS = readFileSync(join(REPO, "docs/errors.md"), "utf8");
const SANDBOX_SRC = readdirSync(join(REPO, "src/sandbox"))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(join(REPO, "src/sandbox", f), "utf8"))
  .join("\n");

function section(md: string, name: string): string {
  const start = md.indexOf(`\n## ${name}\n`);
  if (start < 0) return "";
  const next = md.indexOf("\n## ", start + 1);
  return md.slice(start, next < 0 ? undefined : next);
}

describe("docs about sandbox ports", () => {
  it("the error reference names no error code for ports that src/sandbox does not answer", () => {
    const rows = ERRORS.split("\n").filter((l) => l.startsWith("|") && l.includes("/ports"));
    const codes = rows.flatMap((l) => [...l.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]));
    for (const code of codes) {
      expect(SANDBOX_SRC, `docs/errors.md names ${code} for ports`).toContain(`"${code}"`);
    }
    expect(ERRORS).not.toMatch(/port_exposure_unavailable/);
  });

  it("the sandboxes section names the answer with public_url and invalid_request for a bad port", () => {
    const s = section(ERRORS, "sandboxes");
    expect(s).toMatch(/ports\/expose/);
    expect(s).toMatch(/public_url/);
    expect(s).toMatch(/invalid_request/);
    expect(s).toMatch(/DELETE \/v1\/sandboxes\/\{id\}\/ports\/\{port\}/);
  });

  it("the page /fix does not say that ports stay closed", async () => {
    const app = createApp({ db: openDb(":memory:"), catalog: new Catalog([new MockProvider()], { "gpt-5.2": "mock-1" }) });
    const fix = await (await app.request("/fix")).text();
    expect(fix).toMatch(/Sandboxes run here/);
    expect(fix).not.toMatch(/ports stay\s+closed/);
    expect(fix).toMatch(/ports/);
  });
});
