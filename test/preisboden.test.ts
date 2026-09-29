/**
 * Der Preisboden am Auftrag, in beide Richtungen.
 *
 * Bis zum 29.09.2026 nahm das Brett Auftraege ab einem Cent an. Gemessen an der
 * Produktionsdatenbank: 82 Inferenzen, Median 500 mc, 90. Perzentil 2.038 mc, teuerste 5.812 mc.
 * Der Median aller 47 Auftragspreise war 1.000 mc, nach Provision 900 mc fuer den Gewinner. Bei
 * drei Mitbietern ist der Erwartungswert ein Drittel davon, also 300 mc gegen 500 mc Kosten.
 *
 * Zehn Tage lang wurde gemessen, ob fremde Agenten kommen, waehrend auf dem Brett Auftraege
 * standen, bei denen Mitmachen ein Verlustgeschaeft war. Dieser Test haelt die Grenze fest, und
 * die Gegenprobe darunter haelt fest, dass sie nicht zu hoch sitzt: genau am Boden geht es noch.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { PRICE_MIN_MC, feeMc } from "../src/bounties/store.js";
import { hashApiKey } from "../src/auth/siwe.js";

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "7b".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: "seed-boden" });
  const post = (price_cents: number) =>
    app.request("/v1/bounties", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({
        brief: "Write a short product description for a wooden desk lamp.",
        kind: "creative",
        price_cents,
        deadline: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    });
  return { db, post };
}

const BODEN_CENT = PRICE_MIN_MC / 1000;

describe("der Preisboden", () => {
  it("nimmt einen Auftrag genau am Boden an", async () => {
    const { post } = setup();
    const res = await post(BODEN_CENT);
    expect(res.status).toBe(201);
  });

  it("weist einen Cent darunter ab und legt keinen Auftrag an", async () => {
    const { post, db } = setup();
    const res = await post(BODEN_CENT - 1);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("price_out_of_range");
    const { n } = db.prepare("SELECT count(*) AS n FROM bounties").get() as { n: number };
    expect(n).toBe(0);
  });

  it("sagt in der Absage, woher die Grenze kommt, statt sie zu behaupten", async () => {
    const { post } = setup();
    const body = (await (await post(1)).json()) as { message: string };
    expect(body.message).toContain("0.5");
    expect(body.message).toContain("5.8");
    expect(body.message, "die Rechnung mit drei Mitbietern ist der Grund").toContain("third");
  });

  it("laesst dem Gewinner am Boden mehr, als das 90. Perzentil einer Antwort kostet", () => {
    // Die Rechnung, die den Boden traegt, als Test: Auszahlung nach Provision, geteilt durch drei
    // Mitbieter, muss ueber 2.038 mc liegen. Faellt der Boden, faellt dieser Test.
    const P90_MC = 2_038;
    const auszahlung = PRICE_MIN_MC - feeMc(PRICE_MIN_MC);
    expect(auszahlung / 3).toBeGreaterThan(P90_MC);
    // Und die Gegenprobe zur Gegenprobe: beim alten Boden von einem Cent galt das nicht.
    const alt = 1_000;
    expect((alt - feeMc(alt)) / 3).toBeLessThan(P90_MC);
  });
});
