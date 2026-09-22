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
import { formalpruefung, nochOffenStunden } from "../ops/award.js";

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

/**
 * The deadline guard, and the direction it fails in.
 *
 * On 2026-09-22 a standing instruction said to award job 0a10d826 "at 17:47 UTC". The job closes
 * at 17:47 on the 23rd: the day had been written from memory, the same trap that dated a block of
 * protocol entries a day ahead that morning. Awarding then would have ended the job 24 hours early
 * to move money from us to us, in a market whose whole purpose is a submission from somebody else.
 */
describe("hours left on a job", () => {
  const jetzt = Date.parse("2026-09-22T17:20:00Z");
  it("counts the hours while the job is open", () => {
    expect(nochOffenStunden("2026-09-23T17:47:50.175Z", jetzt)).toBeCloseTo(24.46, 1);
  });
  it("is zero once the deadline has passed, which is what lets an award through", () => {
    expect(nochOffenStunden("2026-09-22T17:19:00Z", jetzt)).toBe(0);
    expect(nochOffenStunden("2026-09-01T00:00:00Z", jetzt)).toBe(0);
  });
  it("is NaN and not zero when the deadline cannot be read", () => {
    // The whole point: `rest > 0` would be false for NaN and would wave the award through at the
    // moment the script knows least about the job. The caller compares against 0, so NaN refuses.
    expect(nochOffenStunden("tomorrow afternoon", jetzt)).toBeNaN();
    expect(nochOffenStunden("", jetzt)).toBeNaN();
  });
});
