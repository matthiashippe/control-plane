import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * On 2026-11-11 the balance at the inference provider ran out at 02:01 UTC and a paying automaton got 503 for 28 hours before
 * anyone looked. ops/credit-runway.sh turns balance and daily usage into one line: OK (exit 0), LOW (exit 1) or FAIL (exit 2).
 *
 * Everything here runs without network: the two provider answers are planted files, and for the modes that fetch, `curl` and
 * `docker` are fakes on PATH that log what they were called with. The planted key is built at runtime so that no tracked file
 * carries something that looks like a key.
 */
const SCRIPT = join(__dirname, "..", "ops", "credit-runway.sh");
const PLANTED_KEY = ["sk", "or", "v1", "planted0000000000000000000000000000000000000000"].join("-");

type Run = { status: number | null; out: string; lines: string[] };

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "credit-runway-"));
  mkdirSync(join(root, "bin"));
  mkdirSync(join(root, "home"));
  const file = (name: string, text: string) => {
    const p = join(root, name);
    writeFileSync(p, text);
    return p;
  };
  const run = (args: string[], env: Record<string, string | undefined> = {}, script = SCRIPT): Run => {
    const r = spawnSync("bash", [script, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: {
        PATH: `${join(root, "bin")}:/usr/bin:/bin`,
        HOME: join(root, "home"),
        FAKE_LOG: join(root, "fake.log"),
        ...env,
      },
    });
    const out = `${r.stdout}${r.stderr}`;
    return { status: r.status, out, lines: r.stdout.split("\n").filter(Boolean) };
  };
  return { root, file, run };
}

const credits = (total: number | string, used: number | string) =>
  `{"data":{"total_credits":${total},"total_usage":${used}}}`;
const key = (weekly: number | string) =>
  `{"data":{"label":"${PLANTED_KEY.slice(0, 12)}...","usage":1,"usage_daily":0,"usage_weekly":${weekly}}}`;

describe("ops/credit-runway.sh computes runway and threshold from balance and daily usage", () => {
  it("the selftest passes and shows every direction", () => {
    const s = sandbox();
    const r = s.run(["--selftest"]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines.at(-1)).toBe("CREDIT RUNWAY SELFTEST OK");
    const cases = r.lines.filter((l) => /^ok {3}(low|ok|fail) /.test(l));
    expect(cases.length).toBeGreaterThanOrEqual(4);
    for (const kind of ["low", "ok", "fail"]) expect(cases.some((l) => l.startsWith(`ok   ${kind} `))).toBe(true);
    expect(r.lines.some((l) => l.startsWith("FAIL"))).toBe(false);
  }, 120_000);

  it("the selftest goes red when the minimum daily usage is taken out of the script", () => {
    const s = sandbox();
    const mutated = join(s.root, "credit-runway-mutated.sh");
    const text = readFileSync(SCRIPT, "utf8");
    const marker = "effective = max(daily, min_daily)";
    expect(text).toContain(marker);
    writeFileSync(mutated, text.replace(marker, "effective = daily"));
    const r = s.run(["--selftest"], {}, mutated);
    expect(r.status, r.out).toBe(1);
    expect(r.lines.at(-1)).toBe("CREDIT RUNWAY SELFTEST FAILED");
    expect(r.lines.some((l) => l.startsWith("FAIL low "))).toBe(true);
  }, 120_000);

  it("20 USD bought and 20.16 USD used is LOW with exit 1", () => {
    const s = sandbox();
    const r = s.run(["--files", s.file("c.json", credits(20, 20.16)), s.file("k.json", key(3.5))]);
    expect(r.status).toBe(1);
    expect(r.lines).toEqual(["CREDIT RUNWAY LOW: -0.16 USD, 0.0 days at 1.00 USD per day, threshold 5.00 USD"]);
  });

  it("40 USD left at 7 USD per week is OK with exit 0", () => {
    const s = sandbox();
    const r = s.run(["--files", s.file("c.json", credits(47, 7)), s.file("k.json", key(7))]);
    expect(r.status).toBe(0);
    expect(r.lines).toEqual(["CREDIT RUNWAY OK: 40.00 USD, 40.0 days at 1.00 USD per day, threshold 5.00 USD"]);
  });

  it("4 USD left at no usage is LOW: the minimum daily usage keeps the runway finite and the minimum amount warns", () => {
    const s = sandbox();
    const r = s.run(["--files", s.file("c.json", credits(10, 6)), s.file("k.json", key(0))]);
    expect(r.status).toBe(1);
    expect(r.lines).toEqual(["CREDIT RUNWAY LOW: 4.00 USD, 4.0 days at 1.00 USD per day, threshold 5.00 USD"]);
  });

  it("the threshold follows the daily usage: 3 days at 5 USD per day is 15 USD", () => {
    const s = sandbox();
    const at = s.run(["--files", s.file("c.json", credits(15, 0)), s.file("k.json", key(35))]);
    expect(at.status).toBe(0);
    expect(at.lines).toEqual(["CREDIT RUNWAY OK: 15.00 USD, 3.0 days at 5.00 USD per day, threshold 15.00 USD"]);
    const below = s.run(["--files", s.file("c2.json", credits(14.99, 0)), s.file("k2.json", key(35))]);
    expect(below.status).toBe(1);
    expect(below.lines[0]).toMatch(/^CREDIT RUNWAY LOW: 14\.99 USD, /);
  });

  it("the thresholds come from CP_CREDIT_WARN_DAYS, CP_CREDIT_WARN_USD and CP_CREDIT_MIN_DAILY_USD", () => {
    const s = sandbox();
    const c = s.file("c.json", credits(40, 0));
    const k = s.file("k.json", key(7));
    expect(s.run(["--files", c, k]).status).toBe(0);
    expect(s.run(["--files", c, k], { CP_CREDIT_WARN_USD: "50" }).status).toBe(1);
    expect(s.run(["--files", c, k], { CP_CREDIT_WARN_DAYS: "41" }).status).toBe(1);
    const r = s.run(["--files", c, s.file("k0.json", key(0))], { CP_CREDIT_MIN_DAILY_USD: "20" });
    expect(r.status).toBe(1);
    expect(r.lines[0]).toBe("CREDIT RUNWAY LOW: 40.00 USD, 2.0 days at 20.00 USD per day, threshold 60.00 USD");
  });

  it("an empty answer, an answer that is not JSON and an error answer are FAIL with exit 2", () => {
    const s = sandbox();
    const k = s.file("k.json", key(7));
    for (const body of ["", "<html>bad gateway</html>", '{"error":{"code":401,"message":"No auth credentials found"}}']) {
      const r = s.run(["--files", s.file("c.json", body), k]);
      expect(r.status, body).toBe(2);
      expect(r.lines.length).toBe(1);
      expect(r.lines[0]).toMatch(/^CREDIT RUNWAY FAIL: /);
    }
    const missing = s.run(["--files", s.file("c.json", credits(47, 7)), s.file("k.json", "")]);
    expect(missing.status).toBe(2);
    expect(missing.lines[0]).toMatch(/^CREDIT RUNWAY FAIL: /);
  });

  it("without arguments it reads the key from the environment and hands it to curl on stdin, never on the command line", () => {
    const s = sandbox();
    writeFileSync(
      join(s.root, "bin", "curl"),
      [
        "#!/bin/sh",
        'printf "%s\\n" "ARGV $*" >> "$FAKE_LOG"',
        'printf "STDIN %s\\n" "$(cat)" >> "$FAKE_LOG"',
        'case "$*" in',
        `  *api/v1/credits*) printf '%s' '${credits(47, 7)}' ;;`,
        `  *api/v1/key*) printf '%s' '${key(7)}' ;;`,
        "  *) exit 7 ;;",
        "esac",
      ].join("\n"),
    );
    chmodSync(join(s.root, "bin", "curl"), 0o755);
    const r = s.run([], { OPENROUTER_API_KEY: PLANTED_KEY });
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["CREDIT RUNWAY OK: 40.00 USD, 40.0 days at 1.00 USD per day, threshold 5.00 USD"]);
    const log = readFileSync(join(s.root, "fake.log"), "utf8").split("\n");
    const argv = log.filter((l) => l.startsWith("ARGV "));
    expect(argv.length).toBe(2);
    expect(argv.some((l) => l.includes(PLANTED_KEY))).toBe(false);
    // The counter-proof: the same log does see the key, on stdin, so the check above can find it.
    expect(log.filter((l) => l.startsWith("STDIN ") && l.includes(PLANTED_KEY)).length).toBe(2);
    expect(r.out).not.toContain(PLANTED_KEY);
  });

  it("without arguments and without a key in the environment it takes the key from ~/.config/control-plane/loop.env", () => {
    const s = sandbox();
    mkdirSync(join(s.root, "home", ".config", "control-plane"), { recursive: true });
    writeFileSync(join(s.root, "home", ".config", "control-plane", "loop.env"), `CP_URL=https://example.invalid\nOPENROUTER_API_KEY=${PLANTED_KEY}\n`);
    writeFileSync(
      join(s.root, "bin", "curl"),
      ["#!/bin/sh", 'printf "STDIN %s\\n" "$(cat)" >> "$FAKE_LOG"', `printf '%s' '{"data":{"total_credits":1,"total_usage":0,"usage_weekly":0}}'`].join("\n"),
    );
    chmodSync(join(s.root, "bin", "curl"), 0o755);
    const r = s.run([]);
    expect(r.status, r.out).toBe(1);
    expect(r.lines[0]).toMatch(/^CREDIT RUNWAY LOW: 1\.00 USD, /);
    expect(readFileSync(join(s.root, "fake.log"), "utf8")).toContain(`Bearer ${PLANTED_KEY}`);
    expect(r.out).not.toContain(PLANTED_KEY);
  });

  it("without any key it is FAIL with exit 2 and asks nothing of the network", () => {
    const s = sandbox();
    writeFileSync(join(s.root, "bin", "curl"), '#!/bin/sh\necho called >> "$FAKE_LOG"\nexit 7\n');
    chmodSync(join(s.root, "bin", "curl"), 0o755);
    const r = s.run([]);
    expect(r.status).toBe(2);
    expect(r.lines).toEqual(["CREDIT RUNWAY FAIL: no OPENROUTER_API_KEY in the environment or in ~/.config/control-plane/loop.env"]);
  });

  it("--container asks the service container and passes no key to docker", () => {
    const s = sandbox();
    const answer = JSON.stringify({ credits: credits(47, 7), key: key(7) });
    writeFileSync(join(s.root, "answer.json"), answer);
    writeFileSync(
      join(s.root, "bin", "docker"),
      ["#!/bin/sh", 'printf "ARGV %s\\n" "$*" >> "$FAKE_LOG"', `cat "${join(s.root, "answer.json")}"`].join("\n"),
    );
    chmodSync(join(s.root, "bin", "docker"), 0o755);
    const r = s.run(["--container"], { OPENROUTER_API_KEY: PLANTED_KEY });
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["CREDIT RUNWAY OK: 40.00 USD, 40.0 days at 1.00 USD per day, threshold 5.00 USD"]);
    const log = readFileSync(join(s.root, "fake.log"), "utf8");
    expect(log).toMatch(/^ARGV exec deploy-cp-1 node -e /);
    expect(log).toContain("process.env.OPENROUTER_API_KEY");
    expect(log).not.toContain(PLANTED_KEY);
    writeFileSync(join(s.root, "answer.json"), "");
    const empty = s.run(["--container"]);
    expect(empty.status).toBe(2);
    expect(empty.lines[0]).toMatch(/^CREDIT RUNWAY FAIL: /);
  });

  it("copies of the script run outside the repository", () => {
    const s = sandbox();
    const copy = join(s.root, "copy.sh");
    copyFileSync(SCRIPT, copy);
    const r = s.run(["--selftest"], {}, copy);
    expect(r.status, r.out).toBe(0);
  }, 120_000);
});
