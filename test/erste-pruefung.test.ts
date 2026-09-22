/**
 * The three things a stranger checks first, and what they found wrong.
 *
 * An adversarial read on 2026-09-22 went through the public surfaces as a hostile reader and
 * clicked what it was offered. Three findings, all of them one click deep:
 *
 *   B18  /terms proved the margin with a link to /v1/credits/history, and that link answers 401.
 *        Somebody checking the markup before their first payment has no key by definition.
 *   B22  Four surfaces said an API key takes "four calls", docs/api-key.md listed four steps of
 *        which one is not a call, and the 401 this service answers with says "three auth
 *        endpoints". For an agent developer that is the first page they read.
 *   B23  /bounties.json said award_cents is what the winner receives, and the open 45 c job
 *        reported 40. The rounding was documented only in the MCP tool description.
 *
 * What is pinned here is not the wording but the property each finding violated: a claim offered
 * as checkable has to be checkable, a number about money has to say the same thing everywhere, and
 * a figure that is rounded has to say so where it is read.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";

function setup() {
  const db = openDb(":memory:");
  // With an operator address, because the commission only exists when one is configured: without
  // `pay` the fee is zero and a 45 c job awards 45, which is the instance this test is not about.
  const app = createApp({ db, pay: { payTo: "0x" + "1".repeat(40) } as never });
  return { db, app };
}

function buyer(db: ReturnType<typeof openDb>) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "9d".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: "seed" });
  return key;
}

describe("what a stranger checks first", () => {
  it("proves the markup somewhere that answers without a key", async () => {
    const { app } = setup();
    const terms = await (await app.request("/terms")).text();
    const von = terms.indexOf("What the money does");
    expect(von, "the money section is gone").toBeGreaterThan(-1);
    const geld = terms.slice(von, terms.indexOf("</p>", terms.indexOf("</p>", von) + 4));
    expect(geld, "the margin has to be checkable before the first payment").toContain('href="/v1/status"');

    // And the place it points at has to carry the number.
    const status = (await (await app.request("/v1/status")).json()) as { markup: number; models: unknown[] };
    expect(status.markup, "the multiplier itself, keyless").toBeGreaterThan(1);
    expect(status, "and the field the prices arrive in, whatever the catalogue holds").toHaveProperty("models");

    // The keyless claim and the key-only receipt must not be confused for each other: the page
    // says which is which, because the old version linked only the one that answers 401.
    expect(geld).toContain('href="/v1/credits/history"');
    expect((await app.request("/v1/credits/history")).status, "still key-only, and said to be").toBe(401);
  });

  it("says the same number of calls everywhere, including in its own 401", async () => {
    const { app } = setup();
    const fehler = (await (await app.request("/v1/credits/balance")).json()) as { message?: string; hint?: string };
    const meldung = JSON.stringify(fehler);
    expect(meldung, "the service names three endpoints when it refuses").toMatch(/three auth endpoints/);

    for (const pfad of ["/", "/post", "/jobs", "/llms.txt", "/bounties.json"]) {
      const text = await (await app.request(pfad)).text();
      expect(text, `${pfad} still promises four calls while the 401 names three`).not.toMatch(/four calls/i);
    }
  });

  it("names the rounding where an agent reads the figure", async () => {
    const { db, app } = setup();
    const key = buyer(db);
    // 45 cents is the case the finding was about: 10 per cent off is 40.5, and the field says 40.
    const res = await app.request("/v1/bounties", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({
        brief: "FACT SHEET on one page. 90 words maximum. Hand in the sheet and nothing else.",
        kind: "factual",
        price_cents: 45,
        deadline: new Date(Date.now() + 3600e3).toISOString(),
      }),
    });
    expect(res.status).toBe(201);

    const liste = (await (await app.request("/bounties.json")).json()) as {
      note: string;
      open: { price_cents: number; award_cents: number }[];
    };
    const job = liste.open.find((b) => b.price_cents === 45)!;
    expect(job.award_cents, "half a cent goes nowhere, and the field shows the floor").toBe(40);
    expect(liste.note, "so the note has to say it, on the surface that carries the number").toMatch(
      /rounded down to the cent/i,
    );
  });
});
