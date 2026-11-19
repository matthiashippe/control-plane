import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureWallet, openDb } from "../src/db.js";

/*
 * ops/konto-live.sh (goals/konto/15, point 1), offline. A stand-in `ssh` and `docker` sit first in PATH inside a folder
 * from mkdtemp: `ssh` runs the remote command right here with the script on stdin, and `docker compose ... exec -T cp
 * <cmd>` runs <cmd> with the local node in a rebuilt app folder (the working directory of the container), which holds
 * `dist/konto/config.js` with a token of this test and a link to the repo's node_modules for better-sqlite3. The database
 * is built with the real schema (openDb), the chain is a JSON-RPC stub on 127.0.0.1 with port 0. No real server, no
 * fixed port.
 */

const SCRIPT = join(__dirname, "..", "ops", "konto-live.sh");
const NODE_MODULES = join(__dirname, "..", "node_modules");
const dirs: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

/** A random address, so finding it in the output can only mean the script leaked it. */
const address = () => `0x${randomBytes(20).toString("hex")}`;
/** Atomic USDC (6 decimals) as the 32-byte word balanceOf returns, built from a number, never typed as hex. */
const word = (atomic: bigint) => `0x${atomic.toString(16).padStart(64, "0")}`;

type Chain = { token: string; balances: Map<string, bigint>; fail: boolean; seen: { to: string; owner: string }[] };

/** JSON-RPC stub: answers eth_call balanceOf(owner) on `token` from `balances`, or an error for every call when `fail`. */
async function startChain(chain: Chain): Promise<string> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      const call = body.params?.[0] ?? {};
      const owner = `0x${String(call.data ?? "").slice(-40)}`;
      chain.seen.push({ to: String(call.to).toLowerCase(), owner });
      res.setHeader("content-type", "application/json");
      if (chain.fail || body.method !== "eth_call") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "header not found" } }));
        return;
      }
      const balance = String(call.to).toLowerCase() === chain.token ? (chain.balances.get(owner) ?? 0n) : 0n;
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: word(balance) }));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/${randomBytes(6).toString("hex")}`;
}

type Account = { chainId: number; usdc: bigint };
type Setup = { accounts: Account[]; rpcFails?: boolean; sshFails?: boolean };

/** Runs the script asynchronously, because the RPC stub lives in this same process and must keep answering. */
function exec(cwd: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("bash", [SCRIPT], { cwd, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, out: stdout + stderr });
    });
  });
}

async function run({ accounts, rpcFails = false, sshFails = false }: Setup) {
  const dir = mkdtempSync(join(tmpdir(), "cp-konto-live-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  const app = join(dir, "app");
  mkdirSync(bin);
  mkdirSync(join(app, "dist", "konto"), { recursive: true });
  symlinkSync(NODE_MODULES, join(app, "node_modules"), "dir");

  const token = address();
  writeFileSync(join(app, "dist", "konto", "config.js"), `export const MAINNET_USDC = ${JSON.stringify(token)};\n`);

  const dbPath = join(dir, "cp.db");
  const db = openDb(dbPath);
  const addresses: string[] = [];
  const balances = new Map<string, bigint>();
  const insert = db.prepare(
    "INSERT INTO konto_accounts (address, chain_id, permission, signature, created_at) VALUES (?, ?, '{}', '0x', ?)",
  );
  for (const a of accounts) {
    const addr = address();
    ensureWallet(db, addr);
    insert.run(addr, a.chainId, new Date().toISOString());
    addresses.push(addr);
    balances.set(addr, a.usdc);
  }
  db.close();

  const chain: Chain = { token, balances, fail: rpcFails, seen: [] };
  const rpc = await startChain(chain);

  writeFileSync(
    join(bin, "ssh"),
    sshFails
      ? "#!/usr/bin/env bash\nexit 255\n"
      : // The last argument is the remote command; stdin (the script) is passed on unchanged.
        '#!/usr/bin/env bash\ncmd="${@: -1}"\nexec bash -c "$cmd"\n',
  );
  // `docker compose -f <file> exec -T cp <cmd...>`: everything after `cp` runs in the app folder, like WORKDIR /app. `node`
  // is the node running this test, because PATH below holds only the system folders and CI installs node elsewhere.
  writeFileSync(
    join(bin, "docker"),
    [
      "#!/usr/bin/env bash",
      'while [ "$#" -gt 0 ] && [ "$1" != cp ]; do shift; done',
      "shift",
      `cd ${JSON.stringify(app)}`,
      `if [ "$1" = node ]; then shift; exec ${JSON.stringify(process.execPath)} "$@"; fi`,
      'exec "$@"',
      "",
    ].join("\n"),
  );
  chmodSync(join(bin, "ssh"), 0o755);
  chmodSync(join(bin, "docker"), 0o755);

  const r = await exec(dir, {
    PATH: `${bin}:/usr/bin:/bin`,
    HOME: dir,
    CP_DEPLOY_HOST: "test@host.invalid",
    CP_DEPLOY_KEY: join(dir, "no-such-key"),
    // What `docker compose exec` hands node in the container: the service's own environment.
    CP_DB_PATH: dbPath,
    CP_KONTO_RPC_URL: rpc,
  });
  return { ...r, addresses, rpc, token, chain, dir };
}

/** 12.345678 and 10 USDC on Base, 5 USDC on Base Sepolia that must not count. */
const THREE: Account[] = [
  { chainId: 8453, usdc: 12_345_678n },
  { chainId: 8453, usdc: 10_000_000n },
  { chainId: 84532, usdc: 5_000_000n },
];

describe("ops/konto-live.sh", () => {
  it("counts the accounts on Base and sums their USDC rounded down to the cent, exit 0", async () => {
    const r = await run({ accounts: THREE });
    expect(r.code, r.out).toBe(0);
    expect(r.stdout).toBe("accounts 2\nbalance_usd 22.34\n");
    // Only the two accounts of chain 8453 were asked, and on the token of the service's own build.
    expect(r.chain.seen.map((s) => s.owner).sort()).toEqual(r.addresses.slice(0, 2).sort());
    expect(new Set(r.chain.seen.map((s) => s.to))).toEqual(new Set([r.token]));
  });

  it("never prints an address of the database, the token or the URL of the RPC, in no case", async () => {
    const cases: Setup[] = [{ accounts: THREE }, { accounts: THREE, rpcFails: true }, { accounts: [] }];
    for (const c of cases) {
      const r = await run(c);
      expect(r.out.length, "the script said something, so the check below has text to look at").toBeGreaterThan(10);
      for (const secret of [...r.addresses, r.token, r.rpc, new URL(r.rpc).host, r.dir]) {
        expect(r.out.toLowerCase()).not.toContain(secret.toLowerCase());
      }
      expect(r.out).not.toMatch(/0x[0-9a-f]{40}/i);
      for (const line of r.out.trim().split("\n")) {
        expect(line).toMatch(/^(accounts [0-9]+|balance_usd ([0-9]+\.[0-9]{2}|unknown))$/);
      }
    }
    const none = await run({ accounts: [] });
    expect(none.code, none.out).toBe(0);
    expect(none.stdout).toBe("accounts 0\nbalance_usd 0.00\n");
  });

  it("says balance_usd unknown and exits 1 when the RPC fails", async () => {
    const r = await run({ accounts: THREE, rpcFails: true });
    expect(r.code, r.out).toBe(1);
    expect(r.stdout).toBe("accounts 2\nbalance_usd unknown\n");
    expect(r.chain.seen.length).toBeGreaterThan(0);
  });

  it("says ssh failed and exits 2 when the server cannot be asked", async () => {
    const r = await run({ accounts: THREE, sshFails: true });
    expect(r.code).toBe(2);
    expect(r.out.trim()).toBe("ssh failed");
  });
});
