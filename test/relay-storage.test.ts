/**
 * The relay does not fill the payment server's disk without bound (goals/relay/01, point 9): a sender stores at most
 * 4000000 characters of content in 24 hours, above that 413 in plain words without a message and without a charge;
 * cleanupExpired deletes messages older than 30 days, and the contact stays, so the reply stays free.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanupExpired, getBalanceMc } from "../src/db.js";
import { FIRST_CONTACT_MC, RELAY_LIMITS } from "../src/relay/store.js";
import {
  addr,
  credit,
  keyFor,
  messageCount,
  relayRows,
  send,
  signedSend,
  wallet,
  world,
  type World,
} from "./relay-world.js";
import type { PrivateKeyAccount } from "viem/accounts";

const CONTRACT = readFileSync(new URL("../docs/relay/vertrag.md", import.meta.url), "utf8");
const LIMITS = /^## Grenzen\n([\s\S]*?)^## /m.exec(CONTRACT)?.[1] ?? "";

const DAY = 24 * 60 * 60 * 1000;
const FULL = "x".repeat(64_000);

/** Fills a's quota of the day towards b with 62 messages of 64000 characters, 3968000 in all. */
async function fill(w: World, a: PrivateKeyAccount, to: string, at: Date): Promise<void> {
  for (let i = 0; i < 62; i++) {
    const res = await send(w, await signedSend(a, to, `${i}`.padEnd(64_000, "x"), { signedAt: at.toISOString() }));
    expect(res.status, `message ${i}`).toBe(201);
  }
}

describe("the storage limit per sender", () => {
  it("is in the contract under ## Grenzen and in the code", () => {
    expect(LIMITS).toMatch(/4000000/);
    expect(LIMITS).toMatch(/30 Tage/);
    expect(RELAY_LIMITS.maxStoredCharsPerDay).toBe(4_000_000);
  });

  it("accepts exactly 4000000 characters in 24 hours and answers 413 above, without message and charge", async () => {
    const w = world();
    const now = new Date();
    w.setNow(now);
    const a = wallet();
    const b = wallet();
    const c = wallet();
    credit(w, addr(a), 5000);
    await fill(w, a, b.address, now);
    // 3968000 + 32000 = 4000000, still allowed.
    expect((await send(w, await signedSend(a, b.address, "y".repeat(32_000), { signedAt: now.toISOString() }))).status).toBe(201);
    const stored = messageCount(w);
    const balance = getBalanceMc(w.db, addr(a));

    // One more character, to a new address: no message, no first-contact charge.
    const res = await send(w, await signedSend(a, c.address, "z", { signedAt: now.toISOString() }));
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.message).toMatch(/4000000/);
    expect(body.message).toMatch(/Nothing was sent and nothing was charged/);
    expect(messageCount(w)).toBe(stored);
    expect(getBalanceMc(w.db, addr(a))).toBe(balance);
    expect(relayRows(w, addr(a))).toHaveLength(1);
  });

  it("frees the quota again after 24 hours", async () => {
    const w = world();
    const now = new Date();
    w.setNow(now);
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    await fill(w, a, b.address, now);
    expect((await send(w, await signedSend(a, b.address, FULL, { signedAt: now.toISOString() }))).status).toBe(413);
    const later = new Date(now.getTime() + DAY + 1000);
    w.setNow(later);
    expect((await send(w, await signedSend(a, b.address, FULL, { signedAt: later.toISOString() }))).status).toBe(201);
  });

  it("counts messages sent with an API key too", async () => {
    const w = world();
    const now = new Date();
    w.setNow(now);
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    await fill(w, a, b.address, now);
    const key = keyFor(w, addr(a));
    const res = await send(w, { to: addr(b), content: FULL }, { Authorization: `Bearer ${key}` });
    expect(res.status).toBe(413);
  });

  it("still answers a repeat of an accepted signature with its id when the quota is full", async () => {
    const w = world();
    const now = new Date();
    w.setNow(now);
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    await fill(w, a, b.address, now);
    const last = await signedSend(a, b.address, "y".repeat(32_000), { signedAt: now.toISOString() });
    const first = await send(w, last);
    expect(first.status).toBe(201);
    const again = await send(w, last);
    expect(again.status).toBe(201);
    expect(await again.json()).toEqual(await first.json());
  });
});

describe("cleanupExpired and the relay", () => {
  it("deletes messages older than 30 days, keeps younger ones and keeps the contact free", async () => {
    const w = world();
    const start = new Date();
    w.setNow(start);
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    expect((await send(w, await signedSend(a, b.address, "old", { signedAt: start.toISOString() }))).status).toBe(201);
    const young = new Date(start.getTime() + 20 * DAY);
    w.setNow(young);
    expect((await send(w, await signedSend(a, b.address, "young", { signedAt: young.toISOString() }))).status).toBe(201);

    const removed = cleanupExpired(w.db, start.getTime() + 30 * DAY + 1000);
    expect(removed.relay).toBe(1);
    const left = w.db.prepare("SELECT content FROM relay_messages ORDER BY seq").all() as { content: string }[];
    expect(left.map((m) => m.content)).toEqual(["young"]);

    // Everything goes after another 30 days, and the contact is still there: b answers without credit, a writes again for free.
    const end = new Date(young.getTime() + 30 * DAY + 1000);
    expect(cleanupExpired(w.db, end.getTime()).relay).toBe(1);
    expect(messageCount(w)).toBe(0);
    w.setNow(end);
    expect(getBalanceMc(w.db, addr(b))).toBe(0);
    expect((await send(w, await signedSend(b, a.address, "reply", { signedAt: end.toISOString() }))).status).toBe(201);
    expect((await send(w, await signedSend(a, b.address, "more", { signedAt: end.toISOString() }))).status).toBe(201);
    expect(relayRows(w)).toEqual([expect.objectContaining({ delta_mc: -FIRST_CONTACT_MC })]);
    expect(getBalanceMc(w.db, addr(a))).toBe(5000 - FIRST_CONTACT_MC);
  });
});
