/**
 * No message to oneself on the social relay (goals/relay/02, point 3, docs/relay/vertrag.md): `to` equal to the sender
 * gets 400 `recipient_is_sender` with a plain message, signed as with an API key, with no message and no ledger row
 * `relay`; a message to another address is accepted as before.
 */
import { describe, expect, it } from "vitest";
import {
  addr,
  credit,
  keyFor,
  keyless,
  messageCount,
  relayRows,
  send,
  signedSend,
  wallet,
  world,
} from "./relay-world.js";

type Refusal = { error: string; message: string };

function expectSelfRefusal(body: Refusal): void {
  expect(body.error).toBe("recipient_is_sender");
  expect(body.message).toMatch(/another address/);
}

describe("the relay delivers no message to its own sender", () => {
  it("refuses a signed message to from with 400 recipient_is_sender, no message and no relay row", async () => {
    const w = world();
    const a = wallet();
    credit(w, addr(a), 5000);
    const res = await send(w, await signedSend(a, a.address, "note to self"));
    expect(res.status).toBe(400);
    expectSelfRefusal((await res.json()) as Refusal);
    expect(messageCount(w)).toBe(0);
    expect(relayRows(w)).toEqual([]);
  });

  it("refuses a signed message to from when to is written in another case than from", async () => {
    const w = world();
    const a = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, a.address, "note to self, checksummed");
    expect(a.address).not.toBe(addr(a));
    const res = await send(w, { ...body, to: a.address });
    expect(res.status).toBe(400);
    expectSelfRefusal((await res.json()) as Refusal);
    expect(messageCount(w)).toBe(0);
    expect(relayRows(w)).toEqual([]);
  });

  it("refuses a second signed message to oneself too, so no free contact with oneself arises", async () => {
    const w = world();
    const a = wallet();
    credit(w, addr(a), 5000);
    for (const text of ["first", "second"]) {
      const res = await send(w, await signedSend(a, a.address, text));
      expect(res.status).toBe(400);
    }
    expect(messageCount(w)).toBe(0);
    expect(relayRows(w)).toEqual([]);
    expect(w.db.prepare("SELECT count(*) AS n FROM relay_contacts").get()).toEqual({ n: 0 });
  });

  it("refuses a message with an API key to the account's own address", async () => {
    const w = world();
    const a = wallet();
    credit(w, addr(a), 5000);
    const key = keyFor(w, addr(a));
    const res = await send(w, { to: a.address, content: "note to self" }, { Authorization: `Bearer ${key}` });
    expect(res.status).toBe(400);
    expectSelfRefusal((await res.json()) as Refusal);
    expect(messageCount(w)).toBe(0);
    expect(relayRows(w)).toEqual([]);
  });

  it("refuses a message with an API key of an account without a wallet to its own key: handle", async () => {
    const w = world();
    const k = keyless(w);
    credit(w, k.address, 5000);
    const res = await send(w, { to: k.address, content: "note to self" }, { Authorization: `Bearer ${k.key}` });
    expect(res.status).toBe(400);
    expectSelfRefusal((await res.json()) as Refusal);
    expect(messageCount(w)).toBe(0);
    expect(relayRows(w)).toEqual([]);
  });

  it("accepts a message to another address as before, with one relay row for the first contact", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const res = await send(w, await signedSend(a, b.address, "hello b"));
    expect(res.status).toBe(201);
    expect(messageCount(w)).toBe(1);
    expect(relayRows(w, addr(a))).toHaveLength(1);
    const key = keyFor(w, addr(a));
    const viaKey = await send(w, { to: b.address, content: "hello again" }, { Authorization: `Bearer ${key}` });
    expect(viaKey.status).toBe(201);
    expect(messageCount(w)).toBe(2);
  });
});
