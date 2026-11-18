// SOLL pictures of the start page (goals/seite/01). Renders docs/soll/src/startseite.html with the headless Chromium from
// ~/.cache/ms-playwright/ into docs/soll/startseite-390.png and docs/soll/startseite-1440.png, full page, width as in the name.
//
//   node ops/soll.mjs                    render and write both pictures, then report defects
//   node ops/soll.mjs --check            render into a mktemp folder, compare with the committed pictures, exit 1 on any defect
//   node ops/soll.mjs --check --source <file> --pictures <dir>
//                                        the same against another source or picture folder (counter-test with planted defects)
//
// No network: the browser talks over a pipe (no debugging port), every host name resolves to nothing, and every request that is
// not file: or data: is failed and counted as a defect. No package beyond Node: the DevTools protocol is spoken by hand in ops/browser.mjs.
// The judgement is ops/soll-assess.mjs, a pure module that test/soll.test.ts checks without a browser.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FOLD, WIDTHS, assess, decodePng, isLocal, pixelDiffCount, summary } from "./soll-assess.mjs";
import { findChrome, launch } from "./browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback; };
const CHECK = flag("--check");
// Every argument is a known flag or the value right after --source or --pictures; anything else ends the tool here, before it
// renders or writes a picture, so a check command with an old or misspelt flag cannot overwrite the committed pictures.
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--source" || args[i] === "--pictures") { i++; continue; }
  if (args[i] !== "--check") { console.error(`unknown argument: ${args[i]}`); process.exit(1); }
}
const SOURCE = value("--source", path.join(ROOT, "docs/soll/src/startseite.html"));
const PICTURES = value("--pictures", path.join(ROOT, "docs/soll"));
const pictureOf = (dir, w) => path.join(dir, `startseite-${w}.png`);

const within = (ms, what, p) => Promise.race([p, new Promise((_, fail) => setTimeout(() => fail(new Error(`${what}: no answer after ${ms} ms`)), ms))]);

async function renderAt(browser, width, url) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => browser.send(m, p, sessionId);
  const foreign = new Set();
  browser.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Fetch.requestPaused") {
      const u = msg.params.request.url;
      if (isLocal(u)) send("Fetch.continueRequest", { requestId: msg.params.requestId }).catch(() => {});
      else { foreign.add(u); send("Fetch.failRequest", { requestId: msg.params.requestId, errorReason: "BlockedByClient" }).catch(() => {}); }
    } else if (msg.method === "Network.requestWillBeSent") {
      const u = msg.params.request.url;
      if (!isLocal(u)) foreign.add(u);
    }
  });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  // Two frames after the last change, so layout and paint have caught up even on a loaded machine.
  const settle = () => evaluate("document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))");
  const metrics = (height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send("Network.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Page.enable");
  await metrics(FOLD[width] ?? 900);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "dark" }] });
  await send("Page.navigate", { url });
  // Waiting on the load event is not enough: the one of about:blank can arrive after Page.enable. The document itself says when.
  const deadline = Date.now() + 20000;
  while (!(await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete"`))) {
    if (Date.now() > deadline) throw new Error(`render ${width}: page did not load`);
    await new Promise((r) => setTimeout(r, 50));
  }
  await settle();
  const m = await evaluate(`(() => {
      const d = document.documentElement, b = document.body, u = document.querySelector('[data-soll="move"]');
      // The page sets overflow-x: clip on html and .hero, so scrollWidth alone stays at the viewport while content is cut off.
      // Every box that pokes out counts, except inside a container the reader can scroll sideways (tables, long code).
      const W = window.innerWidth;
      let over = Math.max(d.scrollWidth, b.scrollWidth);
      for (const el of b.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || (r.right <= W + 0.5 && r.left >= -0.5)) continue;
        let p = el.parentElement, scrolls = false;
        for (; p && p !== b; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") { scrolls = true; break; } }
        if (!scrolls) over = Math.max(over, Math.ceil(r.right), W + Math.ceil(-r.left));
      }
      return { scrollWidth: over, height: Math.max(d.scrollHeight, b.scrollHeight),
               text: b.innerText, moveBottom: u ? Math.round(u.getBoundingClientRect().bottom + window.scrollY) : null };
    })()`);
  // The full page in one viewport instead of captureBeyondViewport, whose internal resize raced the paint under load.
  const pageHeight = () => evaluate("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)");
  let height = m.height;
  for (let i = 0; i < 3; i++) {
    await metrics(height);
    await settle();
    const now = await pageHeight();
    if (now === height) break;
    height = now;
  }
  m.height = height;
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 } });
  await browser.send("Target.closeTarget", { targetId });
  return { ...m, width, foreign: [...foreign], png: Buffer.from(shot.data, "base64") };
}

async function main() {
  const chrome = findChrome("picture");
  if (!chrome) { console.error("soll: no Chromium under ~/.cache/ms-playwright (or SOLL_CHROME)"); process.exit(2); }
  if (!existsSync(SOURCE)) { console.error(`soll: source missing: ${SOURCE}`); process.exit(2); }
  const scratch = mkdtempSync(path.join(os.tmpdir(), "soll-"));
  // The fonts are part of the picture: launch() in ops/browser.mjs starts the kind "picture" with
  // env: { ...process.env, FONTCONFIG_FILE: fonts }, fonts being FONTS_CONF of ops/soll-assess.mjs next to the profile.
  const browser = launch(chrome, path.join(scratch, "profile"), "picture");
  const results = [];
  try {
    for (const width of WIDTHS) {
      const r = await within(60000, `render ${width}`, renderAt(browser, width, pathToFileURL(SOURCE).href));
      const fresh = decodePng(r.png);
      let diffPixels = null, pngWidth;
      if (CHECK) {
        writeFileSync(path.join(scratch, `startseite-${width}.png`), r.png);
        const committed = pictureOf(PICTURES, width);
        if (existsSync(committed)) { const old = decodePng(readFileSync(committed)); pngWidth = old.width; diffPixels = pixelDiffCount(old, fresh); }
      } else {
        writeFileSync(pictureOf(PICTURES, width), r.png);
        pngWidth = fresh.width; diffPixels = 0;
      }
      const defects = assess({ width, pngWidth, diffPixels, scrollWidth: r.scrollWidth, text: r.text, foreign: r.foreign, moveBottom: r.moveBottom });
      for (const d of defects) console.log(`soll: defect ${d}`);
      console.log(`soll: ${width} px, ${fresh.height} px tall, diff ${diffPixels === null ? "nothing to compare" : diffPixels + " px"}`);
      results.push({ width, moveBottom: r.moveBottom, defects });
    }
  } finally {
    await browser.close();
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(summary(results));
  process.exit(results.some((r) => r.defects.length) ? 1 : 0);
}

main().catch((e) => { console.error(`soll: ${e.message}`); process.exit(2); });
