import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * ops/konto-ready.sh (goals/konto/14, point 3), offline. A stand-in `ssh` and `docker` sit first in PATH inside a
 * folder from mkdtemp: `ssh` runs the remote command right here with the script on stdin, and `docker ... test -r
 * <path>` tests that path here. CP_READY_ENV_FILE points the script at a rebuilt .env in the same folder. No network,
 * no port, no real server.
 */

const SCRIPT = join(__dirname, "..", "ops", "konto-ready.sh");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A value nobody else would print, so finding it in the output can only mean the script leaked it. */
const unique = (label: string) => `${label}-${randomBytes(8).toString("hex")}`;

type Setup = { env: Record<string, string | null>; keyReadable?: boolean; sshFails?: boolean };

function run({ env, keyReadable = true, sshFails = false }: Setup) {
  const dir = mkdtempSync(join(tmpdir(), "cp-konto-ready-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  spawnSync("mkdir", ["-p", bin]);
  writeFileSync(
    join(bin, "ssh"),
    sshFails
      ? "#!/usr/bin/env bash\nexit 255\n"
      : // The last argument is the remote command; stdin (the script) is passed on unchanged.
        '#!/usr/bin/env bash\ncmd="${@: -1}"\nexec bash -c "$cmd"\n',
  );
  writeFileSync(join(bin, "docker"), '#!/usr/bin/env bash\ntest -r "${@: -1}"\n');
  chmodSync(join(bin, "ssh"), 0o755);
  chmodSync(join(bin, "docker"), 0o755);

  // An unreadable key is one the container cannot see: the file is not there. That holds for root as well.
  const keyFile = join(dir, unique("gas-key"));
  if (keyReadable) writeFileSync(keyFile, "not a key\n", { mode: 0o600 });

  const lines: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value === null) continue;
    lines.push(`${name}=${value === "@keyfile" ? keyFile : value}`);
  }
  const envFile = join(dir, "env");
  writeFileSync(envFile, lines.join("\n") + "\n", { mode: 0o600 });

  const r = spawnSync("bash", [SCRIPT], {
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: dir,
      CP_DEPLOY_HOST: "test@host.invalid",
      CP_DEPLOY_KEY: join(dir, "no-such-key"),
      CP_READY_ENV_FILE: envFile,
    },
    encoding: "utf8",
    timeout: 20_000,
  });
  const out = `${r.stdout}${r.stderr}`;
  const status = (name: string) => r.stdout.split("\n").find((l) => l.startsWith(`${name} `))?.slice(name.length + 1);
  return { code: r.status, out, status, keyFile, dir };
}

const PROXY = unique("proxy");
const RPC = `https://${unique("rpc")}.test`;
const BRIDGE_URL = `https://${unique("bridge")}.test`;
const BRIDGE_KEY = `/data/${unique("bridge-key")}`;

/** Everything point 4 of docs/konto/euro.md asks for, with values that appear nowhere else. */
function full(): Record<string, string | null> {
  return {
    CP_KONTO_CHAIN_ID: "8453",
    CP_KONTO_MAINNET: "1",
    CP_KONTO_RPC_URL: RPC,
    CP_KONTO_KEY_FILE: "@keyfile",
    CP_KONTO_AUTH_PROXY_ID: PROXY,
    CP_BRIDGE_URL: BRIDGE_URL,
    CP_BRIDGE_KEY_FILE: BRIDGE_KEY,
  };
}

const REQUIRED = ["CP_KONTO_CHAIN_ID", "CP_KONTO_MAINNET", "CP_KONTO_KEY_FILE", "CP_KONTO_AUTH_PROXY_ID"];

describe("ops/konto-ready.sh", () => {
  it("says set for every name and key_file readable, and exits 0, when everything is in place", () => {
    const r = run({ env: full() });
    expect(r.code, r.out).toBe(0);
    for (const name of [...REQUIRED, "CP_KONTO_RPC_URL", "CP_BRIDGE_URL", "CP_BRIDGE_KEY_FILE"]) {
      expect(r.status(name), name).toBe("set");
    }
    expect(r.status("key_file")).toBe("readable");
  });

  it("says missing and exits 1 for a required name that is absent or empty", () => {
    const absent = run({ env: { ...full(), CP_KONTO_AUTH_PROXY_ID: null } });
    expect(absent.code, absent.out).toBe(1);
    expect(absent.status("CP_KONTO_AUTH_PROXY_ID")).toBe("missing");
    expect(absent.status("CP_KONTO_CHAIN_ID")).toBe("set");

    const empty = run({ env: { ...full(), CP_KONTO_MAINNET: "" } });
    expect(empty.code, empty.out).toBe(1);
    expect(empty.status("CP_KONTO_MAINNET")).toBe("missing");

    const noKey = run({ env: { ...full(), CP_KONTO_KEY_FILE: null } });
    expect(noKey.code, noKey.out).toBe(1);
    expect(noKey.status("CP_KONTO_KEY_FILE")).toBe("missing");
    expect(noKey.status("key_file")).toBe("unreadable");
  });

  it("says wrong and exits 1 for CP_KONTO_CHAIN_ID=84532 (Base Sepolia) and for CP_KONTO_MAINNET other than 1", () => {
    const sepolia = run({ env: { ...full(), CP_KONTO_CHAIN_ID: "84532" } });
    expect(sepolia.code, sepolia.out).toBe(1);
    expect(sepolia.status("CP_KONTO_CHAIN_ID")).toBe("wrong");
    expect(sepolia.status("CP_KONTO_MAINNET")).toBe("set");

    const off = run({ env: { ...full(), CP_KONTO_MAINNET: "0" } });
    expect(off.code, off.out).toBe(1);
    expect(off.status("CP_KONTO_MAINNET")).toBe("wrong");
  });

  it("says empty for absent CP_BRIDGE_* and default for an absent RPC URL, without changing the exit", () => {
    const r = run({ env: { ...full(), CP_BRIDGE_URL: null, CP_BRIDGE_KEY_FILE: "", CP_KONTO_RPC_URL: null } });
    expect(r.code, r.out).toBe(0);
    expect(r.status("CP_BRIDGE_URL")).toBe("empty");
    expect(r.status("CP_BRIDGE_KEY_FILE")).toBe("empty");
    expect(r.status("CP_KONTO_RPC_URL")).toBe("default");
  });

  it("says key_file unreadable and exits 1 when the container cannot read the gas key", () => {
    const r = run({ env: full(), keyReadable: false });
    expect(r.code, r.out).toBe(1);
    expect(r.status("CP_KONTO_KEY_FILE")).toBe("set");
    expect(r.status("key_file")).toBe("unreadable");
  });

  it("never prints a value of the .env, in no case, not even a quoted one", () => {
    const cases: Setup[] = [
      { env: full() },
      { env: { ...full(), CP_KONTO_CHAIN_ID: "84532" } },
      { env: { ...full(), CP_KONTO_AUTH_PROXY_ID: `"${PROXY}"` } },
      { env: full(), keyReadable: false },
    ];
    for (const c of cases) {
      const r = run(c);
      expect(r.out.length, "the script said something, so the check below has text to look at").toBeGreaterThan(20);
      for (const secret of [PROXY, RPC, BRIDGE_URL, BRIDGE_KEY, r.keyFile, r.dir, "84532"]) {
        expect(r.out).not.toContain(secret);
      }
      for (const line of r.out.trim().split("\n")) {
        expect(line).toMatch(/^(CP_[A-Z_]+ (set|missing|wrong|default|empty)|key_file (readable|unreadable)|env_file unreadable)$/);
      }
    }
  });

  it("says ssh failed and exits 2 when the server cannot be asked", () => {
    const r = run({ env: full(), sshFails: true });
    expect(r.code).toBe(2);
    expect(r.out.trim()).toBe("ssh failed");
  });
});
