import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { readFileSync } from "node:fs";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { MockProvider } from "../src/inference/mock.js";
import { Catalog, MARKUP } from "../src/inference/proxy.js";

function setup() {
  const db = openDb(":memory:");
  const app = createApp({
    db,
    catalog: new Catalog([new MockProvider()], { "gpt-5.2": "mock-1", "gpt-5-mini": "mock-1" }),
  });
  return { db, app };
}

describe("public page and status", () => {
  it("serves an HTML page at / with the hostname, the setup line and the limits of phase 1", async () => {
    const { app } = setup();
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("cp.hippe.eu");
    expect(html).toContain("conwayApiUrl");
    expect(html).toContain("automaton --provision");
    expect(html).toMatch(/501/); // sandboxes and transfers are named as unavailable
    expect(html).toMatch(/not transferable|not redeemable/i);
    expect(html).not.toMatch(/<script[^>]+src=/i); // no external scripts
    expect(html).not.toMatch(/fonts\.googleapis|googletagmanager|analytics/i);
  });

  it("serves /v1/status without an API key with models, tiers, markup and the automaton count", async () => {
    const { app } = setup();
    const res = await app.request("/v1/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      version: string;
      phase: number;
      markup: number;
      models: { id: string; aliases: string[]; input_per_million: number; output_per_million: number }[];
      topup_tiers_usd: number[];
      automatons: number;
    };
    expect(body.ok).toBe(true);
    expect(body.phase).toBe(1);
    expect(body.markup).toBe(MARKUP);
    // One entry per real model, the runtime IDs stand next to them as aliases.
    expect(body.models).toHaveLength(1);
    expect(body.models[0].id).toBe("mock-1");
    expect(body.models[0].aliases.sort()).toEqual(["gpt-5-mini", "gpt-5.2"]);
    expect(body.models[0].input_per_million).toBeGreaterThan(0);
    expect(body.topup_tiers_usd).toContain(5);
    expect(body.automatons).toBe(0);
  });

  it("counts only automatons in /v1/status that have a payment behind them", async () => {
    // Registration is free and possible as often as you like, and so is an API key. If the endpoint
    // counted every registration, anybody could set the public metric of the service, and with it
    // the measure of the 30 day trial, to any value they liked. In the security review of
    // 19.09.2026 it said 100 there after a short while.
    const { app, db } = setup();
    const count = async () => ((await (await app.request("/v1/status")).json()) as { automatons: number }).automatons;
    const addAutomaton = (id: string, address: string) => {
      db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(
        address,
        new Date().toISOString(),
      );
      db.prepare(
        "INSERT INTO automatons (automaton_id, address, creator_address, name, bio, registered_at) VALUES (?, ?, ?, ?, '', ?)",
      ).run(id, address, "0xdef", "Test", new Date().toISOString());
    };

    addAutomaton("a-1", "0xabc");
    expect(await count(), "a registration without a payment does not count").toBe(0);

    for (let i = 2; i <= 20; i++) addAutomaton(`a-${i}`, "0xabc");
    expect(await count(), "twenty free registrations do not count either").toBe(0);

    postLedger(db, { address: "0xabc", kind: "topup", deltaMc: 500_000, ref: "x402-nonce-1" });
    expect(await count(), "a paying wallet is one, however many automatons it registers").toBe(1);

    addAutomaton("b-1", "0xbbb");
    postLedger(db, { address: "0xbbb", kind: "topup", deltaMc: 500_000, ref: "x402-nonce-2" });
    expect(await count(), "a second paying operator adds to it").toBe(2);
  });

  it("counts a paying wallet without a row in the automatons table too", async () => {
    // The first real customer on 19.09.2026 had pointed an already registered automaton from
    // api.conway.tech at us. The runtime checks its registration flag only at process start and
    // then never sends a register (upstream src/index.ts:249-255). Counted through the automatons
    // table they were invisible, while our own acceptance run filled the number. Whoever pays,
    // counts, with or without a registration.
    const { app, db } = setup();
    const count = async () => ((await (await app.request("/v1/status")).json()) as { automatons: number }).automatons;
    postLedger(db, { address: "0xswitcher", kind: "topup", deltaMc: 500_000, ref: "x402-nonce-3" });
    expect(await count()).toBe(1);
  });

  it("reports separately how many paying wallets actually buy inference", async () => {
    // Paying does not yet mean thinking. The difference between the two numbers is the real
    // question of the service.
    const { app, db } = setup();
    const status = async () => (await (await app.request("/v1/status")).json()) as { automatons: number; active: number };

    postLedger(db, { address: "0xpayer", kind: "topup", deltaMc: 500_000, ref: "n-1" });
    expect(await status()).toMatchObject({ automatons: 1, active: 0 });

    postLedger(db, { address: "0xpayer", kind: "inference", deltaMc: -1_000, ref: "gen-1" });
    expect(await status()).toMatchObject({ automatons: 1, active: 1 });
  });

  it("gives away nothing in /v1/status that identifies a tenant", async () => {
    const { app, db } = setup();
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, ?, ?)").run("0xdeadbeef", 123456, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "0xdeadbeef",
      "hash",
      "cnwy_k_visible",
      "t",
      new Date().toISOString(),
    );
    const text = await (await app.request("/v1/status")).text();
    expect(text).not.toContain("0xdeadbeef");
    expect(text).not.toContain("cnwy_k_");
    expect(text).not.toContain("123456");
    expect(text.toLowerCase()).not.toContain("balance");
  });

  it("otherwise still lets /v1/* through only with an API key and answers unknown paths with a JSON 404", async () => {
    const { app } = setup();
    expect((await app.request("/v1/credits/balance")).status).toBe(401);
    expect((await app.request("/v1/models")).status).toBe(401);
    const missing = await app.request("/does-not-exist");
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as { error: string; message: string; docs: string };
    expect(Object.keys(body).sort()).toEqual(["docs", "error", "message"]);
    expect(body.error).toBe("not_found");
    expect(body.message).toContain("/.well-known/x402");
    expect(body.docs).toContain("docs/errors.md");
  });

  it("names the operator and a way to get in touch on the page", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toMatch(/Matthias Hippe/);
    expect(html).toMatch(/mailto:[^"]+@/);
    expect(html).toContain("github.com/matthiashippe/control-plane");
  });

  it("carries an imprint with a serviceable address (DDG § 5), reachable at /impressum", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toMatch(/id="impressum"/);
    expect(html).toMatch(/Matthias Hippe/);
    expect(html).toMatch(/San-Francisco-Straße 1/);
    expect(html).toMatch(/20457 Hamburg/);
    const redirect = await app.request("/impressum");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/#impressum");
  });

  it("promises no cashing of credits (regulation: no claim to repayment)", async () => {
    const { app } = setup();
    const html = (await (await app.request("/")).text()).toLowerCase();
    expect(html).toContain("not redeemable");
    expect(html).not.toMatch(/refund|pay ?out|cash out|redeem your|withdraw/);
  });

  it("links the free route visibly, so nobody pays who does not have to", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toContain("without-control-plane.md");
    expect(html).toMatch(/you may not need this/i);
  });

  it("serves /.well-known/x402 with endpoints, the payment offer and the free route", async () => {
    const { app } = setup();
    const res = await app.request("/.well-known/x402");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as Record<string, any>;
    expect(doc.x402Version).toBe(1);
    expect(doc.endpoints.topup).toBe("/pay/{usd}/{address}");
    expect(doc.endpoints.inference).toBe("/v1/chat/completions");
    expect(doc.markup).toBe(MARKUP);
    expect(doc.credits).toMatchObject({ redeemable: false, transferable: false });
    expect(doc.free_alternative).toContain("without-control-plane.md");
    expect(JSON.stringify(doc)).not.toMatch(/refund|cash out|withdraw/i);
  });

  it("names the payment offer in /.well-known/x402 as soon as pay is configured", async () => {
    const db = openDb(":memory:");
    const app = createApp({
      db,
      catalog: new Catalog([new MockProvider()], { "gpt-5.2": "mock-1" }),
      pay: {
        payTo: "0x914102284463F4F58B1D2f6DB9aC80BFcaA7d614",
        network: "base",
        chainId: 8453,
        usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        maxTimeoutSeconds: 120,
        tiers: [5, 25],
      },
    });
    const doc = (await (await app.request("/.well-known/x402")).json()) as Record<string, any>;
    expect(doc.accepts).toHaveLength(1);
    expect(doc.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "base",
      chainId: 8453,
      payTo: "0x914102284463F4F58B1D2f6DB9aC80BFcaA7d614",
      amounts_usd: [5, 25],
    });
  });

  it("serves llms.txt as text with the setup line, the tiers and the free route", async () => {
    const { app } = setup();
    const res = await app.request("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const txt = await res.text();
    expect(txt).toContain("# Handsel");
    expect(txt).toContain("conwayApiUrl");
    expect(txt).toContain("cp.hippe.eu");
    expect(txt).toContain("without-control-plane.md");
    expect(txt).toMatch(/not redeemable and not transferable/i);
    expect(txt).not.toMatch(/refund|cash out|withdraw/i);
  });
});

describe("the questions of a sceptic", () => {
  // Whoever arrives here through a GitHub issue is considering sending money in cryptocurrency to
  // a stranger. The answers to that belong where they think about the money, so between the price
  // and the feature overview, not at the end of the page.
  function moneySection(html: string) {
    const from = html.indexOf("<h2>Price</h2>");
    const to = html.indexOf("<h2>What works");
    expect(from, "the Price section is missing").toBeGreaterThan(-1);
    expect(to, "the 'What works, what does not' section is missing or stands before the price").toBeGreaterThan(from);
    return html.slice(from, to);
  }
  const page = async () => await (await setup().app.request("/")).text();

  it("answers at the price what happens to the credit when the service is shut down", async () => {
    // The two weeks of notice used to be only under "Honest limits", far below the tiers.
    const money = moneySection(await page());
    expect(money).toMatch(/shut this down|shutting it down/i);
    expect(money, "the notice period belongs next to the price").toMatch(/at least two weeks/i);
    expect(money, "what happens to the remainder has to be there").toMatch(/is gone/i);
    expect(money).toMatch(/not redeemable for money/i);
  });

  it("promises no money back in the shutdown clause either", async () => {
    // Credits are never redeemable (loop-constraints.md, regulation). A shutdown clause is exactly
    // the place where a well-meant promise of repayment otherwise slips in.
    const html = (await page()).toLowerCase();
    expect(html).not.toMatch(/refund|pay ?out|cash out|redeem your|withdraw|money back|reimburs|compensat/);
    expect(html).toContain("not transferable and not redeemable");
  });

  it("names next to the price who gets the money, and not only in the imprint", async () => {
    const money = moneySection(await page());
    expect(money).toContain("Matthias Hippe");
    expect(money).toMatch(/Hamburg/);
    expect(money, "a pointer to the serviceable address").toContain('href="#impressum"');
    expect(money, "the pointer to the free route belongs here too").toMatch(/href="#free"/);
  });

  it("says in the same place how to get help, without promising a response time", async () => {
    const money = moneySection(await page());
    expect(money).toContain("github.com/matthiashippe/control-plane/issues");
    expect(money).toMatch(/mailto:[^"]+@/);
    expect(money).toContain("docs/errors.md");
    expect(money).toMatch(/no\s+guaranteed response time/i);
    const html = await page();
    expect(html, "no response time, no on-call service").not.toMatch(
      /within \d+\s*(minutes?|hours?|business days?|days?)|24\/7|round the clock/i,
    );
  });

  it("shows with the acceptance run that the unchanged runtime ran against this production", async () => {
    const html = await page();
    expect(html, "the upstream pin, so it is traceable what ran there").toContain("d8f8168");
    expect(html).toMatch(/PROD OK topup=true registered=true turns=5 api_errors=0 ledger_consistent=true/);
    expect(html).toContain("goals/2026-09-19-goal-5b-betrieb.md");
    expect(html, "anybody can repeat the same run without money").toMatch(/pnpm e2e/);
  });

  it("names no transaction as evidence that is not in the goal logs", async () => {
    // A number on the page that cannot be checked in the repo is a claim.
    const fs = await import("node:fs");
    const html = await page();
    const evidence = fs
      .readdirSync(new URL("../goals/", import.meta.url))
      .map((f) => fs.readFileSync(new URL(`../goals/${f}`, import.meta.url), "utf-8"))
      .join("\n");
    const hashes = html.match(/0x[0-9a-f]{64}/g) ?? [];
    expect(hashes.length, "the page should name at least one on-chain receipt").toBeGreaterThan(0);
    for (const h of hashes) expect(evidence, `${h} is in no goal log`).toContain(h);
  });

  it("quantifies at the price what a turn actually cost, from the logged run", async () => {
    const fs = await import("node:fs");
    const log = fs.readFileSync(new URL("../goals/2026-09-19-goal-5a-openrouter.md", import.meta.url), "utf-8");
    const costs = [...log.matchAll(/cost_usd=([0-9.]+) \(Marge|LIVE OK[^\n]*cost_usd=([0-9.]+)/g)]
      .map((m) => Number(m[1] ?? m[2]))
      .filter((n) => n > 0.01);
    expect(costs.length, "the log holds the costs of the five-turn runs").toBeGreaterThanOrEqual(2);

    const money = moneySection(await page());
    for (const purchase of costs) {
      const computed = (purchase * 100 * MARKUP).toFixed(1);
      expect(money, `${computed} cents (purchase ${purchase} USD times ${MARKUP}) is missing from the page`).toContain(computed);
    }
    expect(money, "the purchase price of the first run").toContain((costs[0] * 100).toFixed(1));
    expect(money).toMatch(/cents? per turn/i);
    expect(money, "not a promise but an order of magnitude").toMatch(/order of magnitude/i);
  });

  it("stays sober: no availability promise, no user counts, no marketing vocabulary", async () => {
    const html = await page();
    expect(html).toMatch(/no SLA/);
    expect(html).not.toMatch(/uptime|99\.9|guaranteed availability/i);
    expect(html, "user counts come live from /v1\/status, not from the HTML").not.toMatch(
      /trusted by|thousands of|hundreds of (users|operators|teams)|loved by/i,
    );
    expect(html).not.toMatch(
      /seamless|effortless|revolutionary|cutting.edge|unleash|supercharge|blazing|game.?changer|best.in.class|world.class/i,
    );
  });
});

describe("delivery through Caddy", () => {
  it("keeps the CSP hash in the Caddyfile in sync with the inline script of the page", async () => {
    // The content security policy allows the inline script by sha256 hash instead of
    // 'unsafe-inline'. If somebody changes the script without following up the hash in the
    // Caddyfile, the browser blocks it and the page shows no live numbers any more, without a test
    // firing. That is exactly what this test catches.
    const fs = await import("node:fs");
    const crypto = await import("node:crypto");
    const html = fs.readFileSync(new URL("../src/public/index.html", import.meta.url), "utf-8");
    const caddyfile = fs.readFileSync(new URL("../deploy/Caddyfile", import.meta.url), "utf-8");

    const script = /<script>([\s\S]*?)<\/script>/.exec(html);
    expect(script, "the page has no inline script any more: then the hash can leave the CSP").not.toBeNull();

    const hash = "sha256-" + crypto.createHash("sha256").update(script![1]).digest("base64");
    expect(caddyfile, `the CSP hash in the Caddyfile does not match the script. Expected: ${hash}`).toContain(hash);
  });

  it("caps the size of a request body in the Caddy configuration", async () => {
    const fs = await import("node:fs");
    const caddyfile = fs.readFileSync(new URL("../deploy/Caddyfile", import.meta.url), "utf-8");
    expect(caddyfile).toMatch(/request_body\s*\{[\s\S]*?max_size\s+\d+\s*[KMG]?B/);
  });

  it("sets the security headers a payment-processing service needs", async () => {
    const fs = await import("node:fs");
    const caddyfile = fs.readFileSync(new URL("../deploy/Caddyfile", import.meta.url), "utf-8");
    for (const header of [
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Content-Security-Policy",
    ]) {
      expect(caddyfile, `${header} is missing from the Caddyfile`).toContain(header);
    }
  });
});

describe("favicon", () => {
  it("serves an icon instead of a 404, and the page carries it in the head itself", async () => {
    // Two visitors fetched favicon.ico on 19.09.2026 and got a 404. This costs nothing and looks
    // unfinished otherwise. The data URI in the head saves the request entirely, the route catches
    // clients that ask anyway.
    const { app } = setup();
    const res = await app.request("/favicon.ico");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/svg\+xml/);
    expect((await res.text()).length).toBeGreaterThan(50);

    const html = await (await app.request("/")).text();
    expect(html, "without the data URI every browser asks the route").toMatch(/rel="icon"/);
  });
});

describe("serving nothing that should not be served", () => {
  it("answers typical scan paths with a 404 and no content", async () => {
    // On 20.09.2026 a scanner ran 261 known paths against the service (.env, .git/config, variants
    // of those), all 404. That was expected, because the app reads exactly one file, the landing
    // page, and reads it once on start (src/app.ts, loadIndexHtml). This test pins that down: if a
    // static file server is ever added, it shows up here.
    const { app } = setup();
    const paths = [
      "/.env",
      "/.env.production",
      "/.git/config",
      "/config.json",
      "/package.json",
      "/deploy/.env",
      "/src/app.ts",
      "/data/cp.db",
      "/admin",
      "/../package.json",
      "/public/../../package.json",
    ];
    for (const path of paths) {
      const res = await app.request(path);
      expect(res.status, `${path} must serve nothing`).toBe(404);
      const text = await res.text();
      expect(text, `${path} gives away content`).not.toMatch(/(dependencies|BEGIN |cnwy_k_|sk-|PRIVATE KEY|CP_)/);
      expect(text.length, `${path} answers too verbosely`).toBeLessThan(600);
    }
  });
});

/**
 * What a shared URL gives away. The article and the Reddit posts put the address into threads, and
 * without these tags Reddit, Discord, Slack and Hacker News show the bare address. Whoever does not
 * know it then does not click.
 */
describe("preview and findability", () => {
  it("serves robots.txt instead of a 404", async () => {
    const db = openDb(":memory:");
    const res = await createApp({ db }).request("/robots.txt");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/User-agent: \*/);
    expect(text, "nothing may be blocked by accident").not.toMatch(/Disallow: \/\s*$/m);
  });

  it("carries the title, the description and the address for the preview", async () => {
    const db = openDb(":memory:");
    const html = await (await createApp({ db }).request("/")).text();
    for (const field of ["og:title", "og:description", "og:url", "og:type", "twitter:card"]) {
      expect(html, `${field} is missing`).toMatch(new RegExp(field));
    }
    expect(html).toMatch(/rel="canonical" href="https:\/\/cp\.hippe\.eu\/"/);
    // The description has to say what this is a replacement for, otherwise the preview is empty.
    expect(html).toMatch(/og:description" content="Post the job and the price/);
  });

  it("uses no em dash in the copy", async () => {
    const db = openDb(":memory:");
    const html = await (await createApp({ db }).request("/")).text();
    // Only the text a visitor reads. The inline script stays out: its characters are code, and a
    // change to them invalidates the CSP hash in the Caddyfile.
    const copy = html.replace(/<script[\s\S]*?<\/script>/g, "");
    const hits = copy.match(/[\u2013\u2014]/g) ?? [];
    expect(hits, `em dashes in the copy: ${hits.length}`).toEqual([]);
  });
});

/**
 * The picture a link unfurls into.
 *
 * Twelve issue answers and an article all carry this address, and without this the unfurl in
 * Slack, Discord, Reddit or X is the bare URL. It is a file in `src/public`, which the image
 * build copies wholesale (`harness/cp/Dockerfile`: `cp -r src/public dist/public`), so the way
 * this breaks is silently: the route simply stops existing and nobody notices until a link looks
 * bare somewhere nobody is watching.
 */
describe("the link preview", () => {
  it("serves the card and names it with an absolute URL", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });

    const res = await app.request("/og.png");
    expect(res.status, "the card is missing from src/public or was not copied into the image").toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length, "an empty file unfurls as nothing at all").toBeGreaterThan(10_000);
    // A PNG and not something renamed: the eight-byte signature.
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const html = await (await app.request("/")).text();
    // Relative URLs are ignored by most unfurlers, so the absolute one is the whole point.
    expect(html).toContain('property="og:image" content="https://cp.hippe.eu/og.png"');
    expect(html).toContain('name="twitter:image" content="https://cp.hippe.eu/og.png"');
    expect(html, "summary shows a thumbnail, summary_large_image shows the card").toContain("summary_large_image");
    expect(html, "an alt text is what a screen reader and a bad connection get").toMatch(/og:image:alt/);
  });
});

describe("the market measurement is on the page", () => {
  /**
   * Read from the dataset, not written down here a second time.
   *
   * These four numbers were hardcoded in this test until 2026-09-21, which meant the page and the
   * data it cites could drift apart and the test would keep passing as long as the page did not
   * change. It nearly happened the same day: a fresh scan moved the totals, and the only thing
   * that caught the stale page was a string comparison against numbers that were themselves
   * stale. Now the summary beside the raw CSV is the single source, so a new scan either updates
   * both or fails here.
   */
  const measured = JSON.parse(
    readFileSync(new URL("../docs/research/data/2026-09-21-x402-kennzahlen.json", import.meta.url), "utf-8"),
  ) as {
    distinct_services: number;
    providers: number;
    with_demand_data: number;
    services_with_20_or_more_payers: number;
    largest_service: { share_percent: number };
  };
  const grouped = (n: number) => n.toLocaleString("en-US");

  it("names the scope and the core numbers the dataset actually holds", async () => {
    const db = openDb(":memory:");
    const html = await (await createApp({ db }).request("/")).text();

    expect(html).toContain(`${grouped(measured.distinct_services)} distinct services`);
    expect(html).toContain(`${grouped(measured.providers)} providers`);
    // "133 of 20,783" would be wrong: only the entries carrying demand data were measured.
    expect(html).toContain(`${grouped(measured.with_demand_data)} of them`);
    expect(html).toContain(`${grouped(measured.services_with_20_or_more_payers)} of those have twenty or more`);
    // The concentration, and the warning that goes with it. A number this large from one endpoint
    // is worthless without the sentence saying the directory published it a day late.
    expect(html).toContain(`${measured.largest_service.share_percent} percent of all calls`);
    expect(html, "a floor is not a count and the page has to say which it is").toMatch(/floor and not a count/);
    expect(html, "without a link to the raw data it is a claim").toMatch(/docs\/research\/data/);
  });
});

/**
 * Your own bookings. The page promises that every call is a ledger row with purchase price and
 * margin; without this endpoint the promise was unprovable. And a customer for whom nothing happens
 * after the payment can tell here whether their money did not arrive or their runtime does not
 * think. That is exactly the case we had on 19.09.2026.
 */
describe("GET /v1/credits/history", () => {
  function withKey() {
    const db = openDb(":memory:");
    const address = "0x0629a6851234567890123456789012345678488e".toLowerCase();
    const key = "cnwy_k_test_history";
    // The wallet has to exist before a key points at it. Created directly instead of through
    // postLedger, otherwise a zero booking stands in every history this test checks.
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(
      address,
      new Date().toISOString(),
    );
    db.prepare(
      "INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(address, hashApiKey(key), key.slice(0, 12), "test", new Date().toISOString());
    return { db, address, key, app: createApp({ db }) };
  }

  it("requires a key", async () => {
    const { app } = withKey();
    expect((await app.request("/v1/credits/history")).status).toBe(401);
  });

  // The case this endpoint was built for, answered in words since 2026-09-21. The only paying
  // stranger this service has had sat at exactly this state for 33 hours: five dollars in, no
  // automaton registered, not one inference call, and no request from their runtime since access
  // logging began. A list of one booking told them nothing about any of it.
  describe("paid, and nothing has happened since", () => {
    const history = async (app: ReturnType<typeof createApp>, key: string) =>
      (await (await app.request("/v1/credits/history", { headers: { authorization: key } })).json()) as {
        idle_credit?: { inference_calls: number; automaton_registered: boolean; message: string };
      };

    it("names the missing registration when there is none", async () => {
      const { db, app, address, key } = withKey();
      postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: "tx" });

      const body = await history(app, key);

      expect(body.idle_credit, "the one place a stuck customer looks has to answer them").toBeTruthy();
      expect(body.idle_credit!.inference_calls).toBe(0);
      expect(body.idle_credit!.automaton_registered).toBe(false);
      expect(body.idle_credit!.message).toContain("never got past POST /v1/automatons/register");
      // The cause this service cannot see, and the one nobody writes down.
      expect(body.idle_credit!.message).toContain("bypass this control plane");
    });

    it("says so differently when the runtime did reach us and register", async () => {
      const { db, app, address, key } = withKey();
      postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: "tx" });
      db.prepare(
        "INSERT INTO automatons (automaton_id, address, creator_address, name, registered_at) VALUES (?, ?, ?, ?, ?)",
      ).run("a-1", address, address, "Theirs", new Date().toISOString());

      const body = await history(app, key);

      expect(body.idle_credit!.automaton_registered).toBe(true);
      expect(body.idle_credit!.message).toContain("provisioning worked");
      expect(body.idle_credit!.message, "a registration does not explain the silence on its own").toContain("bypass this control plane");
    });

    it("says nothing at all to somebody whose credit is being spent", async () => {
      const { db, app, address, key } = withKey();
      postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: "tx" });
      postLedger(db, { address, kind: "inference", deltaMc: -500, ref: "call-1", meta: { model: "m" } });

      const body = await history(app, key);

      expect(body.idle_credit, "an explanation nobody needs is noise in a machine-read answer").toBeUndefined();
    });

    it("says nothing to somebody who never paid", async () => {
      const { app, key } = withKey();
      expect((await history(app, key)).idle_credit).toBeUndefined();
    });
  });

  it("shows topup and inference with the purchase price and the margin", async () => {
    const { db, address, key, app } = withKey();
    postLedger(db, { address, kind: "topup", deltaMc: 501_000, ref: "0xabc", meta: { tx_hash: "0xdeadbeef" } });
    postLedger(db, {
      address,
      kind: "inference",
      deltaMc: -1557,
      ref: "call-1",
      meta: { model: "openai/gpt-5.2", cost_usd: 0.0119735, margin_mc: 359, usage: { total_tokens: 12591 } },
    });
    const res = await app.request("/v1/credits/history", { headers: { Authorization: key } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      balance_cents: number;
      entries: { kind: string; cents: number; model?: string; purchase_usd?: number; margin_cents?: number; tx_hash?: string }[];
    };
    expect(body.balance_cents).toBe(499);
    expect(body.entries).toHaveLength(2);
    // Newest first: the inference, then the topup.
    expect(body.entries[0].kind).toBe("inference");
    expect(body.entries[0].model).toBe("openai/gpt-5.2");
    expect(body.entries[0].purchase_usd).toBe(0.0119735);
    expect(body.entries[1].kind).toBe("topup");
    expect(body.entries[1].tx_hash).toBe("0xdeadbeef");
  });

  it("shows only your own address, even when somebody else paid", async () => {
    const { db, address, key, app } = withKey();
    const other = "0x1111111111111111111111111111111111111111";
    postLedger(db, { address, kind: "topup", deltaMc: 1000, ref: "own", meta: {} });
    postLedger(db, { address: other, kind: "topup", deltaMc: 999_000, ref: "other", meta: {} });
    const body = (await (await app.request("/v1/credits/history", { headers: { Authorization: key } })).json()) as {
      entries: { cents: number }[];
    };
    expect(body.entries, "somebody else's booking must not appear here").toHaveLength(1);
    expect(body.entries[0].cents).toBe(1);
  });

  it("answers the silent customer's question: credit present, list empty", async () => {
    const { db, address, key, app } = withKey();
    postLedger(db, { address, kind: "topup", deltaMc: 501_000, ref: "0xabc", meta: {} });
    const body = (await (await app.request("/v1/credits/history", { headers: { Authorization: key } })).json()) as {
      balance_cents: number;
      entries: { kind: string }[];
    };
    expect(body.balance_cents).toBe(501);
    expect(body.entries.filter((e) => e.kind === "inference"), "not a single inference call").toHaveLength(0);
  });

  it("names the endpoint that really exists in the setup", async () => {
    const db = openDb(":memory:");
    const html = await (await createApp({ db }).request("/")).text();
    expect(html).toMatch(/v1\/credits\/history/);
    // /v1/credits/transfers is a POST and answers 501. Instructions for it would lead nowhere.
    expect(html, "the page must not recommend an endpoint that does not exist as a GET").not.toMatch(
      /curl[^\n]*v1\/credits\/transfers/,
    );
  });

  it("names the credit endpoints in both self-descriptions", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const doc = (await (await app.request("/.well-known/x402")).json()) as {
      endpoints: Record<string, string>;
    };
    expect(doc.endpoints.history, "a machine does not find the endpoint otherwise").toBe("/v1/credits/history");
    expect(doc.endpoints.balance).toBe("/v1/credits/balance");
    const txt = await (await app.request("/llms.txt")).text();
    expect(txt).toMatch(/v1\/credits\/history/);
  });
});

describe("whoever knows only /v1/status gets on from there", () => {
  it("names the origin, the endpoint list, the setup and the free route", async () => {
    const db = openDb(":memory:");
    const res = await createApp({ db }).request("/v1/status", {
      headers: { host: "cp.hippe.eu", "x-forwarded-proto": "https" },
    });
    const body = (await res.json()) as { docs?: Record<string, string> };
    expect(body.docs, "without it the endpoint is a dead end").toBeTruthy();
    expect(body.docs?.service).toBe("https://cp.hippe.eu");
    expect(body.docs?.endpoints).toBe("/.well-known/x402");
    expect(body.docs?.setup).toMatch(/conwayApiUrl/);
    // The free route belongs here too, not only on the page they have not read.
    expect(body.docs?.free_alternative).toMatch(/without-control-plane/);
  });

  it("stays machine readable: the existing fields do not change", async () => {
    const db = openDb(":memory:");
    const body = (await (await createApp({ db }).request("/v1/status")).json()) as Record<string, unknown>;
    for (const field of ["ok", "version", "markup", "models", "topup_tiers_usd", "automatons", "active"]) {
      expect(body, `${field} is missing`).toHaveProperty(field);
    }
  });
});

describe("The market leads, not the billing layer", () => {
  // Both of these pinned the old single-column layout by its headings. The page was rebuilt on
  // 2026-09-21 and the markers moved; the rules they encode did not, so they are restated against
  // the new markup rather than deleted. What must stay true: the live market comes before the
  // billing story, and the name and the positioning sentence are both on the page.
  it("shows the live market before it explains the billing layer", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    const market = html.indexOf('id="market"');
    const conway = html.indexOf("what killed Conway");
    expect(market, "the market section is missing").toBeGreaterThan(-1);
    expect(conway, "the section about Conway is missing").toBeGreaterThan(-1);
    // Swapping the two turns this red, and that is the point: the order is the positioning.
    expect(market, "a market you have to scroll for is a claim").toBeLessThan(conway);
  });

  it("carries the name and the positioning sentence where a first-time reader lands", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toMatch(/<title>Handsel/);
    // The name is the brand in the bar now, not the first heading: the first heading is what the
    // service does, which is what a stranger needs in the first two seconds.
    expect(html).toMatch(/class="brand"[\s\S]{0,400}Handsel/);
    expect(html).toMatch(/<h1[^>]*>[\s\S]*?Pay only the best/);
    expect(html).toContain("Post the job and the price. Agents deliver finished work. You pay only the best.");
    const hero = html.indexOf("Post the job and the price.");
    const fold = html.indexOf('id="market"');
    expect(hero, "the sentence has to stand above the market, not below it").toBeLessThan(fold);
  });
});

describe("A base URL that already carries a path", () => {
  it("redirects the joined path to the real one instead of refusing it", async () => {
    const { app } = setup();
    for (const [wrong, right] of [
      ["/v1/status/v1/models", "/v1/models"],
      ["/v1/auth/verify/v1/models", "/v1/models"],
      ["/v1/status/v1/credits/balance", "/v1/credits/balance"],
    ] as const) {
      const res = await app.request(wrong, { method: "GET" });
      expect(res.status, wrong).toBe(308);
      expect(res.headers.get("location"), wrong).toBe(right);
    }
  });

  it("keeps the query string, because the runtime puts a limit there", async () => {
    const { app } = setup();
    const res = await app.request("/v1/status/v1/credits/history?limit=5", { method: "GET" });
    expect(res.headers.get("location")).toBe("/v1/credits/history?limit=5");
  });

  it("does not open a way past the key: the redirect target is still protected", async () => {
    const { app } = setup();
    const redirected = await app.request("/v1/status/v1/credits/balance", { method: "GET" });
    const target = redirected.headers.get("location")!;
    // The counter-check that matters. A rewrite that answered in place would have skipped the auth
    // middleware; a redirect sends the client back through the front door.
    const followed = await app.request(target, { method: "GET" });
    expect(followed.status, "the real path still demands a key").toBe(401);
  });

  it("still refuses a path that is merely unknown, with the explanation", async () => {
    const { app } = setup();
    const res = await app.request("/v1/nonsense", { method: "GET" });
    expect(res.status, "only a doubled /v1/ is a joined base URL").toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("not_found");
  });
});
