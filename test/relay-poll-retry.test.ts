/**
 * A poll whose answer never arrived loses no message (goals/relay/01, point 8). The runtime's HTTP client repeats a poll
 * after a timeout or a 5xx with the same headers (src/conway/http-client.ts:113 at the pin d8f8168), so a repeat with the
 * same X-Signature gets the same messages again, with a cursor as without, and count still falls to 0 after the poll that
 * handed them out.
 */
import { describe, expect, it } from "vitest";
import { addr, count, credit, poll, pollHeaders, send, signedSend, wallet, world } from "./relay-world.js";

interface Inbox {
  messages: { id: string; nonce: string; content: string }[];
  next_cursor: string | null;
}

async function inbox(res: Response): Promise<Inbox> {
  expect(res.status).toBe(200);
  return (await res.json()) as Inbox;
}

async function setup() {
  const w = world();
  const a = wallet();
  const b = wallet();
  credit(w, addr(a), 5000);
  for (const text of ["one", "two"]) {
    expect((await send(w, await signedSend(a, b.address, text))).status).toBe(201);
  }
  return { w, a, b };
}

describe("a repeated poll with the same X-Signature", () => {
  it("gets the same messages again without a cursor", async () => {
    const { w, b } = await setup();
    const headers = await pollHeaders(b);
    const first = await inbox(await poll(w, headers));
    expect(first.messages.map((m) => m.content)).toEqual(["one", "two"]);
    // The first answer is lost on the way; the client sends the same request again.
    const again = await inbox(await poll(w, headers));
    expect(again.messages.map((m) => m.id)).toEqual(first.messages.map((m) => m.id));
    expect(again.messages.map((m) => m.nonce)).toEqual(first.messages.map((m) => m.nonce));
    expect(again.next_cursor).toBe(first.next_cursor);
  });

  it("gets the same messages again with a cursor", async () => {
    const { w, a, b } = await setup();
    const start = await inbox(await poll(w, await pollHeaders(b)));
    for (const text of ["three", "four"]) {
      expect((await send(w, await signedSend(a, b.address, text))).status).toBe(201);
    }
    const headers = await pollHeaders(b);
    const first = await inbox(await poll(w, headers, { cursor: start.next_cursor }));
    expect(first.messages.map((m) => m.content)).toEqual(["three", "four"]);
    const again = await inbox(await poll(w, headers, { cursor: start.next_cursor }));
    expect(again.messages.map((m) => m.id)).toEqual(first.messages.map((m) => m.id));
    expect(again.next_cursor).toBe(first.next_cursor);
  });

  it("does not hand out a message that arrived in between, and a new poll still gets it", async () => {
    const { w, a, b } = await setup();
    const headers = await pollHeaders(b);
    const first = await inbox(await poll(w, headers));
    expect((await send(w, await signedSend(a, b.address, "later"))).status).toBe(201);
    const again = await inbox(await poll(w, headers));
    expect(again.messages.map((m) => m.content)).toEqual(["one", "two"]);
    expect(again.next_cursor).toBe(first.next_cursor);
    const fresh = await inbox(await poll(w, await pollHeaders(b)));
    expect(fresh.messages.map((m) => m.content)).toEqual(["later"]);
  });

  it("leaves count at 0 after the poll that handed the messages out, and a new poll without cursor is empty", async () => {
    const { w, b } = await setup();
    expect(await (await count(w, await pollHeaders(b))).json()).toEqual({ unread: 2 });
    const headers = await pollHeaders(b);
    await inbox(await poll(w, headers));
    expect(await (await count(w, await pollHeaders(b))).json()).toEqual({ unread: 0 });
    await inbox(await poll(w, headers));
    expect(await (await count(w, await pollHeaders(b))).json()).toEqual({ unread: 0 });
    const fresh = await inbox(await poll(w, await pollHeaders(b)));
    expect(fresh.messages).toEqual([]);
  });

  it("is refused like any poll once X-Timestamp is outside the window", async () => {
    const { w, b } = await setup();
    const stamp = new Date();
    const headers = await pollHeaders(b, { timestamp: stamp.toISOString() });
    w.setNow(stamp);
    await inbox(await poll(w, headers));
    w.setNow(new Date(stamp.getTime() + 300_001));
    expect((await poll(w, headers)).status).toBe(401);
  });

  it("does not hand another reader's messages to a repeat signed by someone else", async () => {
    const { w, b } = await setup();
    const c = wallet();
    const headers = await pollHeaders(b);
    await inbox(await poll(w, headers));
    // c reuses b's signature under its own address: the signature does not fit, so 401 and nothing of b.
    const res = await poll(w, { ...headers, "X-Wallet-Address": addr(c) });
    expect(res.status).toBe(401);
  });
});
