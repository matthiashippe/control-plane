import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// goals/sandbox/11: `ops/sandbox/cloudflare.py psl-txt <url>` writes exactly the TXT record _psl.<ports domain> that the
// Public Suffix List checks, in the zone of exposed ports, with the ports token. The script runs against a fake Cloudflare API
// on 127.0.0.1 with an ephemeral port (CLOUDFLARE_API_BASE), and HOME points at an empty temp dir, so the real
// ~/brain/connectors/secrets.env is never read and the real API is never called.

const SCRIPT = join(__dirname, "..", "ops", "sandbox", "cloudflare.py");
const PORTS_ZONE = "sandboxhost.de";
const PAYMENT_ZONE = "postyourprice.com";
const PSL_NAME = "_psl.sandboxhost.de";
const PORTS_TOKEN = "test-ports-token";
const PAYMENT_TOKEN = "test-payment-token";
const PR_URL = "https://github.com/publicsuffix/list/pull/2999";

type DnsRecord = { id: string; type: string; name: string; content: string; proxied?: boolean; ttl: number };
type Seen = { method: string; url: string; auth: string; body: unknown };

const WILDCARD: DnsRecord = { id: "rec-wild", type: "A", name: `*.${PORTS_ZONE}`, content: "192.0.2.10", proxied: true, ttl: 1 };

let server: Server;
let base = "";
let home = "";
let seen: Seen[] = [];
let portsRecords: DnsRecord[] = [];
let paymentRecords: DnsRecord[] = [];
let nextId = 1;

function send(res: ServerResponse, status: number, result: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ success: status < 400, errors: status < 400 ? [] : [{ code: status, message: "fake" }], result }));
}

function handle(req: IncomingMessage, raw: string, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://fake");
  const body = raw ? JSON.parse(raw) : null;
  seen.push({ method: req.method ?? "", url: req.url ?? "", auth: String(req.headers.authorization ?? ""), body });
  const path = url.pathname.replace(/^\/client\/v4/, "");
  if (req.method === "GET" && path === "/zones") {
    const name = url.searchParams.get("name");
    if (name === PORTS_ZONE) return send(res, 200, [{ id: "zone-ports", name }]);
    if (name === PAYMENT_ZONE) return send(res, 200, [{ id: "zone-pay", name }]);
    return send(res, 200, []);
  }
  const m = path.match(/^\/zones\/(zone-ports|zone-pay)\/dns_records(?:\/([^/]+))?$/);
  if (!m) return send(res, 404, null);
  const list = m[1] === "zone-ports" ? portsRecords : paymentRecords;
  if (req.method === "GET" && !m[2]) {
    const type = url.searchParams.get("type");
    const name = url.searchParams.get("name");
    return send(res, 200, list.filter((r) => (!type || r.type === type) && (!name || r.name === name)));
  }
  if (req.method === "POST" && !m[2]) {
    const rec = { id: `rec-${nextId++}`, ttl: 1, ...body } as DnsRecord;
    list.push(rec);
    return send(res, 200, rec);
  }
  const i = list.findIndex((r) => r.id === m[2]);
  if (i < 0) return send(res, 404, null);
  if (req.method === "PATCH") {
    list[i] = { ...list[i], ...body };
    return send(res, 200, list[i]);
  }
  if (req.method === "DELETE") {
    list.splice(i, 1);
    return send(res, 200, { id: m[2] });
  }
  return send(res, 405, null);
}

function run(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "python3",
      [SCRIPT, ...args],
      {
        timeout: 30_000,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: home,
          NO_PROXY: "127.0.0.1,localhost",
          no_proxy: "127.0.0.1,localhost",
          CLOUDFLARE_API_BASE: base,
          CLOUDFLARE_SBX_API_TOKEN: PORTS_TOKEN,
          CLOUDFLARE_HTC_API_TOKEN: PAYMENT_TOKEN,
        },
      },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

const unquote = (s: string) => s.replace(/^"(.*)"$/, "$1");
const writes = () => seen.filter((s) => s.method !== "GET");

function expectOnlyPortsZone() {
  expect(seen.every((s) => s.auth === `Bearer ${PORTS_TOKEN}`)).toBe(true);
  expect(seen.some((s) => s.url.includes(PAYMENT_ZONE) || s.url.includes("zone-pay"))).toBe(false);
  expect(seen.some((s) => s.method === "DELETE")).toBe(false);
  expect(paymentRecords).toEqual([{ id: "pay-apex", type: "A", name: PAYMENT_ZONE, content: "198.51.100.1", proxied: true, ttl: 1 }]);
  expect(portsRecords.find((r) => r.name === WILDCARD.name)).toEqual(WILDCARD);
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "cf-psl-home-"));
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => handle(req, raw, res));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/client/v4`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  seen = [];
  nextId = 1;
  portsRecords = [{ ...WILDCARD }];
  paymentRecords = [{ id: "pay-apex", type: "A", name: PAYMENT_ZONE, content: "198.51.100.1", proxied: true, ttl: 1 }];
});

describe("cloudflare.py psl-txt", () => {
  it("creates exactly one TXT record _psl.sandboxhost.de with the pull request URL when none exists", async () => {
    const r = await run("psl-txt", PR_URL);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n").at(-1)).toBe("PSL TXT OK");
    const w = writes();
    expect(w.map((s) => s.method)).toEqual(["POST"]);
    const body = w[0].body as DnsRecord;
    expect(body.type).toBe("TXT");
    expect(body.name).toBe(PSL_NAME);
    expect(unquote(body.content)).toBe(PR_URL);
    expect(portsRecords.filter((x) => x.name === PSL_NAME)).toHaveLength(1);
    expectOnlyPortsZone();
  });

  it("writes nothing when the same record is already there", async () => {
    portsRecords.push({ id: "rec-psl", type: "TXT", name: PSL_NAME, content: `"${PR_URL}"`, ttl: 1 });
    const r = await run("psl-txt", PR_URL);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n").at(-1)).toBe("PSL TXT OK");
    expect(writes()).toEqual([]);
    expect(seen.some((s) => s.method === "POST" || s.method === "PATCH")).toBe(false);
    expectOnlyPortsZone();
  });

  it("treats an unquoted stored value as the same record", async () => {
    portsRecords.push({ id: "rec-psl", type: "TXT", name: PSL_NAME, content: PR_URL, ttl: 1 });
    const r = await run("psl-txt", PR_URL);
    expect(r.code, r.stderr).toBe(0);
    expect(writes()).toEqual([]);
    expectOnlyPortsZone();
  });

  it("patches only that one record when it holds another pull request", async () => {
    portsRecords.push({ id: "rec-psl", type: "TXT", name: PSL_NAME, content: '"https://github.com/publicsuffix/list/pull/1"', ttl: 1 });
    portsRecords.push({ id: "rec-other", type: "TXT", name: PORTS_ZONE, content: '"v=spf1 -all"', ttl: 1 });
    const r = await run("psl-txt", PR_URL);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n").at(-1)).toBe("PSL TXT OK");
    const w = writes();
    expect(w.map((s) => s.method)).toEqual(["PATCH"]);
    expect(w[0].url).toMatch(/\/dns_records\/rec-psl$/);
    expect(unquote((w[0].body as DnsRecord).content)).toBe(PR_URL);
    expect(portsRecords.find((x) => x.id === "rec-other")).toEqual({
      id: "rec-other", type: "TXT", name: PORTS_ZONE, content: '"v=spf1 -all"', ttl: 1,
    });
    expect(portsRecords.filter((x) => x.name === PSL_NAME)).toHaveLength(1);
    expectOnlyPortsZone();
  });

  it("refuses two TXT records under the name and changes neither", async () => {
    portsRecords.push({ id: "rec-a", type: "TXT", name: PSL_NAME, content: '"a"', ttl: 1 });
    portsRecords.push({ id: "rec-b", type: "TXT", name: PSL_NAME, content: '"b"', ttl: 1 });
    const r = await run("psl-txt", PR_URL);
    expect(r.code).not.toBe(0);
    expect(r.stdout).not.toContain("PSL TXT OK");
    expect(writes()).toEqual([]);
    expectOnlyPortsZone();
  });

  for (const bad of [
    "https://github.com/someone/list/pull/2999",
    "https://github.com/publicsuffix/list/pull/",
    "https://github.com/publicsuffix/list/pull/0",
    "https://github.com/publicsuffix/list/pull/2999/files",
    "http://github.com/publicsuffix/list/pull/2999",
    "https://github.com/publicsuffix/list/issues/2999",
    `${PR_URL}\n`,
    `${PR_URL}"`,
  ]) {
    it(`refuses ${JSON.stringify(bad)} without calling the API`, async () => {
      const r = await run("psl-txt", bad);
      expect(r.code).not.toBe(0);
      expect(r.stdout).not.toContain("PSL TXT OK");
      expect(seen).toEqual([]);
      expect(portsRecords).toEqual([WILDCARD]);
    });
  }
});
