// SOLL picture of the preview card /og.png (goals/umzug/03): the picture every shared link of automatonhost.com shows. Renders the
// source docs/soll/src/og-card.html with the headless Chromium from ~/.cache/ms-playwright/ at 1200 x 630 CSS pixels and device
// scale factor 2 into docs/soll/og-card.png (2400 x 1260).
//
//   node ops/soll-og.mjs                          render and write the picture, then report defects
//   node ops/soll-og.mjs --check                  render into a mktemp folder, compare with the committed picture, exit 1 on any
//                                                 defect
//   node ops/soll-og.mjs --check --source <file> [--pictures <dir>]
//                                                 the same with another source: src/public/og-card.html, which has to match the
//                                                 picture pixel for pixel, or a counter-test with a planted defect
//
// The tool never writes to src/public/: src/public/og.png is a copy of docs/soll/og-card.png, made by hand after the approval.
// No network, no port, no package: the browser part is ops/browser.mjs. The judgement is assessOg() in ops/soll-assess.mjs, a pure
// function that test/soll-og.test.ts checks without a browser.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OG_CARD, assessOg, decodePng, isLocal, pixelDiffCount, summaryOg } from "./soll-assess.mjs";
import { findChrome, launch } from "./browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback; };
const CHECK = flag("--check");
// Every argument is a known flag or the value right after --source or --pictures; anything else ends the tool here, before it
// renders or writes a picture, so a check command with a misspelt flag cannot overwrite the committed picture.
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--source" || args[i] === "--pictures") { i++; continue; }
  if (args[i] !== "--check") { console.error(`unknown argument: ${args[i]}`); process.exit(1); }
}
const SOURCE = value("--source", path.join(ROOT, "docs/soll/src/og-card.html"));
const PICTURES = value("--pictures", path.join(ROOT, "docs/soll"));
const PICTURE = path.join(PICTURES, "og-card.png");

// Limits against a hanging browser, not a measure of the card: the judgement is assessOg() alone.
const START_MS = 180000;
const RENDER_MS = 120000;
const LOAD_MS = 60000;
const within = (ms, what, p) => Promise.race([p, new Promise((_, fail) => setTimeout(() => fail(new Error(`${what}: no answer after ${ms} ms`)), ms))]);

async function render(browser, url) {
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
  await send("Network.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: OG_CARD.width, height: OG_CARD.height, deviceScaleFactor: OG_CARD.scale, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "dark" }] });
  await send("Page.navigate", { url });
  // Polling the document instead of the load event, which can still be the one of about:blank (see ops/soll.mjs).
  const deadline = Date.now() + LOAD_MS;
  while (!(await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete"`))) {
    if (Date.now() > deadline) throw new Error("render og: page did not load");
    await new Promise((r) => setTimeout(r, 50));
  }
  await evaluate("document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))");
  const m = await evaluate(`(() => {
      const b = document.body;
      // html and body clip at the card's edge, so the furthest element box counts. Not the scroll size: the glow body::before
      // reaches past the edge on purpose and is clipped, and it is no element of its own.
      let right = 0, bottom = 0;
      for (const el of b.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        right = Math.max(right, Math.ceil(r.right - 0.5));
        bottom = Math.max(bottom, Math.ceil(r.bottom - 0.5));
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
      return { contentWidth: right, contentHeight: bottom, named, text: b.innerText };
    })()`);
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: OG_CARD.width, height: OG_CARD.height, scale: 1 } });
  await browser.send("Target.closeTarget", { targetId });
  return { ...m, foreign: [...foreign, ...m.named], png: Buffer.from(shot.data, "base64") };
}

async function main() {
  const chrome = findChrome("picture");
  if (!chrome) { console.error("soll og: no Chromium under ~/.cache/ms-playwright (or SOLL_CHROME)"); process.exit(2); }
  if (!existsSync(SOURCE)) { console.error(`soll og: source missing: ${SOURCE}`); process.exit(2); }
  const scratch = mkdtempSync(path.join(os.tmpdir(), "soll-og-"));
  // The fonts are part of the picture: launch() in ops/browser.mjs starts the kind "picture" with
  // env: { ...process.env, FONTCONFIG_FILE: fonts }, fonts being FONTS_CONF of ops/soll-assess.mjs next to the profile.
  const browser = launch(chrome, path.join(scratch, "profile"), "picture");
  let result;
  try {
    await within(START_MS, "browser start", browser.send("Browser.getVersion"));
    const r = await within(RENDER_MS, "render og", render(browser, pathToFileURL(SOURCE).href));
    const fresh = decodePng(r.png);
    let diffPixels = null, pngWidth, pngHeight;
    if (CHECK) {
      writeFileSync(path.join(scratch, "og-card.png"), r.png);
      if (existsSync(PICTURE)) { const old = decodePng(readFileSync(PICTURE)); pngWidth = old.width; pngHeight = old.height; diffPixels = pixelDiffCount(old, fresh); }
    } else {
      writeFileSync(PICTURE, r.png);
      pngWidth = fresh.width; pngHeight = fresh.height; diffPixels = 0;
    }
    const defects = assessOg({ width: fresh.width, height: fresh.height, pngWidth, pngHeight, diffPixels,
      contentWidth: r.contentWidth, contentHeight: r.contentHeight, text: r.text, foreign: r.foreign });
    for (const d of defects) console.log(`soll og: defect ${d}`);
    result = { width: fresh.width, height: fresh.height, diffPixels, defects };
  } finally {
    await browser.close();
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(summaryOg(result));
  process.exit(result.defects.length ? 1 : 0);
}

main().catch((e) => { console.error(`soll og: ${e.message}`); process.exit(2); });
