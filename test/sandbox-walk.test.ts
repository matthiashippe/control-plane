/**
 * `judgeSandboxWalk` of harness/e2e/sandbox-walk.mjs, in both directions. The good walk below is the SANDBOX_RESULT of a
 * real run of the unmodified runtime at d8f8168 (its client and tools) against dist/index.js over TLS with the rebuilt
 * sandboxd of harness/sandboxd/ (2026-11-13, code-host), with the id replaced; since goals/sandbox/07 expose_port
 * answers a public_url under the domain of the rebuilt sandboxd and remove_port closes the port again. Each other case
 * changes one thing the walk must catch: a wrong `echo ok`, the old 409 on expose_port, a public_url under another
 * domain or under postyourprice.com, a failed remove_port, a status the runtime retries (503 and the others), a
 * sandbox still listed after DELETE, zero or two ledger rows, a 402 on create, a read that only worked through the
 * runtime's fallback to `cat`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RETRIED, WALK_DOMAIN, WALK_PORT, judgeSandboxWalk, parseSandboxResult } from "../harness/e2e/sandbox-walk.mjs";
import { HARNESS_DOMAIN, startHarnessSandboxd } from "../harness/sandboxd/start.mjs";
import { createSandboxdClient, loadOrCreateClientKey } from "../src/sandbox/client.js";

const ID = "abcde12345";
// What the runtime's tool expose_port returns (`src/agent/tools.ts:228` at d8f8168), with the id redacted.
const EXPOSE_TEXT = "Port 8080 exposed at: https://sbx-{id}-8080.sbx.example";
const OLD_409_TEXT =
  'Conway API error: POST /v1/sandboxes/{id}/ports/expose -> 409: {"error":"port_exposure_unavailable","message":"Exposing a port of a sandbox is not offered yet.","docs":"https://github.com/matthiashippe/control-plane/blob/main/docs/errors.md#sandboxes"}';

function good(): any {
  return {
    name: "walk-d89893f2",
    id: ID,
    content: "sandbox-walk-6c6c7b9c9195",
    steps: [
      { step: "create_sandbox", tool: "create_sandbox", status: 201, http: [201], text: "Sandbox created: {id} (1 vCPU, 512MB RAM)", error: false },
      { step: "exec", tool: "exec", status: 200, http: [200], text: "exit_code: 0\nstdout: ok\n\nstderr: ", error: false },
      { step: "write_file", tool: "write_file", status: 200, http: [200], text: "File written: /root/sandbox-walk.txt", error: false },
      { step: "read_file", tool: "read_file", status: 200, http: [200], text: "sandbox-walk-6c6c7b9c9195", error: false },
      { step: "expose_port", tool: "expose_port", status: 200, http: [200], text: EXPOSE_TEXT, error: false },
      { step: "remove_port", tool: "remove_port", status: 200, http: [200], text: "Port 8080 removed", error: false },
      { step: "list_sandboxes", tool: "list_sandboxes", status: 200, http: [200], text: "{id} [running] 1vCPU/512MB ", error: false, listed: true },
      { step: "delete", tool: null, status: 200, http: [], text: "" },
      { step: "list_after_delete", tool: "list_sandboxes", status: 200, http: [200], text: "No sandboxes found.", error: false, listed: false },
    ],
  };
}

function withStep(name: string, patch: Record<string, unknown>) {
  const r = good();
  const s = r.steps.find((x: any) => x.step === name);
  Object.assign(s, patch);
  return r;
}

const reasons = (r: unknown) => judgeSandboxWalk(r).reasons.join(" | ");

describe("judgeSandboxWalk", () => {
  it("passes the real walk of the runtime", () => {
    expect(judgeSandboxWalk(good())).toEqual({ ok: true, reasons: [] });
  });

  it("passes it with exactly one ledger row, and fails it with zero or two", () => {
    expect(judgeSandboxWalk({ ...good(), ledger_rows: 1 })).toEqual({ ok: true, reasons: [] });
    expect(judgeSandboxWalk({ ...good(), ledger_rows: 0 }).ok).toBe(false);
    expect(reasons({ ...good(), ledger_rows: 0 })).toContain("ledger: 0 rows");
    expect(reasons({ ...good(), ledger_rows: 2 })).toContain("ledger: 2 rows");
    expect(reasons({ ...good(), ledger_rows: null })).toContain("ledger");
  });

  it("fails when echo ok did not print ok with exit code 0", () => {
    expect(reasons(withStep("exec", { text: "exit_code: 0\nstdout: \n\nstderr: " }))).toContain("exec: echo ok");
    expect(reasons(withStep("exec", { text: "exit_code: 1\nstdout: ok\n\nstderr: " }))).toContain("exec: echo ok");
    expect(reasons(withStep("exec", { text: "exit_code: 0\nstdout: okay\n\nstderr: " }))).toContain("exec: echo ok");
  });

  it("fails when expose_port answered the old 409 or no public_url of the form https://sbx-<id>-<port>.<domain>", () => {
    const old409 = withStep("expose_port", { status: 409, http: [409], text: OLD_409_TEXT, error: true });
    expect(judgeSandboxWalk(old409).ok).toBe(false);
    expect(reasons(old409)).toContain("expose_port: status 409, expected 200 with a public_url");
    expect(reasons(withStep("expose_port", { text: "Port 8080 exposed at: https://x.example" }))).toContain("expose_port: public_url");
    expect(reasons(withStep("expose_port", { text: "Port 8080 exposed at: https://sbx-{id}-9090.sbx.example" }))).toContain("expose_port: public_url");
    expect(reasons(withStep("expose_port", { text: "Port 8080 exposed at: https://sbx-{id}-8080.other.example" }))).toContain("expose_port: public_url");
    expect(reasons(withStep("expose_port", { text: "Port 8080 exposed at: undefined" }))).toContain("expose_port: public_url");
  });

  it("fails a public_url under postyourprice.com even when that is the domain it was told to expect", () => {
    const r = withStep("expose_port", { text: "Port 8080 exposed at: https://sbx-{id}-8080.postyourprice.com" });
    expect(reasons(r)).toContain("postyourprice.com");
    expect(judgeSandboxWalk(r, { domain: "postyourprice.com" }).ok).toBe(false);
    expect(judgeSandboxWalk(withStep("expose_port", { text: "Port 8080 exposed at: https://sbx-{id}-8080.sbx.postyourprice.com" }), { domain: "sbx.postyourprice.com" }).ok).toBe(false);
  });

  it("takes the expected domain from the caller, so a walk against production names its own", () => {
    const prod = withStep("expose_port", { text: "Port 8080 exposed at: https://sbx-{id}-8080.ports.example" });
    expect(judgeSandboxWalk(prod).ok).toBe(false);
    expect(judgeSandboxWalk(prod, { domain: "ports.example" })).toEqual({ ok: true, reasons: [] });
  });

  it("fails when remove_port is missing or did not answer 2xx, or the next call of the same client is not answered 200", () => {
    const r = good();
    r.steps = r.steps.filter((s: any) => s.step !== "remove_port");
    expect(reasons(r)).toContain("remove_port: missing");
    const failed = withStep("remove_port", { status: 404, http: [404], text: "Conway API error: DELETE /v1/sandboxes/{id}/ports/8080 -> 404: {}", error: true });
    expect(reasons(failed)).toContain("remove_port: status 404, expected 2xx");
    expect(reasons(withStep("remove_port", { status: 501, http: [501], error: true }))).toContain("remove_port");
    expect(reasons(withStep("list_sandboxes", { status: 501, http: [501] }))).toContain("list_sandboxes: status 501");
  });

  it("fails on every status the runtime retries, in any step, 503 included", () => {
    expect(RETRIED).toEqual([429, 500, 502, 503, 504]);
    for (const s of RETRIED) {
      const r = withStep("list_sandboxes", { http: [s, 200] });
      expect(judgeSandboxWalk(r).ok, `status ${s}`).toBe(false);
      expect(reasons(r)).toContain(`the runtime got ${s}`);
    }
    expect(reasons(withStep("create_sandbox", { http: [503, 201] }))).toContain("create_sandbox: the runtime got 503");
  });

  it("fails when the sandbox is still listed after DELETE, or DELETE did not answer 200", () => {
    expect(reasons(withStep("list_after_delete", { listed: true, text: "{id} [running] 1vCPU/512MB " }))).toContain("still listed");
    expect(reasons(withStep("delete", { status: 501 }))).toContain("delete: status 501, expected 200");
    expect(reasons(withStep("list_sandboxes", { listed: false }))).toContain("not listed");
  });

  it("fails when the file read back differs, or was only read through the fallback to cat", () => {
    expect(reasons(withStep("read_file", { text: "something else" }))).toContain("read_file");
    expect(reasons(withStep("read_file", { http: [404, 200] }))).toContain("read_file");
    expect(reasons(withStep("write_file", { status: 501, http: [501], text: "Conway API error: ... -> 501: {}" }))).toContain("write_file");
  });

  it("names a 402 on create as credits and judges no later step", () => {
    const r = { name: "w", id: null, content: "c", steps: [{ step: "create_sandbox", tool: "create_sandbox", status: 402, http: [402], text: "Conway API error: POST /v1/sandboxes -> 402: {}", error: true }] };
    const v = judgeSandboxWalk(r);
    expect(v.ok).toBe(false);
    expect(v.reasons).toHaveLength(1);
    expect(v.reasons[0]).toMatch(/^credits/);
  });

  it("fails a walk that stopped early or has no result", () => {
    const r = good();
    r.steps = r.steps.filter((s: any) => s.step !== "list_after_delete");
    expect(reasons(r)).toContain("list_after_delete: missing");
    expect(judgeSandboxWalk(null).ok).toBe(false);
    expect(reasons(withStep("create_sandbox", { status: 501, http: [501] }))).toContain("create_sandbox: status 501");
  });
});

describe("the domain of the rebuilt sandboxd", () => {
  const stops: Array<() => Promise<void>> = [];
  const dirs: string[] = [];
  afterEach(async () => {
    for (const s of stops.splice(0)) await s();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("is a documentation domain, the one the walk expects, and the one sandboxd builds public URLs under", async () => {
    expect(HARNESS_DOMAIN).toBe("sbx.example");
    expect(WALK_DOMAIN).toBe(HARNESS_DOMAIN);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "walk-domain-"));
    dirs.push(root);
    const key = loadOrCreateClientKey(root);
    const s = await startHarnessSandboxd({ host: "127.0.0.1", port: 0, keysDir: root, mntDir: path.join(root, "mnt"), disksDir: path.join(root, "disks"), log: () => {} });
    stops.push(s.close);
    const c = createSandboxdClient({ baseUrl: s.url, privateKey: key.privateKey, timeoutMs: 15_000 });
    const id = String((await c.request("POST", "/v1/sandboxes", { owner: "o-walk", memory_mb: 512 })).body.id);
    const exposed = await c.request("POST", `/v1/sandboxes/${id}/ports/expose`, { port: WALK_PORT });
    expect(exposed).toEqual({ status: 200, body: { port: WALK_PORT, public_url: `https://sbx-${id}-${WALK_PORT}.sbx.example` } });
    expect((await c.request("DELETE", `/v1/sandboxes/${id}/ports/${WALK_PORT}`)).status).toBe(200);
    expect((await c.request("DELETE", `/v1/sandboxes/${id}`)).status).toBe(200);
  });
});

describe("parseSandboxResult", () => {
  it("takes the last SANDBOX_RESULT line and ignores everything else", () => {
    const text = `noise\nSANDBOX_RESULT {"id":"one"}\nSANDBOX_RESULT ${JSON.stringify(good())}\nSANDBOX_VERDICT ok\n`;
    expect(parseSandboxResult(text)?.id).toBe(ID);
    expect(parseSandboxResult("SANDBOX_VERDICT ok")).toBeNull();
    expect(parseSandboxResult("SANDBOX_RESULT {broken")).toBeNull();
  });
});
