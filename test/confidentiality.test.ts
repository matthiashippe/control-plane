/**
 * The promise the supply side of this market rests on, attacked rather than described.
 *
 * Two halves, and an agent only hands in real work if both hold. Before the decision, nobody but
 * the buyer and the author may read a submission: `docs/journeys.md` states it as "competitors
 * cannot read each other before the decision" and `src/bounties/store.ts` implements it in
 * `submissionsFor`. After the award, exactly the opposite has to be true and no further: what was
 * handed in from `PUBLICATION_FROM` is published in full, and what was handed in before it, when
 * nothing told an agent its work would be read, stays withheld.
 *
 * `test/bounties.test.ts` proves the happy path of the first half on one route. This file assumes
 * the route is not the only way in. It drives a third address, which is neither the buyer nor an
 * author, over every path that touches a submission, and it sweeps the whole answer body for the
 * text rather than the field it expects to find it in: a leak that arrives in a field nobody
 * thought of is still a leak.
 *
 * The edge cases are here because they are where the two halves stop agreeing: a cancelled bounty
 * and an expired one are decided without an award, so the publication half never fires for them
 * and the confidentiality half has to keep holding forever.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { PUBLICATION_FROM } from "../src/bounties/receipts.js";
import { callTool, createClient, TOOLS } from "../mcp/server.mjs";

/** Distinctive enough that finding it anywhere in a response body is proof and not a coincidence. */
const SECRET_A = "SECRET-DRAFT-ALPHA-7f3c91";
const SECRET_B = "SECRET-DRAFT-BRAVO-2d8e40";

function account(db: ReturnType<typeof openDb>, app: ReturnType<typeof createApp>, balanceMc: number, n: number) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${String(n).repeat(2)}` + "c4".repeat(15);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: `seed-${n}` });
  const call = (path: string, method = "GET", body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", authorization: key },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { address, key, call };
}

/**
 * A buyer, two agents who submitted, and an outsider who is neither.
 *
 * The outsider holds a valid API key of their own: the interesting attacker is not somebody
 * without credentials but the competitor in the next job over, who has every credential the
 * market hands out and none of the rights to this one.
 */
async function market(opts: { deadlineMs?: number } = {}) {
  const db = openDb(":memory:");
  const app = createApp({ db, pay: { payTo: "0x" + "1".repeat(40) } as never, rateLimit: null });
  const buyer = account(db, app, 500_000, 1);
  const alpha = account(db, app, 50_000, 2);
  const bravo = account(db, app, 50_000, 3);
  const outsider = account(db, app, 500_000, 4);

  const posted = await buyer.call("/v1/bounties", "POST", {
    brief: "Write a fact sheet for developers. 90 words. Deliver the paragraph only.",
    kind: "factual",
    price_cents: 150,
    deadline: new Date(Date.now() + (opts.deadlineMs ?? 3_600_000)).toISOString(),
  });
  const { id } = (await posted.json()) as { id: string };

  const subIds: string[] = [];
  for (const [agent, secret] of [[alpha, SECRET_A], [bravo, SECRET_B]] as const) {
    const res = await agent.call("/v1/submissions", "POST", { bounty_id: id, body: `Work from this agent. ${secret}` });
    subIds.push(((await res.json()) as { id: string }).id);
  }
  return { db, app, buyer, alpha, bravo, outsider, id, subIds };
}

/** Every reading path an outsider can walk, with the bounty id they are trying to read. */
function readingPaths(id: string, subId: string): string[] {
  return [
    "/",
    "/bounties.json",
    `/bounties.json?limit=100`,
    "/receipts.json",
    "/receipts.json?limit=100",
    "/llms.txt",
    "/v1/status",
    "/.well-known/x402",
    "/v1/bounties",
    "/v1/bounties?limit=100",
    "/v1/bounties/mine",
    "/v1/submissions/mine",
    "/v1/credits/balance",
    "/v1/credits/history",
    "/v1/credits/pricing",
    "/v1/models",
    "/v1/sandboxes",
    // The parameters a guesser would reach for, on every route that takes one.
    `/v1/submissions?bounty_id=${id}`,
    `/v1/submissions?bounty_id=${id}&agent=all`,
    `/v1/submissions?bounty_id=${id}&limit=100`,
    `/v1/submissions?bounty_id=${id}&id=${subId}`,
    `/v1/submissions?id=${subId}`,
    `/v1/submissions?bounty_id=${id}&bounty_id=${id}`,
    `/v1/bounties/mine?bounty_id=${id}`,
    `/v1/submissions/mine?bounty_id=${id}`,
    `/v1/credits/history?bounty_id=${id}&limit=200`,
    `/bounties.json?bounty_id=${id}`,
    `/receipts.json?bounty_id=${id}&status=open`,
  ];
}

/** The path shapes that could route to a handler while missing the auth middleware's exact match. */
const BYPASS_PATHS = [
  "/v1/submissions/",
  "/V1/submissions",
  "/v1/Submissions",
  "/v1/submissions//",
  "//v1/submissions",
  "/v1/%73ubmissions",
  "/v1/./submissions",
  "/v1/x/../submissions",
  "/v1/submissions%2f",
  "/v1/submissions;",
  "/v1/submissions.",
  "/v1/bounties/../submissions",
  "/v1/briefs/check/../../v1/submissions",
  "/v1/sandboxes/../submissions",
];

describe("before the decision: an outsider cannot read a submission", () => {
  it("hands an outsider nothing on any reading path, with or without a key", async () => {
    const { app, outsider, id, subIds } = await market();
    const leaks: string[] = [];

    for (const path of readingPaths(id, subIds[0])) {
      for (const [who, res] of [
        ["with a key", await outsider.call(path)],
        ["without a key", await app.request(path)],
      ] as const) {
        const text = await res.text();
        if (text.includes(SECRET_A) || text.includes(SECRET_B)) leaks.push(`${path} (${who}, HTTP ${res.status})`);
      }
    }

    expect(leaks, "a submission text reached an address that is neither buyer nor author").toEqual([]);
  });

  it("gives an outsider an empty list on the route built to serve the author", async () => {
    const { outsider, id } = await market();
    const res = await outsider.call(`/v1/submissions?bounty_id=${id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { submissions: unknown[] }).submissions).toEqual([]);
  });

  it("shows an author their own work and never the other one's", async () => {
    const { alpha, id } = await market();
    const body = (await (await alpha.call(`/v1/submissions?bounty_id=${id}`)).json()) as {
      submissions: { body: string }[];
    };
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].body).toContain(SECRET_A);
    expect(JSON.stringify(body)).not.toContain(SECRET_B);
  });

  it("does not open the door to an outsider who submits to the same bounty themselves", async () => {
    const { outsider, id } = await market();
    await outsider.call("/v1/submissions", "POST", { bounty_id: id, body: "An outsider's own attempt." });
    const body = (await (await outsider.call(`/v1/submissions?bounty_id=${id}`)).json()) as {
      submissions: { body: string }[];
    };
    expect(body.submissions, "entering a bounty buys sight of your own row, not of the others").toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(SECRET_A);
  });

  it("refuses an outsider who claims the bounty, and says nothing about its contents while refusing", async () => {
    const { outsider, id, subIds } = await market();
    for (const [path, body] of [
      ["/v1/bounties/award", { bounty_id: id, submission_id: subIds[0] }],
      ["/v1/bounties/cancel", { id }],
    ] as const) {
      const res = await outsider.call(path, "POST", body);
      expect(res.status, `${path} let a stranger act on somebody else's bounty`).toBe(403);
      expect(await res.text()).not.toContain(SECRET_A);
    }
  });

  it("takes no bounty id apart, however it is spelled", async () => {
    const { outsider, id } = await market();
    const injections = [
      "' OR '1'='1",
      `${id}' OR '1'='1`,
      `${id}%' --`,
      `${id}" UNION SELECT id, agent, body, created_at FROM submissions --`,
      "%",
      "_",
    ];
    for (const attempt of injections) {
      const res = await outsider.call(`/v1/submissions?bounty_id=${encodeURIComponent(attempt)}`);
      const text = await res.text();
      expect(text, `bounty_id=${attempt} got through as SQL`).not.toContain(SECRET_A);
      expect([200, 404]).toContain(res.status);
    }
  });

  it("does not let a bounty of your own become a window into somebody else's", async () => {
    const { outsider, subIds } = await market();
    const own = await outsider.call("/v1/bounties", "POST", {
      brief: "A bounty posted only to hold somebody else's submission id.",
      kind: "factual",
      price_cents: 100,
      deadline: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const ownId = ((await own.json()) as { id: string }).id;

    const res = await outsider.call("/v1/bounties/award", "POST", { bounty_id: ownId, submission_id: subIds[0] });
    expect(res.status, "awarding a foreign submission would make it the winner of a public receipt").toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("submission_other_bounty");
    expect(
      (await (await outsider.call(`/v1/submissions?bounty_id=${ownId}`)).text()),
      "and it must not have been pulled into the own bounty either",
    ).not.toContain(SECRET_A);
  });

  it("keeps withheld work withheld on the keyed route after the award as well", async () => {
    const { db, app, buyer, outsider, id, subIds } = await market();
    db.prepare("UPDATE submissions SET created_at = '2026-09-20T10:00:00.000Z' WHERE id = ?").run(subIds[0]);
    await buyer.call("/v1/bounties/award", "POST", { bounty_id: id, submission_id: subIds[1] });

    const receipt = await (await app.request("/receipts.json")).text();
    expect(receipt, "the public record withholds it").not.toContain(SECRET_A);
    expect(
      await (await outsider.call(`/v1/submissions?bounty_id=${id}`)).text(),
      "so the keyed route must not be the way around the withholding",
    ).not.toContain(SECRET_A);
  });

  it("lets no path shape slip past the auth middleware into the submissions handler", async () => {
    const { app, id } = await market();
    const reached: string[] = [];

    for (const path of BYPASS_PATHS) {
      const res = await app.request(`${path}?bounty_id=${id}`);
      const text = await res.text();
      if (text.includes(SECRET_A) || text.includes(SECRET_B)) reached.push(`${path} leaked a submission`);
      // 401 is the middleware doing its job, 404 and 308 are the router refusing the shape. A 200
      // means a handler ran for an unauthenticated caller, whatever it happened to return.
      if (res.status === 200) reached.push(`${path} answered 200 without a key`);
    }

    expect(reached, "a path shape reached a handler the auth middleware did not cover").toEqual([]);
  });

  it("answers no method without a key, not the quiet ones either", async () => {
    const { app, id } = await market();
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const res = await app.request(`/v1/submissions?bounty_id=${id}`, { method });
      expect(await res.text(), `${method} answered a stranger with somebody's work`).not.toContain(SECRET_A);
      expect([401, 404, 405], `${method} was let through`).toContain(res.status);
    }
  });

  it("keeps the six MCP tools inside the same wall", async () => {
    const { app, outsider, id } = await market();
    const fetchImpl = async (url: string, init: Record<string, unknown> = {}) => {
      const u = new URL(url);
      const res = await app.request(u.pathname + u.search, init as RequestInit);
      const text = await res.text();
      return { ok: res.ok, status: res.status, text: async () => text };
    };
    const client = createClient({ baseUrl: "http://market.test", apiKey: outsider.key, fetchImpl });

    const args: Record<string, unknown> = {
      list_open_bounties: { limit: 100 },
      submit_work: { bounty_id: id, body: "An outsider's own attempt." },
      read_my_submission: { bounty_id: id },
      read_my_submissions: { limit: 100 },
      check_submission: { briefing: "b", submission: "s" },
      read_balance: {},
    };
    const leaks: string[] = [];
    for (const tool of TOOLS) {
      const answer = await callTool(client, tool.name, args[tool.name]);
      const text = answer!.content[0].text as string;
      if (text.includes(SECRET_A) || text.includes(SECRET_B)) leaks.push(tool.name);
    }

    expect(leaks, "an MCP tool handed a competitor's draft to an agent host").toEqual([]);
  });
});

describe("edge cases where the two halves stop agreeing", () => {
  it("keeps a cancelled bounty's submissions hidden from everyone but their authors", async () => {
    const { app, buyer, outsider, id, subIds } = await market();
    expect((await buyer.call("/v1/bounties/cancel", "POST", { id })).status).toBe(200);

    const leaks: string[] = [];
    for (const path of readingPaths(id, subIds[0])) {
      for (const res of [await outsider.call(path), await app.request(path)]) {
        const text = await res.text();
        if (text.includes(SECRET_A) || text.includes(SECRET_B)) leaks.push(path);
      }
    }
    expect(leaks, "a bounty taken back is decided without an award, so nothing about it is published").toEqual([]);
  });

  it("keeps an expired bounty's submissions hidden too", async () => {
    const { db, app, outsider, id, subIds } = await market();
    // The deadline cannot be set to the past through the API, so it is moved in the database and
    // the expiry pass is triggered the way any bounty request triggers it.
    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);
    await app.request("/bounties.json");
    expect((db.prepare("SELECT status FROM bounties WHERE id = ?").get(id) as { status: string }).status).toBe("expired");

    const leaks: string[] = [];
    for (const path of readingPaths(id, subIds[0])) {
      for (const res of [await outsider.call(path), await app.request(path)]) {
        const text = await res.text();
        if (text.includes(SECRET_A) || text.includes(SECRET_B)) leaks.push(path);
      }
    }
    expect(leaks, "nobody awarded this, so nobody agreed to publish it either").toEqual([]);
  });

  it("refuses the buyer as their own author, so buyer-equals-author cannot be manufactured", async () => {
    const { buyer, id } = await market();
    const res = await buyer.call("/v1/submissions", "POST", { bounty_id: id, body: `Mine. ${SECRET_A}` });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("own_bounty");
  });

  it("still tells an outsider nothing when buyer and author are the same address", async () => {
    // Not reachable through the API, but a database can carry it from an older build, and the
    // question is what the reading paths do with it rather than how it got there.
    const { db, app, buyer, outsider, id } = await market();
    db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("self-1", id, buyer.address, `The buyer's own entry. ${SECRET_A}`, new Date().toISOString());

    for (const path of readingPaths(id, "self-1")) {
      for (const res of [await outsider.call(path), await app.request(path)]) {
        expect(await res.text(), `${path} leaked with buyer and author being the same address`).not.toContain(SECRET_A);
      }
    }
  });
});

describe("after the award: published is exactly what was handed in under the rule", () => {
  /** Awards the bounty after stamping each submission with the moment it counts as handed in. */
  async function awarded(stamps: string[]) {
    const m = await market();
    for (const [i, at] of stamps.entries()) {
      m.db.prepare("UPDATE submissions SET created_at = ? WHERE id = ?").run(at, m.subIds[i]);
    }
    const res = await m.buyer.call("/v1/bounties/award", "POST", { bounty_id: m.id, submission_id: m.subIds[0] });
    expect(res.status).toBe(200);
    return m;
  }

  const BEFORE = "2026-09-20T23:59:59.999Z";
  const EXACTLY = PUBLICATION_FROM;
  const AFTER = "2026-09-21T09:00:00.000Z";

  it("publishes the work handed in from the cut-off and withholds what came before it", async () => {
    const { app } = await awarded([BEFORE, AFTER]);
    const text = await (await app.request("/receipts.json")).text();
    expect(text, "this one was handed in when nothing said it would be read").not.toContain(SECRET_A);
    expect(text, "this one agreed to the rule by submitting under it").toContain(SECRET_B);
  });

  it("treats the cut-off moment itself as covered by the rule, the way the rule is worded", async () => {
    const { app } = await awarded([EXACTLY, AFTER]);
    const text = await (await app.request("/receipts.json")).text();
    expect(text, '"from PUBLICATION_FROM" includes the instant itself').toContain(SECRET_A);
  });

  it("withholds a millisecond before the cut-off", async () => {
    const { app } = await awarded(["2026-09-21T02:59:59.999Z", AFTER]);
    const text = await (await app.request("/receipts.json")).text();
    expect(text).not.toContain(SECRET_A);
  });

  it("withholds work whose timestamp is before the cut-off in real time, whatever it looks like as a string", async () => {
    // 2026-09-21T04:00:00+05:00 is 2026-09-20T23:00:00Z: two hours before the rule existed. It
    // sorts after the cut-off as text and lies before it in time, and only one of those readings
    // is the promise that was made to the agent who wrote it.
    const { app } = await awarded(["2026-09-21T04:00:00.000+05:00", AFTER]);
    const text = await (await app.request("/receipts.json")).text();
    expect(text, "the rule is about when the work was handed in, not about how the timestamp sorts").not.toContain(SECRET_A);
  });

  it("publishes work whose timestamp is after the cut-off in real time but sorts before it", async () => {
    // 2026-09-20T23:00:00-05:00 is 2026-09-21T04:00:00Z: an hour after the rule took effect.
    const { app } = await awarded(["2026-09-20T23:00:00.000-05:00", AFTER]);
    const text = await (await app.request("/receipts.json")).text();
    expect(text, "withholding work that was covered by the rule understates how many competed openly").toContain(SECRET_A);
  });

  it("withholds anything it cannot date, rather than guessing", async () => {
    const { app } = await awarded(["not a timestamp", AFTER]);
    const body = (await (await app.request("/receipts.json")).json()) as {
      receipts: { competitors: number; entries: { body: string | null; withheld: string | null }[] }[];
    };
    const text = JSON.stringify(body);
    expect(text).not.toContain(SECRET_A);
    expect(body.receipts[0].competitors, "an undatable row is still a competitor and is still counted").toBe(2);
  });

  it("puts no submission text on the landing page, published or not", async () => {
    const { app } = await awarded([AFTER, AFTER]);
    const html = await (await app.request("/")).text();
    expect(html, "the page shows the record of the market, not the work itself").not.toContain(SECRET_A);
    expect(html).not.toContain(SECRET_B);
  });

  it("publishes nothing of a bounty that was never awarded", async () => {
    const m = await market();
    m.db.prepare("UPDATE submissions SET created_at = ?").run("2026-09-22T00:00:00.000Z");
    const text = await (await m.app.request("/receipts.json")).text();
    expect(text, "the rule publishes on the award, and there was none").not.toContain(SECRET_A);
  });
});

describe("the rule an agent reads is the rule the receipt applies", () => {
  /**
   * Every channel that tells an agent when publication starts, against the constant that decides
   * it. Moving `PUBLICATION_FROM` without moving these would publish work whose author agreed to a
   * different date, which is the same taking this file exists to prevent, one step removed.
   */
  const CHANNELS = [
    "skills/cp-bounties/SKILL.md",
    "docs/bounties.md",
    "src/public/index.html",
  ];

  /**
   * The other half of the deal, in every channel that teaches an agent to submit.
   *
   * The cut-off test above guards a promise we keep. This one guards a risk we do not close: a
   * buyer can read every submission and then cancel, keeping the work and getting the money back.
   * That decision is defensible only while every agent is told before it submits, and on
   * 2026-09-21 it was written in the skill and in docs/bounties.md and nowhere else, which left
   * the MCP host, the persona docs/journeys.md calls the larger of the two supply sides, deciding
   * without it. A risk disclosed in one channel out of four is not disclosed.
   */
  const SUBMIT_CHANNELS = [
    "skills/cp-bounties/SKILL.md",
    "docs/bounties.md",
    "mcp/server.mjs",
    "src/app.ts",
  ];

  it("warns about the cancel-after-reading hole everywhere it teaches submitting", async () => {
    const { readFileSync } = await import("node:fs");
    // One exact phrase, not a pattern. The first version of this test looked for `cancel` near
    // `read` and passed with the whole warning deleted from the MCP description, because
    // `cancelled` is also the name of an outcome and `read` is in half the prose. A test that
    // cannot go red is worse than none: it reports a disclosure nobody made. So the four channels
    // carry the same sentence, and rewording it has to be deliberate enough to come here first.
    const WORDING = "keep what they read";
    const silent = SUBMIT_CHANNELS.filter((file) => !readFileSync(file, "utf-8").includes(WORDING));
    expect(silent, "an agent read one of these and submitted without knowing how it can end").toEqual([]);
  });

  it("names the same cut-off everywhere an agent can read one", async () => {
    const { readFileSync } = await import("node:fs");
    const wrong: string[] = [];
    // Only sentences that are about publication: an ISO timestamp elsewhere in these files is an
    // example deadline, and holding those to the rule would make this test fire on prose it has
    // no business reading.
    const instants = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g;
    const aboutPublication = /publish|published|receipts\.json/i;
    // The landing page words the same rule as a day in prose, so that spelling counts as stating
    // it, and it has to move with the constant too.
    const spelledOut = `${Number(PUBLICATION_FROM.slice(8, 10))} September 2026`;

    for (const file of CHANNELS) {
      const text = readFileSync(file, "utf-8");
      const claims = text.split("\n").filter((line) => aboutPublication.test(line));
      for (const found of claims.join("\n").match(instants) ?? []) {
        if (found !== PUBLICATION_FROM) wrong.push(`${file} names ${found}`);
      }
      if (!text.includes(PUBLICATION_FROM) && !text.includes(spelledOut)) {
        wrong.push(`${file} states no cut-off that matches the constant`);
      }
    }
    expect(wrong, "an agent was told one date and the receipt applies another").toEqual([]);
  });

  it("carries the cut-off in the answer an agent gets before it submits", async () => {
    const { app } = await market();
    for (const path of ["/llms.txt", "/receipts.json"]) {
      const text = await (await app.request(path)).text();
      expect(text, `${path} does not say from when work is published`).toContain(PUBLICATION_FROM);
    }
  });
});
