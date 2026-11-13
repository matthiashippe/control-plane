/**
 * GET /v1/handoff/{code} (goals/konto/02, Punkt 7): the terminal that created the code learns how it ended, as Server-Sent Events,
 * and nobody else does.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ATLAS, create, handoffApp, tap } from "./handoff-helpers.js";

type App = ReturnType<typeof handoffApp>["app"];

/** Every stream a test opened, cancelled after the test, so a test that fails half way does not leave a stream polling. */
const opened: ReadableStreamDefaultReader<Uint8Array>[] = [];
afterEach(async () => {
  for (const r of opened.splice(0)) await r.cancel().catch(() => {});
});

/** Reads events off a stream: each `next()` waits for the next event, `ended()` for the end of the stream. */
function events(res: Response) {
  const reader = res.body!.getReader();
  opened.push(reader);
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  const take = (): { event: string; data: string } | null => {
    const end = buffer.indexOf("\n\n");
    if (end < 0) return null;
    const block = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    const event = /^event: (.*)$/m.exec(block)?.[1] ?? "";
    const data = /^data: (.*)$/m.exec(block)?.[1] ?? "";
    return event || data ? { event, data } : take();
  };
  // An event that does not come is a failure after 10 seconds, not a stream that waits for the test timeout.
  const pull = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const r = await Promise.race([
      reader.read(),
      new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error("no event within 10 s")), 10_000); }),
    ]).finally(() => clearTimeout(timer));
    if (r.done) done = true;
    else buffer += decoder.decode(r.value, { stream: true });
  };
  return {
    async next() {
      for (;;) {
        const e = take();
        if (e) return { event: e.event, data: JSON.parse(e.data) as { state: string } };
        if (done) throw new Error("stream ended without another event");
        await pull();
      }
    },
    async ended() {
      while (!done) await pull();
      return take();
    },
    cancel: () => reader.cancel(),
  };
}

const open = (app: App, code: string, token?: string) =>
  app.request(`/v1/handoff/${code}`, token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } });

describe("GET /v1/handoff/{code}", () => {
  it("answers the terminal's secret with text/event-stream and the event state pending first", async () => {
    const { app } = handoffApp();
    const h = await create(app);
    const res = await open(app, h.code, h.poll_token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const s = events(res);
    expect(await s.next()).toEqual({ event: "state", data: { state: "pending" } });
    await s.cancel();
  });

  it("sends done after the right number and then ends", async () => {
    const { app } = handoffApp();
    const h = await create(app);
    const s = events(await open(app, h.code, h.poll_token));
    expect((await s.next()).data.state).toBe("pending");
    expect((await tap(app, h.code, h.match)).status).toBe(200);
    expect(await s.next()).toEqual({ event: "state", data: { state: "done" } });
    expect(await s.ended()).toBeNull();
    // Opened afterwards, it says done at once and ends.
    const later = events(await open(app, h.code, h.poll_token));
    expect((await later.next()).data.state).toBe("done");
    expect(await later.ended()).toBeNull();
  });

  it("sends burned after a wrong number", async () => {
    const { app } = handoffApp();
    const h = await create(app);
    const s = events(await open(app, h.code, h.poll_token));
    expect((await s.next()).data.state).toBe("pending");
    const wrong = h.match === 99 ? 98 : h.match + 1;
    expect((await tap(app, h.code, wrong)).status).toBe(410);
    expect((await s.next()).data.state).toBe("burned");
    expect(await s.ended()).toBeNull();
  });

  it("sends expired once the ten minutes are up", async () => {
    const { app, clock } = handoffApp();
    const h = await create(app);
    const s = events(await open(app, h.code, h.poll_token));
    expect((await s.next()).data.state).toBe("pending");
    clock.now += 601_000;
    expect((await s.next()).data.state).toBe("expired");
    expect(await s.ended()).toBeNull();
  });

  it("answers 401 without a secret and with the secret of another handoff, and says nothing about the state", async () => {
    const { app } = handoffApp();
    const h = await create(app);
    const other = await create(app, { ...ATLAS, automaton_name: "Other" });
    for (const [what, res] of [
      ["no header", await open(app, h.code)],
      ["other secret", await open(app, h.code, other.poll_token)],
      ["key instead of secret", await app.request(`/v1/handoff/${h.code}`, { headers: { authorization: "Bearer cnwy_k_0000000000000000000000000000" } })],
      ["secret without Bearer", await app.request(`/v1/handoff/${h.code}`, { headers: { authorization: other.poll_token } })],
    ] as const) {
      expect(res.status, what).toBe(401);
      expect(res.headers.get("content-type"), what).toMatch(/application\/json/);
      const body = await res.text();
      expect(body, what).not.toMatch(/pending|done|burned|expired|"state"/);
    }
    // The other handoff's own secret still opens its own stream.
    const own = events(await open(app, other.code, other.poll_token));
    expect((await own.next()).data.state).toBe("pending");
    await own.cancel();
  });

  it("answers an unknown code with 404", async () => {
    const { app } = handoffApp();
    const h = await create(app);
    for (const code of ["ZZZZZZZZZZZZ", "nothing"]) {
      const res = await open(app, code, h.poll_token);
      expect(res.status, code).toBe(404);
      expect((await res.json()).error).toBe("handoff_not_found");
    }
    expect((await app.request(`/v1/handoff/${h.code}/more`, { headers: { authorization: `Bearer ${h.poll_token}` } })).status).toBe(404);
    expect((await app.request(`/v1/handoff/${h.code}`, { method: "DELETE" })).status).toBe(405);
  });
});
