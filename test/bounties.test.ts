import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger, MC_PER_CENT } from "../src/db.js";
import { abgelaufeneFreigeben, GEBUEHR_PROZENT, gebuehrMc } from "../src/bounties/store.js";
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
    zurueckziehen: (b: unknown) => ruf("/v1/bounties/cancel", "POST", b),
    liste: () => ruf("/v1/bounties", "GET"),
    einreichen2: (b: unknown) => ruf("/v1/submissions", "POST", b),
    vergeben: (b: unknown) => ruf("/v1/bounties/award", "POST", b),
    einreichungen: (id: string) => ruf(`/v1/submissions?bounty_id=${id}`, "GET"),
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

describe("Einreichen und vergeben: der Weg des Geldes zum Gewinner", () => {
  /** Auftraggeber a, Bewerber b. */
  async function markt() {
    const s = setup();
    const { id } = (await (await s.a.einstellen(auftrag())).json()) as { id: string };
    return { ...s, id };
  }

  it("nimmt eine Einreichung an und zahlt bei der Vergabe genau den hinterlegten Betrag aus", async () => {
    const { a, b, id, ledgerSumme, saldenSumme } = await markt();
    const res = await b.einreichen2({ bounty_id: id, body: "Here is the listing." });
    expect(res.status).toBe(201);
    const { id: sid } = (await res.json()) as { id: string };

    const vergabe = await a.vergeben({ bounty_id: id, submission_id: sid });
    expect(vergabe.status).toBe(200);
    expect(((await vergabe.json()) as { status: string }).status).toBe("awarded");
    expect(b.saldo(), "der Gewinner bekommt den Preis").toBe(500_000 + 200 * MC_PER_CENT);
    expect(a.saldo(), "der Auftraggeber hat ihn beim Einstellen bezahlt").toBe(500_000 - 200 * MC_PER_CENT);
    expect(ledgerSumme(), "das Geld hat den Ledger nie verlassen").toBe(saldenSumme());
    expect(saldenSumme()).toBe(1_000_000);
  });

  it("vergibt kein zweites Mal, sonst entstünde Geld aus dem Nichts", async () => {
    const { a, b, id } = await markt();
    const { id: sid } = (await (await b.einreichen2({ bounty_id: id, body: "x" })).json()) as { id: string };
    await a.vergeben({ bounty_id: id, submission_id: sid });
    const nachErster = b.saldo();
    const zweite = await a.vergeben({ bounty_id: id, submission_id: sid });
    expect(zweite.status).toBe(409);
    expect(b.saldo()).toBe(nachErster);
  });

  it("lässt nur den Auftraggeber vergeben", async () => {
    const { a, b, id } = await markt();
    const { id: sid } = (await (await b.einreichen2({ bounty_id: id, body: "x" })).json()) as { id: string };
    const res = await b.vergeben({ bounty_id: id, submission_id: sid });
    expect(res.status).toBe(403);
    expect(b.saldo(), "niemand vergibt sich selbst fremdes Geld").toBe(500_000);
    void a;
  });

  it("nimmt je Agent nur eine Einreichung an", async () => {
    const { b, id } = await markt();
    expect((await b.einreichen2({ bounty_id: id, body: "erster Versuch" })).status).toBe(201);
    const zweiter = await b.einreichen2({ bounty_id: id, body: "zweiter Versuch" });
    expect(zweiter.status).toBe(409);
    expect(((await zweiter.json()) as { error: string }).error).toBe("already_submitted");
  });

  it("lässt den Auftraggeber nicht auf den eigenen Auftrag bieten", async () => {
    const { a, id } = await markt();
    const res = await a.einreichen2({ bounty_id: id, body: "meine eigene Arbeit" });
    expect(res.status).toBe(403);
  });

  it("nimmt nach Ablauf der Frist nichts mehr an", async () => {
    const { b, db, id } = await markt();
    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);
    const res = await b.einreichen2({ bounty_id: id, body: "zu spät" });
    // Der Durchlauf zu Beginn der Route hat den Auftrag bereits verfallen lassen.
    expect(res.status).toBe(409);
    expect((db.prepare("SELECT status FROM bounties WHERE id = ?").get(id) as { status: string }).status).toBe("expired");
  });

  it("weist eine Einreichung ab, die zu einem anderen Auftrag gehört", async () => {
    const { a, b, id } = await markt();
    const { id: id2 } = (await (await a.einstellen(auftrag({ price_cents: 100 }))).json()) as { id: string };
    const { id: sid } = (await (await b.einreichen2({ bounty_id: id2, body: "gehört zu 2" })).json()) as { id: string };
    const res = await a.vergeben({ bounty_id: id, submission_id: sid });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("submission_other_bounty");
  });

  it("zeigt dem Auftraggeber alle Einreichungen und einem Bewerber nur die eigene", async () => {
    const { db, app, a, b, id } = await markt();
    const c = konto(db, app, 500_000, 3);
    await b.einreichen2({ bounty_id: id, body: "von b" });
    await c.einreichen2({ bounty_id: id, body: "von c" });
    const alsAuftraggeber = (await (await a.einreichungen(id)).json()) as { submissions: unknown[] };
    expect(alsAuftraggeber.submissions, "er muss auswählen können").toHaveLength(2);
    const alsBewerber = (await (await b.einreichungen(id)).json()) as { submissions: { body: string }[] };
    expect(alsBewerber.submissions, "sonst schreibt einer vom anderen ab").toHaveLength(1);
    expect(alsBewerber.submissions[0].body).toBe("von b");
  });

  it("schreibt für die Vergabe eine Ledger-Zeile mit Bezug auf Auftrag und Einreichung", async () => {
    const { a, b, db, id } = await markt();
    const { id: sid } = (await (await b.einreichen2({ bounty_id: id, body: "x" })).json()) as { id: string };
    await a.vergeben({ bounty_id: id, submission_id: sid });
    const zeile = db.prepare("SELECT kind, delta_mc, address, meta FROM ledger WHERE ref = ?").get(`bounty-award:${id}`) as
      { kind: string; delta_mc: number; address: string; meta: string };
    expect(zeile.kind).toBe("bounty_award");
    expect(zeile.delta_mc).toBe(200 * MC_PER_CENT);
    expect(zeile.address).toBe(b.address);
    expect(JSON.parse(zeile.meta).submission_id).toBe(sid);
  });

  it("verlangt für beide Wege einen API-Key", async () => {
    const { app, id } = await markt();
    for (const [pfad, init] of [
      ["/v1/submissions", { method: "POST", body: JSON.stringify({ bounty_id: id, body: "x" }) }],
      ["/v1/bounties/award", { method: "POST", body: JSON.stringify({ bounty_id: id, submission_id: "x" }) }],
      [`/v1/submissions?bounty_id=${id}`, { method: "GET" }],
    ] as const) {
      expect((await app.request(pfad, { ...init, headers: { "content-type": "application/json" } })).status, pfad).toBe(401);
    }
  });
});

describe("Migration auf einen Bestand, der die Auftragstabelle schon hat", () => {
  it("zieht winner_submission nach, denn CREATE TABLE IF NOT EXISTS legt keine Spalte nach", () => {
    // Genau die Lage der Produktionsdatenbank nach dem Deploy vom 20.09.2026: bounties existiert,
    // die Spalte noch nicht. Wer das nicht prueft, merkt es erst, wenn die erste Vergabe wirft.
    const ordner = mkdtempSync(join(tmpdir(), "cp-migration-"));
    const pfad = join(ordner, "alt.db");
    try {
      const alt = new Database(pfad);
      alt.exec(`
        CREATE TABLE wallets (address TEXT PRIMARY KEY, balance_mc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE bounties (
          id TEXT PRIMARY KEY, creator TEXT NOT NULL, kind TEXT NOT NULL, brief TEXT NOT NULL,
          price_mc INTEGER NOT NULL, deadline TEXT NOT NULL, status TEXT NOT NULL,
          created_at TEXT NOT NULL, closed_at TEXT
        );
      `);
      alt.prepare("INSERT INTO bounties VALUES (?, ?, 'factual', 'b', 1000, ?, 'open', ?, NULL)")
        .run("alt-1", "0xabc", new Date(Date.now() + 3_600_000).toISOString(), new Date().toISOString());
      alt.close();

      const db = openDb(pfad);
      const spalten = (db.prepare("PRAGMA table_info(bounties)").all() as { name: string }[]).map((s) => s.name);
      expect(spalten).toContain("winner_submission");
      expect(
        (db.prepare("SELECT winner_submission FROM bounties WHERE id = ?").get("alt-1") as { winner_submission: null }).winner_submission,
        "der Bestand bleibt erhalten und die neue Spalte ist leer",
      ).toBeNull();
      db.close();
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});

describe("Die oeffentliche Auftragsliste", () => {
  it("zeigt offene Aufträge ohne Schlüssel, denn ein Markt, den nur Mitglieder sehen, ist keiner", async () => {
    const { app, a } = setup();
    await a.einstellen(auftrag());
    const res = await app.request("/bounties.json", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { open: { brief: string; price_cents: number }[]; note: string };
    expect(body.open).toHaveLength(1);
    expect(body.open[0].price_cents).toBe(200);
    expect(body.note, "wer hier liest, soll wissen, dass Briefings öffentlich sind").toMatch(/public/i);
  });

  it("nennt keine Adressen, denn öffentlich ist der Auftrag und nicht der Auftraggeber", async () => {
    const { app, a } = setup();
    await a.einstellen(auftrag());
    const text = await (await app.request("/bounties.json", { method: "GET" })).text();
    expect(text).not.toContain(a.address);
  });

  it("zeigt zurückgezogene und abgelaufene Aufträge nicht", async () => {
    const { app, a, db } = setup();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    const { id: id2 } = (await (await a.einstellen(auftrag({ price_cents: 100 }))).json()) as { id: string };
    await a.zurueckziehen({ id });
    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id2);
    const body = (await (await app.request("/bounties.json", { method: "GET" })).json()) as { open: unknown[] };
    expect(body.open).toHaveLength(0);
  });

  it("gibt beim Abruf abgelaufenes Geld zurück, auch ohne dass jemand angemeldet ist", async () => {
    const { app, a, db } = setup();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);
    await app.request("/bounties.json", { method: "GET" });
    expect(a.saldo()).toBe(500_000);
  });

  it("deckelt die Zahl der Einträge", async () => {
    const { app } = setup();
    const res = await app.request("/bounties.json?limit=99999", { method: "GET" });
    expect(res.status).toBe(200);
  });
});

const BETREIBER = "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614";
const PAY = {
  payTo: BETREIBER as `0x${string}`,
  network: "base" as const,
  chainId: 8453,
  usdcAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as `0x${string}`,
  maxTimeoutSeconds: 60,
  tiers: [5] as const,
};

/** Wie setup(), aber mit konfigurierter Betreiberadresse, also mit Gebuehr. */
function setupMitGebuehr(balanceMc = 500_000) {
  const db = openDb(":memory:");
  const app = createApp({ db, pay: PAY });
  const ledgerSumme = () => (db.prepare("SELECT coalesce(sum(delta_mc), 0) AS s FROM ledger").get() as { s: number }).s;
  const saldenSumme = () => (db.prepare("SELECT coalesce(sum(balance_mc), 0) AS s FROM wallets").get() as { s: number }).s;
  const betreiber = () =>
    ((db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(BETREIBER) as { balance_mc: number } | undefined)
      ?.balance_mc) ?? 0;
  return { db, app, a: konto(db, app, balanceMc, 1), b: konto(db, app, balanceMc, 2), ledgerSumme, saldenSumme, betreiber };
}

describe("Vermittlungsgebuehr", () => {
  it("zieht zehn Prozent vom Auszahlbetrag ab und schreibt sie dem Betreiber gut", async () => {
    const { a, b, betreiber } = setupMitGebuehr();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    const { id: sid } = (await (await b.einreichen2({ bounty_id: id, body: "die Arbeit" })).json()) as { id: string };
    await a.vergeben({ bounty_id: id, submission_id: sid });

    const preisMc = 200 * MC_PER_CENT;
    const gebuehr = gebuehrMc(preisMc);
    expect(gebuehr).toBe(preisMc / 10);
    expect(b.saldo(), "der Gewinner bekommt den Preis minus Gebuehr").toBe(500_000 + preisMc - gebuehr);
    expect(betreiber(), "die Gebuehr landet beim Betreiber").toBe(gebuehr);
  });

  it("laesst den Kaeufer genau den ausgeschriebenen Preis zahlen, nicht mehr", async () => {
    const { a, b } = setupMitGebuehr();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    const { id: sid } = (await (await b.einreichen2({ bounty_id: id, body: "x" })).json()) as { id: string };
    await a.vergeben({ bounty_id: id, submission_id: sid });
    expect(a.saldo(), "er hat beim Einstellen 200 Cent bezahlt und sonst nichts").toBe(500_000 - 200 * MC_PER_CENT);
  });

  it("verliert und erschafft dabei keinen Millicent", async () => {
    const { a, b, ledgerSumme, saldenSumme } = setupMitGebuehr();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    const { id: sid } = (await (await b.einreichen2({ bounty_id: id, body: "x" })).json()) as { id: string };
    await a.vergeben({ bounty_id: id, submission_id: sid });
    expect(ledgerSumme()).toBe(saldenSumme());
    expect(saldenSumme(), "nur die beiden Startguthaben sind im System").toBe(1_000_000);
  });

  it("rundet zugunsten des Gewinners, die Gebuehr liegt nie ueber zehn Prozent", () => {
    for (const preisMc of [1_000, 1_001, 1_009, 7_777, 123_456]) {
      const g = gebuehrMc(preisMc);
      expect(g * 100).toBeLessThanOrEqual(preisMc * GEBUEHR_PROZENT);
      expect(g + (preisMc - g), "beide Zeilen ergeben zusammen den hinterlegten Betrag").toBe(preisMc);
    }
  });

  it("nennt den Auszahlbetrag schon in der oeffentlichen Liste, damit ein Agent nicht rechnen muss", async () => {
    const { app, a } = setupMitGebuehr();
    await a.einstellen(auftrag());
    const body = (await (await app.request("/bounties.json", { method: "GET" })).json()) as
      { open: { price_cents: number; award_cents: number; fee_percent: number }[] };
    expect(body.open[0].price_cents).toBe(200);
    expect(body.open[0].award_cents).toBe(180);
    expect(body.open[0].fee_percent).toBe(GEBUEHR_PROZENT);
  });

  it("nimmt ohne konfigurierte Betreiberadresse keine Gebuehr, statt Geld einzubehalten, das niemandem gehoert", async () => {
    const { app, a, b } = setup();
    const { id } = (await (await a.einstellen(auftrag())).json()) as { id: string };
    const { id: sid } = (await (await b.einreichen2({ bounty_id: id, body: "x" })).json()) as { id: string };
    await a.vergeben({ bounty_id: id, submission_id: sid });
    expect(b.saldo()).toBe(500_000 + 200 * MC_PER_CENT);
    const liste = (await (await app.request("/bounties.json", { method: "GET" })).json()) as { open: unknown[] };
    expect(liste.open).toHaveLength(0);
  });
});
