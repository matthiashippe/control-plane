import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
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

describe("Öffentliche Seite und Status", () => {
  it("liefert unter / eine HTML-Seite mit Hostname, Setup-Zeile und den Grenzen von Phase 1", async () => {
    const { app } = setup();
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("cp.hippe.eu");
    expect(html).toContain("conwayApiUrl");
    expect(html).toContain("automaton --provision");
    expect(html).toMatch(/501/); // Sandboxes und Transfers sind als nicht verfügbar benannt
    expect(html).toMatch(/not transferable|not redeemable/i);
    expect(html).not.toMatch(/<script[^>]+src=/i); // keine externen Skripte
    expect(html).not.toMatch(/fonts\.googleapis|googletagmanager|analytics/i);
  });

  it("liefert /v1/status ohne API-Key mit Modellen, Tiers, Markup und Automaton-Zahl", async () => {
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
    // Ein Eintrag je echtem Modell, die Runtime-IDs stehen als Aliase daneben.
    expect(body.models).toHaveLength(1);
    expect(body.models[0].id).toBe("mock-1");
    expect(body.models[0].aliases.sort()).toEqual(["gpt-5-mini", "gpt-5.2"]);
    expect(body.models[0].input_per_million).toBeGreaterThan(0);
    expect(body.topup_tiers_usd).toContain(5);
    expect(body.automatons).toBe(0);
  });

  it("zählt registrierte Automatons in /v1/status mit", async () => {
    const { app, db } = setup();
    db.prepare(
      "INSERT INTO automatons (automaton_id, address, creator_address, name, bio, registered_at) VALUES (?, ?, ?, ?, '', ?)",
    ).run("a-1", "0xabc", "0xdef", "Test", new Date().toISOString());
    const body = (await (await app.request("/v1/status")).json()) as { automatons: number };
    expect(body.automatons).toBe(1);
  });

  it("gibt in /v1/status nichts preis, was einen Mandanten identifiziert", async () => {
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

  it("lässt /v1/* sonst weiterhin nur mit API-Key durch und antwortet auf Unbekanntes mit JSON-404", async () => {
    const { app } = setup();
    expect((await app.request("/v1/credits/balance")).status).toBe(401);
    expect((await app.request("/v1/models")).status).toBe(401);
    const missing = await app.request("/gibtsnicht");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
  });

  it("nennt auf der Seite den Betreiber und eine Kontaktmöglichkeit", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toMatch(/Hanseatic Tech Company/);
    expect(html).toMatch(/mailto:[^"]+@/);
    expect(html).toContain("github.com/matthiashippe/control-plane");
  });

  it("verspricht keine Auszahlung von Credits (Regulatorik: kein Rückzahlungsanspruch)", async () => {
    const { app } = setup();
    const html = (await (await app.request("/")).text()).toLowerCase();
    expect(html).toContain("not redeemable");
    expect(html).not.toMatch(/refund|pay ?out|cash out|redeem your|withdraw/);
  });

  it("verlinkt den kostenlosen Weg sichtbar, damit niemand zahlt, der nicht muss", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toContain("ohne-control-plane.md");
    expect(html).toMatch(/you may not need this/i);
  });

  it("liefert /.well-known/x402 mit Endpunkten, Zahlungsangebot und dem kostenlosen Weg", async () => {
    const { app } = setup();
    const res = await app.request("/.well-known/x402");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as Record<string, any>;
    expect(doc.x402Version).toBe(1);
    expect(doc.endpoints.topup).toBe("/pay/{usd}/{address}");
    expect(doc.endpoints.inference).toBe("/v1/chat/completions");
    expect(doc.markup).toBe(MARKUP);
    expect(doc.credits).toMatchObject({ redeemable: false, transferable: false });
    expect(doc.free_alternative).toContain("ohne-control-plane.md");
    expect(JSON.stringify(doc)).not.toMatch(/refund|cash out|withdraw/i);
  });

  it("nennt in /.well-known/x402 das Zahlungsangebot, sobald Pay konfiguriert ist", async () => {
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

  it("liefert llms.txt als Text mit Setup-Zeile, Tiers und dem kostenlosen Weg", async () => {
    const { app } = setup();
    const res = await app.request("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const txt = await res.text();
    expect(txt).toContain("# control-plane");
    expect(txt).toContain("conwayApiUrl");
    expect(txt).toContain("cp.hippe.eu");
    expect(txt).toContain("ohne-control-plane.md");
    expect(txt).toMatch(/not redeemable and not transferable/i);
    expect(txt).not.toMatch(/refund|cash out|withdraw/i);
  });
});
