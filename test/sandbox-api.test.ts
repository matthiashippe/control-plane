/**
 * The sandbox API against a rebuilt sandboxd, held against docs/sandbox/vertrag.md.
 *
 * On 2026-11-10 a stranger's automaton got 501 on `POST /v1/sandboxes`, `exec` and the file paths.
 * Every row with `/v1/sandboxes` in the section `## Endpunkte` of docs/sandbox/vertrag.md is read
 * from the file, called here and read the way the runtime at d8f8168 reads it (`src/conway/client.ts`,
 * the expressions are copied below). The rebuilt sandboxd is the real `createSandboxd` with a fake
 * Docker (test/sandbox-world.ts); the control plane reaches it through the real signed client.
 */
import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { getAvailableMc } from "../src/db.js";
import { RETRIED, closeWorlds, sandboxWorld } from "./sandbox-world.js";

const VERTRAG = path.join(__dirname, "..", "docs", "sandbox", "vertrag.md");

afterEach(closeWorlds);

type ContractRow = { method: string; path: string; answer: string };

/** The rows of `## Endpunkte` in docs/sandbox/vertrag.md that name `/v1/sandboxes`. */
function contractRows(): ContractRow[] {
  const text = fs.readFileSync(VERTRAG, "utf8");
  const section = text.split(/^## /m).find((s) => s.startsWith("Endpunkte"));
  if (!section) throw new Error("docs/sandbox/vertrag.md has no section ## Endpunkte");
  return section
    .split("\n")
    .filter((l) => /^\| (GET|POST|PUT|PATCH|DELETE) /.test(l) && l.includes("/v1/sandboxes"))
    .map((l) => {
      const cells = l.split("|").map((c) => c.trim());
      return { method: cells[1], path: cells[2].replace(/`/g, ""), answer: cells[4] };
    });
}

// The runtime's own reading, expression for expression from src/conway/client.ts at d8f8168.
const readCreate = (result: any) => ({
  id: result.id || result.sandbox_id,
  status: result.status || "running",
  region: result.region || "",
  vcpu: result.vcpu || 1,
  memoryMb: result.memory_mb || 512,
  diskGb: result.disk_gb || 5,
  terminalUrl: result.terminal_url,
  createdAt: result.created_at || "now",
});
const readList = (result: any) => (Array.isArray(result) ? result : result.sandboxes || []).map((s: any) => ({ id: s.id || s.sandbox_id, status: s.status || "unknown" }));
const readExec = (result: any) => ({ stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exit_code ?? result.exitCode ?? -1 });
const readFile = (result: any) => (typeof result === "string" ? result : result.content || "");

const CREATE_FIELDS = ["id", "status", "region", "vcpu", "memory_mb", "disk_gb", "terminal_url", "created_at"];

describe("every /v1/sandboxes row of docs/sandbox/vertrag.md", () => {
  it("answers against a rebuilt sandboxd with the fields the runtime reads", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    const rows = contractRows();
    expect(rows.length).toBeGreaterThanOrEqual(7);
    const created = await a.call("POST", "/v1/sandboxes", { name: "child-1", vcpu: 1, memory_mb: 512, disk_gb: 5, region: "" });
    expect(created.status).toBe(201);
    const id = readCreate(created.json).id as string;
    const seen: string[] = [];
    for (const r of rows) {
      const key = `${r.method} ${r.path}`;
      seen.push(key);
      if (key === "POST /v1/sandboxes") {
        for (const f of CREATE_FIELDS) expect(created.json, `field ${f}`).toHaveProperty(f);
        const s = readCreate(created.json);
        expect(s).toMatchObject({ status: "running", vcpu: 1, memoryMb: 512, diskGb: 5, terminalUrl: "" });
        expect(Number.isNaN(Date.parse(s.createdAt))).toBe(false);
      } else if (key === "GET /v1/sandboxes") {
        const res = await a.call("GET", "/v1/sandboxes");
        expect(res.status).toBe(200);
        expect(readList(res.json)).toEqual([{ id, status: "running" }]);
        for (const f of CREATE_FIELDS) expect(res.json.sandboxes[0], `field ${f}`).toHaveProperty(f);
      } else if (key === "POST /v1/sandboxes/{id}/exec") {
        const res = await a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "cd /root && echo ok", timeout: 120000 }, { "Idempotency-Key": "01JC0000000000000000000001" });
        expect(res.status).toBe(200);
        expect(res.json).toHaveProperty("exit_code");
        expect(readExec(res.json)).toEqual({ stdout: "ok\n", stderr: "", exitCode: 0 });
      } else if (key === "POST /v1/sandboxes/{id}/files/upload/json") {
        const res = await a.call("POST", `/v1/sandboxes/${id}/files/upload/json`, { path: "/root/a b.txt", content: "hello sandbox" });
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
      } else if (key.startsWith("GET /v1/sandboxes/{id}/files/read")) {
        const res = await a.call("GET", `/v1/sandboxes/${id}/files/read?path=${encodeURIComponent("/root/a b.txt")}`);
        expect(res.status).toBe(200);
        expect(readFile(res.json)).toBe("hello sandbox");
      } else if (key === "POST /v1/sandboxes/{id}/ports/expose") {
        const res = await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 });
        expect(res.status).toBe(409);
        expect(res.json.error).toBe("port_exposure_unavailable");
      } else if (key === "DELETE /v1/sandboxes/{id}/ports/{port}") {
        const res = await a.call("DELETE", `/v1/sandboxes/${id}/ports/8080`);
        expect(res.status).toBe(409);
        expect(res.json.error).toBe("port_exposure_unavailable");
      } else {
        throw new Error(`a contract row without a test: ${key}`);
      }
    }
    expect(seen).toEqual(expect.arrayContaining(["POST /v1/sandboxes", "GET /v1/sandboxes", "POST /v1/sandboxes/{id}/exec"]));
    // The file went through sandboxd into the sandbox, not into a cache of the control plane.
    expect([...w.files.values()]).toContain("hello sandbox");
  });

  it("sends sandboxd an owner handle and never the address of the account", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    expect((await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).status).toBe(201);
    const run = w.calls.find((c) => c.cmd === "docker" && c.args[0] === "run")!;
    const label = run.args.find((x) => x.startsWith("sandboxd.owner="))!;
    expect(label).toMatch(/^sandboxd\.owner=acct-[0-9a-f]{24}$/);
    expect(JSON.stringify(w.calls)).not.toContain(a.address);
  });
});

describe("tiers and limits of docs/sandbox/plan.md, Grenzen", () => {
  it("maps 512 MB to the small tier and 1024 MB to the medium one", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    const small = await a.call("POST", "/v1/sandboxes", { vcpu: 1, memory_mb: 512, disk_gb: 5 });
    const b = w.account();
    const medium = await b.call("POST", "/v1/sandboxes", { vcpu: 1, memory_mb: 1024, disk_gb: 10 });
    expect([small.status, medium.status]).toEqual([201, 201]);
    expect(w.row(small.json.id)).toMatchObject({ tier: "small", step_mc: 100, slots: 1 });
    expect(w.row(medium.json.id)).toMatchObject({ tier: "medium", step_mc: 200, slots: 2 });
    expect(medium.json).toMatchObject({ memory_mb: 1024, disk_gb: 10, vcpu: 1 });
  });

  it("answers 400 above 1024 MB with both tiers named, without a call to sandboxd", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    for (const req of [{ vcpu: 2, memory_mb: 2048, disk_gb: 20 }, { memory_mb: 1025 }, { vcpu: 4, memory_mb: 8192, disk_gb: 80 }]) {
      const res = await a.call("POST", "/v1/sandboxes", req);
      expect(res.status).toBe(400);
      expect(res.json.message).toContain("memory_mb 512");
      expect(res.json.message).toContain("memory_mb 1024");
    }
    expect(w.hits).toEqual([]);
    expect(getAvailableMc(w.db, a.address)).toBe(100_000);
  });

  it("holds two slots per account, a medium one counting as two", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    expect((await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).status).toBe(201);
    expect((await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).status).toBe(201);
    const third = await a.call("POST", "/v1/sandboxes", { memory_mb: 512 });
    expect(third.status).toBe(409);
    expect(third.json).toMatchObject({ error: "sandbox_slots_full", slots_used: 2, slots_limit: 2 });
    const b = w.account();
    expect((await b.call("POST", "/v1/sandboxes", { memory_mb: 1024 })).status).toBe(201);
    const after = await b.call("POST", "/v1/sandboxes", { memory_mb: 512 });
    expect(after.status).toBe(409);
    expect(after.json.slots_used).toBe(2);
    // The refused creates reserved nothing: two small holds for a, one for b.
    expect(getAvailableMc(w.db, a.address)).toBe(100_000 - 2000);
    expect(getAvailableMc(w.db, b.address)).toBe(100_000 - 1000);
  });

  it("answers a full sandbox server with 409, not 503", async () => {
    const w = await sandboxWorld({ slots: 1 });
    const a = w.account();
    const b = w.account();
    expect((await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).status).toBe(201);
    const full = await b.call("POST", "/v1/sandboxes", { memory_mb: 512 });
    expect(full.status).toBe(409);
    expect(full.json.error).toBe("sandbox_host_full");
    expect(getAvailableMc(w.db, b.address)).toBe(100_000);
  });
});

describe("whose sandbox", () => {
  it("answers 404 for the sandbox of another account and for an unknown id, and lists only the own ones", async () => {
    const w = await sandboxWorld();
    const owner = w.account();
    const other = w.account();
    const id = (await owner.call("POST", "/v1/sandboxes", { memory_mb: 512 })).json.id as string;
    const hitsBefore = w.hits.length;
    for (const target of [id, "zzzzzzzzzz"]) {
      for (const [method, sub, body] of [
        ["POST", "/exec", { command: "id" }],
        ["POST", "/files/upload/json", { path: "/root/x", content: "x" }],
        ["GET", `/files/read?path=${encodeURIComponent("/root/x")}`, undefined],
        ["POST", "/ports/expose", { port: 80 }],
        ["DELETE", "/ports/80", undefined],
        ["GET", "", undefined],
        ["DELETE", "", undefined],
      ] as const) {
        const res = await other.call(method, `/v1/sandboxes/${target}${sub}`, body);
        expect(res.status, `${method} ${sub} on ${target}`).toBe(404);
        expect(res.json.error).toBe("sandbox_not_found");
      }
    }
    expect(w.hits.length).toBe(hitsBefore);
    expect((await other.call("GET", "/v1/sandboxes")).json).toEqual({ sandboxes: [] });
    expect((await owner.call("GET", "/v1/sandboxes")).json.sandboxes.map((s: any) => s.id)).toEqual([id]);
  });

  it("asks for the key on the sub-paths", async () => {
    const w = await sandboxWorld();
    const res = await w.app.request("/v1/sandboxes/abcdefghij/exec", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});

describe("credit", () => {
  it("answers 402 with details.required_cents and details.current_balance_cents and calls no sandboxd", async () => {
    const w = await sandboxWorld();
    const poor = w.account(999);
    const res = await poor.call("POST", "/v1/sandboxes", { memory_mb: 512 });
    expect(res.status).toBe(402);
    expect(res.json.details).toEqual({ required_cents: 1, current_balance_cents: 0 });
    // The runtime's topup reads exactly these two (src/conway/topup.ts:81 at the pin): deficit 1 cent, smallest tier.
    expect(res.json.details.required_cents - res.json.details.current_balance_cents).toBe(1);
    expect(w.hits).toEqual([]);
    expect((w.db.prepare("SELECT count(*) AS n FROM sandboxes").get() as { n: number }).n).toBe(0);
  });
});

describe("sandboxd unreachable", () => {
  it("answers 501 on create when sandboxd does not answer, and reserves and charges nothing", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    w.server.closeAllConnections();
    await new Promise((r) => w.server.close(() => r(undefined)));
    const res = await a.call("POST", "/v1/sandboxes", { memory_mb: 512 });
    expect(res.status).toBe(501);
    expect(res.json.error).toBe("sandbox_server_unreachable");
    expect(res.json.message).toMatch(/local worker/);
    expect(getAvailableMc(w.db, a.address)).toBe(100_000);
    expect(w.sandboxRows()).toEqual([]);
    expect((w.db.prepare("SELECT count(*) AS n FROM sandboxes").get() as { n: number }).n).toBe(0);
  });

  it("answers 501 and not 402 right after sandboxd was unreachable, so the runtime buys no credit for nothing", async () => {
    const w = await sandboxWorld();
    const rich = w.account();
    const poor = w.account(0);
    w.server.closeAllConnections();
    await new Promise((r) => w.server.close(() => r(undefined)));
    expect((await rich.call("POST", "/v1/sandboxes", { memory_mb: 512 })).status).toBe(501);
    const res = await poor.call("POST", "/v1/sandboxes", { memory_mb: 512 });
    expect(res.status).toBe(501);
    expect(res.json).not.toHaveProperty("details");
    // A minute later the next create may try again; without credit that is the 402, still without a call.
    w.clock.t += 61_000;
    const later = await poor.call("POST", "/v1/sandboxes", { memory_mb: 512 });
    expect(later.status).toBe(402);
    expect(later.json.details).toEqual({ required_cents: 1, current_balance_cents: 0 });
  });

  it("answers 501 when sandboxd refuses the key (401), on create and on exec", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).json.id as string;
    w.keys.list = [];
    const create = await a.call("POST", "/v1/sandboxes", { memory_mb: 512 });
    expect(create.status).toBe(501);
    const exec = await a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "echo ok" });
    expect(exec.status).toBe(501);
    expect(exec.json.message).toMatch(/cannot be reached/);
    // Only the first sandbox holds its reservation.
    expect(getAvailableMc(w.db, a.address)).toBe(100_000 - 1000);
  });

  it("never answers a status the runtime retries (429, 500, 502, 503, 504), whatever sandboxd does", async () => {
    const seen: number[] = [];
    // 1. sandboxd fails a step of create (its own 500).
    {
      const w = await sandboxWorld({ respond: (cmd) => (cmd === "mkfs.ext4" ? { code: 1, stderr: "disk" } : undefined) });
      const a = w.account();
      const res = await a.call("POST", "/v1/sandboxes", { memory_mb: 512 });
      seen.push(res.status);
      expect(res.status).toBe(501);
    }
    // 2. sandboxd has no free slot (its own 503).
    {
      const w = await sandboxWorld({ slots: 0 });
      seen.push((await w.account().call("POST", "/v1/sandboxes", { memory_mb: 512 })).status);
    }
    // 3. a sandbox server that answers 502, 503 and 504 itself, as Caddy would in front of a dead sandboxd.
    for (const status of [502, 503, 504, 429]) {
      const w = await sandboxWorld();
      const a = w.account();
      const id = (await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).json.id as string;
      w.server.removeAllListeners("request");
      w.server.on("request", (_req, res) => {
        res.writeHead(status, { "content-type": "text/html" });
        res.end("<html>bad gateway</html>");
      });
      for (const [method, target, body] of [
        ["POST", "/v1/sandboxes", { memory_mb: 512 }],
        ["POST", `/v1/sandboxes/${id}/exec`, { command: "echo ok" }],
        ["POST", `/v1/sandboxes/${id}/files/upload/json`, { path: "/root/x", content: "x" }],
        ["GET", `/v1/sandboxes/${id}/files/read?path=%2Froot%2Fx`, undefined],
        ["DELETE", `/v1/sandboxes/${id}`, undefined],
        ["GET", "/v1/sandboxes", undefined],
      ] as const) {
        seen.push((await a.call(method, target, body)).status);
      }
    }
    // 4. a sandbox that runs out of time inside sandboxd still answers 200 with exit_code 124.
    {
      const w = await sandboxWorld({ respond: (cmd, args) => (cmd === "docker" && args.includes("-lc") ? { code: null, timedOut: true } : undefined) });
      const a = w.account();
      const id = (await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).json.id as string;
      const res = await a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "sleep 999", timeout: 1000 });
      seen.push(res.status);
      expect(res.json.exit_code).toBe(124);
    }
    expect(seen.length).toBeGreaterThan(20);
    for (const s of seen) expect(RETRIED, `status ${s}`).not.toContain(s);
    expect(seen).toContain(501);
    expect(seen).toContain(409);
  });
});

describe("exec with the same Idempotency-Key", () => {
  it("runs the command once and hands the repeat its result, even when it runs longer than the first request was held", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const w = await sandboxWorld({
      respond: async (cmd, args) => {
        if (cmd === "docker" && args.includes("-lc") && args[args.length - 1].includes("apt-get")) {
          await gate;
          return { code: 0, stdout: "installed\n", stderr: "" };
        }
        return undefined;
      },
    });
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).json.id as string;
    // The control plane on a real socket, so the runtime's abort after its 30 s is a real abort.
    const cp = serve({ fetch: w.app.fetch, port: 0, hostname: "127.0.0.1" });
    try {
      await new Promise((r) => cp.once("listening", r));
      const base = `http://127.0.0.1:${(cp.address() as AddressInfo).port}`;
      const send = (key: string, signal?: AbortSignal) =>
        fetch(`${base}/v1/sandboxes/${id}/exec`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: a.key, "Idempotency-Key": key },
          body: JSON.stringify({ command: "cd /root && apt-get install -y jq", timeout: 120000 }),
          signal,
        });
      // First attempt: the client gives up, as the runtime does after 30 s, while the command still runs.
      await expect(send("01JC0000000000000000000IDK", AbortSignal.timeout(200))).rejects.toThrow();
      expect(w.execs().length).toBe(1);
      // The repeat with the same key starts nothing new and waits for the running command.
      const repeat = send("01JC0000000000000000000IDK");
      await new Promise((r) => setTimeout(r, 100));
      expect(w.execs().length).toBe(1);
      release();
      const res = await repeat;
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ stdout: "installed\n", stderr: "", exit_code: 0 });
      // A third repeat after the end gets the same result at once, still from the one run.
      const again = await send("01JC0000000000000000000IDK");
      expect(await again.json()).toEqual({ stdout: "installed\n", stderr: "", exit_code: 0 });
      expect(w.execs().length).toBe(1);
      // The control plane itself kept the one run: the repeats never asked sandboxd a second time.
      expect(w.hits.filter((h) => h.endsWith("/exec"))).toHaveLength(1);
      // The counter-check: another key is another command.
      const other = await send("01JC0000000000000000000ID2");
      expect(other.status).toBe(200);
      expect(w.execs().length).toBe(2);
    } finally {
      cp.close();
    }
  });

  it("passes the Idempotency-Key on to sandboxd", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).json.id as string;
    const seen: (string | undefined)[] = [];
    const handler = w.server.listeners("request")[0] as (req: any, res: any) => void;
    w.server.removeAllListeners("request");
    w.server.on("request", (req, res) => {
      seen.push(req.headers["idempotency-key"] as string | undefined);
      handler(req, res);
    });
    await a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "echo ok" }, { "Idempotency-Key": "01JC0000000000000000000KEY" });
    expect(seen).toContain("01JC0000000000000000000KEY");
  });
});

describe("ports", () => {
  it("port_exposure_unavailable: expose and remove answer 409 and never reach sandboxd", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).json.id as string;
    const before = [...w.hits];
    const expose = await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 3000 });
    const remove = await a.call("DELETE", `/v1/sandboxes/${id}/ports/3000`);
    for (const res of [expose, remove]) {
      expect(res.status).toBe(409);
      expect(res.json.error).toBe("port_exposure_unavailable");
      expect(res.json).not.toHaveProperty("public_url");
    }
    expect(w.hits).toEqual(before);
    expect(w.hits.some((h) => h.includes("/ports"))).toBe(false);
  });
});

describe("DELETE /v1/sandboxes/{id}", () => {
  it("deletes at sandboxd, books the started step and gives the reservation back", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { memory_mb: 512 })).json.id as string;
    w.clock.t += 60_000;
    const res = await a.call("DELETE", `/v1/sandboxes/${id}`);
    expect(res.status).toBe(200);
    expect(w.hits).toContain(`DELETE /v1/sandboxes/${id}`);
    expect(w.sandboxRows(a.address)).toEqual([{ ref: `sandbox:${id}:0`, delta_mc: -100 }]);
    expect(getAvailableMc(w.db, a.address)).toBe(100_000 - 100);
    expect((await a.call("GET", "/v1/sandboxes")).json).toEqual({ sandboxes: [] });
    expect((await a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "echo ok" })).status).toBe(404);
  });
});

describe("without a sandbox server configured", () => {
  it("answers 501 on create and on the sandbox paths, and an empty list", async () => {
    const { openDb } = await import("../src/db.js");
    const { hashApiKey } = await import("../src/auth/siwe.js");
    const db = openDb(":memory:");
    const app = createApp({ db });
    const address = "0x" + "34".repeat(20);
    const key = "cnwy_k_" + "e1".repeat(16);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 5000, ?)").run(address, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address, hashApiKey(key), key.slice(0, 15), "t", new Date().toISOString());
    const call = (method: string, url: string, body?: unknown) =>
      app.request(url, { method, headers: { "Content-Type": "application/json", Authorization: key }, body: body === undefined ? undefined : JSON.stringify(body) });
    const create = await call("POST", "/v1/sandboxes", { memory_mb: 512 });
    expect(create.status).toBe(501);
    expect(((await create.json()) as any).message).toMatch(/local worker/);
    expect(await (await call("GET", "/v1/sandboxes")).json()).toEqual({ sandboxes: [] });
  });
});
