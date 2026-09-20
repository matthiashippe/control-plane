import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { Catalog } from "../src/inference/proxy.js";
import { MOCK_MODEL } from "../src/inference/mock.js";
import type { ChatProvider } from "../src/inference/provider.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { verifyFindings, messages, normalise } from "../src/check/fabrication.js";

const SUBMISSION =
  "Marina Promenade, Dubai Marina. Two bedrooms, 1,240 sqft on the 11th floor. " +
  "Service charge is AED 18 per sqft per year, which comes to AED 22,320 a year. " +
  "Viewings available on short notice.";

/** A provider that returns exactly the answer the test needs. */
function answering(content: string): ChatProvider {
  return {
    id: "stub",
    models: () => [{ ...MOCK_MODEL, id: "stub-1", provider: "stub" }],
    chat: async () => ({
      id: "chatcmpl-stub",
      object: "chat.completion",
      created: 0,
      model: "stub-1",
      choices: [{ index: 0, message: { role: "assistant" as const, content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }),
  };
}

function setup(content: string, balanceMc = 500_000) {
  const db = openDb(":memory:");
  const app = createApp({ db, catalog: new Catalog([answering(content)]) });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "cd".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, ?, ?)").run(address, 0, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: "seed" });
  const check = (body: unknown, withKey = true) =>
    app.request("/v1/check", {
      method: "POST",
      headers: { "content-type": "application/json", ...(withKey ? { authorization: key } : {}) },
      body: JSON.stringify(body),
    });
  const balance = () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
  return { db, app, check, balance };
}

const FINDING = { quote: "Viewings available on short notice.", kind: "unsupported", reason: "Not in the briefing." };

describe("quote verification", () => {
  it("aligns typographic characters, otherwise a correct finding falls through", () => {
    expect(normalise("AED 18‑per’sqft")).toBe("aed 18-per'sqft");
  });

  it("keeps a finding whose quote is in the submission verbatim", () => {
    const { findings, discarded } = verifyFindings(SUBMISSION, { findings: [FINDING] });
    expect(findings).toHaveLength(1);
    expect(discarded).toBe(0);
  });

  it("discards a fabricated finding, because that one accuses an honest text", () => {
    const invented = { ...FINDING, quote: "Free parking for all visitors." };
    const { findings, discarded } = verifyFindings(SUBMISSION, { findings: [invented] });
    expect(findings).toHaveLength(0);
    expect(discarded).toBe(1);
  });

  it("finds a quote again even with different quotation marks and hyphens", () => {
    const different = { ...FINDING, quote: "Service charge is AED 18 per sqft per year" };
    expect(verifyFindings(SUBMISSION, { findings: [different] }).findings).toHaveLength(1);
  });

  it("discards findings without a quote or with an unknown kind", () => {
    const raw = { findings: [{ kind: "unsupported", reason: "x" }, { ...FINDING, kind: "taste" }] };
    const { findings, discarded } = verifyFindings(SUBMISSION, raw);
    expect(findings).toHaveLength(0);
    expect(discarded).toBe(2);
  });

  it("tolerates an answer without a findings list", () => {
    expect(verifyFindings(SUBMISSION, { whatever: 1 })).toEqual({ findings: [], discarded: 0 });
  });

  it("sends different instructions for factual and creative", () => {
    const f = messages("b", "e", "factual")[0].content;
    const s = messages("b", "e", "creative")[0].content;
    expect(f).not.toBe(s);
    expect(s).toContain("would the client have a problem");
    expect(f).toContain("Do the multiplication yourself");
  });
});

describe("POST /v1/check", () => {
  it("returns verified findings and bills like any other inference", async () => {
    const { check, balance } = setup(JSON.stringify({ findings: [FINDING] }));
    const before = balance();
    const res = await check({ briefing: "A listing brief.", submission: SUBMISSION });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; findings: unknown[]; discarded: number };
    expect(body.kind).toBe("factual");
    expect(body.findings).toHaveLength(1);
    expect(body.discarded).toBe(0);
    expect(balance(), "the call is billed").toBeLessThan(before);
  });

  it("does not hand out a fabricated finding but counts it as discarded", async () => {
    const invented = { ...FINDING, quote: "Includes a private beach." };
    const { check } = setup(JSON.stringify({ findings: [invented] }));
    const res = await check({ briefing: "A listing brief.", submission: SUBMISSION });
    const body = (await res.json()) as { findings: unknown[]; discarded: number };
    expect(body.findings).toHaveLength(0);
    expect(body.discarded).toBe(1);
  });

  it("accepts kind=creative", async () => {
    const { check } = setup(JSON.stringify({ findings: [] }));
    const res = await check({ briefing: "b", submission: "e", kind: "creative" });
    expect(((await res.json()) as { kind: string }).kind).toBe("creative");
  });

  it("requires briefing and submission", async () => {
    const { check } = setup(JSON.stringify({ findings: [] }));
    const res = await check({ submission: "only this" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("caps the length, otherwise one call buys a whole context window", async () => {
    const { check, balance } = setup(JSON.stringify({ findings: [] }));
    const before = balance();
    const res = await check({ briefing: "b", submission: "x".repeat(20_001) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("too_long");
    expect(balance(), "rejected means not billed").toBe(before);
  });

  it("does not hide it when the model returns no JSON", async () => {
    const { check } = setup("Sorry, I cannot do that.");
    const res = await check({ briefing: "b", submission: "e" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("unparseable_answer");
  });

  it("needs an API key", async () => {
    const { check } = setup(JSON.stringify({ findings: [] }));
    const res = await check({ briefing: "b", submission: "e" }, false);
    expect(res.status).toBe(401);
  });
});
