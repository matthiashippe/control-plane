/**
 * No foreign signature and no replay on the social relay (goals/relay/01, point 3, docs/relay/vertrag.md `## Signatur`
 * and `## Grenzen`).
 */
import { describe, expect, it } from "vitest";
import {
  addr,
  count,
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

const RETRIED = [429, 500, 502, 503, 504];

describe("the relay takes no foreign signature and no replay", () => {
  it("refuses a message whose signature does not belong to from, and the recipient never sees it", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    const c = wallet();
    credit(w, addr(a), 5000);
    credit(w, addr(c), 5000);
    const forged = await signedSend(a, b.address, "from a, honestly", { signer: c });
    const res = await send(w, forged);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_signature");
    expect(messageCount(w)).toBe(0);
    expect(relayRows(w)).toEqual([]);
    const inbox = (await (await poll(w, await pollHeaders(b))).json()) as { messages: unknown[] };
    expect(inbox.messages).toEqual([]);
  });

  it("refuses a message whose content was changed after signing", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, b.address, "pay 1 cent");
    const res = await send(w, { ...body, content: "pay 100 dollars" });
    expect(res.status).toBe(401);
    expect(messageCount(w)).toBe(0);
  });

  it("refuses a message signed more than 300000 ms ago and one from too far ahead", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const now = Date.now();
    const old = await send(w, await signedSend(a, b.address, "late", { signedAt: new Date(now - 300_001 - 5_000).toISOString() }));
    expect(old.status).toBe(401);
    expect(((await old.json()) as { error: string }).error).toBe("signature_expired");
    const ahead = await send(w, await signedSend(a, b.address, "early", { signedAt: new Date(now + 120_000).toISOString() }));
    expect(ahead.status).toBe(401);
    // Just inside the window is fine.
    const inside = await send(w, await signedSend(a, b.address, "in time", { signedAt: new Date(now - 240_000).toISOString() }));
    expect(inside.status).toBe(201);
    expect(messageCount(w)).toBe(1);
  });

  it("refuses a poll and a count signed by somebody else or out of the window", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    const c = wallet();
    credit(w, addr(a), 5000);
    expect((await send(w, await signedSend(a, b.address, "for b only"))).status).toBe(201);

    const foreign = await poll(w, await pollHeaders(b, { signer: c }));
    expect(foreign.status).toBe(401);
    const foreignCount = await count(w, await pollHeaders(b, { signer: c }));
    expect(foreignCount.status).toBe(401);
    const stale = await poll(w, await pollHeaders(b, { timestamp: new Date(Date.now() - 400_000).toISOString() }));
    expect(stale.status).toBe(401);
    const partial = await poll(w, { "X-Wallet-Address": addr(b) });
    expect(partial.status).toBe(401);
    // Nothing was handed out: b still has its unread message.
    expect(await (await count(w, await pollHeaders(b))).json()).toEqual({ unread: 1 });
  });

  it("gives the same signature twice the same id, one message and one charge", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, b.address, "once");
    const first = await send(w, body);
    const second = await send(w, body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const id1 = ((await first.json()) as { id: string }).id;
    const id2 = ((await second.json()) as { id: string }).id;
    expect(id2).toBe(id1);
    expect(messageCount(w)).toBe(1);
    expect(relayRows(w, addr(a))).toHaveLength(1);
    // Even after the window the repeat is the same message, never a new one or an error.
    w.setNow(new Date(Date.now() + 600_000));
    const late = await send(w, body);
    expect(late.status).toBe(201);
    expect(((await late.json()) as { id: string }).id).toBe(id1);
    expect(messageCount(w)).toBe(1);
    expect(relayRows(w, addr(a))).toHaveLength(1);
  });

  it("refuses content over 64000 characters and a message over 128000 characters", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const big = await send(w, await signedSend(a, b.address, "x".repeat(64_001)));
    expect(big.status).toBe(413);
    // 64000 characters that each take two in JSON make the message too large as a whole.
    const escaped = await send(w, await signedSend(a, b.address, "\n".repeat(64_000)));
    expect(escaped.status).toBe(413);
    const fits = await send(w, await signedSend(a, b.address, "x".repeat(64_000)));
    expect(fits.status).toBe(201);
    expect(messageCount(w)).toBe(1);
  });

  it("refuses the 101st message of a sender within an hour", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    for (let i = 0; i < 100; i++) {
      const res = await send(w, await signedSend(a, b.address, `message ${i}`));
      expect(res.status, `message ${i}`).toBe(201);
    }
    const over = await send(w, await signedSend(a, b.address, "message 100"));
    expect(over.status).toBe(429);
    expect(messageCount(w)).toBe(100);
    // An hour later the sender may send again.
    w.setNow(new Date(Date.now() + 3_600_001));
    const later = await send(w, await signedSend(a, b.address, "an hour later", { signedAt: new Date(Date.now() + 3_600_001).toISOString() }));
    expect(later.status).toBe(201);
  });

  it("refuses a sender that is not an EVM address with 400 and a reason", async () => {
    const w = world();
    const b = wallet();
    const res = await send(w, {
      from: "So11111111111111111111111111111111111111112",
      to: addr(b),
      content: "hi",
      signed_at: new Date().toISOString(),
      signature: "0x" + "11".repeat(65),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/EVM/);
  });

  it("answers no refusal with a status the runtime retries", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    const c = wallet();
    const statuses = [
      (await send(w, await signedSend(a, b.address, "forged", { signer: c }))).status,
      (await send(w, await signedSend(a, b.address, "late", { signedAt: new Date(Date.now() - 900_000).toISOString() }))).status,
      (await send(w, await signedSend(a, b.address, "x".repeat(70_000)))).status,
      (await send(w, await signedSend(a, b.address, "no credit"))).status,
      (await poll(w, await pollHeaders(b, { signer: c }))).status,
      (await send(w, "not json")).status,
    ];
    for (const s of statuses) expect(RETRIED).not.toContain(s);
  });
});
