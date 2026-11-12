import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/fetchers.py keeps a cache of every address it classified. That cache is built from the production access log, so it holds
 * addresses of real visitors, and the repository is public. It used to sit next to the script and was committed with it.
 *
 * The cache now lives at CP_FETCHER_CACHE, by default ~/.cache/control-plane/fetcher-cache.tsv, outside any checkout. Every run here
 * happens on a copy of the script in a throwaway directory with HOME pointed at another throwaway directory, so "nothing is written
 * next to the script" is checked on a directory that starts empty.
 *
 * No network: the planted rows are answered from the cache, and the one address that is not cached is 127.0.0.1, which the resolver
 * answers from /etc/hosts. That address is what forces a write.
 */
const SCRIPT = join(__dirname, "..", "ops", "fetchers.py");
const DOC_ADDRESS = "192.0.2.10";
const NOT_CACHED = "127.0.0.1";

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "fetcher-cache-"));
  const opsDir = join(root, "ops");
  const home = join(root, "home");
  mkdirSync(opsDir);
  mkdirSync(home);
  copyFileSync(SCRIPT, join(opsDir, "fetchers.py"));
  return { root, opsDir, home, script: join(opsDir, "fetchers.py") };
}

function run(script: string, env: Record<string, string>, input: string) {
  const base: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", ...env };
  return spawnSync("python3", [script], { env: base, input, encoding: "utf-8", timeout: 30_000 });
}

describe("ops/fetchers.py keeps its cache outside the repository", () => {
  it("reads and writes the cache at CP_FETCHER_CACHE and creates nothing next to the script", () => {
    const box = sandbox();
    const cacheDir = mkdtempSync(join(tmpdir(), "fetcher-cache-target-"));
    const cache = join(cacheDir, "fetcher-cache.tsv");
    writeFileSync(cache, `# ip\towner\tkind\n${DOC_ADDRESS}\tPlantedOwner\tdatacenter\n`, "utf-8");

    const r = run(box.script, { HOME: box.home, CP_FETCHER_CACHE: cache }, `${DOC_ADDRESS}\n${NOT_CACHED}\n`);
    expect(r.status, r.stderr).toBe(0);

    // Read from the configured place: the planted owner can only come from that file.
    expect(r.stdout).toContain(`${DOC_ADDRESS}\tPlantedOwner\tdatacenter`);
    // Written to the configured place: the new address is there, the planted row survived.
    const written = readFileSync(cache, "utf-8");
    expect(written).toContain(`${NOT_CACHED}\t`);
    expect(written).toContain(`${DOC_ADDRESS}\tPlantedOwner\tdatacenter`);
    // And nowhere else.
    expect(existsSync(join(box.opsDir, "fetcher-cache.tsv"))).toBe(false);
    expect(existsSync(join(box.home, ".cache", "control-plane", "fetcher-cache.tsv"))).toBe(false);
  });

  it("defaults to ~/.cache/control-plane/fetcher-cache.tsv and creates the folder", () => {
    const box = sandbox();
    const r = run(box.script, { HOME: box.home }, `${NOT_CACHED}\n`);
    expect(r.status, r.stderr).toBe(0);

    const cache = join(box.home, ".cache", "control-plane", "fetcher-cache.tsv");
    expect(existsSync(cache)).toBe(true);
    expect(readFileSync(cache, "utf-8")).toContain(`${NOT_CACHED}\t`);
    expect(existsSync(join(box.opsDir, "fetcher-cache.tsv"))).toBe(false);
  });

  it("is not tracked by git and is ignored", () => {
    const tracked = spawnSync("git", ["ls-files", "ops/fetcher-cache.tsv"], { cwd: join(__dirname, ".."), encoding: "utf-8" });
    expect(tracked.stdout.trim()).toBe("");
    const ignored = spawnSync("git", ["check-ignore", "-q", "ops/fetcher-cache.tsv"], { cwd: join(__dirname, "..") });
    expect(ignored.status).toBe(0);
  });
});
