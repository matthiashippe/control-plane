/**
 * No sweep before the first billing round (goals/hosting/01, point 3). The rollout canary runs this image for a few
 * seconds against a copy of the database with the same key for sandboxd, so building the services must not reach sandboxd
 * at all: only the billing round of src/index.ts (src/sandbox/round.ts) may start a sweep, three minutes after the start.
 * Here the services and the app are built the way src/index.ts builds them, on a fake clock that runs ten minutes without
 * the round, next to a failed automaton whose sandbox still runs and a start a restart cut off long ago.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createAutomatonService } from "../src/automaton/service.js";
import { PROBE_COMMAND } from "../src/automaton/sweep.js";
import { createSandboxService, type SandboxService } from "../src/sandbox/service.js";
import { closeWorlds } from "./sandbox-world.js";
import { automatonWorld } from "./automaton-world.js";

afterEach(async () => {
  vi.useRealTimers();
  await closeWorlds();
});

const PROMPT = "Watch the price of one thing and write a short note about it every hour.";
const TEN_MINUTES = 10 * 60_000;

/** Records every call of the sandbox service that reaches sandboxd for a sweep. */
function recorded(s: SandboxService) {
  const calls: string[] = [];
  const service: SandboxService = {
    ...s,
    exec: ((...a: Parameters<SandboxService["exec"]>) => {
      calls.push("exec");
      return s.exec(...a);
    }) as SandboxService["exec"],
    remove: ((...a: Parameters<SandboxService["remove"]>) => {
      calls.push("remove");
      return s.remove(...a);
    }) as SandboxService["remove"],
  };
  return { service, calls };
}

describe("building the services of src/index.ts", () => {
  it("reaches sandboxd neither with a probe nor with a DELETE for ten minutes without the billing round", async () => {
    let down = true;
    const w = await automatonWorld({ startFails: true, answer: (m) => (down && m === "DELETE" ? { status: 500, body: { error: "down" } } : undefined) });
    const first = createAutomatonService({ db: w.db, sandboxes: w.service, publicUrl: () => "https://example.dev", now: () => w.clock.t, log: () => {} });

    // An active row without started_at whose start a restart cut off an hour ago: its upload never answers.
    const other = w.account();
    const stuck = createAutomatonService({
      db: w.db,
      sandboxes: { ...w.service, upload: () => new Promise(() => {}) },
      publicUrl: () => "https://example.dev",
      now: () => w.clock.t,
      log: () => {},
    });
    void stuck.create(other.address, other.key, { name: "cut-off", genesis_prompt: PROMPT });
    for (let i = 0; i < 200 && !w.db.prepare("SELECT 1 FROM hosted_automatons WHERE address = ?").get(other.address); i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const cut = w.db.prepare("SELECT id, sandbox_id FROM hosted_automatons WHERE address = ?").get(other.address) as { id: string; sandbox_id: string };
    w.db.prepare("UPDATE hosted_automatons SET created_at = ? WHERE id = ?").run(new Date(w.clock.t - 60 * 60_000).toISOString(), cut.id);
    const cutSandbox = cut.sandbox_id;

    // A failed automaton whose sandbox the sandbox server did not delete.
    const owner = w.account();
    const failed = await first.create(owner.address, owner.key, { name: "failing", genesis_prompt: PROMPT });
    expect(failed.status).toBe(501);
    const failedSandbox = String((w.db.prepare("SELECT sandbox_id FROM hosted_automatons WHERE id = ?").get(failed.body.id) as { sandbox_id: string }).sandbox_id);
    down = false;

    const rowsBefore = w.db.prepare("SELECT * FROM hosted_automatons ORDER BY id").all();
    const hitsBefore = w.hits.length;
    const execsBefore = w.execs().length;

    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "setImmediate", "Date"] });
    // As src/index.ts: the sandbox service, the automaton service on it, and the app with both, without the billing round.
    // Only their clock is the one of the world, so that billing and deadlines read the same time as the rows.
    const rec = recorded(createSandboxService({ db: w.db, client: w.client, now: () => w.clock.t }));
    const automatons = createAutomatonService({ db: w.db, sandboxes: rec.service, publicUrl: () => "https://example.dev", now: () => w.clock.t });
    createApp({ db: w.db, sandbox: rec.service, automatons, rateLimit: null });
    await vi.advanceTimersByTimeAsync(TEN_MINUTES);
    vi.useRealTimers();
    // Whatever a timer started would reach sandboxd over a real socket now.
    await new Promise((r) => setTimeout(r, 300));

    expect(rec.calls).toEqual([]);
    expect(w.hits.slice(hitsBefore)).toEqual([]);
    expect(w.execs().length).toBe(execsBefore);
    expect(w.db.prepare("SELECT * FROM hosted_automatons ORDER BY id").all()).toEqual(rowsBefore);
    expect(w.d.sandboxes()[failedSandbox].status).toBe("running");
    expect(w.d.sandboxes()[cutSandbox].status).toBe("running");

    // The other direction: the same service, asked by the round, probes and deletes both.
    expect(await automatons.sweep()).toEqual({ removed: 2, interrupted: 1 });
    expect(rec.calls).toContain("exec");
    expect(rec.calls.filter((c) => c === "remove")).toHaveLength(2);
    expect(w.execs().slice(execsBefore).filter((c) => c.args[c.args.length - 1] === PROBE_COMMAND)).toHaveLength(1);
    expect(w.hits.slice(hitsBefore)).toEqual(expect.arrayContaining([`DELETE /v1/sandboxes/${failedSandbox}`, `DELETE /v1/sandboxes/${cutSandbox}`]));
  });
});

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

/** Every .ts file under src/, with its path from the repo root. */
function sources(dir = path.join(ROOT, "src")): { file: string; text: string }[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return e.name.endsWith(".ts") ? [{ file: path.relative(ROOT, p).split(path.sep).join("/"), text: fs.readFileSync(p, "utf8") }] : [];
  });
}

describe("who may start a sweep", () => {
  it("calls sweepAutomatons only in the sweep of the automaton service, and that only from the billing round of src/index.ts", () => {
    const all = sources();
    const where = (re: RegExp) =>
      all.flatMap(({ file, text }) => text.split("\n").flatMap((line, i) => (re.test(line) ? [`${file}:${line.trim()}`] : [])));

    const direct = where(/sweepAutomatons\(/).filter((l) => !l.includes("export async function sweepAutomatons("));
    expect(direct).toHaveLength(1);
    expect(direct[0]).toMatch(/^src\/automaton\/service\.ts:sweeping \?\?= sweepAutomatons\(/);
    const service = all.find((s) => s.file === "src/automaton/service.ts")!.text;
    const fn = service.slice(service.indexOf("  function sweep(): Promise<"), service.indexOf("\n  }\n", service.indexOf("  function sweep(): Promise<")));
    expect(fn).toContain("sweepAutomatons(");

    // The sweep of the service is named in two places in src/: where src/index.ts hands it to the billing round, and where
    // the round calls it after the tick (test/billing-round.test.ts holds that one to three minutes after the start).
    expect(where(/\.sweep\b/)).toEqual([
      "src/index.ts:sweep: automatons ? () => automatons.sweep() : undefined,",
      "src/sandbox/round.ts:.then(() => opts.sweep?.())",
    ]);
    // The billing round starts only in src/index.ts, and nothing else imports the sweep module.
    expect(where(/startBillingRound\(/).filter((l) => !l.includes("export function startBillingRound("))).toEqual([
      "src/index.ts:const billing = startBillingRound({",
    ]);
    expect(where(/(from|import\()\s*["'][./\w]*\/sweep\.js["']/).map((l) => l.split(":")[0])).toEqual(["src/automaton/service.ts"]);
  });
});
