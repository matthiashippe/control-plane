/**
 * `Idempotency-Key` on POST /v1/automatons (goals/sandbox/08, point 13). Creating an automaton can take minutes (the sandbox
 * up to 120 s, automaton-start up to 90 s), so a client that repeats after its own timeout must get the automaton it already
 * has, not a second one that takes the second slot of the account and costs twice; also while the first request still
 * runs, and after a restart of the control plane in between, which is why the key lives in the database.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createSandboxService } from "../src/sandbox/service.js";
import { closeWorlds } from "./sandbox-world.js";
import { automatonWorld } from "./automaton-world.js";

afterEach(closeWorlds);

const BODY = { name: "watcher", genesis_prompt: "Watch the price of one thing and write a short note about it every hour." };
type World = Awaited<ReturnType<typeof automatonWorld>>;

const creates = (w: World) => w.hits.filter((h) => h === "POST /v1/sandboxes").length;
const automatonKeys = (w: World) => (w.db.prepare("SELECT count(*) AS n FROM api_keys WHERE name LIKE 'automaton:%'").get() as { n: number }).n;
const rows = (w: World) => (w.db.prepare("SELECT count(*) AS n FROM hosted_automatons").get() as { n: number }).n;

describe("POST /v1/automatons with Idempotency-Key", () => {
  it("gives the same id and makes exactly one call to sandboxd for the same key and body, one after the other and at once", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const first = await acct.call("POST", "/v1/automatons", BODY, { "Idempotency-Key": "k-1" });
    expect(first.status, JSON.stringify(first.json)).toBe(201);
    const again = await acct.call("POST", "/v1/automatons", BODY, { "Idempotency-Key": "k-1" });
    expect(again.status, JSON.stringify(again.json)).toBe(200);
    expect(again.json).toMatchObject({ id: first.json.id, sandbox_id: first.json.sandbox_id });
    expect(again.json.message).toMatch(/Idempotency-Key/);
    expect(creates(w)).toBe(1);

    const [a, b] = await Promise.all([
      acct.call("POST", "/v1/automatons", BODY, { "Idempotency-Key": "k-2" }),
      acct.call("POST", "/v1/automatons", BODY, { "Idempotency-Key": "k-2" }),
    ]);
    expect(a.status, JSON.stringify(a.json)).toBe(201);
    expect(b.json.id).toBe(a.json.id);
    expect(b.json.sandbox_id).toBe(a.json.sandbox_id);
    expect(creates(w)).toBe(2);
    expect(automatonKeys(w)).toBe(2);
    expect(rows(w)).toBe(2);
  });

  it("answers 409 for the same key with another body, without a call to sandboxd", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    expect((await acct.call("POST", "/v1/automatons", BODY, { "Idempotency-Key": "k-1" })).status).toBe(201);
    const hits = w.hits.length;
    const res = await acct.call("POST", "/v1/automatons", { ...BODY, genesis_prompt: "Something else." }, { "Idempotency-Key": "k-1" });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("idempotency_key_reused");
    expect(res.json.message).toMatch(/Idempotency-Key/);
    expect(w.hits.length).toBe(hits);
    expect(rows(w)).toBe(1);
    // The same key of another account is a key of its own.
    expect((await w.account().call("POST", "/v1/automatons", { ...BODY, name: "theirs" }, { "Idempotency-Key": "k-1" })).status).toBe(201);
  });

  it("gives the same id without a call to sandboxd from a new createApp on the same database", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const first = await acct.call("POST", "/v1/automatons", BODY, { "Idempotency-Key": "after-restart" });
    expect(first.status).toBe(201);
    const hits = w.hits.length;
    const service = createSandboxService({ db: w.db, client: w.client, now: () => w.clock.t, log: () => {} });
    const restarted = createApp({ db: w.db, sandbox: service, rateLimit: null });
    const res = await restarted.request("/v1/automatons", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: acct.key, "idempotency-key": "after-restart" },
      body: JSON.stringify(BODY),
    });
    const json = (await res.json()) as any;
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json.id).toBe(first.json.id);
    expect(w.hits.length).toBe(hits);
    expect(rows(w)).toBe(1);
    expect(automatonKeys(w)).toBe(1);
  });

  it("creates one automaton per call without the header, as before", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const a = await acct.call("POST", "/v1/automatons", BODY);
    const b = await acct.call("POST", "/v1/automatons", BODY);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.json.id).not.toBe(a.json.id);
    expect(creates(w)).toBe(2);
  });

  it("answers 400 invalid_request for an empty Idempotency-Key and one over 200 characters, without a call to sandboxd", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    for (const key of ["", "k".repeat(201)]) {
      const res = await acct.call("POST", "/v1/automatons", BODY, { "Idempotency-Key": key });
      expect(res.status).toBe(400);
      expect(res.json.error).toBe("invalid_request");
      expect(res.json.message).toMatch(/Idempotency-Key/);
    }
    expect(w.hits).toHaveLength(0);
  });
});
