/**
 * ops/video-render.mjs (goals/reichweite/03, Punkt 2): the timeline of the video from the recorded transcript and the captions of
 * the tape. Nothing is cut: every recorded line is shown, unchanged and in its order; only waits are shortened, each to at most
 * 1 s; the video stays within 30 s; scene 1 shows the error of api.conway.tech and scene 3 reaches a turn. No browser here: the
 * pure functions on made-up transcripts, and the command line only up to the point where it would start one.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM tool without types
import { assessTimeline, buildTimeline, COLS, MAX_WAIT_MS, MIN_LINE_MS, MIN_SHOWN_PX, NARROWEST_SHOWN_PX, PAGE, parseTape, ROWS, textDefects, WIDTH } from "../ops/video-render.mjs";

type Line = { t_ms: number; text: string };
type Step = { scene: number; command: string; exit_code: number; started_ms: number; lines: Line[] };

const TAPE = [
  "caption 1 Before: api.conway.tech fails.",
  "run 1 grep conwayApiUrl ~/.automaton/automaton.json",
  "run 1 automaton --provision",
  "caption 2 Change one line.",
  "run 2 grep conwayApiUrl ~/.automaton/automaton.json",
  "caption 3 After: it runs on automatonhost.com.",
  "run 3 automaton --provision",
  "run 3 automaton --run",
  "until Turn [^:]+: [0-9]+ tools",
  "caption 4 automatonhost.com/fix",
  "caption 4 Top up by card, PayPal or Apple Pay.",
].join("\n");

/** A made-up recording in the shape of docs/video/umzug.transcript.json. */
function transcript(): { runtime_rev: string; recorded_at: string; steps: Step[] } {
  return {
    runtime_rev: "d8f8168",
    recorded_at: "2026-11-23T10:00:00.000Z",
    steps: [
      { scene: 1, command: "grep conwayApiUrl ~/.automaton/automaton.json", exit_code: 0, started_ms: 100, lines: [{ t_ms: 40, text: '  "conwayApiUrl": "https://api.conway.tech",' }] },
      { scene: 1, command: "automaton --provision", exit_code: 1, started_ms: 200, lines: [{ t_ms: 7000, text: '{"level":"error","message":"Provision failed: SIWE verification failed: 401"}' }] },
      { scene: 2, command: "grep conwayApiUrl ~/.automaton/automaton.json", exit_code: 0, started_ms: 7300, lines: [{ t_ms: 30, text: '  "conwayApiUrl": "https://automatonhost.com",' }] },
      { scene: 3, command: "automaton --provision", exit_code: 0, started_ms: 7400, lines: [{ t_ms: 6000, text: '{"level":"info","message":"{\\"apiKey\\":\\"<api key hidden>\\",\\"keyPrefix\\":\\"cnwy_k_abcdef12\\"}"}' }] },
      {
        scene: 3, command: "automaton --run", exit_code: 143, started_ms: 13500, lines: [
          { t_ms: 5000, text: "10:00:20 INFO  main  Conway Automaton v0.2.1 starting..." },
          { t_ms: 5300, text: "10:00:20 INFO  loop  [THINK] Routing inference" },
          { t_ms: 9000, text: "10:00:24 INFO  main  Turn 01ABC: 1 tools, 2048 tokens" },
        ],
      },
    ],
  };
}

const plan = (t = transcript(), tapeText = TAPE) => {
  const tape = parseTape(tapeText);
  const tl = buildTimeline(t, tape);
  return { tl, defects: assessTimeline(t, tape, tl) as string[] };
};
const allLines = (t: ReturnType<typeof transcript>) => t.steps.flatMap((s) => s.lines.map((l) => l.text));
/** The output rows in the order they first appear on screen. */
function shownRows(tl: { states: { scene: number; rows?: { kind: string; text: string }[] }[] }): string[] {
  const seen: string[] = [];
  const count = new Map<number, number>();
  for (const s of tl.states) {
    if (!s.rows) continue;
    const out = s.rows.filter((r) => r.kind === "out");
    if (out.length > (count.get(s.scene) ?? 0)) {
      count.set(s.scene, out.length);
      seen.push(out[out.length - 1].text);
    }
  }
  return seen;
}

describe("ops/video-render.mjs", () => {
  it("keeps every recorded line in the timeline in its order", () => {
    const t = transcript();
    const { tl, defects } = plan(t);
    expect(defects).toEqual([]);
    expect(shownRows(tl)).toEqual(allLines(t));
    expect(tl.lineRefs).toEqual(t.steps.flatMap((s, si) => s.lines.map((_, li) => [si, li])));
    // States come in time order, the four scenes in their order.
    const at = tl.states.map((s: { at: number }) => s.at);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect([...new Set(tl.states.map((s: { scene: number }) => s.scene))]).toEqual([1, 2, 3, 4]);
  });

  it("fails when a recorded line is missing", () => {
    const t = transcript();
    const tape = parseTape(TAPE);
    const tl = buildTimeline(t, tape);
    // The timeline drops the second line of the run, the transcript still holds it.
    const cut = { ...tl, lineRefs: tl.lineRefs.filter((_: number[], i: number) => i !== 5), states: tl.states.map((s: { rows?: { text: string }[] }) => (s.rows ? { ...s, rows: s.rows.filter((r) => !/THINK/.test(r.text)) } : s)) };
    const d = assessTimeline(t, tape, cut);
    expect(d.join("\n")).toMatch(/recorded lines missing or out of order/);
    expect(d.join("\n")).toMatch(/not shown unchanged in its order/);
    // Two lines swapped is a defect too.
    const swapped = { ...tl, lineRefs: [...tl.lineRefs.slice(0, 4), tl.lineRefs[5], tl.lineRefs[4], ...tl.lineRefs.slice(6)] };
    expect(assessTimeline(t, tape, swapped).join("\n")).toMatch(/recorded lines missing or out of order/);
  });

  it("caps a pause at one second", () => {
    const { tl, defects } = plan();
    expect(defects).toEqual([]);
    expect(Math.max(...tl.waits)).toBe(MAX_WAIT_MS);
    // The 7 s of the provisioning in scene 1 become 1 s between the command on screen and its line.
    const line = tl.states.findIndex((s: { rows?: { text: string }[] }) => s.rows?.some((r) => /Provision failed/.test(r.text)));
    const enter = tl.states[line - 1];
    expect(enter.rows[enter.rows.length - 1]).toEqual({ kind: "cmd", text: "automaton --provision" });
    expect(tl.states[line].at - enter.at).toBe(1000);
    // A wait above the cap in a timeline is a defect.
    const t = transcript();
    const tape = parseTape(TAPE);
    const long = { ...buildTimeline(t, tape), waits: [1500] };
    expect(assessTimeline(t, tape, long).join("\n")).toMatch(/a wait of 1500 ms/);
  });

  it("fails when the video would run longer than 30 seconds", () => {
    const t = transcript();
    // Two hundred more recorded lines, 900 ms apart: every one stays, so the video grows past 30 s.
    t.steps[4].lines.splice(2, 0, ...Array.from({ length: 200 }, (_, i) => ({ t_ms: 5300 + (i + 1) * 900, text: `10:00:2${i % 10} INFO  loop  line ${i}` })));
    t.steps[4].lines[t.steps[4].lines.length - 1].t_ms = 5300 + 201 * 900;
    const { tl, defects } = plan(t);
    expect(tl.total).toBeGreaterThan(30000);
    expect(defects.join("\n")).toMatch(/more than 30 s/);
  });

  it("fails when scene 1 does not show an error from api.conway.tech", () => {
    const answered = transcript();
    answered.steps[1].exit_code = 0;
    answered.steps[1].lines = [{ t_ms: 500, text: '{"level":"info","message":"{\\"apiKey\\":\\"<api key hidden>\\"}"}' }];
    expect(plan(answered).defects).toContain("scene 1 does not show an error from api.conway.tech");
    const other = transcript();
    other.steps[0].lines[0].text = '  "conwayApiUrl": "https://example.org",';
    expect(plan(other).defects).toContain("scene 1 does not show an error from api.conway.tech");
  });

  it("fails when scene 3 does not reach a turn", () => {
    const t = transcript();
    t.steps[4].lines.pop();
    expect(plan(t).defects).toContain("scene 3 does not reach a turn");
  });

  it("rejects a transcript with an api key", () => {
    const key = "cnwy_k_" + "ab12".repeat(8);
    const plain = transcript();
    plain.steps[3].lines[0].text = `{"level":"info","message":"{\\"apiKey\\":\\"${key}\\"}"}`;
    expect(plan(plain).defects).toContain("the transcript holds an api key");
    const file = transcript();
    file.steps[3].lines.push({ t_ms: 6100, text: `  "apiKey": "${key}",` });
    expect(plan(file).defects).toContain("the transcript holds an api key");
    const hex = transcript();
    hex.steps[4].lines[0].text += " " + "f".repeat(64);
    expect(plan(hex).defects).toContain("the transcript holds an api key");
  });

  it("keeps every text of the video at least 12 px on the narrowest page", () => {
    // The video is 358 px wide on a 390 px page (measured on the SOLL pictures); every font of the picture, shrunk by that much,
    // stays at the smallest size of the kit (--t-label, 12 px).
    expect(MIN_SHOWN_PX).toBe(12);
    expect(textDefects(PAGE)).toEqual([]);
    const sizes = [...PAGE.matchAll(/(?:font-size:|font:[^;]*?)\s(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(5);
    for (const px of sizes) expect((px * NARROWEST_SHOWN_PX) / WIDTH).toBeGreaterThanOrEqual(MIN_SHOWN_PX);
    // A planted small font is a defect.
    expect(textDefects(PAGE.replace(".bar b { margin-left: auto; font: 600 44px", ".bar b { margin-left: auto; font: 600 18px")).join("\n")).toMatch(/18 px is shown at 5\.0 px/);
  });

  it("shows every recorded line in full for a moment, also in a burst", () => {
    // Fifteen lines in the same millisecond, two screen rows each: more than the screen holds at once.
    const t = transcript();
    const burst = Array.from({ length: 15 }, (_, i) => ({ t_ms: 5300, text: `10:00:2${i % 10} INFO  loop  burst line ${i} `.padEnd(COLS + 5, ".") }));
    t.steps[4].lines.splice(2, 0, ...burst);
    const { tl, defects } = plan(t);
    expect(defects).toEqual([]);
    for (let k = 1; k < tl.states.length; k++) {
      if (tl.states[k].rows && tl.states[k - 1].rows && tl.states[k].rows.length > tl.states[k - 1].rows.length && tl.states[k].rows.at(-1).kind === "out") {
        expect(tl.states[k].at - tl.states[k - 1].at).toBeGreaterThanOrEqual(tl.states[k - 1].rows.at(-1).kind === "out" ? MIN_LINE_MS : 0);
      }
    }
    // The same burst without the moment: the first lines scroll away before any frame shows them.
    const squeezed = { ...tl, states: tl.states.map((s: { at: number; rows?: { text: string }[] }) => (s.rows?.some((r) => /burst line/.test(r.text)) ? { ...s, at: tl.states.find((x: { rows?: { text: string }[] }) => x.rows?.some((r) => /burst line 0 /.test(r.text))).at } : s)) };
    expect(assessTimeline(t, parseTape(TAPE), squeezed).join("\n")).toMatch(/is never in full on screen for \d+ ms/);
  });

  it("fails when a recorded line does not fit on the screen", () => {
    const t = transcript();
    t.steps[4].lines[0].text = "x".repeat(COLS * ROWS + 1);
    expect(plan(t).defects.join("\n")).toMatch(/needs \d+ rows, the screen holds 10/);
  });

  it("exits 1 on an unknown argument before the browser", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "video-render-test-"));
    try {
      // A stand-in browser that leaves a mark when it is started.
      const chrome = path.join(dir, "chrome");
      fs.writeFileSync(chrome, `#!/bin/sh\ntouch ${JSON.stringify(path.join(dir, "started"))}\n`, { mode: 0o755 });
      for (const args of [["--pln"], ["--frames", "--extra"], [], ["--check", "--tape"], ["--plan", "--video"]]) {
        const r = spawnSync(process.execPath, ["ops/video-render.mjs", ...args], { encoding: "utf8", env: { ...process.env, SOLL_CHROME: chrome } });
        expect(r.status, args.join(" ")).toBe(1);
        expect(r.stderr, args.join(" ")).toMatch(/^usage: node ops\/video-render\.mjs/);
      }
      expect(fs.existsSync(path.join(dir, "started"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
