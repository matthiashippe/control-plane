/**
 * The proxy of sandboxd drops the attribute Domain from every Set-Cookie a sandbox service sends,
 * so a cookie only ever applies to the host name of its own sandbox and never travels to the
 * sandbox of another customer under the shared ports domain. Everything else passes unchanged.
 *
 * Runs against createSandboxd with a fake `run` and a fake service on 127.0.0.1, port 0.
 */
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createSandboxd, memoryState, signRequest, stripCookieDomain } from "../ops/sandbox/sandboxd.mjs";

const DOMAIN = "sandboxhost.de";
const DOMAIN_ATTR = /;\s*domain\s*(=|;|$)/i;
const servers: http.Server[] = [];

afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise((r) => s.close(() => r(undefined)));
});

async function listen(handler: http.RequestListener): Promise<number> {
  const s = http.createServer(handler);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  return (s.address() as AddressInfo).port;
}

type Reply = { status: number; headers: http.IncomingHttpHeaders; body: string };

async function setup(service: http.RequestListener) {
  const upstreamPort = await listen(service);
  const clock = { t: 1762992000 * 1000 };
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const run = async (_cmd: string, args: string[]) => ({
    code: 0,
    stdout: args[0] === "inspect" ? "127.0.0.1\n" : "",
    stderr: "",
    timedOut: false,
  });
  const d = createSandboxd({
    run,
    now: () => clock.t,
    keys: [publicKey],
    state: memoryState(),
    config: { slots: 10, disksDir: "/d", mntDir: "/m", image: "sandboxd-base:1", domain: DOMAIN },
    log: () => {},
  });
  const apiPort = await listen(d.handleApi);
  const proxyPort = await listen(d.handleProxy);

  async function call(method: string, target: string, payload: unknown) {
    const body = JSON.stringify(payload);
    const h = signRequest(privateKey, method, target, Math.floor(clock.t / 1000), body);
    const r = await fetch(`http://127.0.0.1:${apiPort}${target}`, { method, headers: { "content-type": "application/json", ...h }, body });
    clock.t += 1000;
    return { status: r.status, json: await r.json() };
  }

  const created = await call("POST", "/v1/sandboxes", { owner: "acct-a" });
  expect(created.status).toBe(201);
  const id = created.json.id as string;
  expect((await call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: upstreamPort })).status).toBe(200);
  const host = `sbx-${id}-${upstreamPort}.${DOMAIN}`;

  function get(target = "/"): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: proxyPort, method: "GET", path: target, headers: { host } }, (res) => {
        const parts: Buffer[] = [];
        res.on("data", (c) => parts.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(parts).toString("utf8") }));
      });
      req.on("error", reject);
      req.end();
    });
  }
  return { get };
}

function serviceWith(cookies: string[], status = 200, body = "") {
  return (_req: http.IncomingMessage, res: http.ServerResponse) => {
    res.writeHead(status, { "set-cookie": cookies, "x-up": "1", "content-type": "text/plain" });
    res.end(body);
  };
}

describe("set-cookie through the sandbox proxy", () => {
  it("drops Domain from every cookie and keeps name, value, other attributes, headers, status and body", async () => {
    const s = await setup(
      serviceWith(
        ["sbxa=1; Domain=sandboxhost.de; Path=/; HttpOnly; Max-Age=60", "sbxb=2; domain=.SANDBOXHOST.DE", "sbxc=3; Path=/; Secure"],
        201,
        "from sandbox",
      ),
    );
    const r = await s.get();
    expect(r.status).toBe(201);
    expect(r.body).toBe("from sandbox");
    expect(r.headers["x-up"]).toBe("1");
    expect(r.headers["content-type"]).toBe("text/plain");
    expect(r.headers["set-cookie"]).toEqual(["sbxa=1; Path=/; HttpOnly; Max-Age=60", "sbxb=2", "sbxc=3; Path=/; Secure"]);
    for (const c of r.headers["set-cookie"] ?? []) expect(c).not.toMatch(DOMAIN_ATTR);
  });

  it("drops a Domain in the middle with spaces around the equals sign", async () => {
    const s = await setup(serviceWith(["a=1;  Domain = sandboxhost.de ; Path=/"]));
    expect((await s.get()).headers["set-cookie"]).toEqual(["a=1; Path=/"]);
  });

  it("keeps a value that itself contains domain= byte for byte", async () => {
    const s = await setup(serviceWith(["v=domain=sandboxhost.de; Path=/"]));
    expect((await s.get()).headers["set-cookie"]).toEqual(["v=domain=sandboxhost.de; Path=/"]);
  });

  it("passes a reply without set-cookie unchanged", async () => {
    const s = await setup((_req, res) => {
      res.writeHead(200, { "x-up": "1" });
      res.end("plain");
    });
    const r = await s.get();
    expect(r.headers["set-cookie"]).toBeUndefined();
    expect(r.headers["x-up"]).toBe("1");
    expect(r.body).toBe("plain");
  });
});

describe("stripCookieDomain", () => {
  it("drops Domain at the end, without a value and for a foreign domain", () => {
    expect(stripCookieDomain("a=1; Path=/; Domain=sandboxhost.de")).toBe("a=1; Path=/");
    expect(stripCookieDomain("a=1; Domain; Secure")).toBe("a=1; Secure");
    expect(stripCookieDomain("a=1; DOMAIN=evil.example; SameSite=Lax")).toBe("a=1; SameSite=Lax");
    expect(stripCookieDomain("a=1;domain=sandboxhost.de;Path=/")).toBe("a=1;Path=/");
  });

  it("returns a value without Domain byte for byte", () => {
    for (const v of ["sbxc=3; Path=/; Secure", "a=1", "a=1;Path=/", "v=domain=sandboxhost.de; Path=/", "a=1; Max-Age=60;  HttpOnly", "a=1; DomainX=1"]) {
      expect(stripCookieDomain(v)).toBe(v);
    }
  });

  it("drops every Domain when a cookie carries more than one", () => {
    // The browser applies the last Domain attribute, so a filter that stops after the first one leaks the cookie.
    expect(stripCookieDomain("a=1; Domain=x.de; Domain=sandboxhost.de; Path=/")).toBe("a=1; Path=/");
  });

  it("never touches the first piece, even for a cookie named domain", () => {
    expect(stripCookieDomain("domain=1; Path=/")).toBe("domain=1; Path=/");
    expect(stripCookieDomain("Domain=sandboxhost.de")).toBe("Domain=sandboxhost.de");
  });
});
