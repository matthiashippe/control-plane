// The one browser driver of ops/ (goals/konto/08): finding Chromium, its arguments and a DevTools session over a pipe, shared by
// the five SOLL tools (kind "picture") and the three runs on Base Sepolia (kind "passkey").
//
//   picture  the headless shell with fixed fonts and no network: SOLL_CHROME first, then the newest chromium_headless_shell-*,
//            then the newest chromium-* under ~/.cache/ms-playwright
//   passkey  the full Chromium with --headless=new for the virtual authenticator, loading real pages: only the newest chromium-*
//
// No package beyond Node: the DevTools protocol is spoken by hand, and test/browser.test.ts checks this module without a real browser.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FONTS_CONF } from "./soll-assess.mjs";

const KINDS = ["picture", "passkey"];
const kindOf = (kind) => { if (!KINDS.includes(kind)) throw new Error(`unknown browser kind: ${kind}`); return kind; };

export function findChrome(kind) {
  if (kindOf(kind) === "picture" && process.env.SOLL_CHROME) return process.env.SOLL_CHROME;
  const base = path.join(os.homedir(), ".cache", "ms-playwright");
  const candidates = existsSync(base) ? readdirSync(base) : [];
  const pick = (prefix, rel) => candidates.filter((d) => d.startsWith(prefix)).sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()))
    .map((d) => path.join(base, d, rel)).find((p) => existsSync(p));
  if (kind === "passkey") return pick("chromium-", "chrome-linux64/chrome");
  return pick("chromium_headless_shell-", "chrome-headless-shell-linux64/chrome-headless-shell") ?? pick("chromium-", "chrome-linux64/chrome");
}

/** The arguments Chrome starts with, per kind, in the order the committed pictures were rendered with. */
export function chromeArgs(kind, profile) {
  // --no-sandbox as Playwright passes it: the code-host allows no user namespaces.
  if (kindOf(kind) === "passkey") return [
    "--headless=new", "--no-sandbox", "--remote-debugging-pipe", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "--disable-sync", "--disable-component-update",
    "about:blank",
  ];
  // For pictures the only page loaded is our own file, and every host name resolves to nothing.
  return [
    "--headless", "--no-sandbox", "--remote-debugging-pipe", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text",
    "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions",
    "--disable-default-apps", "--mute-audio", "--host-resolver-rules=MAP * ~NOTFOUND", "--allow-file-access-from-files",
    "about:blank",
  ];
}

/** A DevTools session over --remote-debugging-pipe: fd 3 into the browser, fd 4 out of it, messages ending in NUL. */
export function launch(chrome, profile, kind) {
  const env = { ...process.env };
  if (kindOf(kind) === "picture") {
    // The fonts are part of the picture: see FONTS_CONF in ops/soll-assess.mjs.
    const fonts = path.join(path.dirname(profile), "fonts.conf");
    writeFileSync(fonts, FONTS_CONF);
    env.FONTCONFIG_FILE = fonts;
  }
  const child = spawn(chrome, chromeArgs(kind, profile), { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], env });
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
  // Once the browser is gone every request fails at once: a request that waits for an answer that cannot come leaves the event
  // loop empty, and node then ends with exit 0 without a single line, a green check that rendered nothing.
  let gone = null;
  const exited = new Promise((resolve) => child.on("exit", resolve));
  exited.then(() => {
    gone = new Error(`browser exited: ${stderr.trim().split("\n").pop() ?? ""}`);
    for (const { fail } of waiting.values()) fail(gone);
    waiting.clear();
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    if (gone) return fail(gone);
    const n = ++id; waiting.set(n, { ok, fail });
    child.stdio[3].write(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
  const close = async () => { try { await send("Browser.close"); } catch { /* already gone */ } await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]); if (child.exitCode === null) child.kill("SIGKILL"); };
  return { send, on: (l) => listeners.push(l), close };
}
