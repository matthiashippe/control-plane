/**
 * What a message on the social relay costs (goals/relay/01, point 5, docs/relay/vertrag.md `## Preis`): a first contact the
 * price from the contract as exactly one ledger row of kind relay, in the same transaction as the balance and the message; a
 * reply within the contact nothing; without credit 402 and no message; the same signature twice books once.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getBalanceMc } from "../src/db.js";
import { FIRST_CONTACT_MC, acceptMessage } from "../src/relay/store.js";
import {
  addr,
  credit,
  keyless,
  messageCount,
  poll,
  pollHeaders,
  relayRows,
  send,
  signedSend,
  wallet,
  world,
} from "./relay-world.js";

const CONTRACT = readFileSync(new URL("../docs/relay/vertrag.md", import.meta.url), "utf8");
/** The line `Preis Erstkontakt: <n> mc` of the contract. */
const PRICE = Number(/^Preis Erstkontakt: ([1-9][0-9]*) mc$/m.exec(CONTRACT)?.[1] ?? "NaN");

const ledgerSum = (w: ReturnType<typeof world>, address: string) =>
  (w.db.prepare("SELECT coalesce(sum(delta_mc), 0) AS s FROM ledger WHERE address = ?").get(address) as { s: number }).s;

describe("the price of a first contact", () => {
  it("charges the price from the contract", () => {
    expect(Number.isInteger(PRICE)).toBe(true);
    expect(FIRST_CONTACT_MC).toBe(PRICE);
  });

  it("books a first contact as exactly one ledger row relay and keeps balance and ledger together", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const res = await send(w, await signedSend(a, b.address, "first contact"));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const rows = relayRows(w, addr(a));
    expect(rows).toEqual([{ delta_mc: -PRICE, ref: `relay:${id}` }]);
    expect(getBalanceMc(w.db, addr(a))).toBe(5000 - PRICE);
    expect(ledgerSum(w, addr(a))).toBe(getBalanceMc(w.db, addr(a)));
    expect(relayRows(w, addr(b))).toEqual([]);
  });

  it("charges nothing for the reply and for further messages within the contact", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    expect((await send(w, await signedSend(a, b.address, "hi b"))).status).toBe(201);
    // b has no credit at all and still answers.
    expect(getBalanceMc(w.db, addr(b))).toBe(0);
    const reply = await send(w, await signedSend(b, a.address, "hi a"));
    expect(reply.status).toBe(201);
    expect((await send(w, await signedSend(a, b.address, "again"))).status).toBe(201);
    expect(relayRows(w)).toHaveLength(1);
    expect(getBalanceMc(w.db, addr(a))).toBe(5000 - PRICE);
    const inbox = (await (await poll(w, await pollHeaders(a))).json()) as { messages: { content: string }[] };
    expect(inbox.messages.map((m) => m.content)).toEqual(["hi a"]);
  });

  it("answers 402 in plain words without credit, and keeps no message", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), PRICE - 1);
    const res = await send(w, await signedSend(a, b.address, "too poor"));
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
    expect(body.message).toContain(`${PRICE} mc`);
    expect(body.message).toMatch(/\/pay/);
    expect(body.message).toMatch(/Nothing was sent and nothing was charged/);
    expect(messageCount(w)).toBe(0);
    expect(relayRows(w)).toEqual([]);
    expect(getBalanceMc(w.db, addr(a))).toBe(PRICE - 1);

    // The same for an account without a wallet that sends with its key.
    const k = keyless(w);
    const keyed = await send(w, { to: addr(b), content: "no credit either" }, { Authorization: k.key });
    expect(keyed.status).toBe(402);
    expect(messageCount(w)).toBe(0);
  });

  it("books a repeat of the same signature once", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, b.address, "retried by the client");
    const statuses = await Promise.all([send(w, body), send(w, body), send(w, body)].map(async (p) => (await p).status));
    expect(statuses).toEqual([201, 201, 201]);
    expect(relayRows(w, addr(a))).toHaveLength(1);
    expect(messageCount(w)).toBe(1);
    expect(getBalanceMc(w.db, addr(a))).toBe(5000 - PRICE);
  });

  it("keeps message and charge in one transaction: a charge that fails leaves no message", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    // The insert of the message fails after the charge was written; the charge has to go with it.
    w.db.exec("CREATE TEMP TRIGGER fail_relay_insert BEFORE INSERT ON relay_messages BEGIN SELECT RAISE(ABORT, 'boom'); END");
    expect(() =>
      acceptMessage(w.db, {
        sender: addr(a),
        recipient: addr(b),
        content: "x",
        signedAt: new Date().toISOString(),
        signature: "0xabc",
        replyTo: null,
        now: new Date(),
      }),
    ).toThrow(/boom/);
    expect(relayRows(w, addr(a))).toEqual([]);
    expect(getBalanceMc(w.db, addr(a))).toBe(5000);
    expect(messageCount(w)).toBe(0);
  });
});
