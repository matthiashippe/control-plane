/**
 * The border of the one form of a relay signature, held with fixed signatures (goals/relay/03): canonicalSignature of
 * src/relay/signature.ts takes `s` equal to n / 2 and refuses n / 2 + 1, refuses `s` equal to 0, the prefix `0X` and
 * 132 hex characters, and folds `v` 0 into 27 and 1 into 28. A poll repeated with `v` as 0 or 1 gets the first answer.
 * The table needs no real signer, because canonicalSignature checks the form only; every value in it is made up.
 */
import { describe, expect, it } from "vitest";
import { canonicalSignature } from "../src/relay/signature.js";
import { addr, credit, poll, pollHeaders, send, signedSend, wallet, world } from "./relay-world.js";

/** The order n of secp256k1 and n / 2 rounded down, as HALF_N in the relay. */
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = N / 2n;

const R = "11".repeat(32);
const S_LOW = "22".repeat(32);

const hex64 = (s: bigint): string => s.toString(16).padStart(64, "0");

/** A made up signature: `0x`, r, s and v as two hex characters. */
const sig = (s: string, v: string, r: string = R): string => `0x${r}${s}${v}`;

interface Inbox {
  messages: { id: string; content: string }[];
  next_cursor: string | null;
}

/** The same signature with `v` as 0 or 1 instead of 27 or 28. */
function vZeroOne(signature: string): string {
  const v = parseInt(signature.slice(130, 132), 16);
  expect([27, 28]).toContain(v);
  return `${signature.slice(0, 130)}${(v - 27).toString(16).padStart(2, "0")}`;
}

describe("canonicalSignature on a table of fixed signatures", () => {
  it.each([
    ["s equal to n / 2", sig(hex64(HALF_N), "1b"), sig(hex64(HALF_N), "1b")],
    ["s equal to n / 2 with v 28", sig(hex64(HALF_N), "1c"), sig(hex64(HALF_N), "1c")],
    ["s equal to n / 2 with v 0", sig(hex64(HALF_N), "00"), sig(hex64(HALF_N), "1b")],
    ["s equal to 1", sig(hex64(1n), "1b"), sig(hex64(1n), "1b")],
    ["v 27", sig(S_LOW, "1b"), sig(S_LOW, "1b")],
    ["v 28", sig(S_LOW, "1c"), sig(S_LOW, "1c")],
    ["v 0 as 27", sig(S_LOW, "00"), sig(S_LOW, "1b")],
    ["v 1 as 28", sig(S_LOW, "01"), sig(S_LOW, "1c")],
    ["uppercase hex as lowercase", `0x${(R + S_LOW + "1C").toUpperCase()}`, sig(S_LOW, "1c")],
    ["uppercase s equal to n / 2", `0x${R}${hex64(HALF_N).toUpperCase()}1B`, sig(hex64(HALF_N), "1b")],
  ])("accepts %s in its one form", (_name, raw, one) => {
    expect(canonicalSignature(raw)).toBe(one);
  });

  it.each([
    ["s equal to n / 2 + 1", sig(hex64(HALF_N + 1n), "1b")],
    ["s equal to n / 2 + 1 with v 1", sig(hex64(HALF_N + 1n), "01")],
    ["s equal to n - 1", sig(hex64(N - 1n), "1c")],
    ["s equal to 0", sig(hex64(0n), "1b")],
    ["s equal to 0 with v 0", sig(hex64(0n), "00")],
    ["the prefix 0X", `0X${R}${S_LOW}1b`],
    ["the prefix 0X with s equal to n / 2", `0X${R}${hex64(HALF_N)}1c`],
    ["132 hex characters", `${sig(S_LOW, "1b")}00`],
    ["no prefix", `${R}${S_LOW}1b00`],
    ["v 2", sig(S_LOW, "02")],
    ["v 29", sig(S_LOW, "1d")],
    ["a character that is not hex", sig(`${"22".repeat(31)}2g`, "1b")],
  ])("refuses %s", (_name, raw) => {
    expect(canonicalSignature(raw)).toBeNull();
  });

  it("gives the same form for v 0 and 27 and for v 1 and 28", () => {
    expect(canonicalSignature(sig(S_LOW, "00"))).toBe(canonicalSignature(sig(S_LOW, "1b")));
    expect(canonicalSignature(sig(S_LOW, "01"))).toBe(canonicalSignature(sig(S_LOW, "1c")));
    expect(canonicalSignature(sig(S_LOW, "00"))).not.toBe(canonicalSignature(sig(S_LOW, "01")));
  });
});

describe("a poll repeated with v as 0 or 1", () => {
  it("gets the same messages and the same next_cursor as the first poll, and a new poll gets nothing", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const sent = await send(w, await signedSend(a, b.address, "fixed border"));
    expect(sent.status).toBe(201);
    const { id } = (await sent.json()) as { id: string };

    const headers = await pollHeaders(b);
    const firstRes = await poll(w, headers);
    expect(firstRes.status).toBe(200);
    const first = (await firstRes.json()) as Inbox;
    expect(first.messages.map((m) => m.id)).toEqual([id]);

    const repeatRes = await poll(w, { ...headers, "X-Signature": vZeroOne(headers["X-Signature"]) });
    expect(repeatRes.status).toBe(200);
    const repeat = (await repeatRes.json()) as Inbox;
    expect(repeat.messages.map((m) => m.id)).toEqual([id]);
    expect(repeat.next_cursor).toBe(first.next_cursor);

    const later = new Date(Date.parse(headers["X-Timestamp"]) + 1000).toISOString();
    const fresh = (await (await poll(w, await pollHeaders(b, { timestamp: later }))).json()) as Inbox;
    expect(fresh.messages).toEqual([]);
  });
});
