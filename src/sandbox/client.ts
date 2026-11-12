/**
 * The control plane's side of the connection to `sandboxd` (docs/sandbox/plan.md, section Verbindung).
 *
 * Every request is signed with Ed25519 over four lines: method, request target as it goes on the wire
 * (path and `?query`, after encoding), the unix timestamp in seconds and the lowercase hex SHA-256 of
 * the raw body. The format is the one `canonicalMessage` in ops/sandbox/sandboxd.mjs checks, byte for
 * byte; test/sandbox-client.test.ts holds the two against each other and against the worked example
 * printed in the plan.
 *
 * The key pair is created by the service itself on its first start, next to the database
 * (`sandbox-client.key`, PKCS8 PEM, mode 0600, and `sandbox-client.pub`, SPKI PEM). The private half
 * never leaves the volume; the public half is read with `docker exec deploy-cp-1 cat
 * /data/sandbox-client.pub` and installed on the sandbox host by `ops/sandbox/setup.sh --client-key`.
 */

import crypto, { type KeyObject } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SANDBOXD_URL_DEFAULT = "https://ctl.sbx.postyourprice.com";
export const CLIENT_KEY_FILE = "sandbox-client.key";
export const CLIENT_PUB_FILE = "sandbox-client.pub";

/** Lowercase hex SHA-256 of the raw body bytes; no body hashes as the empty string. */
export function bodyHash(body?: string | Uint8Array | null): string {
  const bytes = body == null ? Buffer.alloc(0) : typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/** METHOD \n TARGET \n TIMESTAMP \n BODYHASH, TARGET being path and query exactly as sent. */
export function clientMessage(method: string, target: string, ts: number | string, body?: string | Uint8Array | null): string {
  return `${method.toUpperCase()}\n${target}\n${ts}\n${bodyHash(body)}`;
}

/** The two headers of one signed request. */
export function signHeaders(
  privateKey: KeyObject,
  method: string,
  target: string,
  ts: number,
  body?: string | Uint8Array | null,
): { "X-CP-Timestamp": string; "X-CP-Signature": string } {
  const sig = crypto.sign(null, Buffer.from(clientMessage(method, target, ts, body), "utf8"), privateKey);
  return { "X-CP-Timestamp": String(ts), "X-CP-Signature": sig.toString("base64") };
}

export interface ClientKey {
  privateKey: KeyObject;
  publicPem: string;
  /** True when this call created the key pair. */
  created: boolean;
}

/**
 * The key pair in `dir`, created on the first call. A second start finds the private key and keeps
 * it; the public file is rewritten only if it is missing or does not match. `wx` makes two processes
 * starting at once agree on one key instead of overwriting each other.
 */
export function loadOrCreateClientKey(dir: string): ClientKey {
  const keyPath = path.join(dir, CLIENT_KEY_FILE);
  const pubPath = path.join(dir, CLIENT_PUB_FILE);
  let created = false;
  if (!fs.existsSync(keyPath)) {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    try {
      fs.writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600, flag: "wx" });
      created = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  fs.chmodSync(keyPath, 0o600);
  const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath, "utf8"));
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error(`${keyPath} is not an Ed25519 key`);
  const publicPem = crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  let current: string | null = null;
  try {
    current = fs.readFileSync(pubPath, "utf8");
  } catch {
    current = null;
  }
  if (current !== publicPem) fs.writeFileSync(pubPath, publicPem, { mode: 0o644 });
  return { privateKey, publicPem, created };
}

/**
 * `sandboxd` cannot be used right now: no answer, no answer in time, the key is not accepted (401)
 * or it failed itself (5xx). The callers turn this into the 501 the runtime handles by starting a
 * local worker, never into a status the runtime retries.
 */
export class SandboxdUnavailable extends Error {
  constructor(readonly reason: string) {
    super(`sandboxd unavailable: ${reason}`);
    this.name = "SandboxdUnavailable";
  }
}

export interface SandboxdReply {
  status: number;
  body: Record<string, unknown>;
}

export interface SandboxdClient {
  request(
    method: string,
    target: string,
    body?: Record<string, unknown>,
    opts?: { timeoutMs?: number; idempotencyKey?: string },
  ): Promise<SandboxdReply>;
}

export interface SandboxdClientOptions {
  baseUrl: string;
  privateKey: KeyObject;
  fetchImpl?: typeof fetch;
  /** Clock in ms; the signature timestamp is its whole seconds. */
  now?: () => number;
  timeoutMs?: number;
}

/**
 * A signed client. Each request gets a random `cp_nonce` query parameter, because Ed25519 is
 * deterministic: two identical requests in the same second would carry the same signature, and
 * `sandboxd` refuses a signature it has seen in the last five minutes (goals/sandbox/ANNAHMEN.md,
 * Goal 03). `sandboxd` reads only the parameters it knows, so the extra one changes nothing else.
 */
export function createSandboxdClient(opts: SandboxdClientOptions): SandboxdClient {
  const base = new URL(opts.baseUrl);
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const defaultTimeout = opts.timeoutMs ?? 15_000;
  return {
    async request(method, target, body, ropts = {}) {
      const url = new URL(target, base);
      // As text: searchParams would re-encode the whole query (%20 becomes +) and change the path the
      // runtime encoded.
      url.search = `${url.search ? `${url.search}&` : "?"}cp_nonce=${crypto.randomBytes(8).toString("hex")}`;
      // What goes into the request line: the URL class has already normalised the encoding.
      const wireTarget = `${url.pathname}${url.search}`;
      const raw = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = {
        ...signHeaders(opts.privateKey, method, wireTarget, Math.floor(now() / 1000), raw),
        ...(raw !== undefined ? { "content-type": "application/json" } : {}),
        ...(ropts.idempotencyKey ? { "Idempotency-Key": ropts.idempotencyKey } : {}),
      };
      let res: Response;
      try {
        res = await doFetch(url, {
          method,
          headers,
          body: raw,
          signal: AbortSignal.timeout(ropts.timeoutMs ?? defaultTimeout),
        });
      } catch (e) {
        throw new SandboxdUnavailable(e instanceof Error ? e.name : "network");
      }
      const text = await res.text().catch(() => "");
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { text };
      if (res.status === 401) throw new SandboxdUnavailable("key not accepted (401)");
      // The one 5xx that is an answer and not a failure: the host has no free place (sandboxd
      // slotError). Everything else at 5xx, Caddy's 502 for a stopped sandboxd included, is down.
      const full = res.status === 503 && typeof obj.error === "string" && /^no free slots/.test(obj.error);
      if (res.status >= 500 && !full) throw new SandboxdUnavailable(`status ${res.status}`);
      return { status: res.status, body: obj };
    },
  };
}
