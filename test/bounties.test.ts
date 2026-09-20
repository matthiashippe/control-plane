import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger, MC_PER_CENT } from "../src/db.js";
import { abgelaufeneFreigeben } from "../src/bounties/store.js";
import { hashApiKey } from "../src/auth/siwe.js";

const IN_EINER_STUNDE = () => new Date(Date.now() + 3_600_000).toISOString();

function konto(db: ReturnType<typeof openDb>, app: ReturnType<typeof createApp>, balanceMc: number, n: number) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${String(n).repeat(2)}` + "ef".repeat(15);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: `seed-${n}` });
  const ruf = (pfad: string, method: string, body?: unknown, mitKey = true) =>
    app.request(pfad, {
      method,
      headers: { "content-type": "application/json", ...(mitKey ? { authorization: key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    address,
    einstellen: (b: unknown) => ruf("/v1/bounties", "POST", b),
    zurueckziehen: (b: unknown) => ruf("/v1/bounties/withdraw", "POST", b),
    liste: () => ruf("/v1/bounties", "GET"),
    ohneKey: () => app.request("/v1/bounties", { method: "GET" }),
    saldo: () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc,
  };
}

/** 5 USD Guthaben, also 500.000 mc. */
function setup(balanceMc = 500_000) {
  const db = openDb(":memory:");
  const app = createApp({ db });
  const ledgerSumme = () =>
    (db.prepare("SELECT coalesce(sum(delta_mc), 0) AS s FROM ledger").get() as { s: number }).s;
  const saldenSumme = () =>
    (db.prepare("SELECT coalesce(sum(balance_mc), 0) AS s FROM wallets").get() as { s: number }).s;
  return { db, app, a: konto(db, app, balanceMc, 1), b: konto(db, app, balanceMc, 2), ledgerSumme, saldenSumme };
}

const AUFTRAG = { brief: "Write a listing description.", kind: "factual", price_cents: 200, deadline: "" };
const auftrag = (ueber: Record<string, unknown> = {}) => ({ ...AUFTRAG, deadline: IN_EINER_STUNDE(), ...ueber });

describe("Auftrag einstellen", () => {
  it("bucht den Preis sofort ab, denn ein Auftrag ohne hinterlegtes Geld ist ein leeres Versprechen", async () => {
    const { a } = setup();
    const vorher = a.saldo();
    const res = await a.einstellen(auftrag());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; price_cents: number; status: string };
    expect(body.price_cents).toBe(200);
    expect(body.status).toBe("open");
    expect(a.saldo()).toBe(vorher - 200 * MC_PER_CENT);
  });

  it("legt bei zu kleinem Guthaben gar keinen Auftrag an und lässt den Saldo unberührt", async () => {
    const { a, db } = setup(50_000); // 50 Cent
    const vorher = a.saldo();
    const res = await a.einstellen(auftrag({ price_cents: 200 }));
    expect(res.status).toBe(402);
    expect(a.saldo()).toBe(vorher);
    expect((db.prepare("SELECT count(*) AS n FROM bounties").get() as { n: number }).n).toBe(0);
  });

  it("weist leere Briefings, unmögliche Preise und Fristen ab", async () => {
    const { a } = setup();
    const faelle: [Record<string, unknown>, string][] = [
      [{ brief: "  " }, "brief_required"],
      [{ price_cents: 0 }, "price_out_of_range"],
      [{ price_cents: 1.5 }, "price_out_of_range"],
      [{ price_cents: 200_000 }, "price_out_of_range"],
      [{ deadline: "morgen" }, "deadline_invalid"],
      [{ deadline: new Date(Date.now() - 1000).toISOString() }, "deadline_too_soon"],
      [{ deadline: new Date(Date.now() + 40 * 24 * 3_600_000).toISOString() }, "deadline_too_far"],
    ];
    for (const [ueber, code] of faelle) {
      const res = await a.einstellen(auftrag(ueber));
      expect(res.status, JSON.stringify(ueber)).toBe(400);
      expect(((await res.json()) as { error: string }).error, JSON.stringify(ueber)).toBe(code);
    }
    expect(a.saldo(), "kein abgewiesener Auftrag kostet Geld").toBe(500_000);
  });
});

describe("Auftrag zurückziehen", () => {
  it("gibt genau den hinterlegten Betrag zurück", async () => {
    const { a } = setup();
    const vorher = a.saldo();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    const res = await a.zurueckziehen({ id });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("cancelled");
    expect(a.saldo()).toBe(vorher);
  });

  it("zahlt beim zweiten Aufruf nicht noch einmal aus", async () => {
    const { a } = setup();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    await a.zurueckziehen({ id });
    const nachErstem = a.saldo();
    const res = await a.zurueckziehen({ id });
    expect(res.status).toBe(409);
    expect(a.saldo(), "sonst entstünde Geld aus dem Nichts").toBe(nachErstem);
  });

  it("lässt nur den Auftraggeber zurückziehen", async () => {
    const { a, b } = setup();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    const res = await b.zurueckziehen({ id });
    expect(res.status).toBe(403);
    expect(b.saldo(), "fremdes Geld landet auch nicht beim Fremden").toBe(500_000);
  });

  it("antwortet auf unbekannte Kennungen mit 404 und verlangt überhaupt eine", async () => {
    const { a } = setup();
    expect((await a.zurueckziehen({ id: "gibt-es-nicht" })).status).toBe(404);
    expect((await a.zurueckziehen({})).status).toBe(400);
  });
});

describe("Auftragsliste", () => {
  it("zeigt offene Aufträge, aber keine zurückgezogenen", async () => {
    const { a } = setup();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    await a.einstellen(auftrag({ price_cents: 100 }));
    expect((((await (await a.liste()).json()) as { bounties: unknown[] })).bounties).toHaveLength(2);
    await a.zurueckziehen({ id });
    expect((((await (await a.liste()).json()) as { bounties: unknown[] })).bounties).toHaveLength(1);
  });

  it("zeigt abgelaufene Aufträge nicht mehr", async () => {
    const { a, db } = setup();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);
    expect((((await (await a.liste()).json()) as { bounties: unknown[] })).bounties).toHaveLength(0);
  });

  it("braucht einen API-Key", async () => {
    const { a } = setup();
    expect((await a.ohneKey()).status).toBe(401);
  });
});

describe("Buchhaltung", () => {
  it("hält Ledger und Salden nach Einstellen und Zurückziehen deckungsgleich", async () => {
    const { a, ledgerSumme, saldenSumme } = setup();
    expect(ledgerSumme()).toBe(saldenSumme());
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    expect(ledgerSumme(), "das hinterlegte Geld ist aus den Salden heraus").toBe(saldenSumme());
    await a.zurueckziehen({ id });
    expect(ledgerSumme()).toBe(saldenSumme());
    expect(saldenSumme()).toBe(1_000_000);
  });

  it("schreibt für jede Bewegung eine Ledger-Zeile mit Bezug auf den Auftrag", async () => {
    const { a, db } = setup();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    await a.zurueckziehen({ id });
    const zeilen = db
      .prepare("SELECT kind, delta_mc, ref FROM ledger WHERE ref LIKE ? ORDER BY id")
      .all(`%${id}`) as { kind: string; delta_mc: number; ref: string }[];
    expect(zeilen.map((z) => z.kind)).toEqual(["bounty_hold", "bounty_release"]);
    expect(zeilen[0].delta_mc).toBe(-200 * MC_PER_CENT);
    expect(zeilen[1].delta_mc).toBe(200 * MC_PER_CENT);
  });
});

describe("Verfall bei abgelaufener Frist", () => {
  /** Setzt die Frist in die Vergangenheit, ohne die Pruefung beim Einstellen zu umgehen. */
  async function abgelaufenerAuftrag() {
    const s = setup();
    const { id } = (await (await s.a.einstellen(auftrag())).json()) as { id: string };
    s.db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);
    return { ...s, id };
  }

  it("gibt das hinterlegte Geld zurueck, sonst liegt es für immer", async () => {
    const { a, db, id } = await abgelaufenerAuftrag();
    expect(a.saldo(), "vorher liegt das Geld fest").toBe(500_000 - 200 * MC_PER_CENT);
    expect(abgelaufeneFreigeben(db)).toBe(1);
    expect(a.saldo()).toBe(500_000);
    expect((db.prepare("SELECT status FROM bounties WHERE id = ?").get(id) as { status: string }).status).toBe("expired");
  });

  it("unterscheidet abgelaufen von zurückgezogen, weil es zwei verschiedene Geschichten sind", async () => {
    const { db, id } = await abgelaufenerAuftrag();
    abgelaufeneFreigeben(db);
    const zeile = db.prepare("SELECT kind, ref FROM ledger WHERE ref = ?").get(`bounty-expired:${id}`) as { kind: string };
    expect(zeile.kind).toBe("bounty_release");
  });

  it("zahlt beim zweiten Durchlauf nicht noch einmal aus", async () => {
    const { a, db } = await abgelaufenerAuftrag();
    abgelaufeneFreigeben(db);
    const nachErstem = a.saldo();
    expect(abgelaufeneFreigeben(db)).toBe(0);
    expect(a.saldo()).toBe(nachErstem);
  });

  it("lässt laufende Aufträge unberührt", async () => {
    const { a, db } = setup();
    await a.einstellen(auftrag());
    expect(abgelaufeneFreigeben(db)).toBe(0);
    expect(a.saldo()).toBe(500_000 - 200 * MC_PER_CENT);
  });

  it("läuft von selbst, sobald jemand den Markt anfasst", async () => {
    const { a, db, id } = await abgelaufenerAuftrag();
    await a.liste();
    expect((db.prepare("SELECT status FROM bounties WHERE id = ?").get(id) as { status: string }).status).toBe("expired");
    expect(a.saldo()).toBe(500_000);
  });

  it("hält Ledger und Salden auch nach dem Verfall deckungsgleich", async () => {
    const { db, ledgerSumme, saldenSumme } = await abgelaufenerAuftrag();
    abgelaufeneFreigeben(db);
    expect(ledgerSumme()).toBe(saldenSumme());
    expect(saldenSumme()).toBe(1_000_000);
  });

  it("gibt das Geld auch dann zurück, wenn der Dienst zwischendurch neu startet", async () => {
    const { db, a, id } = await abgelaufenerAuftrag();
    // Ein Neustart baut die App neu auf; genau dort laeuft der Durchlauf.
    createApp({ db });
    expect((db.prepare("SELECT status FROM bounties WHERE id = ?").get(id) as { status: string }).status).toBe("expired");
    expect(a.saldo()).toBe(500_000);
  });
});

describe("Der Verfall darf den Start nicht verhindern", () => {
  it("laesst die App auch mit gestoerter Datenbank entstehen, statt eine Neustartschleife zu bauen", () => {
    const kaputt = {
      prepare() {
        throw new Error("SQLITE_CORRUPT: database disk image is malformed");
      },
    } as unknown as ReturnType<typeof openDb>;
    // Ohne die Absicherung wirft schon createApp, und zusammen mit autoheal waere das eine
    // Neustartschleife statt eines Dienstes, der laut warnt und weiterlaeuft.
    expect(() => createApp({ db: kaputt })).not.toThrow();
  });
});
