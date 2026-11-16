/**
 * What the key `automaton:<id>` of a hosted automaton may reach (goals/sandbox/08, point 12). The runtime reads messages of
 * strangers over the relay and calls every route with its key, so that key must not reach the keys of the account, the
 * other automatons of the account or their sandboxes. Its own automaton, its own sandbox and the sandboxes it starts stay
 * open, and the key of the customer reaches everything as before.
 */
import { afterEach, describe, expect, it } from "vitest";
import { closeWorlds } from "./sandbox-world.js";
import { automatonWorld } from "./automaton-world.js";

afterEach(closeWorlds);

const PROMPT = "Watch the price of one thing and write a short note about it every hour.";
type World = Awaited<ReturnType<typeof automatonWorld>>;

async function raw(w: World, method: string, path: string, key: string, body?: unknown) {
  const res = await w.app.request(path, {
    method,
    headers: { "content-type": "application/json", authorization: key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

/** One account with `n` automatons; each with its id, its sandbox and its own key in clear (from the setup file). */
async function accountWith(w: World, n: number) {
  const acct = w.account();
  const bots = [];
  for (let i = 0; i < n; i++) {
    const res = await acct.call("POST", "/v1/automatons", { name: `bot-${i}`, genesis_prompt: PROMPT });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    bots.push({ id: res.json.id as string, sandboxId: res.json.sandbox_id as string, key: w.setupOf(res.json.sandbox_id)?.conwayApiKey as string });
  }
  return { acct, bots };
}

const automatonRoutes = (id: string): [string, string][] => [
  ["GET", `/v1/automatons/${id}`],
  ["GET", `/v1/automatons/${id}/logs`],
  ["POST", `/v1/automatons/${id}/stop`],
  ["POST", `/v1/automatons/${id}/start`],
  ["DELETE", `/v1/automatons/${id}`],
];

const sandboxRoutes = (id: string): [string, string, unknown?][] => [
  ["GET", `/v1/sandboxes/${id}`],
  ["POST", `/v1/sandboxes/${id}/exec`, { command: "echo hi" }],
  ["POST", `/v1/sandboxes/${id}/files/upload/json`, { path: "/root/note.txt", content: "x" }],
  ["GET", `/v1/sandboxes/${id}/files/read?path=/root/note.txt`],
  ["POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 }],
  ["DELETE", `/v1/sandboxes/${id}`],
];

describe("the key of a hosted automaton", () => {
  it("answers 403 forbidden on GET /v1/auth/api-keys", async () => {
    const w = await automatonWorld();
    const { bots } = await accountWith(w, 1);
    const res = await raw(w, "GET", "/v1/auth/api-keys", bots[0].key);
    expect(res.status).toBe(403);
    expect(res.json.error).toBe("forbidden");
    expect(res.json.message).toMatch(/automaton/);
    expect(JSON.stringify(res.json)).not.toMatch(/cnwy_k_/);
  });

  it("answers 403 forbidden on POST /v1/auth/api-keys/revoke, and the key of the customer stays valid", async () => {
    const w = await automatonWorld();
    const { acct, bots } = await accountWith(w, 1);
    const res = await raw(w, "POST", "/v1/auth/api-keys/revoke", bots[0].key, { key_prefix: acct.key.slice(0, 15) });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe("forbidden");
    const row = w.db.prepare("SELECT revoked_at FROM api_keys WHERE key_prefix = ?").get(acct.key.slice(0, 15)) as { revoked_at: string | null };
    expect(row.revoked_at).toBeNull();
    expect((await acct.call("GET", "/v1/credits/balance")).status).toBe(200);
    // Not even its own key: deleting the automaton is what revokes it.
    expect((await raw(w, "POST", "/v1/auth/api-keys/revoke", bots[0].key, { key_prefix: bots[0].key.slice(0, 15) })).status).toBe(403);
  });

  it("answers 404 on status, /logs, stop, start and DELETE of another automaton of its own account", async () => {
    const w = await automatonWorld();
    const { acct, bots } = await accountWith(w, 2);
    const [a, b] = bots;
    for (const [method, path] of automatonRoutes(b.id)) {
      const res = await raw(w, method, path, a.key);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(res.json.error).toBe("automaton_not_found");
    }
    expect((await raw(w, "GET", "/v1/automatons", a.key)).json.automatons.map((x: any) => x.id)).toEqual([a.id]);
    const still = await acct.call("GET", `/v1/automatons/${b.id}`);
    expect(still.status).toBe(200);
    expect(still.json.status).toBe("starting");
    expect(w.d.sandboxes()[b.sandboxId].status).toBe("running");
  });

  it("answers 404 on the sandbox of another automaton: get, /exec, upload, /files/read, expose and DELETE", async () => {
    const w = await automatonWorld();
    const { bots } = await accountWith(w, 2);
    const [a, b] = bots;
    const execsBefore = w.execs().length;
    for (const [method, path, body] of sandboxRoutes(b.sandboxId)) {
      const res = await raw(w, method, path, a.key, body);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(res.json.error).toBe("sandbox_not_found");
    }
    expect(w.execs().length).toBe(execsBefore);
    expect(w.d.sandboxes()[b.sandboxId].status).toBe("running");
    const list = await raw(w, "GET", "/v1/sandboxes", a.key);
    expect(list.status).toBe(200);
    expect(list.json.sandboxes.map((s: any) => s.id)).toEqual([a.sandboxId]);
  });

  it("keeps its own automaton, its own sandbox, a sandbox it starts and its credits open", async () => {
    const w = await automatonWorld();
    const { bots } = await accountWith(w, 1);
    const [a] = bots;
    expect((await raw(w, "GET", `/v1/automatons/${a.id}`, a.key)).status).toBe(200);
    expect((await raw(w, "GET", `/v1/automatons/${a.id}/logs`, a.key)).status).toBe(200);
    expect((await raw(w, "GET", "/v1/automatons", a.key)).json.automatons.map((x: any) => x.id)).toEqual([a.id]);
    const own = await raw(w, "POST", `/v1/sandboxes/${a.sandboxId}/exec`, a.key, { command: "echo own" });
    expect(own.status).toBe(200);
    expect(own.json.stdout).toBe("own\n");
    expect((await raw(w, "GET", `/v1/sandboxes/${a.sandboxId}/files/read?path=/root/.automaton-setup.json`, a.key)).status).toBe(200);
    const child = await raw(w, "POST", "/v1/sandboxes", a.key, {});
    expect(child.status).toBe(201);
    for (const [method, path, body] of sandboxRoutes(child.json.id)) {
      const res = await raw(w, method, path, a.key, body);
      expect([200, 201], `${method} ${path}: ${JSON.stringify(res.json)}`).toContain(res.status);
    }
    expect((await raw(w, "GET", "/v1/credits/balance", a.key)).status).toBe(200);
  });

  it("leaves the key of the customer as it was: keys, every automaton and every sandbox", async () => {
    const w = await automatonWorld();
    const { acct, bots } = await accountWith(w, 2);
    const keys = await acct.call("GET", "/v1/auth/api-keys");
    expect(keys.status).toBe(200);
    expect(keys.json.keys.map((k: any) => k.name)).toEqual(expect.arrayContaining([`automaton:${bots[0].id}`, `automaton:${bots[1].id}`]));
    expect((await acct.call("GET", "/v1/automatons")).json.automatons).toHaveLength(2);
    for (const b of bots) {
      expect((await acct.call("GET", `/v1/automatons/${b.id}/logs`)).status).toBe(200);
      expect((await acct.call("POST", `/v1/sandboxes/${b.sandboxId}/exec`, { command: "echo mine" })).status).toBe(200);
    }
    expect((await acct.call("GET", "/v1/sandboxes")).json.sandboxes).toHaveLength(2);
    const revoke = await acct.call("POST", "/v1/auth/api-keys/revoke", { key_prefix: bots[1].key.slice(0, 15) });
    expect(revoke.status).toBe(200);
    expect((await raw(w, "GET", `/v1/automatons/${bots[1].id}`, bots[1].key)).status).toBe(401);
    expect((await acct.call("DELETE", `/v1/automatons/${bots[0].id}`)).status).toBe(200);
  });
});
