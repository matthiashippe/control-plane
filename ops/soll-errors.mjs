// SOLL pictures of the error pages /errors/{slug} (goals/reichweite/01): one page per error text a Conway operator searches for,
// with the conwayApiUrl line in the first screen. Renders the three sources docs/soll/src/errors-<slug>.html with the headless
// Chromium from ~/.cache/ms-playwright/ into docs/soll/errors-<slug>-<width>.png, full page, width as in the name.
//
//   node ops/soll-errors.mjs                       render and write all six pictures, then report defects
//   node ops/soll-errors.mjs --check               render into a mktemp folder, compare with the committed pictures, exit 1 on
//                                                  any defect
//   node ops/soll-errors.mjs --check --source <dir> [--pictures <dir>]
//                                                  the same with the three sources errors-<slug>.html from another folder: the
//                                                  real pages written by ops/soll-live-errors.mjs, or a counter-test with
//                                                  planted defects
//
// Any other argument ends with exit 1 before the browser starts, so a mistyped flag never writes a picture. No network, no
// port, no package: the browser part is ops/browser.mjs. The judgement is assessErrors() in ops/soll-assess.mjs, a pure
// function that test/soll-errors.test.ts checks without a browser.
//
// A foreign address is a request to anything that is not file: or data:, or an address of another service named in an attribute
// that loads something (src, srcset, poster, data, background, a <link> href, a style url()). A link a reader clicks, such as the
// Source link to github.com in the frame of every page, loads nothing and is not counted, as on the start page (ops/soll.mjs).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ERROR_BLOCK, ERROR_SLUGS, FOLD, WIDTHS, assessErrors, decodePng, isLocal, pixelDiffCount, summaryErrors } from "./soll-assess.mjs";
import { findChrome, launch } from "./browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "usage: node ops/soll-errors.mjs [--check] [--source <dir>] [--pictures <dir>]";
/** The arguments, or null when one of them is unknown or a folder is missing after its flag. */
function parseArgs(argv) {
  const out = { check: false, source: null, pictures: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") out.check = true;
    else if (a === "--source" || a === "--pictures") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) return null;
      out[a.slice(2)] = path.resolve(v);
    } else return null;
  }
  return out;
}
const parsed = parseArgs(process.argv.slice(2));
if (!parsed) { console.error(USAGE); process.exit(1); }
const CHECK = parsed.check;
const SOURCES = parsed.source ?? path.join(ROOT, "docs/soll/src");
const PICTURES = parsed.pictures ?? path.join(ROOT, "docs/soll");
const sourceOf = (slug) => path.join(SOURCES, `errors-${slug}.html`);
const pictureOf = (dir, slug, w) => path.join(dir, `errors-${slug}-${w}.png`);

// Limits against a hanging browser, not a measure of the page: the judgement is assessErrors() alone.
const START_MS = 180000;
const RENDER_MS = 120000;
const LOAD_MS = 60000;
const within = (ms, what, p) => Promise.race([p, new Promise((_, fail) => setTimeout(() => fail(new Error(`${what}: no answer after ${ms} ms`)), ms))]);

async function renderAt(browser, width, url, block) {
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
  const settle = () => evaluate("document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))");
  const metrics = (height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send("Network.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Page.enable");
  await metrics(FOLD[width] ?? 900);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "dark" }] });
  await send("Page.navigate", { url });
  // Polling the document instead of the load event, which can still be the one of about:blank (see ops/soll.mjs).
  const deadline = Date.now() + LOAD_MS;
  while (!(await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete"`))) {
    if (Date.now() > deadline) throw new Error(`render ${width}: page did not load`);
    await new Promise((r) => setTimeout(r, 50));
  }
  await settle();
  const m = await evaluate(`(() => {
      const d = document.documentElement, b = document.body, u = document.querySelector(${JSON.stringify(`[data-soll="${block}"]`)});
      // html and .hero clip sideways, so every box that pokes out counts, except inside a container that scrolls sideways.
      const W = window.innerWidth;
      let over = Math.max(d.scrollWidth, b.scrollWidth);
      for (const el of b.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || (r.right <= W + 0.5 && r.left >= -0.5)) continue;
        let p = el.parentElement, scrolls = false;
        for (; p && p !== b; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") { scrolls = true; break; } }
        if (!scrolls) over = Math.max(over, Math.ceil(r.right), W + Math.ceil(-r.left));
      }
      // Addresses of other services named in attributes count even when nothing loads them (a link, a form target, a style).
      const named = [];
      // No backslash in here: this text is a template literal, which would eat it.
      const far = (v) => { const t = v.trim().toLowerCase(); return t.startsWith("//") || t.startsWith("http:") || t.startsWith("https:"); };
      // Only attributes that load something; see the head of this file for why a clicked link does not count.
      const URLS = new Set(["src", "poster", "data", "background", "xlink:href"]);
      for (const el of document.querySelectorAll("*")) for (const at of el.attributes) {
        const n = at.name.toLowerCase(), v = at.value, flat = v.toLowerCase().split("'").join("").split('"').join("").split(" ").join("");
        const loads = URLS.has(n) || (n === "href" && el.tagName === "LINK");
        if ((loads && far(v)) || (n === "srcset" && v.split(",").some(far))
            || (n === "style" && ["url(http:", "url(https:", "url(//"].some((p) => flat.includes(p)))) named.push(n + "=" + v.trim().slice(0, 120));
      }
      return { scrollWidth: over, height: Math.max(d.scrollHeight, b.scrollHeight), named,
               text: b.innerText, blockBottom: u ? Math.round(u.getBoundingClientRect().bottom + window.scrollY) : null };
    })()`);
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
  return { ...m, width, foreign: [...foreign, ...m.named], png: Buffer.from(shot.data, "base64") };
}

async function main() {
  const chrome = findChrome("picture");
  if (!chrome) { console.error("soll errors: no Chromium under ~/.cache/ms-playwright (or SOLL_CHROME)"); process.exit(2); }
  for (const slug of ERROR_SLUGS) if (!existsSync(sourceOf(slug))) { console.error(`soll errors: source missing: ${sourceOf(slug)}`); process.exit(2); }
  const scratch = mkdtempSync(path.join(os.tmpdir(), "soll-errors-"));
  // The fonts are part of the picture: launch() in ops/browser.mjs starts the kind "picture" with the reference fonts.
  const browser = launch(chrome, path.join(scratch, "profile"), "picture");
  const results = [];
  try {
    await within(START_MS, "browser start", browser.send("Browser.getVersion"));
    for (const slug of ERROR_SLUGS) for (const width of WIDTHS) {
      const r = await within(RENDER_MS, `render ${slug} ${width}`, renderAt(browser, width, pathToFileURL(sourceOf(slug)).href, ERROR_BLOCK));
      const fresh = decodePng(r.png);
      let diffPixels = null, pngWidth;
      if (CHECK) {
        const committed = pictureOf(PICTURES, slug, width);
        if (existsSync(committed)) { const old = decodePng(readFileSync(committed)); pngWidth = old.width; diffPixels = pixelDiffCount(old, fresh); }
      } else {
        writeFileSync(pictureOf(PICTURES, slug, width), r.png);
        pngWidth = fresh.width; diffPixels = 0;
      }
      const defects = assessErrors({ slug, width, pngWidth, diffPixels, scrollWidth: r.scrollWidth, text: r.text, foreign: r.foreign, blockBottom: r.blockBottom });
      for (const d of defects) console.log(`soll errors: defect ${d}`);
      console.log(`soll errors: ${slug} ${width} px, ${fresh.height} px tall, diff ${diffPixels === null ? "nothing to compare" : diffPixels + " px"}`);
      results.push({ slug, width, blockBottom: r.blockBottom, defects });
    }
  } finally {
    await browser.close();
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(summaryErrors(results));
  process.exit(results.some((r) => r.defects.length) ? 1 : 0);
}

main().catch((e) => { console.error(`soll errors: ${e.message}`); process.exit(2); });
