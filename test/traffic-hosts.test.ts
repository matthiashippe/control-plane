import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/traffic.sh after the move to automatonhost.com (kunden 04).
 *
 * On 2026-11-19 the script stopped right after its header: postyourprice.com/sitemap.xml answers 301, `curl -s`
 * without -L prints nothing, the grep in the CP_PAGES assignment exits 1 and `set -euo pipefail` ends the run.
 * These cases run the real script with a planted log (CP_TRAFFIC_LOG), a fixed clock (CP_NOW) and a directory first
 * on PATH that holds a fake `ssh` (exit 255) and a fake `curl` answering like production did that day: the old hosts
 * empty without -L, the sitemap with -L and on automatonhost.com, everything empty with CP_FAKE_SITEMAP=empty.
 * No network, no port, documentation addresses only.
 */
const REPO = join(__dirname, "..");
// TRAFFIC_UNDER_TEST points the cases at another copy of the script (with ops/ beside it), so each case can be shown
// red against a script that lacks what it tests.
const SCRIPT = process.env.TRAFFIC_UNDER_TEST ?? join(REPO, "ops/traffic.sh");
const FIXTURE = join(REPO, "ops/fixtures/traffic-three-hosts.log");
// 2026-11-20T12:00:00Z
const NOW = "1795176000";

const FAKE_CURL = `#!/bin/sh
follow=0
url=""
for a in "$@"; do
  case "$a" in
    --location) follow=1 ;;
    --*) ;;
    -*L*) follow=1 ;;
    http://*|https://*) url="$a" ;;
  esac
done
[ "$CP_FAKE_SITEMAP" = "empty" ] && exit 0
sitemap() {
  printf '<?xml version="1.0" encoding="UTF-8"?>\\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\\n'
  for p in "" katalog check fix post; do printf '  <url><loc>https://automatonhost.com/%s</loc></url>\\n' "$p"; done
  printf '</urlset>\\n'
}
case "$url" in
  https://automatonhost.com/sitemap.xml) sitemap ;;
  https://postyourprice.com/sitemap.xml|https://cp.hippe.eu/sitemap.xml) [ "$follow" = 1 ] && sitemap ;;
esac
exit 0
`;

type Run = { status: number | null; stdout: string; stderr: string };

function run(args: string[], env: Record<string, string> = {}, log = FIXTURE): Run {
  const root = mkdtempSync(join(tmpdir(), "traffic-hosts-"));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "ssh"), "#!/bin/sh\nexit 255\n");
    writeFileSync(join(bin, "curl"), FAKE_CURL);
    chmodSync(join(bin, "ssh"), 0o755);
    chmodSync(join(bin, "curl"), 0o755);
    const base: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && k !== "CP_PAGES" && k !== "CP_URL" && k !== "CP_OWN_HOSTS" && k !== "CP_FAKE_SITEMAP") base[k] = v;
    }
    const r = spawnSync("bash", [SCRIPT, ...args], {
      env: {
        ...base,
        PATH: `${bin}:/usr/bin:${process.env.PATH ?? ""}`,
        HOME: root,
        CP_OWN_IPS_SEEN: join(root, "seen.txt"),
        CP_SSH_KEY: join(root, "no-key"),
        CP_TRAFFIC_LOG: log,
        CP_NOW: NOW,
        ...env,
      },
      encoding: "utf8",
      timeout: 60_000,
    });
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The lines of the arrivals block, from its heading to the blank line after it. */
function block(stdout: string): string[] {
  const lines = stdout.split("\n");
  const start = lines.indexOf("-- Arrivals per host --");
  if (start < 0) return [];
  const end = lines.indexOf("", start);
  return lines.slice(start, end < 0 ? undefined : end);
}

const logDirs: string[] = [];
afterAll(() => {
  for (const d of logDirs) rmSync(d, { recursive: true, force: true });
});

/** A log holding only the lines of the given addresses, optionally rewritten. */
function only(ips: string[], rewrite: (line: string) => string = (l) => l): string {
  const dir = mkdtempSync(join(tmpdir(), "traffic-hosts-log-"));
  logDirs.push(dir);
  const path = join(dir, "access.log");
  const lines = readFileSync(FIXTURE, "utf8")
    .split("\n")
    .filter((l) => l.trim() && ips.includes(JSON.parse(l).request.remote_ip))
    .map(rewrite);
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

const EXPECTED = [
  "-- Arrivals per host --",
  "   6 foreign arrival(s) in the last 168 hours",
  "   automatonhost.com: 3 foreign arrival(s)",
  "      1  (none)",
  "      1  (our page)",
  "      1  www.google.com",
  "   postyourprice.com: 1 foreign arrival(s)",
  "      1  github.com",
  "   cp.hippe.eu: 1 foreign arrival(s)",
  "      1  (none)",
  "   other hosts: 1 foreign arrival(s)",
];

const ADDRESS = /([0-9]{1,3}\.){3}[0-9]{1,3}|[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){3,}/;

describe("ops/traffic.sh arrivals per host", () => {
  it("follows a sitemap redirect from postyourprice.com and runs through without CP_URL", () => {
    const r = run(["168"]);
    expect(r.stderr).not.toMatch(/fewer than five pages/);
    expect(r.stderr).not.toMatch(/did not parse/);
    // A sitemap read in full is not mentioned at all; an empty one would be.
    expect(r.stderr).not.toMatch(/sitemap/);
    expect(r.stdout).toMatch(/^Requests to automatonhost\.com in the last 168 hours$/m);
    expect(block(r.stdout)).toEqual(EXPECTED);
    expect(r.status).toBe(0);
  }, 90_000);

  it("runs through with the postyourprice url as CP_URL, whose sitemap answers 301", () => {
    const r = run(["168"], { CP_URL: "https://postyourprice.com" });
    expect(r.stderr).not.toMatch(/fewer than five pages/);
    expect(r.stderr).not.toMatch(/did not parse/);
    // A sitemap read in full is not mentioned at all; an empty one would be.
    expect(r.stderr).not.toMatch(/sitemap/);
    expect(block(r.stdout)).toEqual(EXPECTED);
    expect(r.status).toBe(0);
  }, 90_000);

  it("reports an empty sitemap on stderr and still runs through", () => {
    const r = run(["168"], { CP_FAKE_SITEMAP: "empty" });
    expect(r.stderr).toMatch(/sitemap/);
    expect(block(r.stdout)).toEqual(EXPECTED);
    expect(r.status).toBe(0);
  }, 90_000);

  it("counts the fixture per host exactly, in the full report and in --funnel", () => {
    expect(block(run(["168"]).stdout)).toEqual(EXPECTED);
    const funnel = run(["--funnel", "168"]);
    expect(block(funnel.stdout)).toEqual(EXPECTED);
    // The block sits between the header and the funnel heading.
    const at = funnel.stdout.indexOf("-- Arrivals per host --");
    expect(at).toBeGreaterThan(funnel.stdout.indexOf("Requests to "));
    expect(at).toBeLessThan(funnel.stdout.indexOf("-- Who of them behaved like a person, over the whole log --"));
  }, 90_000);

  it("files an address once, under the host and referrer of its first request", () => {
    const lines = block(run(["168"], {}, only(["192.0.2.43"])).stdout);
    expect(lines).toEqual([
      "-- Arrivals per host --",
      "   1 foreign arrival(s) in the last 168 hours",
      "   automatonhost.com: 0 foreign arrival(s)",
      "   postyourprice.com: 1 foreign arrival(s)",
      "      1  github.com",
      "   cp.hippe.eu: 0 foreign arrival(s)",
      "   other hosts: 0 foreign arrival(s)",
    ]);
  }, 90_000);

  it("never counts our own checker", () => {
    const lines = block(run(["168"], {}, only(["192.0.2.46"])).stdout);
    expect(lines[1]).toBe("   0 foreign arrival(s) in the last 168 hours");
    // The same address without our checker user agent is a stranger: the filter, not the log, made the zero.
    const stranger = only(["192.0.2.46"], (l) => l.replace("control-plane-check/1.0", "Mozilla/5.0 (X11; Linux x86_64)"));
    const counted = block(run(["168"], {}, stranger).stdout);
    expect(counted[1]).toBe("   1 foreign arrival(s) in the last 168 hours");
    expect(counted).toContain("   automatonhost.com: 1 foreign arrival(s)");
  }, 90_000);

  it("names a referrer from our page as (our page), whichever of our hosts it is", () => {
    const lines = block(run(["168"], {}, only(["192.0.2.45"])).stdout);
    expect(lines).toContain("   automatonhost.com: 1 foreign arrival(s)");
    expect(lines).toContain("      1  (our page)");
    expect(lines.join("\n")).not.toMatch(/postyourprice\.com$/m);
    // automatonhost.com itself is one of ours by default.
    const canonical = only(["192.0.2.45"], (l) => l.replace("https://postyourprice.com/", "https://automatonhost.com/"));
    expect(block(run(["168"], {}, canonical).stdout)).toContain("      1  (our page)");
  }, 90_000);

  it("leaves out an address whose first request lies before the window", () => {
    const log = only(["192.0.2.47"]);
    expect(block(run(["168"], {}, log).stdout)[1]).toBe("   0 foreign arrival(s) in the last 168 hours");
    // With a window reaching back past its first request it arrives, so the zero above is the window.
    const wide = block(run(["201"], {}, log).stdout);
    expect(wide[1]).toBe("   1 foreign arrival(s) in the last 201 hours");
    expect(wide).toContain("   automatonhost.com: 1 foreign arrival(s)");
  }, 90_000);

  it("counts any other host under other hosts and never shows a referrer as an address", () => {
    const lines = block(run(["168"], {}, only(["192.0.2.48"])).stdout);
    expect(lines).toEqual([
      "-- Arrivals per host --",
      "   1 foreign arrival(s) in the last 168 hours",
      "   automatonhost.com: 0 foreign arrival(s)",
      "   postyourprice.com: 0 foreign arrival(s)",
      "   cp.hippe.eu: 0 foreign arrival(s)",
      "   other hosts: 1 foreign arrival(s)",
    ]);
    // The same referrer under one of our hosts is listed, and as (address), not as the address.
    const ours = only(["192.0.2.48"], (l) => l.replace('"vysyon.hippe.eu"', '"automatonhost.com:443"'));
    const listed = block(run(["168"], {}, ours).stdout);
    expect(listed).toContain("   automatonhost.com: 1 foreign arrival(s)");
    expect(listed).toContain("      1  (address)");
    expect(listed.join("\n")).not.toMatch(ADDRESS);
  }, 90_000);

  it("prints no address on any line of the block", () => {
    const lines = block(run(["168"]).stdout);
    expect(lines.length).toBe(EXPECTED.length);
    for (const l of lines) expect(l).not.toMatch(ADDRESS);
  }, 90_000);

  it("still passes its selftest", () => {
    const r = run(["--selftest"]);
    expect(r.stdout).toMatch(/SELFTEST OK/);
    expect(r.status).toBe(0);
  }, 180_000);
});
