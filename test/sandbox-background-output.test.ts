/**
 * How a command in the background ends and how much of its output comes back (goals/hosting/02). The wrapper writes the
 * exit code into `<base>.exit.tmp` and moves it to `<base>.exit`, so the wait command never reads an empty exit file as
 * the end; and both print at most the last 65536 bytes (WAIT_TAIL_BYTES) of `<base>.out` and `<base>.err`, after one line
 * that names the size and the path and tells to read parts of it with grep -n or sed -n instead of read_file, because every byte of the answer lands in the context of the model and
 * is paid as inference. The shell runs here in a real bash with a small `seconds`, as in test/sandbox-wait.test.ts.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backgroundCommand, waitCommand } from "../src/sandbox/service.js";

const TAIL = 65536;
const BIG = 5242880;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** A fresh `<dir>/.exec/<tag>` base, as the wrapper of a command in the background writes it. */
function freshBase(): string {
  const dir = tmp("cp-bgout-");
  fs.mkdirSync(path.join(dir, ".exec"));
  return path.join(dir, ".exec", "0a1b2c3d4e5f");
}

function runBash(command: string) {
  const r = spawnSync("bash", ["-c", command], { encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** `size` bytes of `fill` lines that end with `tail`, so the last bytes of the file are known. */
function content(size: number, tail: string): string {
  const line = "npm notice fetching package metadata 0123456789\n";
  const body = line.repeat(Math.ceil(size / line.length)).slice(0, size - tail.length);
  return body + tail;
}

/** Splits a stream that was cut into its notice line and the rest. */
function cut(stream: string): { notice: string; rest: string } {
  const i = stream.indexOf("\n");
  return { notice: stream.slice(0, i), rest: stream.slice(i + 1) };
}

function expectNotice(notice: string, size: number, file: string): void {
  expect(notice).toContain(String(size));
  expect(notice).toContain(String(TAIL));
  expect(notice).toContain(file);
  // read_file returns the whole file (read in src/sandbox/service.ts), so the line warns against it and names exec
  // commands that read only a part, each with the path of the file.
  expect(notice).toContain("read_file");
  expect(notice).toMatch(/read_file[^.]*all [0-9]+ bytes into your context/);
  expect(notice).toContain(`grep -n '<text>' ${file}`);
  expect(notice).toContain(`sed -n '<from>,<to>p' ${file}`);
  expect(notice).not.toMatch(/read the rest with read_file/);
}

describe("the exit file of a command in the background", () => {
  it("an empty exit file without a writer is no end: the wait says still running with exit code 0 and no bash error", () => {
    const base = freshBase();
    fs.writeFileSync(`${base}.exit`, "");
    const r = runBash(waitCommand(base, 2));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("The command is still running. Run the same command again to wait up to 2 more seconds.\n");
    expect(r.stderr).toBe("");
  });

  it("an empty exit file that gets code 3 after 1.5 s ends the wait with exit code 3 and the usual first line", async () => {
    const base = freshBase();
    fs.writeFileSync(`${base}.exit`, "");
    fs.writeFileSync(`${base}.out`, "built\n");
    fs.writeFileSync(`${base}.err`, "");
    const child = spawn("bash", ["-c", waitCommand(base, 6)]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    const code = new Promise<number | null>((r) => child.on("close", (c) => r(c)));
    await new Promise((r) => setTimeout(r, 1500));
    fs.writeFileSync(`${base}.exit`, "3\n");
    expect(await code).toBe(3);
    expect(stdout).toBe("The command has ended with exit code 3.\nbuilt\n");
    expect(stderr).toBe("");
  });

  it("the wrapper writes the exit code through <base>.exit.tmp and mv, so <base>.exit never exists before the move", () => {
    const base = freshBase();
    const bin = tmp("cp-bgout-bin-");
    const log = path.join(bin, "mv.log");
    // An mv in front of the real one that notes whether <base>.exit already existed when it was called.
    fs.writeFileSync(
      path.join(bin, "mv"),
      `#!/bin/bash\nif [ -e ${base}.exit ]; then echo "exit-before" >> ${log}; else echo "no-exit-before" >> ${log}; fi\n` +
        `echo "args $*" >> ${log}\nexec /bin/mv "$@"\n`,
      { mode: 0o755 },
    );
    const r = runBash(`PATH=${bin}:$PATH; ${backgroundCommand("echo hi; exit 3", base, 20)}`);
    expect(r).toMatchObject({ code: 3, stdout: "hi\n", stderr: "" });
    expect(fs.readFileSync(`${base}.exit`, "utf8")).toBe("3\n");
    expect(fs.existsSync(`${base}.exit.tmp`)).toBe(false);
    expect(fs.existsSync(log), "the wrapper did not call mv").toBe(true);
    const calls = fs.readFileSync(log, "utf8");
    expect(calls.split("\n")).toContain("no-exit-before");
    expect(calls.split("\n")).not.toContain("exit-before");
    expect(calls).toContain(`args -f ${base}.exit.tmp ${base}.exit`);
  });
});

describe("how much output comes back", () => {
  it("the wait prints at most the last 65536 bytes of a 5 MB output and a 5 MB error file, each after one line", () => {
    const base = freshBase();
    const out = content(BIG, "END-OF-OUT\n");
    const err = content(BIG, "END-OF-ERR\n");
    fs.writeFileSync(`${base}.out`, out);
    fs.writeFileSync(`${base}.err`, err);
    fs.writeFileSync(`${base}.exit`, "0\n");
    const r = runBash(waitCommand(base, 2));
    expect(r.code).toBe(0);
    const first = "The command has ended with exit code 0.\n";
    expect(r.stdout.startsWith(first)).toBe(true);
    const o = cut(r.stdout.slice(first.length));
    expectNotice(o.notice, BIG, `${base}.out`);
    expect(o.rest).toBe(out.slice(-TAIL));
    expect(o.rest.endsWith("END-OF-OUT\n")).toBe(true);
    const e = cut(r.stderr);
    expectNotice(e.notice, BIG, `${base}.err`);
    expect(e.rest).toBe(err.slice(-TAIL));
    expect(e.rest.endsWith("END-OF-ERR\n")).toBe(true);
  });

  it("the answer of the wrapper to a command that writes 5 MB to each stream is cut the same way", () => {
    const base = freshBase();
    // 5242880 bytes on each stream: 5242869 bytes of "a" and the 11 bytes of the end marker.
    const command =
      `head -c ${BIG - 11} /dev/zero | tr '\\0' a; echo END-OF-OUT; ` + `{ head -c ${BIG - 11} /dev/zero | tr '\\0' b; echo END-OF-ERR; } >&2; exit 0`;
    const r = runBash(backgroundCommand(command, base, 20));
    expect(r.code).toBe(0);
    expect(fs.statSync(`${base}.out`).size).toBe(BIG);
    const o = cut(r.stdout);
    expectNotice(o.notice, BIG, `${base}.out`);
    expect(o.rest).toBe(fs.readFileSync(`${base}.out`, "utf8").slice(-TAIL));
    expect(o.rest.endsWith("END-OF-OUT\n")).toBe(true);
    const e = cut(r.stderr);
    expectNotice(e.notice, BIG, `${base}.err`);
    expect(e.rest).toBe(fs.readFileSync(`${base}.err`, "utf8").slice(-TAIL));
    expect(e.rest.endsWith("END-OF-ERR\n")).toBe(true);
  });

  it("an output of exactly 65536 bytes comes unchanged and without the line", () => {
    const base = freshBase();
    const out = content(TAIL, "LAST\n");
    fs.writeFileSync(`${base}.out`, out);
    fs.writeFileSync(`${base}.err`, "");
    fs.writeFileSync(`${base}.exit`, "0\n");
    const r = runBash(waitCommand(base, 2));
    expect(r.stdout).toBe(`The command has ended with exit code 0.\n${out}`);
    expect(r.stdout).not.toContain("read_file");
  });

  it("an output of 65537 bytes gets the line and its last 65536 bytes", () => {
    const base = freshBase();
    const out = content(TAIL + 1, "LAST\n");
    fs.writeFileSync(`${base}.out`, out);
    fs.writeFileSync(`${base}.err`, "");
    fs.writeFileSync(`${base}.exit`, "0\n");
    const r = runBash(waitCommand(base, 2));
    const first = "The command has ended with exit code 0.\n";
    expect(r.stdout.startsWith(first)).toBe(true);
    const o = cut(r.stdout.slice(first.length));
    expectNotice(o.notice, 65537, `${base}.out`);
    expect(o.rest).toBe(out.slice(-TAIL));
    expect(r.stderr).toBe("");
  });

  it("a small output comes byte for byte as before, from the wait and from the wrapper", () => {
    const base = freshBase();
    fs.writeFileSync(`${base}.out`, "line one\nlong-180\n");
    fs.writeFileSync(`${base}.err`, "warn\n");
    fs.writeFileSync(`${base}.exit`, "3\n");
    expect(runBash(waitCommand(base, 2))).toMatchObject({
      code: 3,
      stdout: "The command has ended with exit code 3.\nline one\nlong-180\n",
      stderr: "warn\n",
    });
    const other = freshBase();
    expect(runBash(backgroundCommand("echo ok; echo warn >&2; exit 0", other, 20))).toMatchObject({ code: 0, stdout: "ok\n", stderr: "warn\n" });
  });
});
