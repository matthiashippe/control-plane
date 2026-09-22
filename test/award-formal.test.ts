/**
 * The half of a brief a machine can check, checked.
 *
 * `POST /v1/check` finds claims the brief does not support, which is the expensive half and the
 * one worth paying for. The cheap half sits in the brief in plain sight: a word limit, a list of
 * words that must not appear, no exclamation marks, one sentence. A buyer reading three
 * submissions does that by hand and badly, and on 2026-09-23 this operator was about to.
 *
 * It reports and never refuses, so these pin that it reports the right things and stays quiet on
 * work that keeps to the brief. The first version missed "10 words maximum. One sentence." because
 * it only looked for that instruction at the start of a line or after a colon.
 */
import { describe, expect, it } from "vitest";
import { formalpruefung } from "../ops/award.js";

const BRIEF = `FACT SHEET for a test.

Write the thing. 10 words maximum. One sentence.

Do not use: "platform", "seamless", "solution". No exclamation marks. No em dashes.

Deliver the finished text only, nothing else.`;

describe("the formal check against a brief", () => {
  it("stays quiet on work that keeps to it", () => {
    expect(formalpruefung(BRIEF, "A short honest line about the market for agents here.")).toEqual([]);
  });

  it("counts words against the limit the brief names", () => {
    const b = formalpruefung(BRIEF, "One two three four five six seven eight nine ten eleven twelve.");
    expect(b).toHaveLength(1);
    expect(b[0]).toContain("12 words against a limit of 10");
  });

  it("finds each word the brief rules out, and only those", () => {
    expect(formalpruefung(BRIEF, "A seamless line.")).toEqual([
      'uses "seamless", which the brief rules out',
    ]);
    // "solutions" is not "solution": the check is on word boundaries, so a brief banning one word
    // does not quietly ban every word containing it.
    expect(formalpruefung(BRIEF, "A line about solutions.")).toEqual([]);
  });

  it("catches punctuation the brief forbids", () => {
    expect(formalpruefung(BRIEF, "A short line!")).toEqual(["has an exclamation mark"]);
    expect(formalpruefung(BRIEF, "A short line — with a dash.")).toEqual(["has an em or en dash"]);
  });

  it("counts sentences when the brief asks for one", () => {
    const b = formalpruefung(BRIEF, "One line here. Another line there.");
    expect(b).toEqual(["2 sentences where the brief asks for one"]);
    // A semicolon is one sentence, which is how the real submission on 2026-09-21 was written.
    expect(formalpruefung(BRIEF, "One line here; another line there.")).toEqual([]);
  });

  it("reports everything at once rather than stopping at the first", () => {
    const b = formalpruefung(BRIEF, "A seamless platform solution — truly! It goes on and on and on and on.");
    expect(b).toHaveLength(7);
  });

  it("says nothing when the brief sets no measurable rule", () => {
    expect(formalpruefung("Write something nice about us.", "Something! With a dash — and more.")).toEqual([]);
  });
});
