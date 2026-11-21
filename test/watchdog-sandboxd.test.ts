import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Until now the first foreign automaton that wanted a sandbox noticed an outage of sandboxd or a base image the prune cron had
 * removed, as 501. ops/watchdog.sh now asks sandboxd (/healthz, then /healthz/image) on every run and reports the change of state
 * only, over the same alarm path as the other checks.
 *
 * No network: `curl` (payment health, sandboxd, webhook), `docker`, `openssl` and `sleep` are fakes on PATH. The fake sandboxd
 * answers from files in the sandbox, the way `curl -w '\n%{http_code}'` prints: the body, a newline, the status code. The fake
 * webhook fails with exit 22 while the file `fail-next` exists and removes it, and writes every successful POST into a log.
 */
const ROOT = join(__dirname, "..");
const WATCHDOG = join(ROOT, "ops", "watchdog.sh");
const SANDBOXD = "https://sandboxd.invalid";

const credit = JSON.stringify({
  credits: JSON.stringify({ data: { total_credits: 50, total_usage: 10 } }),
  key: JSON.stringify({ data: { label: "masked", usage_weekly: 7 } }),
});

type Answer = { code: string; body?: string };
const DOWN: Answer = { code: "000" };
const OK: Answer = { code: "200", body: "ok" };
const IMAGE_OK: Answer = { code: "200", body: "image ok" };
const IMAGE_MISSING: Answer = { code: "503", body: "image missing" };
const IMAGE_UNPINNED: Answer = { code: "503", body: "image unpinned" };

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "watchdog-sandboxd-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts.log");
  const asks = join(root, "asks.log");
  const sleeps = join(root, "sleeps.log");
  const container = join(root, "container.json");
  const failNext = join(root, "fail-next");
  const paymentCode = join(root, "payment-code");
  for (const f of [posts, asks, sleeps]) writeFileSync(f, "");
  writeFileSync(container, credit);
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  // Each sandboxd route reads a queue of answers, one line `<code> <body>` per request; the last line stays for later requests.
  const answerOf = (route: string) => [
    `  f="${root}/${route}"; echo ${route} >> "${asks}"; line=$(head -n 1 "$f");`,
    `  if [ "$(wc -l < "$f")" -gt 1 ]; then tail -n +2 "$f" > "$f.next"; mv "$f.next" "$f"; fi;`,
    '  code=${line%% *}; body=${line#* }; [ "$body" = "$line" ] && body="";',
    "  if [ \"$code\" = 000 ]; then printf '\\n000'; exit 7; fi;",
    "  printf '%s\\n%s' \"$body\" \"$code\" ;;",
  ];
  fake("curl", [
    'case "$*" in',
    `  *"-X POST"*) if [ -e "${failNext}" ]; then rm -f "${failNext}"; exit 22; fi;`,
    `    for a in "$@"; do printf '%s\\t' "$a"; done >> "${posts}"; echo >> "${posts}" ;;`,
    `  *"${SANDBOXD}/healthz/image"*)`,
    ...answerOf("image"),
    `  *"${SANDBOXD}/healthz"*)`,
    ...answerOf("healthz"),
    `  *"https://watchdog.invalid/health"*) cat "${paymentCode}" ;;`,
    "  *) exit 7 ;;",
    "esac",
  ]);
  fake("docker", ['case "$1" in', `  exec) cat "${container}" ;;`, "esac"]);
  fake("openssl", ["exit 1"]);
  fake("sleep", [`echo "$*" >> "${sleeps}"`]);
  const state = join(mkdtempSync(join(tmpdir(), "watchdog-sandboxd-state-")), "state");
  const queue = (route: string, answers: Answer[]) =>
    writeFileSync(join(root, route), answers.map((a) => `${a.code} ${a.body ?? ""}`.trimEnd()).join("\n") + "\n");
  const run = (healthz: Answer[], image: Answer[] = [IMAGE_OK], opts: { failPost?: boolean; payment?: string } = {}) => {
    queue("healthz", healthz);
    queue("image", image);
    writeFileSync(asks, "");
    writeFileSync(sleeps, "");
    writeFileSync(paymentCode, opts.payment ?? "200");
    if (opts.failPost) writeFileSync(failNext, "");
    const r = spawnSync("bash", [WATCHDOG], {
      encoding: "utf8",
      timeout: 60_000,
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: root,
        CP_URL: "https://watchdog.invalid",
        CP_ALERT_WEBHOOK: "https://hook.invalid/alerts",
        CP_WATCHDOG_STATE: state,
        CP_WATCHDOG_ALIVE: "0",
        CP_SANDBOXD_URL: SANDBOXD,
        CP_SANDBOXD_PAUSE: "0",
      },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const lines = (f: string) => readFileSync(f, "utf8").split("\n").filter(Boolean);
  const stored = () => (existsSync(`${state}.sandboxd`) ? readFileSync(`${state}.sandboxd`, "utf8").trim() : null);
  return { run, posts: () => lines(posts), asks: () => lines(asks), sleeps: () => lines(sleeps), stored, failNextLeft: () => existsSync(failNext) };
}

const sandboxdPosts = (posts: string[]) => posts.filter((l) => l.includes("sandboxd"));

describe("ops/watchdog.sh asks sandboxd and its base image on every run and reports the change only", () => {
  it("first run with sandboxd and the image fine: no POST, the line sandboxd: ok, state ok", () => {
    const s = sandbox();
    const r = s.run([OK], [IMAGE_OK]);
    expect(r.out).toContain("[INFO] sandboxd: ok");
    expect(s.asks()).toEqual(["healthz", "image"]);
    expect(s.posts()).toEqual([]);
    expect(s.stored()).toBe("ok");
    expect(r.status).toBe(0);
  }, 120_000);

  it("outage: exactly one [WARN] sandboxd unreachable after two attempts, the next run posts nothing", () => {
    const s = sandbox();
    s.run([OK], [IMAGE_OK]);
    const down = s.run([DOWN]);
    expect(s.asks()).toEqual(["healthz", "healthz"]);
    expect(s.sleeps()).toEqual(["0"]);
    expect(down.out).toContain("[WARN] sandboxd unreachable (HTTP 000, twice in a row)");
    const posts = s.posts();
    expect(posts.length).toBe(1);
    expect(posts[0]).toContain("Title: control-plane WARN");
    expect(posts[0]).toContain("Priority: high");
    expect(posts[0]).toContain("sandboxd unreachable (HTTP 000, twice in a row), every new sandbox fails with 501");
    expect(s.stored()).toBe("down");
    const again = s.run([DOWN]);
    expect(again.out).toContain("[INFO] sandboxd: still down");
    expect(s.posts().length).toBe(1);
  }, 180_000);

  it("one failed attempt and a second that answers is no alarm", () => {
    const s = sandbox();
    s.run([OK], [IMAGE_OK]);
    const r = s.run([DOWN, OK], [IMAGE_OK]);
    expect(s.asks()).toEqual(["healthz", "healthz", "image"]);
    expect(s.sleeps()).toEqual(["0"]);
    expect(r.out).toContain("[INFO] sandboxd: ok");
    expect(sandboxdPosts(s.posts())).toEqual([]);
    const flaky = s.run([OK], [IMAGE_MISSING, IMAGE_OK]);
    expect(flaky.out).toContain("[INFO] sandboxd: ok");
    expect(s.posts()).toEqual([]);
  }, 180_000);

  it("a missing base image is its own message: one [WARN] base image missing", () => {
    const s = sandbox();
    s.run([OK], [IMAGE_OK]);
    s.run([OK], [IMAGE_MISSING]);
    s.run([OK], [IMAGE_MISSING]);
    const posts = s.posts();
    expect(posts.length).toBe(1);
    expect(posts[0]).toContain("sandboxd base image missing, every new sandbox fails with 501");
    expect(posts[0]).not.toContain("not pinned");
    expect(s.stored()).toBe("missing");
  }, 180_000);

  it("a base image without its pin is its own message: one [WARN] base image not pinned, naming the remedy", () => {
    const s = sandbox();
    s.run([OK], [IMAGE_OK]);
    const r = s.run([OK], [IMAGE_UNPINNED]);
    expect(r.out).toContain("[WARN] sandboxd base image not pinned");
    s.run([OK], [IMAGE_UNPINNED]);
    const posts = s.posts();
    expect(posts.length).toBe(1);
    expect(posts[0]).toContain("sandboxd base image not pinned, the prune cron removes it within 24 h, run ops/sandbox/setup.sh");
  }, 180_000);

  it("an answer of /healthz/image other than 200 or 503 counts as down", () => {
    const s = sandbox();
    s.run([OK], [{ code: "502", body: "bad gateway" }]);
    expect(s.posts().length).toBe(1);
    expect(s.posts()[0]).toContain("sandboxd unreachable (HTTP 502 on /healthz/image, twice in a row)");
    expect(s.stored()).toBe("down");
  }, 120_000);

  it("down to image and image to down each report the new state", () => {
    const s = sandbox();
    s.run([DOWN]);
    s.run([OK], [IMAGE_MISSING]);
    s.run([DOWN]);
    const posts = sandboxdPosts(s.posts());
    expect(posts.length).toBe(3);
    expect(posts[0]).toContain("sandboxd unreachable");
    expect(posts[1]).toContain("sandboxd base image missing");
    expect(posts[2]).toContain("sandboxd unreachable");
  }, 180_000);

  it("unpinned to missing and missing to unpinned each report the new state", () => {
    const s = sandbox();
    s.run([OK], [IMAGE_OK]);
    s.run([OK], [IMAGE_UNPINNED]);
    expect(s.stored()).toBe("unpinned");
    const gone = s.run([OK], [IMAGE_MISSING]);
    expect(gone.out).toContain("[WARN] sandboxd base image missing");
    expect(s.stored()).toBe("missing");
    s.run([OK], [IMAGE_MISSING]);
    s.run([OK], [IMAGE_UNPINNED]);
    expect(s.stored()).toBe("unpinned");
    const posts = sandboxdPosts(s.posts());
    expect(posts.length).toBe(3);
    expect(posts[0]).toContain("sandboxd base image not pinned");
    expect(posts[1]).toContain("sandboxd base image missing, every new sandbox fails with 501");
    expect(posts[2]).toContain("sandboxd base image not pinned");
  }, 240_000);

  it("return: exactly one [OK] sandboxd back after an outage and after a missing image, then quiet again", () => {
    const s = sandbox();
    s.run([DOWN]);
    const back = s.run([OK], [IMAGE_OK]);
    expect(back.out).toContain("[OK] sandboxd back, base image pinned");
    s.run([OK], [IMAGE_OK]);
    s.run([OK], [IMAGE_MISSING]);
    s.run([OK], [IMAGE_OK]);
    const posts = s.posts();
    const oks = posts.filter((l) => l.includes("Title: control-plane OK") && l.includes("sandboxd back, base image pinned"));
    expect(oks.length).toBe(2);
    expect(posts.length).toBe(4);
    expect(s.stored()).toBe("ok");
  }, 240_000);

  it("a failed POST of the outage keeps the old state, so the next run reports it again, once", () => {
    const s = sandbox();
    s.run([OK], [IMAGE_OK]);
    const failed = s.run([DOWN], [IMAGE_OK], { failPost: true });
    expect(failed.out).toContain("[WARN] webhook unreachable");
    expect(s.failNextLeft()).toBe(false);
    expect(s.posts()).toEqual([]);
    expect(s.stored()).toBe("ok");
    s.run([DOWN]);
    expect(sandboxdPosts(s.posts()).length).toBe(1);
    s.run([DOWN]);
    expect(s.posts().length).toBe(1);
    expect(s.stored()).toBe("down");
  }, 180_000);

  it("a failed POST of the return keeps the old state, so the next run reports it again, once", () => {
    const s = sandbox();
    s.run([DOWN]);
    s.run([OK], [IMAGE_OK], { failPost: true });
    expect(s.stored()).toBe("down");
    s.run([OK], [IMAGE_OK]);
    s.run([OK], [IMAGE_OK]);
    const posts = s.posts();
    expect(posts.filter((l) => l.includes("sandboxd back")).length).toBe(1);
    expect(posts.length).toBe(2);
  }, 240_000);

  it("while the payment service itself is down, only the outage is posted and sandboxd keeps its state", () => {
    const s = sandbox();
    s.run([OK], [IMAGE_OK]);
    const r = s.run([DOWN], [IMAGE_OK], { payment: "500" });
    expect(r.status).toBe(1);
    expect(s.asks()).toEqual([]);
    expect(s.posts().length).toBe(1);
    expect(s.posts()[0]).toContain("OUTAGE");
    expect(s.stored()).toBe("ok");
  }, 120_000);
});

describe("ops/watchdog.sh reaches sandboxd the same way src/sandbox/ does", () => {
  it("the default of CP_SANDBOXD_URL is SANDBOXD_URL_DEFAULT of src/sandbox/client.ts", () => {
    const client = readFileSync(join(ROOT, "src", "sandbox", "client.ts"), "utf8");
    const fromClient = /export const SANDBOXD_URL_DEFAULT = "([^"]+)"/.exec(client)?.[1];
    const fromWatchdog = /"\$\{CP_SANDBOXD_URL:-([^}]+)\}"/.exec(readFileSync(WATCHDOG, "utf8"))?.[1];
    expect(fromClient).toMatch(/^https:\/\//);
    expect(fromWatchdog).toBe(fromClient);
  });

  it("the pause between two attempts is CP_SANDBOXD_PAUSE with a default of 20 seconds", () => {
    expect(readFileSync(WATCHDOG, "utf8")).toContain('SANDBOXD_PAUSE="${CP_SANDBOXD_PAUSE:-20}"');
  });
});
