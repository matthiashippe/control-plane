/**
 * The verdict of the relay walk (harness/e2e/relay-walk.mjs, goals/relay/01 point 6), in both directions: a complete walk
 * with its ledger is ok; a missing answer, an accepted foreign signature, a missing or a second ledger row relay, a blocked
 * mark and a status the runtime retries are each a fail. Also the gate in harness/e2e/full.sh: relay=true is required.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARK, RETRIED, judgeRelayWalk, parseRelayResult } from "../harness/e2e/relay-walk.mjs";

type Step = Record<string, unknown> & { step: string; http?: number[] };
type Result = { a: string; b: string; steps: Step[] };

const CONTRACT = readFileSync(join(__dirname, "..", "docs", "relay", "vertrag.md"), "utf8");
const FULL_SH = readFileSync(join(__dirname, "..", "harness", "e2e", "full.sh"), "utf8");

function good(): Result {
  return {
    a: "0x" + "a".repeat(40),
    b: "0x" + "b".repeat(40),
    steps: [
      { step: "topup", ok: true, http: [402, 200] },
      { step: "a_send", ok: true, id: "msg_a1", text: "Message sent (id: msg_a1)", http: [201] },
      { step: "b_count_before", unread: 1, http: [200] },
      { step: "b_poll", ids: ["msg_a1"], from_a: true, http: [200] },
      { step: "b_count_after", unread: 0, http: [200] },
      { step: "b_reply", ok: true, id: "msg_b1", text: "Message sent (id: msg_b1)", http: [201] },
      { step: "a_poll", ids: ["msg_b1"], http: [200] },
      { step: "c_forged", status: 401, http: [401] },
      { step: "b_poll_forged", forged_seen: false, http: [200] },
      { step: "key_send", status: 201, id: "msg_k1", http: [201] },
      { step: "b_poll_key", ids: ["msg_k1"], marked: true, verified: false, blocked: false, from_unique: true, http: [200, 200] },
    ],
  };
}

const GOOD_LEDGER = { a_rows: 1, a_mc: [-1000], b_rows: 0, key_rows: 1, consistent: true };

function withStep(name: string, patch: Record<string, unknown>): Result {
  const r = good();
  r.steps = r.steps.map((s) => (s.step === name ? { ...s, ...patch } : s));
  return r;
}

function without(name: string): Result {
  const r = good();
  r.steps = r.steps.filter((s) => s.step !== name);
  return r;
}

function expectFail(result: unknown, ledger: unknown, pattern: RegExp): void {
  const v = judgeRelayWalk(result, ledger) as { ok: boolean; reasons: string[] };
  expect(v.ok).toBe(false);
  expect(v.reasons.join("; ")).toMatch(pattern);
}

describe("judgeRelayWalk", () => {
  it("carries the mark of the contract", () => {
    expect(/^Kennzeichen: (.+)$/m.exec(CONTRACT)?.[1]).toBe(MARK);
  });

  it("passes a complete walk with its ledger, and without a ledger as the walk's own verdict", () => {
    expect(judgeRelayWalk(good(), GOOD_LEDGER)).toEqual({ ok: true, reasons: [] });
    expect(judgeRelayWalk(good())).toEqual({ ok: true, reasons: [] });
  });

  it("fails when B's answer is missing", () => {
    expectFail(without("b_reply"), GOOD_LEDGER, /b_reply: missing/);
    expectFail(withStep("b_reply", { ok: false, id: null, text: "Send failed (402): INSUFFICIENT_CREDITS" }), GOOD_LEDGER, /b_reply/);
    expectFail(withStep("a_poll", { ids: [] }), GOOD_LEDGER, /a_poll: A did not read B's answer/);
    expectFail(without("a_poll"), GOOD_LEDGER, /a_poll: missing/);
  });

  it("fails when A's message does not arrive or is not counted", () => {
    expectFail(withStep("b_poll", { ids: [] }), GOOD_LEDGER, /b_poll/);
    expectFail(withStep("b_count_before", { unread: 0 }), GOOD_LEDGER, /b_count_before/);
    expectFail(withStep("b_count_after", { unread: 1 }), GOOD_LEDGER, /b_count_after/);
    expectFail(withStep("a_send", { ok: false, id: null }), GOOD_LEDGER, /a_send/);
    expectFail(withStep("topup", { ok: false, error: "HTTP 503" }), GOOD_LEDGER, /topup/);
  });

  it("fails when the foreign signature was accepted or B saw it", () => {
    expectFail(withStep("c_forged", { status: 201, http: [201] }), GOOD_LEDGER, /c_forged/);
    expectFail(withStep("b_poll_forged", { forged_seen: true }), GOOD_LEDGER, /b_poll_forged/);
    expectFail(without("c_forged"), GOOD_LEDGER, /c_forged: missing/);
  });

  it.each([
    ["missing", { ...GOOD_LEDGER, a_rows: 0, a_mc: [] }],
    ["doubled", { ...GOOD_LEDGER, a_rows: 2, a_mc: [-1000, -1000] }],
    ["of another amount", { ...GOOD_LEDGER, a_mc: [-500] }],
  ])("fails when A's ledger row relay is %s", (_name, ledger) => {
    expectFail(good(), ledger, /ledger: .*A/);
  });

  it("fails when B paid for the answer, the API key account was not charged once, or the books differ", () => {
    expectFail(good(), { ...GOOD_LEDGER, b_rows: 1 }, /ledger: 1 rows of kind relay for B/);
    expectFail(good(), { ...GOOD_LEDGER, key_rows: 0 }, /API key account/);
    expectFail(good(), { ...GOOD_LEDGER, key_rows: 2 }, /API key account/);
    expectFail(good(), { ...GOOD_LEDGER, consistent: false }, /balance and ledger/);
  });

  it("fails when the mark is blocked, missing, or the message is verified", () => {
    expectFail(withStep("b_poll_key", { blocked: true }), GOOD_LEDGER, /sanitizeInput of the runtime blocked/);
    expectFail(withStep("b_poll_key", { marked: false }), GOOD_LEDGER, /does not start with the mark/);
    expectFail(withStep("b_poll_key", { verified: true }), GOOD_LEDGER, /not verified false/);
    expectFail(withStep("b_poll_key", { from_unique: false }), GOOD_LEDGER, /sanitizeSocialAddress/);
    expectFail(withStep("b_poll_key", { ids: [] }), GOOD_LEDGER, /did not read the message sent with an API key/);
    expectFail(withStep("key_send", { status: 401, id: null }), GOOD_LEDGER, /key_send/);
  });

  it.each(RETRIED as number[])("fails when any step got %i, a status the runtime retries", (status) => {
    expectFail(withStep("b_count_before", { http: [status, 200] }), GOOD_LEDGER, new RegExp(`b_count_before: the runtime got ${status}`));
  });

  it("reads the last RELAY_RESULT line and nothing else", () => {
    const text = `noise\nRELAY_RESULT {"steps":[]}\nRELAY_RESULT ${JSON.stringify(good())}\nRELAY_VERDICT ok`;
    expect(parseRelayResult(text)).toEqual(good());
    expect(parseRelayResult("RELAY_VERDICT fail the walk stopped")).toBeNull();
    expect(parseRelayResult("RELAY_RESULT {broken")).toBeNull();
    expectFail(null, GOOD_LEDGER, /topup: missing/);
  });
});

describe("the relay gate in harness/e2e/full.sh", () => {
  it("names relay in both closing lines and requires relay=true", () => {
    const closing = FULL_SH.split("\n").filter((l) => /^\s*echo "E2E (OK|FAIL) /.test(l));
    expect(closing.length).toBe(2);
    for (const l of closing) expect(l).toMatch(/ relay=\$relay"$/);
    expect(FULL_SH).toMatch(/\|\| "\$relay" != "true" \]\]; then/);
    expect(FULL_SH).toContain('if [[ "$relay_verdict" == "RELAY_VERDICT ok" ]]; then relay=true; fi');
    expect(FULL_SH).toContain("relay-walk.mjs judge");
  });
});
