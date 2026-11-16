import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { FONTS_CONF } from "../ops/soll-assess.mjs";

// The committed SOLL pictures were rendered with WenQuanYi Zen Hei behind the generic families; a host that prefers DejaVu
// renders the same source 56 px taller and fails every pixel comparison (audit 2026-11-16).
describe("SOLL render fonts", () => {
  it("puts the reference fonts in front of each generic family the page stacks end in", () => {
    for (const [generic, font] of [["sans-serif", "WenQuanYi Zen Hei"], ["system-ui", "WenQuanYi Zen Hei"], ["monospace", "WenQuanYi Zen Hei Mono"]]) {
      expect(FONTS_CONF).toContain(`<test name="family"><string>${generic}</string></test><edit name="family" mode="prepend" binding="strong"><string>${font}</string></edit>`);
    }
  });

  it("applies the edits after the system configuration and leaves DejaVu out", () => {
    const include = FONTS_CONF.indexOf("<include");
    expect(include).toBeGreaterThan(-1);
    expect(FONTS_CONF.indexOf("<match")).toBeGreaterThan(include);
    expect(FONTS_CONF).toMatch(/<rejectfont>.*\*\/dejavu\/\*.*<\/rejectfont>/);
  });

  it("is wired into every SOLL renderer", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["ops/soll.mjs", "ops/soll-handoff.mjs", "ops/soll-konto.mjs", "ops/soll-limit.mjs"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/env: \{ \.\.\.process\.env, FONTCONFIG_FILE: fonts \}/);
    }
  });
});
