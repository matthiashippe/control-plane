/**
 * The brief review, and the counter-check that keeps it honest.
 *
 * A lint over somebody's writing is worth nothing the moment it cries wolf. So the first test here
 * is not that it finds things: it is that the two briefs actually running on the live market, both
 * written for this service, produce no findings at all. They are in `test/fixtures/real-briefs.json`
 * exactly as `/bounties.json` served them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { reviewBrief } from "../src/bounties/brief.js";
import { BRIEF_MAX } from "../src/bounties/store.js";

const REAL = JSON.parse(readFileSync(new URL("./fixtures/real-briefs.json", import.meta.url), "utf-8")) as Record<string, string>;

const GOOD =
  "Write a product description for a coworking space in Dubai Marina, aimed at freelancers " +
  "deciding where to rent a desk. 120 words maximum. Do not use the word premium. Deliver the " +
  "finished text only.";

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "cd".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: "seed" });
  const check = (body: unknown) =>
    app.request("/v1/briefs/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const post = (body: unknown) =>
    app.request("/v1/bounties", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify(body),
    });
  return { db, app, check, post };
}

const inAnHour = () => new Date(Date.now() + 3600e3).toISOString();

describe("reviewBrief", () => {
  it("finds nothing wrong with the briefs running on the live market", () => {
    expect(Object.keys(REAL).length, "the fixture has to hold both live briefs").toBe(2);
    for (const [name, brief] of Object.entries(REAL)) {
      const kind = name.startsWith("creative") ? "creative" : "factual";
      expect(reviewBrief(brief, kind as "factual" | "creative"), `${name} is a brief we wrote ourselves`).toEqual([]);
    }
    expect(reviewBrief(GOOD, "creative")).toEqual([]);
  });

  it("names every piece a one-line brief is missing", () => {
    const thin = reviewBrief("Write me a description for my apartment listing in Dubai.", "creative");
    expect(thin.map((f) => f.id).sort()).toEqual(["no_deliverable", "no_length", "no_reader", "nothing_ruled_out", "too_short"]);
    // Each finding has to say what it costs, otherwise it is a scolding and not advice.
    for (const f of thin) expect(f.costs.length, f.id).toBeGreaterThan(60);
  });

  it("says something different about a missing ban on factual and on creative work", () => {
    const brief = "A fact sheet for developers. The reader is deciding whether to use it. 90 words. Deliver the paragraph only.";
    const factual = reviewBrief(brief, "factual").find((f) => f.id === "nothing_ruled_out");
    const creative = reviewBrief(brief, "creative").find((f) => f.id === "nothing_ruled_out");
    expect(factual?.costs).toContain("checked against this brief");
    expect(creative?.costs).toContain("came back clean");
  });

  it("reads a length limit written in words as well as in digits", () => {
    const ids = (t: string) => reviewBrief(t, "creative").map((f) => f.id);
    expect(ids(`${GOOD.replace("120 words maximum", "three paragraphs")}`)).not.toContain("no_length");
    expect(ids(`${GOOD.replace("120 words maximum", "keep it snappy")}`)).toContain("no_length");
  });
});

describe("POST /v1/briefs/check", () => {
  it("answers without any key, because a key is the wall this step is meant to avoid", async () => {
    const { check } = setup();
    const res = await check({ brief: GOOD, kind: "creative" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; words: number; findings: unknown[]; note: string };
    expect(body.kind).toBe("creative");
    expect(body.words).toBeGreaterThan(20);
    expect(body.findings).toEqual([]);
    expect(body.note, "a clean brief is not a good brief, and saying so is the honest part").toContain("not that it is good");
  });

  it("asks for the draft when none was sent, instead of reviewing an empty string", async () => {
    const { check } = setup();
    for (const body of [{}, { brief: "   " }, { brief: 7 }]) {
      const res = await check(body);
      expect(res.status).toBe(400);
      expect((await res.json() as { error: string }).error).toBe("brief_required");
    }
  });

  it("tells a browser that opened the documented path which method it wants", async () => {
    const { app } = setup();
    // llms.txt and docs/bounties.md name this path, so somebody will open it in a browser. Without
    // the guard that GET is a bare 404 and the path we advertised looks like it does not exist.
    // Found on 2026-09-21 by ops/check-journeys.sh, which reads a 404 as the document lying.
    const res = await app.request("/v1/briefs/check");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("method_not_allowed");
    expect(body.message, "the answer has to carry the next step, not just the refusal").toContain("no API key is needed");
  });

  it("refuses a draft longer than a brief may be, so a keyless path cannot be fed a megabyte", async () => {
    const { check } = setup();
    const res = await check({ brief: "x ".repeat(BRIEF_MAX) });
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("brief_too_long");
  });
});

describe("The review that comes back with a posted bounty", () => {
  it("rides along with the receipt and does not block posting", async () => {
    const { post } = setup();
    const res = await post({ brief: "Write something about Dubai.", kind: "creative", price_cents: 20, deadline: inAnHour() });

    expect(res.status, "advice is not a gate: it is their money and their trade").toBe(201);
    const body = (await res.json()) as { id: string; brief_review: { id: string }[] };
    expect(body.id).toBeTruthy();
    expect(body.brief_review.map((f) => f.id)).toContain("too_short");
  });

  it("comes back empty for a brief that says everything, so a good buyer is never nagged", async () => {
    const { post } = setup();
    const res = await post({ brief: GOOD, kind: "creative", price_cents: 20, deadline: inAnHour() });
    const body = (await res.json()) as { brief_review: unknown[] };
    expect(body.brief_review).toEqual([]);
  });
});
