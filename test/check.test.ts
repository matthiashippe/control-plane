import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { Catalog } from "../src/inference/proxy.js";
import { MOCK_MODEL } from "../src/inference/mock.js";
import type { ChatProvider } from "../src/inference/provider.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { befundePruefen, nachrichten, normalisieren } from "../src/check/erfindung.js";

const EINREICHUNG =
  "Marina Promenade, Dubai Marina. Two bedrooms, 1,240 sqft on the 11th floor. " +
  "Service charge is AED 18 per sqft per year, which comes to AED 22,320 a year. " +
  "Viewings available on short notice.";

/** Provider, der genau die Antwort liefert, die der Test braucht. */
function antwortet(inhalt: string): ChatProvider {
  return {
    id: "stub",
    models: () => [{ ...MOCK_MODEL, id: "stub-1", provider: "stub" }],
    chat: async () => ({
      id: "chatcmpl-stub",
      object: "chat.completion",
      created: 0,
      model: "stub-1",
      choices: [{ index: 0, message: { role: "assistant" as const, content: inhalt }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }),
  };
}

function setup(inhalt: string, balanceMc = 500_000) {
  const db = openDb(":memory:");
  const app = createApp({ db, catalog: new Catalog([antwortet(inhalt)]) });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "cd".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, ?, ?)").run(address, 0, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: "seed" });
  const check = (body: unknown, mitKey = true) =>
    app.request("/v1/check", {
      method: "POST",
      headers: { "content-type": "application/json", ...(mitKey ? { authorization: key } : {}) },
      body: JSON.stringify(body),
    });
  const balance = () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
  return { db, app, check, balance };
}

const BEFUND = { zitat: "Viewings available on short notice.", art: "unbelegt", begruendung: "Steht nicht im Briefing." };

describe("Zitatpruefung", () => {
  it("gleicht typografische Zeichen an, sonst faellt ein richtiger Befund durch", () => {
    expect(normalisieren("AED 18‑per’sqft")).toBe("aed 18-per'sqft");
  });

  it("behaelt einen Befund, dessen Zitat woertlich in der Einreichung steht", () => {
    const { befunde, verworfen } = befundePruefen(EINREICHUNG, { befunde: [BEFUND] });
    expect(befunde).toHaveLength(1);
    expect(verworfen).toBe(0);
  });

  it("verwirft einen erfundenen Fund, denn der beschuldigt einen ehrlichen Text", () => {
    const erfunden = { ...BEFUND, zitat: "Free parking for all visitors." };
    const { befunde, verworfen } = befundePruefen(EINREICHUNG, { befunde: [erfunden] });
    expect(befunde).toHaveLength(0);
    expect(verworfen).toBe(1);
  });

  it("findet ein Zitat auch mit anderen Anfuehrungs- und Bindestrichen wieder", () => {
    const anders = { ...BEFUND, zitat: "Service charge is AED 18 per sqft per year" };
    expect(befundePruefen(EINREICHUNG, { befunde: [anders] }).befunde).toHaveLength(1);
  });

  it("verwirft Befunde ohne Zitat oder mit unbekannter Art", () => {
    const roh = { befunde: [{ art: "unbelegt", begruendung: "x" }, { ...BEFUND, art: "geschmack" }] };
    const { befunde, verworfen } = befundePruefen(EINREICHUNG, roh);
    expect(befunde).toHaveLength(0);
    expect(verworfen).toBe(2);
  });

  it("vertraegt eine Antwort ohne Befundliste", () => {
    expect(befundePruefen(EINREICHUNG, { irgendwas: 1 })).toEqual({ befunde: [], verworfen: 0 });
  });

  it("schickt fuer faktisch und schoepferisch verschiedene Anweisungen", () => {
    const f = nachrichten("b", "e", "factual")[0].content;
    const s = nachrichten("b", "e", "creative")[0].content;
    expect(f).not.toBe(s);
    expect(s).toContain("would the client have a problem");
    expect(f).toContain("Do the multiplication yourself");
  });
});

describe("POST /v1/check", () => {
  it("liefert geprüfte Befunde und rechnet wie jede andere Inferenz ab", async () => {
    const { check, balance } = setup(JSON.stringify({ befunde: [BEFUND] }));
    const vorher = balance();
    const res = await check({ briefing: "A listing brief.", submission: EINREICHUNG });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; findings: unknown[]; discarded: number };
    expect(body.kind).toBe("factual");
    expect(body.findings).toHaveLength(1);
    expect(body.discarded).toBe(0);
    expect(balance(), "der Aufruf wird abgerechnet").toBeLessThan(vorher);
  });

  it("gibt einen erfundenen Fund nicht heraus, sondern zaehlt ihn als verworfen", async () => {
    const erfunden = { ...BEFUND, zitat: "Includes a private beach." };
    const { check } = setup(JSON.stringify({ befunde: [erfunden] }));
    const res = await check({ briefing: "A listing brief.", submission: EINREICHUNG });
    const body = (await res.json()) as { findings: unknown[]; discarded: number };
    expect(body.findings).toHaveLength(0);
    expect(body.discarded).toBe(1);
  });

  it("nimmt kind=creative an", async () => {
    const { check } = setup(JSON.stringify({ befunde: [] }));
    const res = await check({ briefing: "b", submission: "e", kind: "creative" });
    expect(((await res.json()) as { kind: string }).kind).toBe("creative");
  });

  it("verlangt briefing und submission", async () => {
    const { check } = setup(JSON.stringify({ befunde: [] }));
    const res = await check({ submission: "nur das" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("deckelt die Laenge, sonst kauft ein Aufruf ein Kontextfenster ein", async () => {
    const { check, balance } = setup(JSON.stringify({ befunde: [] }));
    const vorher = balance();
    const res = await check({ briefing: "b", submission: "x".repeat(20_001) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("too_long");
    expect(balance(), "abgelehnt heisst nicht abgerechnet").toBe(vorher);
  });

  it("verschweigt nicht, wenn das Modell kein JSON liefert", async () => {
    const { check } = setup("Sorry, I cannot do that.");
    const res = await check({ briefing: "b", submission: "e" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("unparseable_answer");
  });

  it("braucht einen API-Key", async () => {
    const { check } = setup(JSON.stringify({ befunde: [] }));
    const res = await check({ briefing: "b", submission: "e" }, false);
    expect(res.status).toBe(401);
  });
});
