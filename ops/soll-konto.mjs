// SOLL pictures of the account step of the phone page /h/{code} (goals/konto/03). Renders the two sources
// docs/soll/src/konto-<state>.html with the headless Chromium from ~/.cache/ms-playwright/ into docs/soll/konto-<state>-<width>.png,
// full page, width as in the name.
//
//   node ops/soll-konto.mjs                       render and write all four pictures, then report defects
//   node ops/soll-konto.mjs --pruefen             (German for "check") render into a mktemp folder, compare with the committed
//                                                 pictures, exit 1 on any defect
//   node ops/soll-konto.mjs --pruefen --source <dir> [--pictures <dir>]
//                                                 the same with the two sources konto-<state>.html from another folder: the real
//                                                 page written by ops/soll-live-konto.mjs, or a counter-test with planted defects
//
// No network, no port, no package: the browser part is the one of ops/soll-handoff.mjs (which stays as it is, because the audit
// runs the frozen checks of konto 02 against it), plus a look at the attributes for addresses of other services that the page
// names without requesting them. The judgement is assessKonto() in ops/soll-assess.mjs, a pure function that
// test/soll-konto.test.ts checks without a browser.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FOLD, KONTO_STATES, WIDTHS, assessKonto, decodePng, isLocal, pixelDiffCount, summaryKonto } from "./soll-assess.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback; };
const CHECK = flag("--pruefen");
const SOURCES = value("--source", path.join(ROOT, "docs/soll/src"));
const PICTURES = value("--pictures", path.join(ROOT, "docs/soll"));
const sourceOf = (state) => path.join(SOURCES, `konto-${state}.html`);
const pictureOf = (dir, state, w) => path.join(dir, `konto-${state}-${w}.png`);

function findChrome() {
  if (process.env.SOLL_CHROME) return process.env.SOLL_CHROME;
  const base = path.join(os.homedir(), ".cache", "ms-playwright");
  const candidates = existsSync(base) ? readdirSync(base) : [];
  const pick = (prefix, rel) => candidates.filter((d) => d.startsWith(prefix)).sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()))
    .map((d) => path.join(base, d, rel)).find((p) => existsSync(p));
  return pick("chromium_headless_shell-", "chrome-headless-shell-linux64/chrome-headless-shell") ?? pick("chromium-", "chrome-linux64/chrome");
}

/** A DevTools session over --remote-debugging-pipe: fd 3 into the browser, fd 4 out of it, messages ending in NUL. */
function launch(chrome, profile) {
  // --no-sandbox as Playwright passes it: the code-host allows no user namespaces, and the only page loaded is our own file.
  const child = spawn(chrome, [
    "--headless", "--no-sandbox", "--remote-debugging-pipe", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text",
    "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions",
    "--disable-default-apps", "--mute-audio", "--host-resolver-rules=MAP * ~NOTFOUND", "--allow-file-access-from-files",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  let id = 0, rest = "", stderr = "";
  const waiting = new Map(), listeners = [];
  for (const s of [child.stdio[3], child.stdio[4]]) s.on("error", () => { /* reported through exit below */ });
  child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-4000); });
  child.stdio[4].on("data", (d) => {
    rest += d.toString("utf8");
    let end;
    while ((end = rest.indexOf("\0")) >= 0) {
      const msg = JSON.parse(rest.slice(0, end));
      rest = rest.slice(end + 1);
      if (msg.id && waiting.has(msg.id)) {
        const { ok, fail } = waiting.get(msg.id); waiting.delete(msg.id);
        msg.error ? fail(new Error(`${msg.error.message} (${msg.error.code})`)) : ok(msg.result);
      } else if (msg.method) for (const l of listeners) l(msg);
    }
  });
  const exited = new Promise((resolve) => child.on("exit", resolve));
  exited.then(() => { for (const { fail } of waiting.values()) fail(new Error(`browser exited: ${stderr.trim().split("\n").pop() ?? ""}`)); });
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const n = ++id; waiting.set(n, { ok, fail });
    child.stdio[3].write(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
  const close = async () => { try { await send("Browser.close"); } catch { /* already gone */ } await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]); if (child.exitCode === null) child.kill("SIGKILL"); };
  return { send, on: (l) => listeners.push(l), close };
}

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
  const settle = () => evaluate("document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))");
  const metrics = (height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send("Network.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Page.enable");
  await metrics(FOLD[width] ?? 900);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "dark" }] });
  await send("Page.navigate", { url });
  // Polling the document instead of the load event, which can still be the one of about:blank (see ops/soll.mjs).
  const deadline = Date.now() + 20000;
  while (!(await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete"`))) {
    if (Date.now() > deadline) throw new Error(`render ${width}: page did not load`);
    await new Promise((r) => setTimeout(r, 50));
  }
  await settle();
  const m = await evaluate(`(() => {
      const d = document.documentElement, b = document.body, u = document.querySelector('[data-soll="passkey"]');
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
  const chrome = findChrome();
  if (!chrome) { console.error("soll konto: no Chromium under ~/.cache/ms-playwright (or SOLL_CHROME)"); process.exit(2); }
  for (const state of KONTO_STATES) if (!existsSync(sourceOf(state))) { console.error(`soll konto: source missing: ${sourceOf(state)}`); process.exit(2); }
  const scratch = mkdtempSync(path.join(os.tmpdir(), "soll-konto-"));
  const browser = launch(chrome, path.join(scratch, "profile"));
  const results = [];
  try {
    for (const state of KONTO_STATES) for (const width of WIDTHS) {
      const r = await within(60000, `render ${state} ${width}`, renderAt(browser, width, pathToFileURL(sourceOf(state)).href));
      const fresh = decodePng(r.png);
      let diffPixels = null, pngWidth;
      if (CHECK) {
        writeFileSync(path.join(scratch, `konto-${state}-${width}.png`), r.png);
        const committed = pictureOf(PICTURES, state, width);
        if (existsSync(committed)) { const old = decodePng(readFileSync(committed)); pngWidth = old.width; diffPixels = pixelDiffCount(old, fresh); }
      } else {
        writeFileSync(pictureOf(PICTURES, state, width), r.png);
        pngWidth = fresh.width; diffPixels = 0;
      }
      const defects = assessKonto({ state, width, pngWidth, diffPixels, scrollWidth: r.scrollWidth, text: r.text, foreign: r.foreign, blockBottom: r.blockBottom });
      for (const d of defects) console.log(`soll konto: defect ${d}`);
      console.log(`soll konto: ${state} ${width} px, ${fresh.height} px tall, diff ${diffPixels === null ? "nothing to compare" : diffPixels + " px"}`);
      results.push({ state, width, blockBottom: r.blockBottom, defects });
    }
  } finally {
    await browser.close();
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(summaryKonto(results));
  process.exit(results.some((r) => r.defects.length) ? 1 : 0);
}

main().catch((e) => { console.error(`soll konto: ${e.message}`); process.exit(2); });
