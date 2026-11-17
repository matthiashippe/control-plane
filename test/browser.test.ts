/**
 * The one browser driver of ops/ (goals/konto/08, Punkt 1): ops/browser.mjs without a real Chromium.
 *
 * findChrome runs against a made-up ~/.cache/ms-playwright under a HOME in a mkdtemp folder. launch runs a stand-in Chrome, a
 * shell script that writes down its arguments and FONTCONFIG_FILE and ends at once with exit 0: after that every request has to
 * fail with `browser exited` instead of waiting for an answer that cannot come. No port, no network.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { chromeArgs, findChrome, launch } from "../ops/browser.mjs";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { FONTS_CONF } from "../ops/soll-assess.mjs";

const SHELL = "chrome-headless-shell-linux64/chrome-headless-shell";
const FULL = "chrome-linux64/chrome";

/** A browser folder of Playwright with its executable, as `<home>/.cache/ms-playwright/<dir>/<rel>`. */
function install(home: string, dir: string, rel: string): string {
  const file = path.join(home, ".cache", "ms-playwright", dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "", { mode: 0o755 });
  return file;
}

/** A Chrome that notes its arguments and FONTCONFIG_FILE next to itself and ends at once with exit 0. */
function goneChrome(): { chrome: string; dir: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "browser-gone-"));
  const chrome = path.join(dir, "chrome");
  writeFileSync(chrome, '#!/bin/sh\nd=$(dirname "$0")\nprintf "%s\\n" "$@" > "$d/args"\nprintf "%s" "$FONTCONFIG_FILE" > "$d/fontconfig"\nexit 0\n', { mode: 0o755 });
  return { chrome, dir };
}

const within = <T>(ms: number, p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, fail) => setTimeout(() => fail(new Error(`no answer after ${ms} ms`)), ms))]);

describe("findChrome", () => {
  let home: string;
  const saved = { HOME: process.env.HOME, SOLL_CHROME: process.env.SOLL_CHROME };
  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), "browser-home-"));
    process.env.HOME = home;
    delete process.env.SOLL_CHROME;
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });

  it("takes the newest headless shell for pictures, before any full Chromium", () => {
    install(home, "chromium_headless_shell-999", SHELL);
    const newest = install(home, "chromium_headless_shell-1200", SHELL);
    install(home, "chromium-2000", FULL);
    expect(findChrome("picture")).toBe(newest);
  });

  it("falls back to the newest full Chromium for pictures when no headless shell is there", () => {
    install(home, "chromium-999", FULL);
    const newest = install(home, "chromium-1200", FULL);
    mkdirSync(path.join(home, ".cache", "ms-playwright", "chromium_headless_shell-1300"), { recursive: true });
    expect(findChrome("picture")).toBe(newest);
  });

  it("takes SOLL_CHROME first for pictures", () => {
    install(home, "chromium_headless_shell-1200", SHELL);
    process.env.SOLL_CHROME = "/somewhere/chrome";
    expect(findChrome("picture")).toBe("/somewhere/chrome");
  });

  it("takes only the newest full Chromium for passkeys and ignores SOLL_CHROME and the headless shell", () => {
    install(home, "chromium_headless_shell-1300", SHELL);
    install(home, "chromium-999", FULL);
    const newest = install(home, "chromium-1200", FULL);
    process.env.SOLL_CHROME = "/somewhere/chrome";
    expect(findChrome("passkey")).toBe(newest);
  });

  it("finds nothing without a Playwright folder", () => {
    expect(findChrome("picture")).toBeUndefined();
    expect(findChrome("passkey")).toBeUndefined();
  });

  it("throws on an unknown kind", () => {
    expect(() => findChrome("screenshot")).toThrow(/unknown browser kind: screenshot/);
    expect(() => chromeArgs("screenshot", "/p")).toThrow(/unknown browser kind/);
    expect(() => launch("/bin/true", "/p/profile", "screenshot")).toThrow(/unknown browser kind/);
  });
});

describe.each(["picture", "passkey"])("launch, kind %s", (kind) => {
  it("fails every request at once with browser exited once the browser is gone", async () => {
    const { chrome, dir } = goneChrome();
    const browser = launch(chrome, path.join(dir, "profile"), kind);
    await expect(within(2000, browser.send("Browser.getVersion"))).rejects.toThrow(/browser exited/);
    // A request after the end fails as well instead of waiting for ever.
    await expect(within(2000, browser.send("Browser.getVersion"))).rejects.toThrow(/browser exited/);
    await within(5000, browser.close());
  });

  it("starts Chrome with the arguments of its kind, and with the fonts only for pictures", async () => {
    const { chrome, dir } = goneChrome();
    const profile = path.join(dir, "profile");
    const browser = launch(chrome, profile, kind);
    await expect(within(2000, browser.send("Browser.getVersion"))).rejects.toThrow(/browser exited/);
    expect(readFileSync(path.join(dir, "args"), "utf8")).toBe(chromeArgs(kind, profile).join("\n") + "\n");
    const fonts = path.join(dir, "fonts.conf");
    if (kind === "picture") {
      expect(readFileSync(path.join(dir, "fontconfig"), "utf8")).toBe(fonts);
      expect(readFileSync(fonts, "utf8")).toBe(FONTS_CONF);
    } else {
      expect(readFileSync(path.join(dir, "fontconfig"), "utf8")).toBe(process.env.FONTCONFIG_FILE ?? "");
      expect(existsSync(fonts)).toBe(false);
    }
  });
});
