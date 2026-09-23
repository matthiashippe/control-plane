import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { POOL_MC } from "../src/credits/starter.js";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const BRIEF =
  "FACT SHEET on the energy certificate for a 1974 apartment block with six flats and gas " +
  "heating, for a landlord ordering one for the first time. 400 words. Deliver the text only.";

function fresh() {
  const db = openDb(":memory:");
  return { db, app: createApp({ db }) };
}

function post(app: ReturnType<typeof createApp>, body: Record<string, string>, headers = {}) {
  return app.request("/start", {
    method: "POST",
    headers: { accept: BROWSER, "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body),
  });
}

const keyIn = (html: string) => html.match(/cnwy_k_[0-9a-f]{32}/)?.[0];

describe("a stranger posts a job with no wallet, no signature and no money", () => {
  it("puts the brief on the board and hands back the one key that opens it", async () => {
    const { db, app } = fresh();
    const res = await post(app, { brief: BRIEF, kind: "factual" });
    expect(res.status).toBe(201);
    const html = await res.text();
    const key = keyIn(html);
    expect(key, "the key has to be on the page, it exists nowhere else").toBeTruthy();

    const row = db.prepare("SELECT id, creator, price_mc, status FROM bounties").get() as {
      id: string;
      creator: string;
      price_mc: number;
      status: string;
    };
    expect(row.status).toBe("open");
    expect(row.creator.startsWith("key:"), "the creator is a keyless handle").toBe(true);
    expect(row.price_mc).toBe(50_000);
    expect(html).toContain(row.id);

    // The key is not decoration: it is the way back to the job.
    const seen = await app.request(`/v1/submissions?bounty_id=${row.id}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    expect(seen.status).toBe(200);

    // And every curl line the page prints is a route that exists, checked by calling it rather
    // than by reading it. A result page that teaches a made-up endpoint is worse than none.
    for (const m of html.matchAll(/https:\/\/[^\s'<]+\/v1\/[^\s'<]*/g)) {
      const path = m[0].slice(m[0].indexOf("/v1/"));
      const method = html.slice(0, m.index).lastIndexOf("-X POST") > html.slice(0, m.index).lastIndexOf("curl -s ") ? "POST" : "GET";
      const res = await app.request(path.replace(/&amp;/g, "&"), {
        method,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: method === "POST" ? JSON.stringify({ bounty_id: row.id, submission_id: "nope" }) : undefined,
      });
      // An invented path answers {"error":"not_found"} with a 404, and so would a real route
      // asked about a thing that is not there. The code is what tells them apart, so that is what
      // is checked rather than the status.
      const body = (await res.json()) as { error?: string };
      expect(body.error, `${method} ${path} is not a route on this service`).not.toBe("not_found");
    }

    // And the board shows it to everybody, which is the point of posting it.
    const board = await (await app.request("/jobs")).text();
    expect(board).toContain("1974 apartment block");
  });

  it("pays for it out of the pool and charges the person nothing", async () => {
    const { db, app } = fresh();
    await post(app, { brief: BRIEF });
    const grant = db.prepare("SELECT address, delta_mc FROM ledger WHERE kind = 'grant'").get() as
      | { address: string; delta_mc: number }
      | undefined;
    expect(grant?.delta_mc).toBe(50_000);
    expect(grant?.address.startsWith("key:")).toBe(true);
    const topups = db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = 'topup'").get() as {
      n: number;
    };
    expect(topups.n, "nothing was paid in, which is the whole claim").toBe(0);
  });

  it("refuses a form post from somebody else's page", async () => {
    const { db, app } = fresh();
    const res = await post(app, { brief: BRIEF }, { origin: "https://example.invalid" });
    expect(res.status).toBe(403);
    expect(db.prepare("SELECT count(*) AS n FROM bounties").get()).toEqual({ n: 0 });
  });

  it("sends an empty draft back to the check instead of posting nothing", async () => {
    const { db, app } = fresh();
    const res = await post(app, { brief: "   " });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/check");
    expect(db.prepare("SELECT count(*) AS n FROM wallets").get()).toEqual({ n: 0 });
  });
});

describe("free identities do not make a free pool", () => {
  // The Goal's third condition, measured the way it is stated: ten attempts, at most the day's
  // budget handed out.
  it("hands out the day's budget and no more, however many identities are minted", async () => {
    const { db, app } = fresh();
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) codes.push((await post(app, { brief: `${BRIEF} Run ${i}.` })).status);
    expect(codes.filter((s) => s === 201), "three fifty-cent jobs fit in a day").toHaveLength(3);
    expect(codes.filter((s) => s === 503), "the rest are refused, not served").toHaveLength(7);

    const out = db
      .prepare("SELECT coalesce(sum(delta_mc), 0) AS total FROM ledger WHERE kind = 'grant'")
      .get() as { total: number };
    expect(out.total).toBe(150_000);
  });

  it("mints no wallet for a request it is going to refuse", async () => {
    const { db, app } = fresh();
    for (let i = 0; i < 4; i++) await post(app, { brief: `${BRIEF} Run ${i}.` });
    const wallets = db.prepare("SELECT count(*) AS n FROM wallets").get() as { n: number };
    // Three jobs, three handles. A fourth handle would be a row nobody can reach, holding a key
    // nobody was ever shown.
    expect(wallets.n).toBe(3);
  });

  it("says why, in words, instead of failing like a broken page", async () => {
    const { app } = fresh();
    await post(app, { brief: BRIEF });
    await post(app, { brief: `${BRIEF} Two.` });
    await post(app, { brief: `${BRIEF} Three.` });
    const res = await post(app, { brief: `${BRIEF} Four.` });
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toMatch(/midnight UTC/i);
    expect(html, "the thing that is still free has to be named").toContain('href="/check"');
    expect(html, "a refusal must not be indexed").toMatch(/noindex/);
    expect(keyIn(html), "no key is handed out with a refusal").toBeUndefined();
  });

  it("stops when the pool itself is gone, not only the day's share", async () => {
    const { db, app } = fresh();
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(
      "key:" + "b".repeat(40),
      new Date().toISOString(),
    );
    db.prepare(
      "INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?, 'grant', ?, 'drain', ?)",
    ).run("key:" + "b".repeat(40), POOL_MC, new Date(Date.now() - 36 * 3600 * 1000).toISOString());
    const res = await post(app, { brief: BRIEF });
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/does not refill/i);
  });
});
