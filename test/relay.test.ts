/**
 * The three paths of the social relay answer the way the runtime's client reads them (goals/relay/01, point 2).
 *
 * The client is `createSocialClient` in src/social/client.ts at the pin d8f8168; docs/relay/vertrag.md lists what it sends
 * and reads per path. The bodies and headers here are built exactly as signSendPayload and signPollPayload build them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addr, count, credit, poll, pollHeaders, send, signedSend, wallet, world } from "./relay-world.js";

const CONTRACT = readFileSync(new URL("../docs/relay/vertrag.md", import.meta.url), "utf8");

/** The paths of the table `## Endpunkte` in docs/relay/vertrag.md, as `METHOD /path`. */
function contractPaths(): string[] {
  const section = CONTRACT.split(/^## /m).find((s) => s.startsWith("Endpunkte")) ?? "";
  return [...section.matchAll(/^\| (POST|GET) (\/v1\/messages(?:\/poll|\/count)?) \|/gm)].map((m) => `${m[1]} ${m[2]}`);
}

describe("the relay answers the runtime's client", () => {
  it("lists exactly the three calls of the runtime in the contract", () => {
    expect(contractPaths()).toEqual(["POST /v1/messages", "POST /v1/messages/poll", "GET /v1/messages/count"]);
  });

  it("accepts a message signed in the runtime's format and hands it to the recipient's poll", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    const body = await signedSend(a, b.address, "hello from a", { replyTo: "msg_earlier" });
    const res = await send(w, body);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const polled = await poll(w, await pollHeaders(b), {});
    expect(polled.status).toBe(200);
    const data = (await polled.json()) as { messages: Record<string, unknown>[]; next_cursor: unknown };
    expect(data.messages).toHaveLength(1);
    const m = data.messages[0];
    for (const field of ["id", "from", "to", "content", "signedAt", "createdAt", "replyTo", "nonce"]) {
      expect(m, `poll gives ${field}`).toHaveProperty(field);
    }
    expect(m.id).toBe(id);
    expect(m.from).toBe(addr(a));
    expect(m.to).toBe(addr(b));
    expect(m.content).toBe("hello from a");
    expect(m.signedAt).toBe(body.signed_at);
    expect(Number.isNaN(Date.parse(String(m.createdAt)))).toBe(false);
    expect(m.replyTo).toBe("msg_earlier");
    expect(typeof m.nonce).toBe("string");
    expect(String(m.nonce).length).toBeGreaterThanOrEqual(16);
    expect(typeof data.next_cursor).toBe("string");
  });

  it("counts the unread message and falls to 0 after the poll", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    expect((await send(w, await signedSend(a, b.address, "one"))).status).toBe(201);
    expect((await send(w, await signedSend(a, b.address, "two"))).status).toBe(201);

    const before = await count(w, await pollHeaders(b));
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ unread: 2 });

    const polled = (await (await poll(w, await pollHeaders(b))).json()) as { messages: { content: string }[]; next_cursor: string };
    expect(polled.messages.map((m) => m.content)).toEqual(["one", "two"]);

    expect(await (await count(w, await pollHeaders(b))).json()).toEqual({ unread: 0 });
    // The sender's own inbox stays empty: a message lands with its recipient only.
    expect(await (await count(w, await pollHeaders(a))).json()).toEqual({ unread: 0 });
  });

  it("continues after next_cursor and gives it back when there is nothing new", async () => {
    const w = world();
    const a = wallet();
    const b = wallet();
    credit(w, addr(a), 5000);
    await send(w, await signedSend(a, b.address, "first"));
    const first = (await (await poll(w, await pollHeaders(b))).json()) as { messages: unknown[]; next_cursor: string };
    expect(first.messages).toHaveLength(1);
    await send(w, await signedSend(a, b.address, "second"));
    const next = (await (await poll(w, await pollHeaders(b), { cursor: first.next_cursor })).json()) as {
      messages: { content: string }[];
      next_cursor: string;
    };
    expect(next.messages.map((m) => m.content)).toEqual(["second"]);
    const empty = (await (await poll(w, await pollHeaders(b), { cursor: next.next_cursor })).json()) as {
      messages: unknown[];
      next_cursor: string;
    };
    expect(empty.messages).toEqual([]);
    expect(empty.next_cursor).toBe(next.next_cursor);
  });

  it("answers none of the three paths like a path without a handler", async () => {
    const w = world();
    const missing = await w.app.request("/v1/nothing-here");
    const missingBody = await missing.text();
    for (const [method, path] of [
      ["POST", "/v1/messages"],
      ["POST", "/v1/messages/poll"],
      ["GET", "/v1/messages/count"],
    ] as const) {
      const res = await w.app.request(path, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
      expect(res.status, `${method} ${path}`).not.toBe(missing.status);
      expect(await res.text(), `${method} ${path}`).not.toBe(missingBody);
      // Nothing the runtime's HTTP client retries and counts for its circuit breaker.
      expect([429, 500, 502, 503, 504]).not.toContain(res.status);
    }
  });

  it("answers a wrong method with 405 and the method it takes", async () => {
    const w = world();
    const get = await w.app.request("/v1/messages");
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    const post = await w.app.request("/v1/messages/count", { method: "POST" });
    expect(post.status).toBe(405);
  });
});
