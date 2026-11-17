// SOLL pictures of money in and out on the phone page /h/{code} (goals/konto/05): adding money by card, sending money to the
// person's own bank account, and tapping again after a check that did not go through. Renders the seven sources
// docs/soll/src/money-<state>.html with the headless Chromium from ~/.cache/ms-playwright/ into
// docs/soll/money-<state>-<width>.png, full page, width as in the name.
//
//   node ops/soll-money.mjs                       render and write all fourteen pictures, then report defects
//   node ops/soll-money.mjs --check               render into a mktemp folder, compare with the committed pictures, exit 1 on
//                                                 any defect
//   node ops/soll-money.mjs --check --source <dir> [--pictures <dir>]
//                                                 the same with the seven sources money-<state>.html from another folder: the
//                                                 real page written by ops/soll-live-money.mjs, or a counter-test with planted
//                                                 defects
//
// Any other argument ends with exit 1 before the browser starts, so a mistyped flag never writes a picture. No network, no
// port, no package: the browser part is ops/browser.mjs. The judgement is assessMoney() in ops/soll-assess.mjs, a pure
// function that test/soll-money.test.ts checks without a browser.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FOLD, MONEY_BLOCKS, MONEY_STATES, WIDTHS, assessMoney, decodePng, isLocal, pixelDiffCount, summaryMoney } from "./soll-assess.mjs";
import { findChrome, launch } from "./browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "usage: node ops/soll-money.mjs [--check] [--source <dir>] [--pictures <dir>]";
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
const sourceOf = (state) => path.join(SOURCES, `money-${state}.html`);
const pictureOf = (dir, state, w) => path.join(dir, `money-${state}-${w}.png`);

// Limits against a hanging browser, not a measure of the page: the judgement is assessMoney() alone.
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
      const URLS = new Set(["href", "src", "action", "formaction", "poster", "data", "background", "ping", "xlink:href", "cite"]);
      for (const el of document.querySelectorAll("*")) for (const at of el.attributes) {
        const n = at.name.toLowerCase(), v = at.value, flat = v.toLowerCase().split("'").join("").split('"').join("").split(" ").join("");
        if ((URLS.has(n) && far(v)) || (n === "srcset" && v.split(",").some(far))
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
  if (!chrome) { console.error("soll money: no Chromium under ~/.cache/ms-playwright (or SOLL_CHROME)"); process.exit(2); }
  for (const state of MONEY_STATES) if (!existsSync(sourceOf(state))) { console.error(`soll money: source missing: ${sourceOf(state)}`); process.exit(2); }
  const scratch = mkdtempSync(path.join(os.tmpdir(), "soll-money-"));
  // The fonts are part of the picture: launch() in ops/browser.mjs starts the kind "picture" with
  // env: { ...process.env, FONTCONFIG_FILE: fonts }, fonts being FONTS_CONF of ops/soll-assess.mjs next to the profile.
  const browser = launch(chrome, path.join(scratch, "profile"), "picture");
  const results = [];
  try {
    // The browser start gets its own limit: on a shared host under load (swap full, load above 100) a cold start took longer than
    // the 60 s of one render, and the first picture failed although the page was fine (audit 2026-11-14, line 386).
    await within(START_MS, "browser start", browser.send("Browser.getVersion"));
    for (const state of MONEY_STATES) for (const width of WIDTHS) {
      const r = await within(RENDER_MS, `render ${state} ${width}`, renderAt(browser, width, pathToFileURL(sourceOf(state)).href, MONEY_BLOCKS[state]));
      const fresh = decodePng(r.png);
      let diffPixels = null, pngWidth;
      if (CHECK) {
        writeFileSync(path.join(scratch, `money-${state}-${width}.png`), r.png);
        const committed = pictureOf(PICTURES, state, width);
        if (existsSync(committed)) { const old = decodePng(readFileSync(committed)); pngWidth = old.width; diffPixels = pixelDiffCount(old, fresh); }
      } else {
        writeFileSync(pictureOf(PICTURES, state, width), r.png);
        pngWidth = fresh.width; diffPixels = 0;
      }
      const defects = assessMoney({ state, width, pngWidth, diffPixels, scrollWidth: r.scrollWidth, text: r.text, foreign: r.foreign, blockBottom: r.blockBottom });
      for (const d of defects) console.log(`soll money: defect ${d}`);
      console.log(`soll money: ${state} ${width} px, ${fresh.height} px tall, diff ${diffPixels === null ? "nothing to compare" : diffPixels + " px"}`);
      results.push({ state, width, blockBottom: r.blockBottom, defects });
    }
  } finally {
    await browser.close();
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(summaryMoney(results));
  process.exit(results.some((r) => r.defects.length) ? 1 : 0);
}

main().catch((e) => { console.error(`soll money: ${e.message}`); process.exit(2); });
