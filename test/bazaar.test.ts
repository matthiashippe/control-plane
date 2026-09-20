/**
 * Der Dienst wird nur dann in das Verzeichnis eines x402-Facilitators aufgenommen, wenn er sich
 * dort selbst deklariert: absolute `resource` und ein `extensions.bazaar`-Block, den der
 * Facilitator bei `/verify` oder `/settle` uebernimmt. Ein Anmeldeweg existiert nicht.
 *
 * Diese Tests halten beides fest, weil ein Versehen hier nicht auffaellt: Zahlungen laufen weiter,
 * der Dienst bleibt nur unsichtbar.
 */
import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import {
  buildPaymentRequired,
  payConfigFromEnv,
  payResource,
  SCHWELLEN_BONUS_CENTS,
  type PayConfig,
} from "../src/payments/pay.js";
import { buildV1Requirements } from "../src/payments/facilitator.js";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const PAY_TO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const WALLET = "0x0629a6851234567890123456789012345678488e" as Address;
const cfg: PayConfig = {
  payTo: PAY_TO,
  network: "base",
  chainId: 8453,
  usdcAddress: USDC,
  maxTimeoutSeconds: 300,
  tiers: [5, 25, 100, 500, 1000, 2500],
};

/** Settler, der nie zum Zug kommt: Die 402-Antwort entsteht vor jedem Settlement. */
class Merker implements Settler {
  readonly kind = "merk";
  readonly resources: string[] = [];
  async settle(_a: Authorization, _s: Hex, resource?: string): Promise<SettleResult> {
    this.resources.push(resource ?? "");
    return { ok: false, error: "im Test nicht erreicht" };
  }
}

describe("Deklaration fuer das Facilitator-Verzeichnis", () => {
  it("macht die resource absolut, sobald die Basis-URL bekannt ist", () => {
    const mit = buildPaymentRequired({ ...cfg, publicOrigin: "https://cp.hippe.eu" }, 5, WALLET);
    expect(mit.accepts[0].resource).toBe(`https://cp.hippe.eu/pay/5/${WALLET}`);
    expect(mit.accepts[0].resource.startsWith("https://")).toBe(true);
  });

  it("bleibt ohne Basis-URL beim relativen Pfad, statt einen Host zu erfinden", () => {
    expect(buildPaymentRequired(cfg, 5, WALLET).accepts[0].resource).toBe(`/pay/5/${WALLET}`);
  });

  it("deklariert den bazaar-Block im Angebot, sonst katalogisiert ihn kein Facilitator", () => {
    const angebot = buildPaymentRequired(cfg, 5, WALLET);
    const info = angebot.accepts[0].extensions?.bazaar?.info;
    expect(info, "accepts[0].extensions.bazaar.info fehlt").toBeTruthy();
    expect(info?.input.method).toBe("GET");
    expect(info?.output.type).toBe("json");
  });

  it("schickt Deklaration und Beschreibung an den Facilitator, nicht nur an den Client", () => {
    const auth: Authorization = {
      from: WALLET,
      to: PAY_TO,
      value: 5_000_000n,
      validAfter: 0n,
      validBefore: 9_999_999_999n,
      nonce: ("0x" + "11".repeat(32)) as Hex,
    };
    const req = buildV1Requirements(
      { url: "x", network: "base", payTo: PAY_TO, usdcAddress: USDC, maxTimeoutSeconds: 300 },
      auth,
      `https://cp.hippe.eu/pay/5/${WALLET}`,
    ) as Record<string, unknown>;
    expect(req.extensions, "paymentRequirements.extensions fehlt").toBeTruthy();
    // Die Beschreibung ist der Text, den ein fremder Automat im Verzeichnis liest.
    expect(String(req.description)).toMatch(/Conway/);
    expect(String(req.description).length).toBeGreaterThan(30);
  });

  it("baut dieselbe absolute Kennung, die auch an den Settler geht", () => {
    // Der Settler wird erst nach gueltiger Signatur gerufen; die Kennung selbst pruefen wir direkt.
    expect(payResource({ ...cfg, publicOrigin: "https://cp.hippe.eu" }, 25, WALLET)).toBe(
      `https://cp.hippe.eu/pay/25/${WALLET}`,
    );
  });

  it("leitet die Basis-URL aus dem Request ab, wenn der Betreiber keine setzt", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, pay: cfg, settler: new Merker() });
    const res = await app.request(`/pay/5/${WALLET}`, {
      headers: { host: "cp.hippe.eu", "x-forwarded-proto": "https" },
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { accepts: Array<{ resource: string; extensions?: unknown }> };
    expect(body.accepts[0].resource).toBe(`https://cp.hippe.eu/pay/5/${WALLET}`);
    expect(body.accepts[0].extensions).toBeTruthy();
  });

  it("uebernimmt keinen Host, der wie eine URL mit Pfad aussieht", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, pay: cfg, settler: new Merker() });
    const res = await app.request(`/pay/5/${WALLET}`, {
      headers: { host: "boese.example/pfad", "x-forwarded-proto": "https" },
    });
    const body = (await res.json()) as { accepts: Array<{ resource: string }> };
    expect(body.accepts[0].resource).toBe(`/pay/5/${WALLET}`);
  });

  it("laesst CP_PUBLIC_URL den Host-Header schlagen", () => {
    const aus = payConfigFromEnv({ CP_PAY_TO: PAY_TO, CP_PUBLIC_URL: "https://beispiel.test/" } as NodeJS.ProcessEnv);
    expect(aus?.publicOrigin).toBe("https://beispiel.test");
  });
});

/**
 * Der Schwellenbonus. Die Runtime staffelt nach Kontostand, und die Schwelle fuer die beste Stufe
 * lautet `> 500` Cent. Ihr Bootstrap-Topup nimmt den kleinsten Tier. Ohne den Bonus startet jeder
 * Neukunde systematisch eine Stufe unter dem, wofuer er bezahlt hat.
 */
describe("Schwellenbonus", () => {
  it("hebt einen 5-USD-Topup ueber die Schwelle der Runtime, nicht genau darauf", () => {
    const UPSTREAM_SCHWELLE_HIGH = 500; // getSurvivalTier: cents > 500
    const gutschrift = 5 * 100 + SCHWELLEN_BONUS_CENTS;
    expect(gutschrift).toBeGreaterThan(UPSTREAM_SCHWELLE_HIGH);
    expect(gutschrift - 5 * 100, "mehr als ein Cent waere ein Geschenk ohne Zweck").toBe(1);
  });

  it("steht offen auf der Seite, weil er auch uns nuetzt", async () => {
    const html = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/public/index.html", import.meta.url), "utf8"),
    );
    expect(html).toMatch(/501 cents/);
    expect(html, "der Grund muss dabeistehen, sonst ist es ein Verkaufstrick").toMatch(/above<\/em> 500 cents/);
  });
});
