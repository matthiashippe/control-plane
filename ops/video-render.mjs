// The video "one line moves an automaton" (goals/reichweite/03, decisions 1, 2 and 5): from the recorded transcript
// docs/video/move.transcript.json and the captions of the tape docs/video/move.tape to pictures, then to the files.
//
//   node ops/video-render.mjs --plan      no browser: the timeline and its defects, last line
//                                         video plan: <f> frames, <s> s, 4 scenes, <l> lines, <n> defects
//   node ops/video-render.mjs --frames    the four key frames docs/soll/video-move-<n>-1280.png (the last picture of each scene)
//   node ops/video-render.mjs --check     the four key frames into a mktemp folder, compared with the committed ones, last line
//                                         video soll: 4 images, <n> defects
//   node ops/video-render.mjs --video     every picture, then src/public/video/move.mp4, src/public/video/move-poster.png and
//                                         docs/video/move.gif with ffmpeg (CP_FFMPEG, else the one of uvx --with imageio-ffmpeg)
//   --transcript <file> --tape <file>     other inputs (tests, counter-tests)
//
// Any other argument ends with exit 1 before the browser starts, so a mistyped flag never writes a picture. No network: the
// browser is ops/browser.mjs, kind "picture", and loads only a page written here. Nothing is cut: every recorded line appears
// in its order and unchanged; only waits are shortened, each to at most 1 s. Typing runs at a fixed speed, every caption 1.5 s.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decodePng, pixelDiffCount } from "./soll-assess.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const WIDTH = 1280;
export const HEIGHT = 720;
export const FPS = 30;
export const GIF_FPS = 10;
export const GIF_WIDTH = 800;
export const MAX_MS = 30000;
export const CAPTION_MS = 1500;
export const TYPE_MS = 30;
export const MAX_WAIT_MS = 1000;
/** A pause at the end of scenes 1 to 3 so the last line can be read; it is no recorded wait and never longer than one. */
export const HOLD_MS = 1000;
/**
 * The text has to stay readable where the video is shown smallest: 358 px wide on a 390 px page (measured on the SOLL pictures of
 * goals/reichweite/03), where every font, shrunk by 358 / 1280, keeps the smallest size of the kit (--t-label, 12 px).
 */
export const NARROWEST_SHOWN_PX = 358;
export const MIN_SHOWN_PX = 12;
/** The terminal: ROWS screen rows of LINE_PX, COLS characters each in the monospace font of TEXT_PX (checked in the browser). */
export const TEXT_PX = 44;
export const LINE_PX = 56;
export const COLS = 46;
export const ROWS = 10;
/**
 * Every recorded line is on screen in full for at least this long: a burst of lines in the same millisecond would otherwise
 * scroll its first lines away before a frame shows them. Real waits shorter than this are lengthened to it, never longer ones.
 */
export const MIN_LINE_MS = 100;
export const SCENES = Object.freeze([1, 2, 3, 4]);
const TURN = /Turn [^:]+: [0-9]+ tools/;

/** The tape: captions per scene and the run lines in order. */
export function parseTape(text) {
  const captions = { 1: [], 2: [], 3: [], 4: [] }, runs = [];
  for (const line of String(text).split("\n")) {
    let m;
    if ((m = line.match(/^caption ([1-4]) (.+)$/))) captions[m[1]].push(m[2]);
    else if ((m = line.match(/^run ([1-4]) (.+)$/))) runs.push({ scene: Number(m[1]), command: m[2] });
  }
  return { captions, runs };
}

/**
 * The timeline: a list of states, each shown from `at` ms on. A state is a caption card (`card`: the captions shown) or the
 * terminal of a scene (`rows`: commands with the prompt, partly typed while typing, and output lines). `lineRefs` lists, in
 * order, which transcript line ([step, line]) each new output row is, and `waits` every shortened wait in ms.
 */
export function buildTimeline(transcript, tape) {
  const steps = Array.isArray(transcript?.steps) ? transcript.steps : [];
  const states = [], lineRefs = [], waits = [];
  let t = 0;
  const push = (s) => states.push({ ...s, at: t });
  for (const scene of SCENES) {
    const caps = tape.captions[scene] ?? [];
    if (scene === 4) {
      for (let i = 0; i < caps.length; i++) { push({ scene, card: caps.slice(0, i + 1), end: true }); t += CAPTION_MS; }
      continue;
    }
    for (const c of caps) { push({ scene, card: [c] }); t += CAPTION_MS; }
    const title = caps[0] ?? "";
    const rows = [];
    const mine = steps.map((s, i) => [s, i]).filter(([s]) => s.scene === scene);
    mine.forEach(([step, si], k) => {
      for (let n = 1; n <= step.command.length; n++) {
        push({ scene, title, rows: [...rows, { kind: "cmd", text: step.command.slice(0, n), typing: n < step.command.length }] });
        t += TYPE_MS;
      }
      rows.push({ kind: "cmd", text: step.command });
      push({ scene, title, rows: [...rows] });
      let prev = 0;
      (step.lines ?? []).forEach((line, li) => {
        const wait = Math.max(MIN_LINE_MS, Math.min(MAX_WAIT_MS, line.t_ms - prev));
        waits.push(wait);
        t += wait;
        prev = line.t_ms;
        rows.push({ kind: "out", text: line.text });
        lineRefs.push([si, li]);
        push({ scene, title, rows: [...rows] });
      });
      const next = mine[k + 1]?.[0];
      if (next) {
        const wait = Math.max(0, Math.min(MAX_WAIT_MS, next.started_ms - (step.started_ms + prev)));
        waits.push(wait);
        t += wait;
      }
    });
    t += HOLD_MS;
  }
  return { states, total: t, lineRefs, waits };
}

/** Defects of a timeline against its transcript and tape: what the video would show wrong. */
export function assessTimeline(transcript, tape, tl) {
  const out = [];
  const steps = Array.isArray(transcript?.steps) ? transcript.steps : [];
  const all = steps.flatMap((s, si) => (s.lines ?? []).map((l, li) => [si, li]));
  const shown = tl.lineRefs;
  if (shown.length !== all.length || shown.some(([a, b], i) => a !== all[i][0] || b !== all[i][1])) {
    out.push(`recorded lines missing or out of order: ${shown.length} shown of ${all.length}`);
  }
  // Every recorded line appears as a row, unchanged, in the order of the recording.
  const texts = all.map(([si, li]) => steps[si].lines[li].text);
  const seen = [];
  for (const s of tl.states) if (s.rows) { const o = s.rows.filter((r) => r.kind === "out"); if (o.length > 0 && o.length > countOut(seen, s.scene)) seen.push({ scene: s.scene, text: o[o.length - 1].text }); }
  if (seen.length !== texts.length || seen.some((x, i) => x.text !== texts[i])) out.push("a recorded line is not shown unchanged in its order");
  if (tl.total > MAX_MS) out.push(`the video would run ${(tl.total / 1000).toFixed(1)} s, more than ${MAX_MS / 1000} s`);
  const long = tl.waits.find((w) => w > MAX_WAIT_MS);
  if (long !== undefined) out.push(`a wait of ${long} ms, more than ${MAX_WAIT_MS} ms`);
  const scenesShown = new Set(tl.states.map((s) => s.scene));
  for (const n of SCENES) if (!scenesShown.has(n)) out.push(`scene ${n} is missing`);
  if (steps.length !== tape.runs.length || steps.some((s, i) => s.scene !== tape.runs[i].scene || s.command !== tape.runs[i].command)) {
    out.push("the steps of the transcript are not the run lines of the tape");
  }
  const txt = (n) => steps.filter((s) => s.scene === n).flatMap((s) => (s.lines ?? []).map((l) => l.text)).join("\n");
  const p1 = steps.find((s) => s.scene === 1 && /--provision$/.test(s.command));
  if (!/"conwayApiUrl": *"https:\/\/api\.conway\.tech"/.test(txt(1)) || !p1 || p1.exit_code === 0 || !/Provision failed/.test(txt(1))) {
    out.push("scene 1 does not show an error from api.conway.tech");
  }
  if (!TURN.test(txt(3))) out.push("scene 3 does not reach a turn");
  out.push(...visibilityDefects(steps, tl));
  const flat = JSON.stringify(transcript ?? {});
  const keys = [...flat.matchAll(/\\*"apiKey\\*"\s*:\s*\\*"([^"\\]*)/g)].map((m) => m[1]);
  if (keys.some((k) => k !== "<api key hidden>") || /cnwy_k_[0-9A-Za-z]{9,}/.test(flat) || /[0-9a-fA-F]{64}/.test(flat)) {
    out.push("the transcript holds an api key");
  }
  return out;
}
function countOut(seen, scene) { return seen.filter((x) => x.scene === scene).length; }

/** The screen rows a row of the terminal takes: the prompt and the cursor count, a line breaks after COLS characters. */
export function rowsOf(r) {
  const len = r.kind === "cmd" ? 2 + r.text.length + (r.typing ? 1 : 0) : r.text.length;
  return Math.max(1, Math.ceil(len / COLS));
}

/**
 * Defects of what the screen shows: a recorded line that needs more rows than the screen holds, or one that is never in full on
 * screen for MIN_LINE_MS. The screen shows the last ROWS rows of its scene; a row counts while all of its screen rows are shown.
 */
export function visibilityDefects(steps, tl) {
  const out = [];
  const texts = steps.flatMap((s) => (s.lines ?? []).map((l) => l.text));
  texts.forEach((text, i) => { const n = rowsOf({ kind: "out", text }); if (n > ROWS) out.push(`recorded line ${i + 1} needs ${n} rows, the screen holds ${ROWS}`); });
  const offset = {};
  let k = 0;
  for (const n of SCENES) { offset[n] = k; k += steps.filter((s) => s.scene === n).reduce((a, s) => a + (s.lines ?? []).length, 0); }
  const seen = new Array(texts.length).fill(0);
  tl.states.forEach((s, i) => {
    if (!s.rows) return;
    const until = i + 1 < tl.states.length ? tl.states[i + 1].at : tl.total;
    let below = 0, o = s.rows.filter((r) => r.kind === "out").length;
    for (let j = s.rows.length - 1; j >= 0; j--) {
      const r = s.rows[j];
      below += rowsOf(r);
      if (r.kind !== "out") continue;
      o--;
      if (below <= ROWS) seen[offset[s.scene] + o] += until - s.at;
    }
  });
  seen.forEach((ms, i) => { if (ms < MIN_LINE_MS) out.push(`recorded line ${i + 1} is never in full on screen for ${MIN_LINE_MS} ms`); });
  return out;
}

/** Defects of the fonts of a page of the video: every size, shrunk to NARROWEST_SHOWN_PX, stays at MIN_SHOWN_PX or more. */
export function textDefects(page) {
  const out = [];
  for (const m of page.matchAll(/(?:font-size:|font:[^;]*?)\s(\d+(?:\.\d+)?)px/g)) {
    const px = Number(m[1]), shown = (px * NARROWEST_SHOWN_PX) / WIDTH;
    if (shown < MIN_SHOWN_PX) out.push(`a font of ${px} px is shown at ${shown.toFixed(1)} px on a 390 px page, less than ${MIN_SHOWN_PX} px`);
  }
  return out;
}

/** The frames of the video: for frame f the index of the state shown at f / FPS seconds. */
export function frameStates(tl, fps = FPS) {
  const n = Math.ceil((tl.total * fps) / 1000);
  const idx = [];
  let j = 0;
  for (let f = 0; f < n; f++) {
    const ms = (f * 1000) / fps;
    while (j + 1 < tl.states.length && tl.states[j + 1].at <= ms) j++;
    idx.push(j);
  }
  return idx;
}

/** The key frames: the last state of each scene, scene 1 to 4. */
export function keyStates(tl) {
  return SCENES.map((n) => tl.states.map((s, i) => [s, i]).filter(([s]) => s.scene === n).map(([, i]) => i).pop());
}

/** The last line of --plan. */
export function planSummary(tl, defects) {
  return `video plan: ${Math.ceil((tl.total * FPS) / 1000)} frames, ${(tl.total / 1000).toFixed(1)} s, ${new Set(tl.states.map((s) => s.scene)).size} scenes, ${tl.lineRefs.length} lines, ${defects.length} defects`;
}

const USAGE = "usage: node ops/video-render.mjs --plan | --frames | --check | --video [--transcript <file>] [--tape <file>]";
/** The arguments, or null when one is unknown, a mode is missing or doubled, or a file is missing after its flag. */
export function parseArgs(argv) {
  const out = { mode: null, transcript: path.join(ROOT, "docs/video/move.transcript.json"), tape: path.join(ROOT, "docs/video/move.tape") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--plan", "--frames", "--check", "--video"].includes(a)) { if (out.mode) return null; out.mode = a.slice(2); }
    else if (a === "--transcript" || a === "--tape") { const v = argv[++i]; if (!v || v.startsWith("--")) return null; out[a.slice(2)] = path.resolve(v); }
    else return null;
  }
  return out.mode ? out : null;
}

// ---- the picture of one state

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** The class of an output row: the lines the viewer has to see stand out, the text stays as recorded. */
function rowClass(r) {
  if (r.kind === "cmd") return "cmd";
  if (/Provision failed|"level":"error"/.test(r.text)) return "out bad";
  if (/conwayApiUrl/.test(r.text)) return "out key";
  if (TURN.test(r.text) || /<api key hidden>/.test(r.text)) return "out good";
  return "out";
}
export function stateHtml(s) {
  if (s.card) {
    if (s.end) {
      const [head, ...rest] = s.card;
      return `<div class="card end"><p class="big">${esc(head)}</p>${rest.map((c) => `<p class="sub">${esc(c)}</p>`).join("")}</div>`;
    }
    return `<div class="card"><p class="step">${s.scene} / 3</p><p class="big">${esc(s.card[0])}</p></div>`;
  }
  const rows = s.rows.map((r) => r.kind === "cmd"
    ? `<div class="row cmd"><span class="ps">$ </span>${esc(r.text)}${r.typing ? '<span class="cur"></span>' : ""}</div>`
    : `<div class="row ${rowClass(r)}">${esc(r.text) || "&nbsp;"}</div>`).join("");
  return `<div class="term"><div class="bar"><i></i><i></i><i></i><span>${esc(s.title)}</span><b>${s.scene} / 3</b></div><div class="screen"><div class="rows">${rows}</div></div></div>`;
}
export const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
:root { --bg:#0a0b09; --panel:#101310; --panel-2:#161a14; --fg:#f3f2e8; --accent:#7ee0b0; --warm:#e0a341;
  --dim: color-mix(in srgb, var(--fg) 52%, transparent); --line: color-mix(in srgb, var(--fg) 11%, transparent); }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: var(--bg); color: var(--fg);
  font-family: ui-sans-serif, system-ui, sans-serif; }
#v { width: ${WIDTH}px; height: ${HEIGHT}px; }
.card { height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 120px; }
.card .step { font: 600 ${TEXT_PX}px/1 ui-monospace, monospace; color: var(--accent); margin-bottom: 28px; letter-spacing: .04em; }
.card .big { font-size: 64px; line-height: 1.12; font-weight: 700; letter-spacing: -.01em; }
.card.end { align-items: center; text-align: center; }
.card.end .big { font-family: ui-monospace, monospace; color: var(--accent); font-size: 72px; }
.card.end .sub { font-size: 48px; margin-top: 36px; color: var(--fg); }
.term { position: absolute; inset: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
  display: flex; flex-direction: column; overflow: hidden; }
.bar { height: 80px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 18px; background: var(--panel-2);
  border-bottom: 1px solid var(--line); }
.bar i { width: 16px; height: 16px; border-radius: 50%; background: var(--line); }
.bar span { margin-left: 12px; font-size: ${TEXT_PX}px; font-weight: 600; white-space: nowrap; }
.bar b { margin-left: auto; font: 600 ${TEXT_PX}px/1 ui-monospace, monospace; color: var(--dim); }
.screen { flex: none; height: ${ROWS * LINE_PX}px; overflow: hidden; margin: 20px 18px 0; padding: 0; }
.row { font: ${TEXT_PX}px/${LINE_PX}px ui-monospace, monospace; white-space: pre-wrap; word-break: break-all; color: var(--dim); }
.row.cmd { color: var(--fg); }
.row.cmd .ps { color: var(--accent); }
.row.bad { color: var(--warm); }
.row.key { color: var(--fg); }
.row.good { color: var(--accent); }
.cur { display: inline-block; width: 24px; height: ${TEXT_PX}px; background: var(--fg); vertical-align: -8px; }
</style></head><body><div id="v"></div></body></html>`;

// ---- the browser part

const within = (ms, what, p) => Promise.race([p, new Promise((_, fail) => setTimeout(() => fail(new Error(`${what}: no answer after ${ms} ms`)), ms))]);

async function openPage(browser, file) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => browser.send(m, p, sessionId);
  const foreign = new Set();
  browser.on((msg) => {
    if (msg.sessionId === sessionId && msg.method === "Network.requestWillBeSent" && !/^(file:|data:|about:blank$)/.test(msg.params.request.url)) foreign.add(msg.params.request.url);
  });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  await send("Network.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "dark" }] });
  const url = pathToFileURL(file).href;
  await send("Page.navigate", { url });
  const deadline = Date.now() + 60000;
  while (!(await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete"`))) {
    if (Date.now() > deadline) throw new Error("the page did not load");
    await new Promise((r) => setTimeout(r, 50));
  }
  const shot = async (html) => {
    await evaluate(`(() => { document.getElementById("v").innerHTML = ${JSON.stringify(html)}; const sc = document.querySelector(".screen"); if (sc) sc.scrollTop = sc.scrollHeight; return document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))); })()`);
    const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } });
    return Buffer.from(r.data, "base64");
  };
  // The plan counts screen rows from COLS and ROWS; here the browser shows that a row of COLS characters takes one screen row, one
  // more character two, and the screen holds ROWS rows, all of them whole.
  const layout = async () => {
    const probe = (n) => stateHtml({ scene: 1, title: "", rows: [{ kind: "out", text: "x".repeat(n) }] });
    const measure = async (n) => {
      return evaluate(`(() => { document.getElementById("v").innerHTML = ${JSON.stringify(probe(n))}; return document.fonts.ready.then(() => { const r = document.querySelector(".row"), sc = document.querySelector(".screen"); return { row: r.getBoundingClientRect().height, screen: sc.clientHeight }; }); })()`);
    };
    const a = await measure(COLS), b = await measure(COLS + 1), out = [];
    if (a.row !== LINE_PX) out.push(`layout: a row of ${COLS} characters is ${a.row} px high, not ${LINE_PX}`);
    if (b.row !== 2 * LINE_PX) out.push(`layout: a row of ${COLS + 1} characters is ${b.row} px high, not ${2 * LINE_PX}`);
    if (a.screen !== ROWS * LINE_PX) out.push(`layout: the screen is ${a.screen} px high, not ${ROWS * LINE_PX}`);
    return out;
  };
  return { shot, layout, foreign, close: () => browser.send("Target.closeTarget", { targetId }) };
}

function ffmpegPath() {
  if (process.env.CP_FFMPEG) return process.env.CP_FFMPEG;
  const r = spawnSync("uvx", ["--with", "imageio-ffmpeg", "python", "-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], { encoding: "utf8", timeout: 300000 });
  const p = (r.stdout ?? "").trim().split("\n").pop();
  if (r.status !== 0 || !p || !existsSync(p)) throw new Error("no ffmpeg: set CP_FFMPEG or install uv (uvx --with imageio-ffmpeg)");
  return p;
}
function ffmpeg(bin, args) {
  const r = spawnSync(bin, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8", timeout: 600000 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr ?? "").trim().split("\n").pop()}`);
}
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) { console.error(USAGE); process.exit(1); }
  let transcript, tapeText;
  try { transcript = JSON.parse(readFileSync(args.transcript, "utf8")); tapeText = readFileSync(args.tape, "utf8"); }
  catch (e) { console.error(`video: transcript or tape not readable: ${e.message}`); process.exit(2); }
  const tape = parseTape(tapeText);
  const tl = buildTimeline(transcript, tape);
  const defects = assessTimeline(transcript, tape, tl);
  for (const d of defects) console.log(`video: defect ${d}`);
  if (args.mode === "plan") { console.log(planSummary(tl, defects)); process.exit(defects.length ? 1 : 0); }
  if (defects.length) { console.log(`video: ${defects.length} defects, nothing rendered`); process.exit(1); }

  const { findChrome, launch } = await import("./browser.mjs");
  const chrome = findChrome("picture");
  if (!chrome) { console.error("video: no Chromium under ~/.cache/ms-playwright (or SOLL_CHROME)"); process.exit(2); }
  const scratch = mkdtempSync(path.join(os.tmpdir(), "video-render-"));
  const page = path.join(scratch, "video.html");
  writeFileSync(page, PAGE);
  const browser = launch(chrome, path.join(scratch, "profile"), "picture");
  const keyOf = (dir, n) => path.join(dir, `video-move-${n}-1280.png`);
  try {
    await within(180000, "browser start", browser.send("Browser.getVersion"));
    const p = await within(120000, "page", openPage(browser, page));
    const keys = keyStates(tl);
    if (args.mode === "frames" || args.mode === "check") {
      const out = await within(60000, "layout", p.layout());
      for (const [k, si] of keys.entries()) {
        const n = k + 1, png = await within(60000, `key frame ${n}`, p.shot(stateHtml(tl.states[si])));
        if (args.mode === "frames") { writeFileSync(keyOf(path.join(ROOT, "docs/soll"), n), png); console.log(`video soll: key frame ${n} written`); continue; }
        const committed = keyOf(path.join(ROOT, "docs/soll"), n);
        if (!existsSync(committed)) { out.push(`key frame ${n}: no committed picture to compare with`); continue; }
        const a = decodePng(readFileSync(committed)), b = decodePng(png);
        if (a.width !== WIDTH || a.height !== HEIGHT) out.push(`key frame ${n}: committed picture is ${a.width}x${a.height}`);
        const diff = pixelDiffCount(a, b);
        if (diff > 0) out.push(`key frame ${n}: ${diff} pixels differ from a fresh render`);
        console.log(`video soll: key frame ${n}, diff ${diff} px`);
      }
      for (const u of p.foreign) out.push(`request to a foreign address: ${u}`);
      for (const d of out) console.log(`video soll: defect ${d}`);
      if (args.mode === "check") { console.log(`video soll: 4 images, ${out.length} defects`); process.exitCode = out.length ? 1 : 0; }
      return;
    }
    const bad = await within(60000, "layout", p.layout());
    if (bad.length) throw new Error(bad[0]);
    // --video: every state that some frame shows, once, then ffmpeg concat with the duration of each run of frames.
    const idx = frameStates(tl);
    const runs = [];
    for (const i of idx) { if (runs.length && runs[runs.length - 1].i === i) runs[runs.length - 1].n++; else runs.push({ i, n: 1 }); }
    const files = new Map();
    for (const r of runs) if (!files.has(r.i)) {
      const f = path.join(scratch, `s${String(r.i).padStart(5, "0")}.png`);
      writeFileSync(f, await within(60000, `state ${r.i}`, p.shot(stateHtml(tl.states[r.i]))));
      files.set(r.i, f);
    }
    if (p.foreign.size) throw new Error(`request to a foreign address: ${[...p.foreign][0]}`);
    const list = runs.map((r) => `file '${files.get(r.i)}'\nduration ${(r.n / FPS).toFixed(6)}`).join("\n") + `\nfile '${files.get(runs[runs.length - 1].i)}'\n`;
    writeFileSync(path.join(scratch, "list.txt"), list);
    const bin = ffmpegPath();
    const comment = `transcript_sha256=${sha256(args.transcript)} tape_sha256=${sha256(args.tape)}`;
    const mp4 = path.join(ROOT, "src/public/video/move.mp4"), poster = path.join(ROOT, "src/public/video/move-poster.png"), gif = path.join(ROOT, "docs/video/move.gif");
    mkdirSync(path.dirname(mp4), { recursive: true });
    const input = ["-f", "concat", "-safe", "0", "-i", path.join(scratch, "list.txt")];
    ffmpeg(bin, [...input, "-vf", `fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-tune", "stillimage",
      "-frames:v", String(idx.length), "-an", "-movflags", "+faststart", "-map_metadata", "-1", "-metadata", `comment=${comment}`, mp4]);
    ffmpeg(bin, [...input, "-vf", `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none`,
      "-frames:v", String(Math.ceil((tl.total * GIF_FPS) / 1000)), gif]);
    // The poster is key frame 2, byte for byte (decision 6).
    const k2 = keyOf(path.join(ROOT, "docs/soll"), 2);
    if (!existsSync(k2)) throw new Error("key frame 2 missing: run --frames first");
    copyFileSync(k2, poster);
    console.log(`video: ${idx.length} frames, ${files.size} pictures, ${(tl.total / 1000).toFixed(1)} s, written move.mp4, move-poster.png, move.gif`);
  } finally {
    await browser.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // exit at once: the timers of within() would otherwise keep node alive for minutes after the work is done
  main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(`video: ${e.message}`); process.exit(2); });
}
