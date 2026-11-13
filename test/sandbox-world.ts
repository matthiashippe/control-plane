/**
 * A rebuilt sandboxd for the sandbox tests: the real `createSandboxd` from ops/sandbox/sandboxd.mjs,
 * with a fake `run` instead of Docker, on 127.0.0.1 port 0. The control plane talks to it through
 * the real signed client (src/sandbox/client.ts) and the real service (src/sandbox/service.ts), with
 * one settable clock for all three, so a test can move time and see what is billed.
 */
import crypto, { type KeyObject } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { openDb, postLedger, type Db } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { createSandboxdClient } from "../src/sandbox/client.js";
import { createSandboxService } from "../src/sandbox/service.js";
import { createSandboxd, memoryState } from "../ops/sandbox/sandboxd.mjs";

export const T0 = 1762992000 * 1000;
export const MINUTE = 60_000;
export const STEP = 6 * MINUTE;
/** The statuses the runtime's HTTP client retries and counts for its circuit breaker (`src/types.ts:613` at d8f8168). */
export const RETRIED = [429, 500, 502, 503, 504];

type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };
export type Call = { cmd: string; args: string[]; input?: string };

export interface WorldOptions {
  db?: Db;
  /** Host slots of sandboxd. */
  slots?: number;
  /** Override one docker command; return undefined for the default behaviour. */
  respond?: (cmd: string, args: string[], input?: string) => Partial<RunResult> | Promise<Partial<RunResult>> | undefined;
  /** Start the clock here instead of T0. */
  t0?: number;
}

const servers: http.Server[] = [];

export async function closeWorlds(): Promise<void> {
  for (const s of servers.splice(0)) {
    s.closeAllConnections?.();
    await new Promise((r) => s.close(() => r(undefined)));
  }
}

export async function listen(handler: http.RequestListener): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

export async function sandboxWorld(opts: WorldOptions = {}) {
  const clock = { t: opts.t0 ?? T0 };
  const calls: Call[] = [];
  const files = new Map<string, string>();
  const cp = crypto.generateKeyPairSync("ed25519");
  const keys: { list: KeyObject[] } = { list: [cp.publicKey] };
  const run = async (cmd: string, args: string[], o: { input?: string } = {}) => {
    calls.push({ cmd, args, input: o.input });
    const r = (await opts.respond?.(cmd, args, o.input)) ?? undefined;
    if (r) return { code: 0, stdout: "", stderr: "", timedOut: false, ...r };
    if (cmd === "docker" && args[0] === "exec") {
      // upload: docker exec -i <name> sh -c '...cat > "$1"' sh <path>
      if (args[1] === "-i") {
        files.set(`${args[2]}:${args[args.length - 1]}`, o.input ?? "");
        return { code: 0, stdout: "", stderr: "", timedOut: false };
      }
      // read: docker exec <name> cat -- <path>
      if (args[2] === "cat") {
        const k = `${args[1]}:${args[4]}`;
        return files.has(k)
          ? { code: 0, stdout: files.get(k)!, stderr: "", timedOut: false }
          : { code: 1, stdout: "", stderr: "No such file", timedOut: false };
      }
      // exec: docker exec <name> bash -lc <command>; `echo X` prints X. A command in the background
      // (backgroundCommand in src/sandbox/service.ts) prints what its inner `bash -c '<command>'` prints.
      const sent = args[args.length - 1];
      const inner = / bash -c '((?:[^']|'\\'')*)' >/.exec(sent);
      const command = inner ? inner[1].replace(/'\\''/g, "'") : sent;
      const m = /echo ([^;&|]*)$/.exec(command);
      return { code: 0, stdout: m ? `${m[1].trim()}\n` : "", stderr: "", timedOut: false };
    }
    return { code: 0, stdout: "", stderr: "", timedOut: false };
  };
  const d = createSandboxd({
    run,
    now: () => clock.t,
    keys: () => keys.list,
    state: memoryState(),
    config: { slots: opts.slots ?? 10, disksDir: "/d", mntDir: "/m", image: "sandboxd-base:1", domain: "postyourprice.com" },
    log: () => {},
  });
  const hits: string[] = [];
  const { server, url } = await listen((req, res) => {
    hits.push(`${req.method} ${String(req.url).split("?")[0]}`);
    return d.handleApi(req, res);
  });
  const db = opts.db ?? openDb(":memory:");
  const lines: string[] = [];
  const client = createSandboxdClient({ baseUrl: url, privateKey: cp.privateKey, now: () => clock.t, timeoutMs: 5000 });
  const service = createSandboxService({ db, client, now: () => clock.t, log: (l) => lines.push(l) });
  const app = createApp({ db, sandbox: service, rateLimit: null });

  let n = 0;
  function account(balanceMc = 100_000) {
    n += 1;
    const address = `0x${n.toString(16).padStart(2, "0").repeat(20)}`;
    const key = `cnwy_k_${crypto.randomBytes(16).toString("hex")}`;
    db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date(clock.t).toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address,
      hashApiKey(key),
      key.slice(0, 15),
      "conway-automaton",
      new Date(clock.t).toISOString(),
    );
    if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: `seed-${n}` });
    // The runtime sends the key raw, without "Bearer" (`src/conway/client.ts:59` at the pin).
    const call = async (method: string, target: string, body?: unknown, headers: Record<string, string> = {}) => {
      const res = await app.request(target, {
        method,
        headers: { "Content-Type": "application/json", Authorization: key, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json: any = text;
      try {
        json = JSON.parse(text);
      } catch {
        /* text */
      }
      return { status: res.status, json, type: res.headers.get("content-type") ?? "" };
    };
    return { address, key, call };
  }

  const balance = (address: string) =>
    (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
  const sandboxRows = (address?: string) =>
    db
      .prepare(`SELECT ref, delta_mc FROM ledger WHERE kind = 'sandbox' ${address ? "AND address = ?" : ""} ORDER BY id`)
      .all(...(address ? [address] : [])) as { ref: string; delta_mc: number }[];
  const row = (id: string) => db.prepare("SELECT * FROM sandboxes WHERE id = ?").get(id) as Record<string, any> | undefined;
  const execs = () => calls.filter((c) => c.cmd === "docker" && c.args[0] === "exec" && c.args.includes("-lc"));
  const topup = (address: string, mc: number) => postLedger(db, { address, kind: "topup", deltaMc: mc, ref: `topup-${crypto.randomUUID()}` });

  return { clock, calls, files, d, url, server, hits, keys, cp, db, client, service, app, lines, account, balance, sandboxRows, row, execs, topup };
}
