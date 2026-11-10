// check: the merge gate of the loop and the one required check on dev (.github/workflows/check.yml, job check; loop.yaml check).
// First the rules (checkRules), then the build (tsc over src/) and every unit test (vitest over test/**/*.test.ts, so it grows with
// each goal without anyone changing this script). Without network (a dead proxy for every child, loopback excluded), without keys
// (OPENROUTER*, ANTHROPIC*, STRIPE*, CP_STRIPE*, CP_ALERT*, CP_SETTLER_KEY, CP_DEPLOY*, GH_TOKEN, GITHUB_TOKEN are dropped), hard stop
// after LIMIT_S. The E2E harness needs Docker and the network; it runs in the job e2e of check.yml and before every rollout in
// deploy.yml, never here.
// The rules hold what loop-constraints.md says about a public repository and the product, before any code of a goal runs:
//  - no Anthropic API and no Anthropic key in the product (src/, deploy/, harness/cp/, mcp/, skills/, package.json), and no Claude or
//    Anthropic model in the inference selection (src/ and deploy/ outside comment lines: a model id `anthropic/...` or `claude-...`);
//  - no secret in any tracked file: OpenRouter keys, Stripe live and webhook keys, GitHub tokens, private key blocks, an ntfy topic;
//  - nothing about the purchasing terms of OpenRouter in any tracked file (loop-constraints.md, Öffentliches Repo);
//  - every package in pnpm-lock.yaml from the npm registry (a tarball or git source runs foreign code at install time).
// On the deny list (gate.yaml): a goal that bends this script cannot bend the gate.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Measured 10.11.2026 on code-host: build 18 s, 94 test files in 102 s; the job may run 15 minutes.
const LIMIT_S = 600, started = Date.now(), DEAD = "http://127.0.0.1:9", LOOPBACK = "127.0.0.1,localhost,::1";
const DROP = /^(OPENROUTER|ANTHROPIC|STRIPE|CP_STRIPE|CP_ALERT|CP_SETTLER_KEY|CP_DEPLOY|GH_TOKEN|GITHUB_TOKEN)/;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !DROP.test(k)));
Object.assign(env, { NODE_ENV: "test", HTTP_PROXY: DEAD, HTTPS_PROXY: DEAD, http_proxy: DEAD, https_proxy: DEAD, NO_PROXY: LOOPBACK, no_proxy: LOOPBACK, CI: "1" });
// One machine for the whole check: its own text is the only file the scans leave out, because it spells the patterns.
const SELF = path.join("scripts", "check.mjs");

const left = () => Math.max(1, LIMIT_S - Math.floor((Date.now() - started) / 1000));
function step(name, cmd, args) {
  console.log(`\n== ${name}: ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, env, stdio: "inherit", timeout: left() * 1000, killSignal: "SIGKILL" });
  if (r.error?.code === "ETIMEDOUT" || r.signal) { console.error(`check: ${name} nach ${LIMIT_S} s abgebrochen`); process.exit(1); }
  if (r.status !== 0) { console.error(`check: ${name} rot (Exit ${r.status ?? r.error?.message})`); process.exit(r.status || 1); }
}

// Tracked files, from git when there is a checkout, else a walk without the usual build and state folders.
const SKIP = new Set(["node_modules", ".git", "dist", ".scratch", "coverage"]);
function walk(rel = "") {
  const out = [];
  for (const e of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const p = path.join(rel, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) out.push(...walk(p)); } else out.push(p);
  }
  return out;
}
function trackedFiles() {
  const r = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  const list = r.status === 0 ? r.stdout.split("\0").filter(Boolean) : walk();
  return list.filter((f) => f !== SELF && existsSync(path.join(ROOT, f)) && statSync(path.join(ROOT, f)).isFile()).sort();
}
const read = (f) => { const b = readFileSync(path.join(ROOT, f)); return b.includes(0) ? "" : b.toString("utf8"); };
const under = (f, dirs) => dirs.some((d) => f === d || f.startsWith(`${d}/`));

// ---- the matchers, pure and exported for the self-test below

// Spelled in pieces, so this file never carries what it looks for.
const KEY = ["ANTHROPIC", "API", "KEY"].join("_"), HOST = ["api", "anthropic", "com"].join("."), SDK = ["@anthropic", "ai/"].join("-");
/** Lines of a product file that reach the Anthropic API. */
export const anthropicHits = (text) => text.split("\n").map((l, i) => [l, i + 1]).filter(([l]) => l.includes(KEY) || l.includes(HOST) || l.includes(SDK)).map(([, n]) => n);

const COMMENT = /^\s*(\/\/|\*|\/\*|#|<!--)/;
const MODEL = new RegExp(["anthropic\\/", "\\bclaude-(?:\\d|opus|sonnet|haiku|instant|v\\d)"].join("|"), "i");
/** Lines outside comments that name a Claude or Anthropic model. */
export const modelHits = (text) => text.split("\n").map((l, i) => [l, i + 1]).filter(([l]) => !COMMENT.test(l) && MODEL.test(l)).map(([, n]) => n);

const SECRETS = [
  ["OpenRouter-Schlüssel", new RegExp(["sk-or-v1-", "[0-9a-f]{20,}"].join(""))],
  ["Stripe-Live-Schlüssel", new RegExp(["\\b[sr]k_", "live_[0-9A-Za-z]{24,}"].join(""))],
  ["Stripe-Webhook-Geheimnis", new RegExp(["\\bwhsec_", "[0-9A-Za-z]{24,}"].join(""))],
  ["GitHub-Token", new RegExp(["\\bgh[pousr]_", "[0-9A-Za-z]{36,}"].join(""))],
  ["privater Schlüssel", new RegExp(["-----BEGIN [A-Z ]*PRIV", "ATE KEY-----"].join(""))],
  ["ntfy-Thema", new RegExp(["ntfy\\.sh/", "[0-9A-Za-z_-]{8,}"].join(""))],
];
/** [what, line] for every secret in a text. */
export const secretHits = (text) => text.split("\n").flatMap((l, i) => SECRETS.filter(([, re]) => re.test(l)).map(([what]) => [what, i + 1]));

const TERMS = new RegExp([
  "openrouter['\\u2019]?s?\\s+(?:terms|tos|nutzungsbedingungen|agb)",
  "(?:terms|tos|nutzungsbedingungen|agb)\\s+(?:of|von|der|bei)\\s+openrouter",
  "reselling\\s+api\\s+access",
  ["sperr", "risiko"].join(""),
].join("|"), "i");
/** Lines about the purchasing terms of OpenRouter. */
export const termsHits = (text) => text.split("\n").map((l, i) => [l, i + 1]).filter(([l]) => TERMS.test(l)).map(([, n]) => n);

/** Lines of pnpm-lock.yaml with a source other than the npm registry. */
export const lockHits = (text) => text.split("\n").map((l, i) => [l, i + 1]).filter(([l]) => /\b(tarball|repo|commit):\s|type:\s*git\b|codeload\.github\.com|git\+(ssh|https?):/.test(l)).map(([, n]) => n);

// ---- the rules

const PRODUCT = ["src", "deploy", "harness/cp", "mcp", "skills"];
const SELECTION = ["src", "deploy"];
const isTest = (f) => /(^|\/)test\//.test(f) || /\.test\.[cm]?[jt]s$/.test(f);
function checkRules() {
  console.log("\n== Regeln: keine Anthropic-API, kein Claude-Modell, keine Secrets, nichts zu den Bedingungen von OpenRouter, Pakete nur aus der Registry");
  const wrong = [], files = trackedFiles();
  for (const f of files) {
    const t = read(f);
    if (!t) continue;
    if ((under(f, PRODUCT) || f === "package.json") && !isTest(f)) for (const n of anthropicHits(t)) wrong.push(`${f}:${n}: keine Anthropic-API und kein Anthropic-Schlüssel im Produkt`);
    if (under(f, SELECTION) && !isTest(f)) for (const n of modelHits(t)) wrong.push(`${f}:${n}: kein Claude- oder Anthropic-Modell in der Inferenz-Auswahl`);
    for (const [what, n] of secretHits(t)) wrong.push(`${f}:${n}: ${what} im öffentlichen Repo`);
    for (const n of termsHits(t)) wrong.push(`${f}:${n}: zu OpenRouter steht im Repo nur Matthias' Entscheidung und der Notschalter`);
  }
  if (existsSync(path.join(ROOT, "pnpm-lock.yaml"))) for (const n of lockHits(read("pnpm-lock.yaml"))) wrong.push(`pnpm-lock.yaml:${n}: Paket nicht aus der npm-Registry`);
  else wrong.push("pnpm-lock.yaml fehlt");
  if (wrong.length) { console.error(`check: Regeln rot:\n${wrong.map((w) => `  ${w}`).join("\n")}`); process.exit(1); }
  console.log(`check: Regeln grün über ${files.length} Dateien`);
}

// ---- self-test of the matchers: planted cases that must trip and look-alikes that must not (loop-constraints.md, Messwerkzeug)

function selfTest() {
  const fails = [], must = (name, hits, want) => { if ((hits.length > 0) !== want) fails.push(`${name}: ${want ? "nicht erkannt" : "fälschlich erkannt"}`); };
  must("Schlüssel im Code", anthropicHits(`const k = process.env.${KEY};`), true);
  must("API-Host", anthropicHits(`fetch("https://${HOST}/v1/messages")`), true);
  must("SDK", anthropicHits(`import x from "${SDK}sdk";`), true);
  must("Anthropic als Wort im Kommentar", anthropicHits("// openai, anthropic and ollama bypass this control plane"), false);
  must("Modell in der Auswahl", modelHits(`export const MODELS = ["openai/gpt-5.2", "${["anthropic", "claude-sonnet-5"].join("/")}"];`), true);
  must("Claude-Modell als Alias", modelHits(`  "gpt-5.2": "${["claude", "opus-5"].join("-")}",`), true);
  must("Modell nur im Kommentar", modelHits(` * CP_MODEL_ALIASES="gpt-5.2=${["claude", "sonnet-5"].join("-")}"`), false);
  must("ClaudeBot als Crawler", modelHits('const CRAWLERS = ["ClaudeBot", "Claude-User", "GPTBot"];'), false);
  must("OpenRouter-Schlüssel", secretHits(`OPENROUTER_API_KEY=${["sk-or-v1-", "0123456789abcdef0123456789abcdef"].join("")}`), true);
  must("Platzhalter im Env-Beispiel", secretHits(`OPENROUTER_API_KEY=${["sk-or", "v1-..."].join("-")}`), false);
  must("Stripe-Live-Schlüssel", secretHits(["sk_", "live_", "51ABCdefGHIjklMNOpqrSTUvwxYZ0123"].join("")), true);
  must("Stripe-Platzhalter", secretHits(["const LIVE_KEY = \"sk_", "live_selftestplaceholder\";"].join("")), false);
  must("ntfy-Thema", secretHits(`CP_ALERT_WEBHOOK=https://${["ntfy.sh", "cp-alarm-x7f3k9q2"].join("/")}`), true);
  must("ntfy-Platzhalter", secretHits(`CP_ALERT_WEBHOOK=https://${["ntfy.sh", "<random-topic>"].join("/")}`), false);
  must("privater Schlüssel", secretHits(["-----BEGIN OPENSSH PRIV", "ATE KEY-----"].join("")), true);
  must("Bedingungen von OpenRouter", termsHits(["OpenRouter's", "terms forbid it"].join(" ")), true);
  must("Nutzungsbedingungen", termsHits(["die Nutzungsbedingungen", "von OpenRouter"].join(" ")), true);
  must("Einkauf über OpenRouter", termsHits("Inference is bought from OpenRouter and sold at cost times 1.3."), false);
  must("Paket aus git", lockHits("    resolution: {type: git, repo: https://github.com/x/y, commit: abc}"), true);
  must("Paket als Tarball", lockHits("    resolution: {tarball: https://example.com/x.tgz}"), true);
  must("Paket aus der Registry", lockHits("    resolution: {integrity: sha512-abc}"), false);
  if (fails.length) { console.error(`check: Selbsttest der Regeln rot:\n${fails.map((f) => `  ${f}`).join("\n")}`); process.exit(1); }
}

selfTest();
checkRules();
step("Build", "pnpm", ["-s", "build"]);
// Patience, not a threshold: on a loaded code-host a test that spawns node took 11 to 16 s (10.11.2026, load average 170 on 16 cores)
// against vitest's default of 5 s, and the worker RPC timed out with 16 workers. No test asserts its own duration through these.
step("Unit-Tests", "pnpm", ["-s", "test", "--testTimeout=60000", "--hookTimeout=60000", "--maxWorkers=6"]);
console.log(`\ncheck: grün in ${Math.round((Date.now() - started) / 1000)} s`);
