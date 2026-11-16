import "./yield-between-tests";
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { resolveApiKey } from "../src/auth/siwe.js";
import { agentMintsToday, crawlerMintsToday, isDeclaredCrawler, KEYLESS_CRAWLER_NAME } from "../src/auth/keyless.js";
import { mintAgentIdentity } from "../src/auth/keyless.js";

/**
 * A declared crawler must not empty the keyless door for everybody else.
 *
 * From 2026-11-11 on one crawler that names itself in its user agent took all 200 keyless places a
 * day over changing addresses, and runtimes arriving later got 429 `daily_limit`. A declared crawler
 * now counts against its own small cap under the key name `crawler`, and every other caller keeps
 * the 200. Addresses come from the documentation ranges and change per crawler request, like the
 * real one, so the per-address rate limit stays on and is not what is tested here.
 */
const CRAWLER_UA = "ExampleCrawler/1.0 (+https://crawler.example/about)";
const REPO = join(__dirname, "..");

const setup = () => {
  const db = openDb(":memory:");
  return { db, app: createApp({ db }) };
};

function mint(a: ReturnType<typeof createApp>, userAgent: string, address: string) {
  return a.request("/v1/auth/keyless", {
    method: "POST",
    headers: { "user-agent": userAgent, "x-forwarded-for": address },
  });
}

/** A different documentation address for every crawler request, like the rotating egress pool. */
const crawlerAddress = (i: number) => `198.51.100.${(i % 250) + 1}`;

afterEach(() => {
  delete process.env.CP_AGENT_MINTS_PER_DAY;
  delete process.env.CP_CRAWLER_MINTS_PER_DAY;
});

describe("a declared crawler has its own cap at the keyless door", () => {
  it("a runtime still gets a key after a crawler took the whole day", async () => {
    process.env.CP_CRAWLER_MINTS_PER_DAY = "200";
    const { db, app } = setup();
    for (let i = 0; i < 200; i++) {
      const res = await mint(app, CRAWLER_UA, crawlerAddress(i));
      expect(res.status, `crawler request ${i + 1}`).toBe(201);
    }
    const res = await mint(app, "node", "192.0.2.50");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string; address: string };
    expect(resolveApiKey(db, body.key)).toBe(body.address);
  });

  it("a declared crawler stops at its own small daily cap", async () => {
    const { app } = setup();
    for (let i = 0; i < 5; i++) {
      const res = await mint(app, CRAWLER_UA, crawlerAddress(i));
      expect(res.status, `crawler request ${i + 1}`).toBe(201);
    }
    const sixth = await mint(app, CRAWLER_UA, crawlerAddress(5));
    expect(sixth.status).toBe(429);
    const body = (await sixth.json()) as { error: string; message: string };
    expect(body.error).toBe("crawler_daily_limit");
    expect(body.message).toMatch(/crawler/i);
    expect(body.message).toMatch(/midnight UTC/);
    expect(body.message).toContain("/v1/auth/nonce");
    const runtime = await mint(app, "node", "192.0.2.50");
    expect(runtime.status).toBe(201);
  });

  it("crawler keys do not count against the places of everybody else", async () => {
    const { db, app } = setup();
    for (let i = 0; i < 5; i++) {
      const res = await mint(app, CRAWLER_UA, crawlerAddress(i));
      expect(res.status).toBe(201);
      const body = (await res.json()) as { keys_left_today: number };
      expect(body.keys_left_today, "the crawler is told its own cap, not the 200").toBe(4 - i);
    }
    expect(agentMintsToday(db)).toBe(0);
    expect(crawlerMintsToday(db)).toBe(5);
    const names = db.prepare("SELECT DISTINCT name FROM api_keys").all() as { name: string }[];
    expect(names.map((r) => r.name)).toEqual([KEYLESS_CRAWLER_NAME]);
    expect(KEYLESS_CRAWLER_NAME).toBe("crawler");
  });

  it("CP_CRAWLER_MINTS_PER_DAY overrides the crawler cap", async () => {
    process.env.CP_CRAWLER_MINTS_PER_DAY = "2";
    const { app } = setup();
    expect((await mint(app, CRAWLER_UA, crawlerAddress(0))).status).toBe(201);
    expect((await mint(app, CRAWLER_UA, crawlerAddress(1))).status).toBe(201);
    const third = await mint(app, CRAWLER_UA, crawlerAddress(2));
    expect(third.status).toBe(429);
    expect(((await third.json()) as { error: string }).error).toBe("crawler_daily_limit");
  });
});

describe("keys_left_today counts the places that are really left", () => {
  const leftOf = async (res: Response) => ((await res.json()) as { keys_left_today: number }).keys_left_today;

  it("keys_left_today counts down a declared crawler's own places", async () => {
    const { app } = setup();
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await mint(app, CRAWLER_UA, crawlerAddress(i));
      expect(res.status, `crawler request ${i + 1}`).toBe(201);
      seen.push(await leftOf(res));
    }
    expect(seen).toEqual([4, 3, 2, 1, 0]);
    const sixth = await mint(app, CRAWLER_UA, crawlerAddress(5));
    expect(sixth.status).toBe(429);
    const body = (await sixth.json()) as Record<string, unknown>;
    expect(body.error).toBe("crawler_daily_limit");
    expect(body).not.toHaveProperty("keys_left_today");
  });

  it("keys_left_today counts down the places of everybody else", async () => {
    const { app } = setup();
    for (let i = 0; i < 3; i++) expect((await mint(app, CRAWLER_UA, crawlerAddress(i))).status).toBe(201);
    const first = await mint(app, "node", "192.0.2.50");
    expect(first.status).toBe(201);
    expect(await leftOf(first)).toBe(199);
    const second = await mint(app, "node", "192.0.2.51");
    expect(second.status).toBe(201);
    expect(await leftOf(second)).toBe(198);
    const crawler = await mint(app, CRAWLER_UA, crawlerAddress(3));
    expect(crawler.status).toBe(201);
    expect(await leftOf(crawler)).toBe(1);
  });

  it("keys_left_today follows the caps set by the environment", async () => {
    process.env.CP_AGENT_MINTS_PER_DAY = "3";
    process.env.CP_CRAWLER_MINTS_PER_DAY = "2";
    const { app } = setup();
    const agents: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await mint(app, "node", `192.0.2.${60 + i}`);
      expect(res.status, `agent request ${i + 1}`).toBe(201);
      agents.push(await leftOf(res));
    }
    expect(agents).toEqual([2, 1, 0]);
    const fourth = await mint(app, "node", "192.0.2.63");
    expect(fourth.status).toBe(429);
    expect(((await fourth.json()) as { error: string }).error).toBe("daily_limit");
    const crawlers: number[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await mint(app, CRAWLER_UA, crawlerAddress(i));
      expect(res.status, `crawler request ${i + 1}`).toBe(201);
      crawlers.push(await leftOf(res));
    }
    expect(crawlers).toEqual([1, 0]);
  });

  it("keys_left_today refills at midnight UTC", () => {
    const db = openDb(":memory:");
    const late = Date.parse("2026-11-16T23:59:00Z");
    const early = Date.parse("2026-11-17T00:01:00Z");
    expect(mintAgentIdentity(db, late, CRAWLER_UA).keysLeftToday).toBe(4);
    expect(mintAgentIdentity(db, late, CRAWLER_UA).keysLeftToday).toBe(3);
    expect(mintAgentIdentity(db, late).keysLeftToday).toBe(199);
    expect(mintAgentIdentity(db, early, CRAWLER_UA).keysLeftToday).toBe(4);
    expect(mintAgentIdentity(db, early).keysLeftToday).toBe(199);
  });
});

const CRAWLERS = [
  CRAWLER_UA,
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "ExampleIndexer/2 https://indexer.example",
];
const NOT_CRAWLERS = [
  "node",
  "node/22.11.0",
  "undici",
  "python-requests/2.31",
  "ExampleBot/1.0",
  "Mozilla/5.0 (X11; Linux x86_64) https://example.com",
  "",
];

describe("one rule for what a declared crawler is", () => {
  it("a user agent is a declared crawler only with a link and a crawler word", () => {
    for (const ua of CRAWLERS) expect(isDeclaredCrawler(ua), ua).toBe(true);
    for (const ua of NOT_CRAWLERS) expect(isDeclaredCrawler(ua), JSON.stringify(ua)).toBe(false);
    expect(isDeclaredCrawler(undefined)).toBe(false);
  });

  it("the tool and the server classify user agents the same way", () => {
    const list = [...CRAWLERS, ...NOT_CRAWLERS];
    const r = spawnSync("bash", [join(REPO, "ops", "keyless-mints.sh"), "--classify"], {
      cwd: REPO,
      input: `${list.join("\n")}\n`,
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(r.status, r.stderr).toBe(0);
    const kinds = r.stdout.split("\n").slice(0, -1);
    expect(kinds).toHaveLength(list.length);
    list.forEach((ua, i) => {
      expect(kinds[i] === "crawler", JSON.stringify(ua)).toBe(isDeclaredCrawler(ua));
    });
  });
});
