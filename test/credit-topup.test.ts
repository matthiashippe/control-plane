import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The balance at the inference provider must never run out, so the provider tops it up by itself. `ops/credit-runway.sh --topup`
 * computes threshold and amount of that automatic top-up from the warn threshold and the daily usage:
 *
 *   threshold X = warn threshold T plus 2 times the daily usage d, rounded up to whole USD
 *   amount Y    = 7 times d, rounded up to a multiple of 5 USD, at least 10 USD
 *
 * Everything here runs without network: the two provider answers are planted files, and for the modes that fetch, `curl` and
 * `docker` are fakes on PATH. The planted key is built at runtime so that no tracked file carries something that looks like a key.
 */
const SCRIPT = join(__dirname, "..", "ops", "credit-runway.sh");
const PLANTED_KEY = ["sk", "or", "v1", "planted1111111111111111111111111111111111111111"].join("-");

type Run = { status: number | null; out: string; lines: string[] };

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "credit-topup-"));
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
    return { status: r.status, out: `${r.stdout}${r.stderr}`, lines: r.stdout.split("\n").filter(Boolean) };
  };
  return { root, file, run };
}

const credits = (total: number | string, used: number | string) =>
  `{"data":{"total_credits":${total},"total_usage":${used}}}`;
const key = (weekly: number | string) =>
  `{"data":{"label":"${PLANTED_KEY.slice(0, 12)}...","usage":1,"usage_daily":0,"usage_weekly":${weekly}}}`;

const LINE = /^AUTO TOPUP: threshold (\d+) USD, amount (\d+) USD, warn threshold (\d+\.\d\d) USD, (\d+\.\d\d) USD per day$/;

describe("ops/credit-runway.sh --topup computes threshold and amount of the automatic top-up", () => {
  it("21.84 USD used in a week (3.12 USD per day) gives threshold 16 USD and amount 25 USD", () => {
    const s = sandbox();
    const r = s.run(["--topup", "--files", s.file("c.json", credits(47, 7)), s.file("k.json", key(21.84))]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["AUTO TOPUP: threshold 16 USD, amount 25 USD, warn threshold 9.36 USD, 3.12 USD per day"]);
  });

  it("no usage gives threshold 7 USD and amount 10 USD: minimum daily usage, minimum warn amount and minimum top-up", () => {
    const s = sandbox();
    const r = s.run(["--topup", "--files", s.file("c.json", credits(47, 7)), s.file("k.json", key(0))]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["AUTO TOPUP: threshold 7 USD, amount 10 USD, warn threshold 5.00 USD, 1.00 USD per day"]);
  });

  it("the threshold always lies at least two days of usage above the warn threshold, the amount covers a week", () => {
    const s = sandbox();
    const c = s.file("c.json", credits(100, 0));
    for (const weekly of [0, 0.5, 5, 7, 13.99, 15, 17.41, 21.84, 21.98, 25, 35, 45, 70, 140.7]) {
      const r = s.run(["--topup", "--files", c, s.file(`k${weekly}.json`, key(weekly))]);
      expect(r.status, `${weekly}: ${r.out}`).toBe(0);
      expect(r.lines.length).toBe(1);
      const m = LINE.exec(r.lines[0]);
      expect(m, r.lines[0]).not.toBeNull();
      const [x, y, t, d] = [Number(m![1]), Number(m![2]), Number(m![3]), Number(m![4])];
      expect(d).toBeCloseTo(Math.max(weekly / 7, 1), 2);
      expect(x, r.lines[0]).toBeGreaterThan(t);
      expect(x + 0.005, r.lines[0]).toBeGreaterThanOrEqual(t + 2 * d);
      expect(x - 1, r.lines[0]).toBeLessThan(t + 2 * d);
      expect(y % 5, r.lines[0]).toBe(0);
      expect(y, r.lines[0]).toBeGreaterThanOrEqual(10);
      const week = Math.max(weekly, 7);
      expect(y, r.lines[0]).toBeGreaterThanOrEqual(week);
      expect(y - 5, r.lines[0]).toBeLessThan(Math.max(week, 10));
    }
  });

  it("the top-up follows the balance-independent rule: a low balance still prints the numbers with exit 0", () => {
    const s = sandbox();
    const r = s.run(["--topup", "--files", s.file("c.json", credits(20, 20.16)), s.file("k.json", key(21.84))]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["AUTO TOPUP: threshold 16 USD, amount 25 USD, warn threshold 9.36 USD, 3.12 USD per day"]);
  });

  it("the warn threshold comes from CP_CREDIT_WARN_USD, CP_CREDIT_WARN_DAYS and CP_CREDIT_MIN_DAILY_USD", () => {
    const s = sandbox();
    const c = s.file("c.json", credits(100, 0));
    const k0 = s.file("k0.json", key(0));
    expect(s.run(["--topup", "--files", c, k0], { CP_CREDIT_WARN_USD: "20" }).lines).toEqual([
      "AUTO TOPUP: threshold 22 USD, amount 10 USD, warn threshold 20.00 USD, 1.00 USD per day",
    ]);
    expect(s.run(["--topup", "--files", c, k0], { CP_CREDIT_WARN_DAYS: "10" }).lines).toEqual([
      "AUTO TOPUP: threshold 12 USD, amount 10 USD, warn threshold 10.00 USD, 1.00 USD per day",
    ]);
    expect(s.run(["--topup", "--files", c, k0], { CP_CREDIT_MIN_DAILY_USD: "4" }).lines).toEqual([
      "AUTO TOPUP: threshold 20 USD, amount 30 USD, warn threshold 12.00 USD, 4.00 USD per day",
    ]);
    expect(s.run(["--topup", "--files", c, k0], { CP_CREDIT_MIN_DAILY_USD: "0.5" }).lines).toEqual([
      "AUTO TOPUP: threshold 6 USD, amount 10 USD, warn threshold 5.00 USD, 0.50 USD per day",
    ]);
  });

  it("an empty answer, an answer that is not JSON and an error answer are AUTO TOPUP FAIL with exit 2", () => {
    const s = sandbox();
    const k = s.file("k.json", key(7));
    for (const body of ["", "<html>bad gateway</html>", '{"error":{"code":401,"message":"No auth credentials found"}}']) {
      const r = s.run(["--topup", "--files", s.file("c.json", body), k]);
      expect(r.status, body).toBe(2);
      expect(r.lines.length, body).toBe(1);
      expect(r.lines[0], body).toMatch(/^AUTO TOPUP FAIL: /);
    }
    const missing = s.run(["--topup", "--files", s.file("c.json", credits(47, 7)), s.file("k.json", "")]);
    expect(missing.status).toBe(2);
    expect(missing.lines).toEqual(["AUTO TOPUP FAIL: empty answer from /key"]);
  });

  it("a wrong argument after --topup is AUTO TOPUP FAIL with exit 2", () => {
    const s = sandbox();
    for (const args of [["--topup", "--files"], ["--topup", "--files", "a"], ["--topup", "--nonsense"]]) {
      const r = s.run(args);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.lines.length).toBe(1);
      expect(r.lines[0]).toMatch(/^AUTO TOPUP FAIL: /);
    }
  });

  it("--topup without a source reads the key like the runway and hands it to curl on stdin, never on the command line", () => {
    const s = sandbox();
    writeFileSync(
      join(s.root, "bin", "curl"),
      [
        "#!/bin/sh",
        'printf "%s\\n" "ARGV $*" >> "$FAKE_LOG"',
        'printf "STDIN %s\\n" "$(cat)" >> "$FAKE_LOG"',
        'case "$*" in',
        `  *api/v1/credits*) printf '%s' '${credits(47, 7)}' ;;`,
        `  *api/v1/key*) printf '%s' '${key(21.84)}' ;;`,
        "  *) exit 7 ;;",
        "esac",
      ].join("\n"),
    );
    chmodSync(join(s.root, "bin", "curl"), 0o755);
    const r = s.run(["--topup"], { OPENROUTER_API_KEY: PLANTED_KEY });
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["AUTO TOPUP: threshold 16 USD, amount 25 USD, warn threshold 9.36 USD, 3.12 USD per day"]);
    const log = readFileSync(join(s.root, "fake.log"), "utf8").split("\n");
    expect(log.filter((l) => l.startsWith("ARGV ")).length).toBe(2);
    expect(log.some((l) => l.startsWith("ARGV ") && l.includes(PLANTED_KEY))).toBe(false);
    // The counter-proof: the same log does see the key, on stdin, so the check above can find it.
    expect(log.filter((l) => l.startsWith("STDIN ") && l.includes(PLANTED_KEY)).length).toBe(2);
    expect(r.out).not.toContain(PLANTED_KEY);
  });

  it("--topup without any key is AUTO TOPUP FAIL with exit 2 and asks nothing of the network", () => {
    const s = sandbox();
    writeFileSync(join(s.root, "bin", "curl"), '#!/bin/sh\necho called >> "$FAKE_LOG"\nexit 7\n');
    chmodSync(join(s.root, "bin", "curl"), 0o755);
    const r = s.run(["--topup"]);
    expect(r.status).toBe(2);
    expect(r.lines).toEqual(["AUTO TOPUP FAIL: no OPENROUTER_API_KEY in the environment or in ~/.config/control-plane/loop.env"]);
    expect(() => readFileSync(join(s.root, "fake.log"), "utf8")).toThrow();
  });

  it("--topup --container asks the service container and passes no key to docker", () => {
    const s = sandbox();
    writeFileSync(join(s.root, "answer.json"), JSON.stringify({ credits: credits(47, 7), key: key(0) }));
    writeFileSync(
      join(s.root, "bin", "docker"),
      ["#!/bin/sh", 'printf "ARGV %s\\n" "$*" >> "$FAKE_LOG"', `cat "${join(s.root, "answer.json")}"`].join("\n"),
    );
    chmodSync(join(s.root, "bin", "docker"), 0o755);
    const r = s.run(["--topup", "--container"], { OPENROUTER_API_KEY: PLANTED_KEY });
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["AUTO TOPUP: threshold 7 USD, amount 10 USD, warn threshold 5.00 USD, 1.00 USD per day"]);
    const log = readFileSync(join(s.root, "fake.log"), "utf8");
    expect(log).toMatch(/^ARGV exec deploy-cp-1 node -e /);
    expect(log).not.toContain(PLANTED_KEY);
  });

  it("the selftest shows the top-up rule in at least three cases, among them the failure", () => {
    const s = sandbox();
    const r = s.run(["--selftest"]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines.at(-1)).toBe("CREDIT RUNWAY SELFTEST OK");
    const topup = r.lines.filter((l) => l.startsWith("ok   topup "));
    expect(topup.length, r.out).toBeGreaterThanOrEqual(3);
    expect(topup.some((l) => l.includes("AUTO TOPUP: threshold 16 USD, amount 25 USD"))).toBe(true);
    expect(topup.some((l) => l.includes("AUTO TOPUP: threshold 7 USD, amount 10 USD"))).toBe(true);
    expect(topup.some((l) => l.includes("exit 2: AUTO TOPUP FAIL: "))).toBe(true);
  }, 120_000);

  for (const [name, marker, replacement] of [
    ["the two days of headroom", "threshold + 2 * effective", "threshold"],
    ["the minimum top-up", "max(Decimal(10), week)", "week"],
  ] as const) {
    it(`the selftest goes red when ${name} is taken out of the script`, () => {
      const s = sandbox();
      const mutated = join(s.root, "credit-runway-mutated.sh");
      const text = readFileSync(SCRIPT, "utf8");
      expect(text).toContain(marker);
      writeFileSync(mutated, text.replace(marker, replacement));
      const r = s.run(["--selftest"], {}, mutated);
      expect(r.status, r.out).toBe(1);
      expect(r.lines.at(-1)).toBe("CREDIT RUNWAY SELFTEST FAILED");
      expect(r.lines.some((l) => l.startsWith("FAIL topup "))).toBe(true);
    }, 120_000);
  }
});
