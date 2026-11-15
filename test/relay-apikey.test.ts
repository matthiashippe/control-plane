/**
 * Accounts without a wallet on the social relay (goals/relay/01, point 4, docs/relay/vertrag.md `## Ungeprüfte Absender`):
 * with an API key, send, poll and count work without a signature, and what such an account sends arrives with the mark from
 * the contract at the start of `content` and `verified: false`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UNVERIFIED_MARK } from "../src/relay/store.js";
import {
  addr,
  count,
  credit,
  keyFor,
  keyless,
  messageCount,
  poll,
  pollHeaders,
  send,
  signedSend,
  wallet,
  world,
} from "./relay-world.js";

const CONTRACT = readFileSync(new URL("../docs/relay/vertrag.md", import.meta.url), "utf8");
/** The line `Kennzeichen: <Text>` of the contract. */
const MARK = /^Kennzeichen: (.+)$/m.exec(CONTRACT)?.[1] ?? "";

/** sanitizeSocialAddress of src/agent/injection-defense.ts:73 at the pin d8f8168, the one line it applies. */
const sanitizeSocialAddress = (raw: string) => raw.replace(/[^a-zA-Z0-9x._\-]/g, "").slice(0, 128);

describe("accounts without a wallet on the relay", () => {
  it("uses the mark the contract names", () => {
    expect(MARK.length).toBeGreaterThan(0);
    expect(UNVERIFIED_MARK).toBe(MARK);
  });

  it("sends, polls and counts with an API key and no signature; the message carries the mark and verified false", async () => {
    const w = world();
    const k = keyless(w);
    const b = wallet();
    credit(w, k.address, 5000);
    const sent = await send(w, { to: addr(b), content: "hello without a wallet" }, { Authorization: k.key });
    expect(sent.status).toBe(201);
    const { id } = (await sent.json()) as { id: string };

    expect(await (await count(w, await pollHeaders(b))).json()).toEqual({ unread: 1 });
    const inbox = (await (await poll(w, await pollHeaders(b))).json()) as { messages: Record<string, unknown>[] };
    expect(inbox.messages).toHaveLength(1);
    const m = inbox.messages[0];
    expect(m.id).toBe(id);
    expect(m.from).toBe(k.address);
    expect(String(m.content).startsWith(`${MARK} `)).toBe(true);
    expect(m.content).toBe(`${MARK} hello without a wallet`);
    expect(m.verified).toBe(false);

    // The account without a wallet reads its own inbox with its key, without a signature.
    const back = await send(w, await signedSend(b, k.address, "hello back"));
    expect(back.status).toBe(201);
    const counted = await count(w, { Authorization: k.key });
    expect(counted.status).toBe(200);
    expect(await counted.json()).toEqual({ unread: 1 });
    const own = await poll(w, { Authorization: `Bearer ${k.key}` });
    expect(own.status).toBe(200);
    const ownInbox = (await own.json()) as { messages: Record<string, unknown>[] };
    expect(ownInbox.messages.map((x) => x.content)).toEqual(["hello back"]);
    expect(ownInbox.messages[0].verified).toBe(true);
  });

  it("delivers a signed message with verified true and without the mark", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    expect((await send(w, await signedSend(a, b.address, "signed"))).status).toBe(201);
    const m = ((await (await poll(w, await pollHeaders(b))).json()) as { messages: Record<string, unknown>[] }).messages[0];
    expect(m.verified).toBe(true);
    expect(m.content).toBe("signed");
    expect(String(m.content)).not.toContain(MARK);
  });

  it("marks a message sent with the key of a wallet account too, because nothing was signed", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const key = keyFor(w, addr(a));
    expect((await send(w, { to: addr(b), content: "by key" }, { Authorization: key })).status).toBe(201);
    const m = ((await (await poll(w, await pollHeaders(b))).json()) as { messages: Record<string, unknown>[] }).messages[0];
    expect(m.from).toBe(addr(a));
    expect(m.content).toBe(`${MARK} by key`);
    expect(m.verified).toBe(false);
  });

  it("stays 401 without a key and without a signature, and with a wrong key", async () => {
    const w = world();
    const b = wallet();
    const none = await send(w, { to: addr(b), content: "who am i" });
    expect(none.status).toBe(401);
    const wrong = await send(w, { to: addr(b), content: "who am i" }, { Authorization: "cnwy_k_" + "0".repeat(32) });
    expect(wrong.status).toBe(401);
    expect((await poll(w, {})).status).toBe(401);
    expect((await count(w, {})).status).toBe(401);
    expect((await count(w, { Authorization: "nonsense" })).status).toBe(401);
    expect(messageCount(w)).toBe(0);
  });

  it("keeps the sender of an account without a wallet unique after the runtime's address filter", async () => {
    const w = world();
    const one = keyless(w);
    const two = keyless(w);
    const a = wallet();
    const cleaned = [one.address, two.address, addr(a)].map(sanitizeSocialAddress);
    expect(new Set(cleaned).size).toBe(3);
    expect(cleaned[0]).toBe(`key${one.address.slice("key:".length)}`);
  });
});
