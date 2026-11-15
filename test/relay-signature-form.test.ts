/**
 * Every signature has exactly one form on the social relay (goals/relay/02, point 2, docs/relay/vertrag.md `## Signatur`):
 * the uppercase hex of an accepted signature and `v` as 0 or 1 are the same message, the mirrored form with `s` in the upper
 * half and a signature without 65 bytes are refused, only the lowercase form is stored, and a poll repeated with the
 * uppercase form of its X-Signature gets the first answer again.
 */
import { describe, expect, it } from "vitest";
import {
  addr,
  credit,
  messageCount,
  poll,
  pollHeaders,
  relayRows,
  send,
  signedSend,
  wallet,
  world,
} from "./relay-world.js";

/** The order of secp256k1. */
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

const upper = (sig: string): string => `0x${sig.slice(2).toUpperCase()}`;

/** The same signature with `v` as 0 or 1 instead of 27 or 28. */
function vZeroOne(sig: string): string {
  const v = parseInt(sig.slice(130, 132), 16);
  return `${sig.slice(0, 130)}${(v - 27).toString(16).padStart(2, "0")}`;
}

/** The mirrored form: `s` replaced by n - s and `v` flipped; viem's verifyMessage accepts it too. */
function mirrored(sig: string): string {
  const r = sig.slice(2, 66);
  const s = BigInt(`0x${sig.slice(66, 130)}`);
  const v = parseInt(sig.slice(130, 132), 16);
  return `0x${r}${(N - s).toString(16).padStart(64, "0")}${(v === 27 ? 28 : 27).toString(16)}`;
}

const storedSignatures = (w: ReturnType<typeof world>): string[] =>
  (w.db.prepare("SELECT signature FROM relay_messages ORDER BY seq").all() as { signature: string }[]).map((r) => r.signature);

describe("every signature on the relay has exactly one form", () => {
  it("takes the uppercase form of an accepted signature as the same message: same id, one message, one relay row", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, b.address, "hello once");
    const first = await send(w, body);
    expect(first.status).toBe(201);
    const { id } = (await first.json()) as { id: string };
    const again = await send(w, { ...body, signature: upper(body.signature as string) });
    expect(again.status).toBe(201);
    expect(((await again.json()) as { id: string }).id).toBe(id);
    expect(messageCount(w)).toBe(1);
    expect(relayRows(w, addr(a))).toHaveLength(1);
    const inbox = (await (await poll(w, await pollHeaders(b))).json()) as { messages: { id: string }[] };
    expect(inbox.messages.map((m) => m.id)).toEqual([id]);
  });

  it("takes v as 0 or 1 of an accepted signature as the same message: same id, one message, one relay row", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, b.address, "hello with v");
    const first = await send(w, body);
    expect(first.status).toBe(201);
    const { id } = (await first.json()) as { id: string };
    const sig = body.signature as string;
    const v = parseInt(sig.slice(130, 132), 16);
    expect([27, 28]).toContain(v);
    const again = await send(w, { ...body, signature: vZeroOne(sig) });
    expect(again.status).toBe(201);
    expect(((await again.json()) as { id: string }).id).toBe(id);
    expect(messageCount(w)).toBe(1);
    expect(relayRows(w, addr(a))).toHaveLength(1);
  });

  it("refuses the mirrored form with s in the upper half with 401 and stores no second message", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, b.address, "hello mirrored");
    expect((await send(w, body)).status).toBe(201);
    const res = await send(w, { ...body, signature: mirrored(body.signature as string) });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_signature");
    expect(messageCount(w)).toBe(1);
    expect(relayRows(w, addr(a))).toHaveLength(1);
  });

  it("refuses a mirrored signature that was never sent in its lower form, and stores nothing", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, b.address, "only mirrored");
    const res = await send(w, { ...body, signature: mirrored(body.signature as string) });
    expect(res.status).toBe(401);
    expect(messageCount(w)).toBe(0);
    expect(relayRows(w)).toEqual([]);
  });

  it("refuses a signature without 65 bytes with 401", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, b.address, "hello short");
    const sig = body.signature as string;
    for (const bad of [sig.slice(0, 130), `${sig}00`, `${sig.slice(0, 130)}1d`]) {
      const res = await send(w, { ...body, signature: bad });
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: string }).error).toBe("invalid_signature");
    }
    expect(messageCount(w)).toBe(0);
    expect(relayRows(w)).toEqual([]);
  });

  it("stores a signature first sent in uppercase in its lowercase form", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, b.address, "shouting");
    const sig = body.signature as string;
    const res = await send(w, { ...body, signature: upper(sig) });
    expect(res.status).toBe(201);
    expect(storedSignatures(w)).toEqual([sig.toLowerCase()]);
    const again = await send(w, body);
    expect(((await again.json()) as { id: string }).id).toBe(((await res.json()) as { id: string }).id);
    expect(messageCount(w)).toBe(1);
  });

  it("gives a poll repeated with the uppercase form of a delivered X-Signature the same answer as the first", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    expect((await send(w, await signedSend(a, b.address, "one"))).status).toBe(201);
    expect((await send(w, await signedSend(a, b.address, "two"))).status).toBe(201);
    const headers = await pollHeaders(b);
    const first = await poll(w, headers);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { messages: { id: string }[]; next_cursor: string | null };
    expect(firstBody.messages).toHaveLength(2);
    const repeat = await poll(w, { ...headers, "X-Signature": upper(headers["X-Signature"]) });
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toEqual(firstBody);
    const pollKeys = (w.db.prepare("SELECT key FROM relay_polls").all() as { key: string }[]).map((r) => r.key);
    expect(pollKeys).toHaveLength(1);
    expect(pollKeys[0].startsWith(headers["X-Signature"].toLowerCase())).toBe(true);
  });
});
