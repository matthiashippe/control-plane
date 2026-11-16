/**
 * The routes under /v1/automatons (goals/sandbox/08, point 3): create, list, status, log, stop, start and delete of a
 * hosted automaton, through the real app, the real sandbox service and the rebuilt sandboxd of test/sandbox-world.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mintKeylessIdentity } from "../src/auth/keyless.js";
import { postLedger } from "../src/db.js";
import { handleRegister } from "../src/registry.js";
import { closeWorlds } from "./sandbox-world.js";
import { automatonWorld } from "./automaton-world.js";

afterEach(closeWorlds);

const PROMPT = "Watch the price of one thing and write a short note about it every hour.";

async function created(w: Awaited<ReturnType<typeof automatonWorld>>, acct = w.account()) {
  const res = await acct.call("POST", "/v1/automatons", { name: "watcher", genesis_prompt: PROMPT });
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  const key = w.setupOf(res.json.sandbox_id)?.conwayApiKey as string;
  return { acct, res, id: res.json.id as string, sandboxId: res.json.sandbox_id as string, key };
}

async function raw(w: Awaited<ReturnType<typeof automatonWorld>>, method: string, path: string, key?: string, body?: unknown) {
  const res = await w.app.request(path, {
    method,
    headers: { "content-type": "application/json", ...(key ? { authorization: key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

describe("POST /v1/automatons", () => {
  it("answers 201 for a name and a genesis prompt and creates exactly one sandbox at sandboxd, with keep_running", async () => {
    const w = await automatonWorld();
    const { res, sandboxId } = await created(w);
    expect(res.json).toMatchObject({ name: "watcher", status: "starting", sandbox_id: sandboxId });
    expect(res.json.id).toMatch(/^[a-z0-9]{12}$/);
    expect(w.hits.filter((h) => h === "POST /v1/sandboxes")).toHaveLength(1);
    expect(w.d.sandboxes()[sandboxId].keep_running).toBe(true);
    expect(w.started.has(`sbx-${sandboxId}`)).toBe(true);
  });

  it("creates an automaton for a keyless account too", async () => {
    const w = await automatonWorld();
    const { address, key } = mintKeylessIdentity(w.db, "browser", w.clock.t);
    postLedger(w.db, { address, kind: "topup", deltaMc: 100_000, ref: "seed-keyless" });
    const res = await raw(w, "POST", "/v1/automatons", key, { name: "keyless-one", genesis_prompt: PROMPT });
    expect(res.status).toBe(201);
    expect(w.d.sandboxes()[res.json.sandbox_id].keep_running).toBe(true);
  });

  it("never passes keep_running on from POST /v1/sandboxes", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const res = await acct.call("POST", "/v1/sandboxes", { keep_running: true });
    expect(res.status).toBe(201);
    expect(w.d.sandboxes()[res.json.id].keep_running).toBeFalsy();
  });

  it("answers 400 invalid_request for an empty genesis_prompt and for one over 8000 characters", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    for (const genesis_prompt of ["", "   ", "x".repeat(8001), undefined]) {
      const res = await acct.call("POST", "/v1/automatons", { name: "watcher", genesis_prompt });
      expect(res.status).toBe(400);
      expect(res.json.error).toBe("invalid_request");
      expect(res.json.message).toMatch(/genesis_prompt/);
    }
    expect(w.hits).toHaveLength(0);
    expect((await acct.call("POST", "/v1/automatons", { name: "watcher", genesis_prompt: "x".repeat(8000) })).status).toBe(201);
  });

  it("answers 403 forbidden to the key automaton:<id> of a hosted automaton", async () => {
    const w = await automatonWorld();
    const { key, id } = await created(w);
    const row = w.db.prepare("SELECT name FROM api_keys WHERE name LIKE 'automaton:%'").get() as { name: string };
    expect(row.name).toBe(`automaton:${id}`);
    const res = await raw(w, "POST", "/v1/automatons", key, { name: "child", genesis_prompt: PROMPT });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe("forbidden");
    expect(w.hits.filter((h) => h === "POST /v1/sandboxes")).toHaveLength(1);
    // A sandbox of its own stays open to it.
    expect((await raw(w, "POST", "/v1/sandboxes", key, {})).status).toBe(201);
  });
});

describe("the routes of one automaton", () => {
  it("answer 404 to another account on status, log, stop, start and delete", async () => {
    const w = await automatonWorld();
    const { id } = await created(w);
    const other = w.account();
    for (const [method, path] of [
      ["GET", `/v1/automatons/${id}`],
      ["GET", `/v1/automatons/${id}/logs`],
      ["POST", `/v1/automatons/${id}/stop`],
      ["POST", `/v1/automatons/${id}/start`],
      ["DELETE", `/v1/automatons/${id}`],
    ]) {
      const res = await other.call(method, path);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(res.json.error).toBe("automaton_not_found");
    }
    expect((await other.call("GET", "/v1/automatons/doesnotexist")).status).toBe(404);
  });

  it("answer 401 without a key", async () => {
    const w = await automatonWorld();
    const { id } = await created(w);
    expect((await raw(w, "GET", `/v1/automatons/${id}`)).status).toBe(401);
    expect((await raw(w, "GET", "/v1/automatons")).status).toBe(401);
  });

  it("GET /v1/automatons lists only the automatons of this account", async () => {
    const w = await automatonWorld();
    const mine = await created(w);
    const theirs = await created(w);
    const list = await mine.acct.call("GET", "/v1/automatons");
    expect(list.status).toBe(200);
    expect(list.json.automatons.map((a: any) => a.id)).toEqual([mine.id]);
    expect((await theirs.acct.call("GET", "/v1/automatons")).json.automatons.map((a: any) => a.id)).toEqual([theirs.id]);
  });

  it("is starting without a turn in the log and running with one, with the wallet address from automaton.json", async () => {
    const w = await automatonWorld();
    const { acct, id, sandboxId } = await created(w);
    let s = await acct.call("GET", `/v1/automatons/${id}`);
    expect(s.json).toMatchObject({ status: "starting", turns: 0 });
    w.logOf(sandboxId, "[2026-11-16T10:00:00Z] Agent loop started\n[2026-11-16T10:00:09Z] Turn 01JX: 1 tools, 210 tokens\n");
    s = await acct.call("GET", `/v1/automatons/${id}`);
    expect(s.json).toMatchObject({ status: "running", turns: 1, wallet_address: "0x00000000000000000000000000000000000a11ce" });
  });

  it("gives the log without the API key and without a run of 64 hex digits", async () => {
    const w = await automatonWorld();
    const { acct, id, sandboxId, key } = await created(w);
    const secret = "ab".repeat(32);
    w.logOf(sandboxId, `line one\nusing key ${key}\nprivate 0x${secret}\nTurn 01JX: 1 tools\n`);
    const res = await acct.call("GET", `/v1/automatons/${id}/logs`);
    expect(res.status).toBe(200);
    const text = res.json.lines.join("\n");
    expect(text).not.toContain(key);
    expect(text).not.toMatch(/[0-9a-f]{64}/i);
    expect(text).toContain("[redacted]");
    expect(res.json.lines).toContain("line one");
  });

  it("stops and starts again", async () => {
    const w = await automatonWorld();
    const { acct, id, sandboxId } = await created(w);
    const stopped = await acct.call("POST", `/v1/automatons/${id}/stop`);
    expect(stopped.status).toBe(200);
    expect(stopped.json).toMatchObject({ status: "stopped", reason: "stopped" });
    expect(w.d.sandboxes()[sandboxId].status).toBe("stopped");
    const again = await acct.call("POST", `/v1/automatons/${id}/start`);
    expect(again.status).toBe(200);
    expect(again.json.status).toBe("starting");
    expect(w.d.sandboxes()[sandboxId].status).toBe("running");
  });

  it("delete revokes the key automaton:<id>, which then gets 401", async () => {
    const w = await automatonWorld();
    const { acct, id, key } = await created(w);
    expect((await raw(w, "GET", "/v1/credits/balance", key)).status).toBe(200);
    const del = await acct.call("DELETE", `/v1/automatons/${id}`);
    expect(del.status).toBe(200);
    expect(del.json).toEqual({ ok: true, id, status: "deleted" });
    expect((await raw(w, "GET", "/v1/credits/balance", key)).status).toBe(401);
    expect((await acct.call("GET", `/v1/automatons/${id}`)).status).toBe(404);
    expect(Object.keys(w.d.sandboxes())).toHaveLength(0);
  });

  it("answers 501 and leaves nothing running when the start in the sandbox fails", async () => {
    const w = await automatonWorld({ startFails: true });
    const acct = w.account();
    const res = await acct.call("POST", "/v1/automatons", { name: "watcher", genesis_prompt: PROMPT });
    expect(res.status).toBe(501);
    expect(res.json.error).toBe("automaton_start_failed");
    expect(Object.keys(w.d.sandboxes())).toHaveLength(0);
    const keys = w.db.prepare("SELECT revoked_at FROM api_keys WHERE name LIKE 'automaton:%'").all() as { revoked_at: string | null }[];
    expect(keys).toHaveLength(1);
    expect(keys[0].revoked_at).not.toBeNull();
    expect((await acct.call("GET", `/v1/automatons/${res.json.id}`)).json).toMatchObject({ status: "failed", reason: "start_failed" });
  });
});

describe("POST /v1/automatons/register", () => {
  it("answers as before and is never taken for an id", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const body = { automaton_id: "x" };
    const res = await acct.call("POST", "/v1/automatons/register", body);
    const before = await handleRegister(w.db, acct.address as `0x${string}`, body);
    expect(res.status).toBe(before.status);
    expect(res.json).toEqual(before.body);
    expect(res.json.error).not.toBe("automaton_not_found");
  });
});
