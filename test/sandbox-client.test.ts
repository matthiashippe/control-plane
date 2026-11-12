/**
 * The control plane's client for sandboxd, held against docs/sandbox/plan.md, section Verbindung.
 *
 * The plan fixes the signature byte for byte and prints a worked example; this test reads that
 * example from the plan instead of copying it, compares the client's message with `canonicalMessage`
 * of ops/sandbox/sandboxd.mjs, and lets sandboxd's own `createVerifier` and the real daemon accept
 * what the client sends, an encoded path with a query included. Then the key pair: made on the
 * first start with mode 0600, kept on the second.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLIENT_KEY_FILE,
  CLIENT_PUB_FILE,
  SandboxdUnavailable,
  bodyHash,
  clientMessage,
  createSandboxdClient,
  loadOrCreateClientKey,
  signHeaders,
} from "../src/sandbox/client.js";
import { canonicalMessage, createVerifier, privateKeyFromSeed, publicKeyFromRaw } from "../ops/sandbox/sandboxd.mjs";
import { T0, closeWorlds, listen, sandboxWorld } from "./sandbox-world.js";

const PLAN = path.join(__dirname, "..", "docs", "sandbox", "plan.md");
const dirs: string[] = [];

afterEach(async () => {
  await closeWorlds();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** The worked example in the first code block of `## Verbindung` of docs/sandbox/plan.md. */
function planExample(): Record<string, string> {
  const text = fs.readFileSync(PLAN, "utf8");
  const section = text.split(/^## /m).find((s) => s.startsWith("Verbindung"));
  if (!section) throw new Error("docs/sandbox/plan.md has no section ## Verbindung");
  const block = /```\n([\s\S]*?)```/.exec(section);
  if (!block) throw new Error("no example block in ## Verbindung");
  const out: Record<string, string> = {};
  for (const line of block[1].split("\n")) {
    const m = /^([a-z]+): (.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

describe("signature after docs/sandbox/plan.md, Verbindung", () => {
  it("gives the example signature of plan.md, read from the file", () => {
    const ex = planExample();
    for (const k of ["seed", "public", "method", "path", "timestamp", "body", "bodyhash", "signature"]) expect(ex, k).toHaveProperty(k);
    expect(bodyHash(ex.body)).toBe(ex.bodyhash);
    const key = privateKeyFromSeed(ex.seed);
    const h = signHeaders(key, ex.method, ex.path, Number(ex.timestamp), ex.body);
    expect(h).toEqual({ "X-CP-Timestamp": ex.timestamp, "X-CP-Signature": ex.signature });
    expect(clientMessage(ex.method, ex.path, ex.timestamp, ex.body)).toBe(canonicalMessage(ex.method, ex.path, ex.timestamp, ex.body));
    expect(crypto.verify(null, Buffer.from(clientMessage(ex.method, ex.path, ex.timestamp, ex.body)), publicKeyFromRaw(ex.public), Buffer.from(ex.signature, "base64"))).toBe(true);
  });

  it("builds the same message as canonicalMessage of sandboxd, for an encoded path with a query too", () => {
    const target = "/v1/sandboxes/abc/files/read?path=%2Froot%2Fa%20b";
    for (const [method, t, body] of [
      ["GET", target, undefined],
      ["get", target, ""],
      ["POST", "/v1/sandboxes/abc/exec", '{"command":"cd /root && echo ü"}'],
      ["DELETE", "/v1/sandboxes/abc", undefined],
    ] as const) {
      expect(clientMessage(method, t, 1762992000, body)).toBe(canonicalMessage(method, t, 1762992000, body));
    }
    expect(clientMessage("GET", target, 1, undefined).split("\n")).toEqual([
      "GET",
      target,
      "1",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ]);
  });

  it("is accepted by createVerifier of sandboxd for the encoded path with a query", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const verifier = createVerifier({ keys: [publicKey], now: () => T0 });
    const target = "/v1/sandboxes/abc/files/read?path=%2Froot%2Fa%20b";
    const headers = signHeaders(privateKey, "GET", target, T0 / 1000, undefined);
    const lower = { "x-cp-timestamp": headers["X-CP-Timestamp"], "x-cp-signature": headers["X-CP-Signature"] };
    expect(verifier.verify({ method: "GET", target, headers: lower, body: Buffer.alloc(0) })).toEqual({ ok: true });
    // The counter-check: the same signature over the decoded path is not accepted.
    const decoded = createVerifier({ keys: [publicKey], now: () => T0 });
    expect(decoded.verify({ method: "GET", target: "/v1/sandboxes/abc/files/read?path=/root/a b", headers: lower, body: Buffer.alloc(0) }).ok).toBe(false);
  });
});

describe("the client against sandboxd on the wire", () => {
  it("sends the encoded path it signed, and sandboxd accepts it", async () => {
    const w = await sandboxWorld();
    const seen: string[] = [];
    const handler = w.server.listeners("request")[0] as (req: any, res: any) => void;
    w.server.removeAllListeners("request");
    w.server.on("request", (req, res) => {
      seen.push(String(req.url));
      handler(req, res);
    });
    const res = await w.client.request("GET", `/v1/sandboxes/abcdefghij/files/read?path=${encodeURIComponent("/root/a b")}`);
    // 404 is sandboxd's answer for an unknown sandbox: the signature was accepted, a 401 would have thrown.
    expect(res.status).toBe(404);
    expect(seen[0]).toMatch(/^\/v1\/sandboxes\/abcdefghij\/files\/read\?path=%2Froot%2Fa%20b&cp_nonce=[0-9a-f]{16}$/);
  });

  it("gets two identical requests in the same second through, although Ed25519 signs them alike", async () => {
    const w = await sandboxWorld();
    const a = await w.client.request("GET", "/v1/sandboxes");
    const b = await w.client.request("GET", "/v1/sandboxes");
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it("throws SandboxdUnavailable on a refused key (401), on a 502 and when nobody answers", async () => {
    const w = await sandboxWorld();
    w.keys.list = [];
    await expect(w.client.request("GET", "/v1/sandboxes")).rejects.toBeInstanceOf(SandboxdUnavailable);
    const { url } = await listen((_req, res) => {
      res.writeHead(502);
      res.end("bad gateway");
    });
    const key = crypto.generateKeyPairSync("ed25519").privateKey;
    await expect(createSandboxdClient({ baseUrl: url, privateKey: key }).request("GET", "/v1/sandboxes")).rejects.toBeInstanceOf(SandboxdUnavailable);
    await expect(createSandboxdClient({ baseUrl: "http://127.0.0.1:9", privateKey: key, timeoutMs: 2000 }).request("GET", "/v1/sandboxes")).rejects.toBeInstanceOf(SandboxdUnavailable);
  });
});

describe("the key pair of the service", () => {
  it("is made on the first start with mode 0600 and kept on the second", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-key-"));
    dirs.push(dir);
    const first = loadOrCreateClientKey(dir);
    expect(first.created).toBe(true);
    const keyFile = path.join(dir, CLIENT_KEY_FILE);
    expect(fs.statSync(keyFile).mode & 0o777).toBe(0o600);
    const pem = fs.readFileSync(keyFile, "utf8");
    const pub = fs.readFileSync(path.join(dir, CLIENT_PUB_FILE), "utf8");
    expect(pub).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
    expect(crypto.createPublicKey(pub).asymmetricKeyType).toBe("ed25519");
    const second = loadOrCreateClientKey(dir);
    expect(second.created).toBe(false);
    expect(fs.readFileSync(keyFile, "utf8")).toBe(pem);
    expect(second.publicPem).toBe(pub);
    expect(fs.statSync(keyFile).mode & 0o777).toBe(0o600);
    // What the service signs with is what the public file says.
    const sig = crypto.sign(null, Buffer.from("x"), second.privateKey);
    expect(crypto.verify(null, Buffer.from("x"), crypto.createPublicKey(pub), sig)).toBe(true);
  });

  it("writes the public half again when it is missing, without a new private key", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-key-"));
    dirs.push(dir);
    const first = loadOrCreateClientKey(dir);
    fs.rmSync(path.join(dir, CLIENT_PUB_FILE));
    const second = loadOrCreateClientKey(dir);
    expect(second.created).toBe(false);
    expect(fs.readFileSync(path.join(dir, CLIENT_PUB_FILE), "utf8")).toBe(first.publicPem);
  });
});
