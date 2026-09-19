/**
 * Backup und Zurückspielen, nachgestellt ohne Docker.
 *
 * Hintergrund: Am 19.09.2026 lief `ops/backup.sh` seit Tagen, aber niemand hatte je ein Backup
 * zurückgespielt. Die Übung dazu steht in `ops/README.md`, Abschnitt "Ein Backup zurückspielen";
 * diese Tests halten die drei Stellen fest, an denen sie schiefgeht.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, postLedger } from "../src/db.js";

const REPO = process.cwd();
const VACUUM = path.join(REPO, "ops", "backup-vacuum.cjs");
const PRUEFEN = path.join(REPO, "ops", "restore-pruefen.cjs");

const verzeichnisse: string[] = [];
const offen: Database.Database[] = [];

afterEach(() => {
  for (const db of offen.splice(0)) {
    try {
      db.close();
    } catch {
      /* schon zu */
    }
  }
  for (const dir of verzeichnisse.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-backup-"));
  verzeichnisse.push(dir);
  return dir;
}

/**
 * Baut eine Datenbank wie im Betrieb: Schema in der .db, Daten im WAL, Verbindung offen. Genau
 * dieser Zustand macht eine Kopie der .db allein wertlos.
 */
function betriebsDatenbank(dir: string): { pfad: string; db: ReturnType<typeof openDb> } {
  const pfad = path.join(dir, "cp.db");
  openDb(pfad).close(); // erster Start: Schema anlegen und auschecken, danach ist die .db klein
  const db = openDb(pfad);
  offen.push(db);
  for (let i = 0; i < 3; i++) {
    const adresse = `0x${String(i).repeat(40)}`;
    const nonce = `0xnonce${i}`;
    postLedger(db, { address: adresse, kind: "topup", deltaMc: 500_000 * (i + 1), ref: nonce });
    postLedger(db, { address: adresse, kind: "inference", deltaMc: -(137 + i), meta: { model: "gpt-5.2", margin_mc: 12 } });
    db.prepare(
      `INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, balance_after_mc, status, tx_hash, created_at, settled_at)
       VALUES (?,?,?,?,?,?, 'settled', ?, ?, ?)`,
    ).run(nonce, adresse, adresse, "5000000", 500_000 * (i + 1), 500_000 * (i + 1), `0xtx${i}`, "2026-09-19T03:00:00Z", "2026-09-19T03:00:01Z");
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?,?,?,?,?)").run(
      adresse,
      `hash${i}`.padEnd(64, "0"),
      `cp_live_${i}`,
      `key-${i}`,
      "2026-09-19T03:00:00Z",
    );
    db.prepare(
      "INSERT INTO automatons (automaton_id, address, creator_address, name, bio, registered_at) VALUES (?,?,?,?,?,?)",
    ).run(`aut-${i}`, adresse, adresse, `Automat ${i}`, "", "2026-09-19T03:00:00Z");
  }
  return { pfad, db };
}

/** Liest eine Datei so, wie es ein Mensch nach dem Zurückspielen täte: Ist sie heil, ist sie voll? */
function zustand(pfad: string): Record<string, unknown> {
  const db = new Database(pfad, { readonly: true });
  const feld = (sql: string): number | string => {
    try {
      return (db.prepare(sql).get() as { n: number }).n;
    } catch (err) {
      return `FEHLER: ${(err as Error).message}`;
    }
  };
  const out = {
    integrity: (() => {
      try {
        return (db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
      } catch (err) {
        return `FEHLER: ${(err as Error).message}`;
      }
    })(),
    wallets: feld("SELECT count(*) n FROM wallets"),
    balance_mc: feld("SELECT coalesce(sum(balance_mc),0) n FROM wallets"),
    ledger: feld("SELECT count(*) n FROM ledger"),
    ledger_sum_mc: feld("SELECT coalesce(sum(delta_mc),0) n FROM ledger"),
    settled: feld("SELECT count(*) n FROM payments WHERE status = 'settled'"),
    keys: feld("SELECT count(*) n FROM api_keys"),
  };
  db.close();
  return out;
}

function backup(quelle: string, ziel: string): Record<string, unknown> {
  const ausgabe = execFileSync(process.execPath, [VACUUM], {
    env: { ...process.env, CP_DB_PATH: quelle, CP_BACKUP_TMP: ziel },
    encoding: "utf8",
  });
  return JSON.parse(ausgabe.trim().split("\n").pop() as string);
}

describe("Backup erzeugen (ops/backup-vacuum.cjs)", () => {
  it("holt den Inhalt aus dem WAL, eine Kopie der .db allein nicht", () => {
    const dir = tmpDir();
    const { pfad } = betriebsDatenbank(dir);

    // Das, wovor der Kopf des Skripts warnt: cp der .db, während der Inhalt im -wal steht.
    const naiv = path.join(dir, "naiv.db");
    fs.copyFileSync(pfad, naiv);
    const naivZustand = zustand(naiv);
    expect(naivZustand.wallets, "die nackte Kopie enthält keine Zeile").toBe(0);
    expect(naivZustand.integrity, "und sieht trotzdem heil aus, deshalb fällt sie nicht auf").toBe("ok");
    expect(fs.statSync(naiv).size, "und liegt weit über jeder Größenschwelle, die das abfangen sollte").toBeGreaterThan(20480);

    const ergebnis = backup(pfad, path.join(dir, "backup-tmp.db"));
    expect(ergebnis.probleme).toEqual([]);
    expect(ergebnis.wallets).toBe(3);
    expect(zustand(path.join(dir, "backup-tmp.db"))).toMatchObject({ integrity: "ok", wallets: 3, settled: 3, keys: 3 });
  });

  it("läuft auch, wenn die Zieldatei vom letzten Lauf noch liegt", () => {
    const dir = tmpDir();
    const { pfad } = betriebsDatenbank(dir);
    const ziel = path.join(dir, "backup-tmp.db");

    // Rohes VACUUM INTO scheitert an einer vorhandenen Datei. Blieb sie nach einem misslungenen
    // Abtransport liegen, schlug ab da jedes weitere Backup fehl, jeden Tag aufs Neue.
    backup(pfad, ziel);
    const roh = new Database(pfad, { readonly: true });
    expect(() => roh.exec(`VACUUM INTO ('${ziel}')`)).toThrow(/output file already exists/);
    roh.close();

    expect(backup(pfad, ziel).wallets).toBe(3);
  });

  it("nimmt ein Backup nicht ab, dessen Salden nicht zu den Ledgerzeilen passen", () => {
    const dir = tmpDir();
    const { pfad, db } = betriebsDatenbank(dir);
    db.prepare("UPDATE wallets SET balance_mc = balance_mc + 4711 WHERE address = ?").run("0x" + "0".repeat(40));

    expect(() => backup(pfad, path.join(dir, "backup-tmp.db"))).toThrow(/ohne passende Ledgersumme/);
  });

  it("nimmt keine halb ausgeführte Buchung mit, auch wenn parallel geschrieben wird", () => {
    const dir = tmpDir();
    const { pfad, db } = betriebsDatenbank(dir);

    // Ein Schreiber mitten in der Transaktion: Saldo erhöht, Ledgerzeile noch nicht geschrieben.
    // Sieht das Backup diesen Zwischenstand, ist es als Beleg wertlos.
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE wallets SET balance_mc = balance_mc + 999_000 WHERE address = ?").run("0x" + "1".repeat(40));
    const ergebnis = backup(pfad, path.join(dir, "backup-tmp.db"));
    db.exec("ROLLBACK");

    expect(ergebnis.probleme).toEqual([]);
    const b = zustand(path.join(dir, "backup-tmp.db"));
    expect(b.balance_mc, "Saldo und Ledger müssen sich im Backup exakt decken").toBe(b.ledger_sum_mc);
  });
});

describe("Backup zurückspielen (ops/README.md)", () => {
  it("ergibt eine heile, vollständige Datenbank, wenn -wal und -shm entfernt werden", () => {
    const dir = tmpDir();
    const { pfad } = betriebsDatenbank(dir);
    const sicherung = path.join(dir, "cp-backup.db");
    backup(pfad, sicherung);

    const ziel = tmpDir();
    const zielPfad = path.join(ziel, "cp.db");
    fs.copyFileSync(sicherung, zielPfad);
    for (const suffix of ["-wal", "-shm"]) fs.rmSync(zielPfad + suffix, { force: true });

    expect(zustand(zielPfad)).toMatchObject({ integrity: "ok", wallets: 3, settled: 3, keys: 3 });
    // Und der Dienst kommt dagegen hoch: openDb() migriert, räumt auf und öffnet.
    const db = openDb(zielPfad);
    offen.push(db);
    expect((db.prepare("SELECT count(*) n FROM wallets").get() as { n: number }).n).toBe(3);
  });

  it("ergibt eine kaputte Datenbank, wenn die -wal und -shm der alten liegen bleiben", () => {
    const dir = tmpDir();
    const { pfad } = betriebsDatenbank(dir);
    const sicherung = path.join(dir, "cp-backup.db");
    backup(pfad, sicherung);

    // Der Stand der alten Datenbank, so wie er nach einem harten Stopp im Volume liegt: .db plus
    // -wal plus -shm. Das Backup wird darüber kopiert, die Begleitdateien bleiben stehen.
    const ziel = tmpDir();
    const zielPfad = path.join(ziel, "cp.db");
    for (const suffix of ["", "-wal", "-shm"]) fs.copyFileSync(pfad + suffix, zielPfad + suffix);
    fs.copyFileSync(sicherung, zielPfad);

    const kaputt = zustand(zielPfad);
    const heil = { integrity: "ok", wallets: 3, balance_mc: 2_999_586, ledger: 6, ledger_sum_mc: 2_999_586, settled: 3, keys: 3 };
    expect(zustand(sicherung), "das Backup selbst ist in Ordnung").toEqual(heil);
    expect(kaputt, "die Mischung aus neuer .db und altem WAL ist es nicht").not.toEqual(heil);
    expect(
      String(kaputt.integrity) !== "ok" || kaputt.settled !== 3 || typeof kaputt.ledger_sum_mc === "string",
      `erwartet war eine beschädigte oder unvollständige Datei, gefunden: ${JSON.stringify(kaputt)}`,
    ).toBe(true);
  });

  it("nimmt ein Backup an, das älter ist als die letzten Migrationen", () => {
    const dir = tmpDir();
    const alt = path.join(dir, "cp-alt.db");
    // Schema aus der Zeit vor reserved_mc, balance_after_mc und der kv-Tabelle.
    const db = new Database(alt);
    db.exec(`
      CREATE TABLE wallets (address TEXT PRIMARY KEY, balance_mc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE siwe_nonces (nonce TEXT PRIMARY KEY, issued_at INTEGER NOT NULL, consumed_at INTEGER);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, address TEXT NOT NULL REFERENCES wallets(address), expires_at INTEGER NOT NULL);
      CREATE TABLE api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL REFERENCES wallets(address),
        key_hash TEXT NOT NULL UNIQUE, key_prefix TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL REFERENCES wallets(address),
        kind TEXT NOT NULL, delta_mc INTEGER NOT NULL, ref TEXT, meta TEXT, created_at TEXT NOT NULL);
      CREATE TABLE payments (nonce TEXT PRIMARY KEY, from_address TEXT NOT NULL, to_address TEXT NOT NULL,
        value_atomic TEXT NOT NULL, credits_mc INTEGER NOT NULL, status TEXT NOT NULL, tx_hash TEXT, error TEXT,
        created_at TEXT NOT NULL, settled_at TEXT);
      CREATE TABLE automatons (automaton_id TEXT PRIMARY KEY, address TEXT NOT NULL, creator_address TEXT NOT NULL,
        name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', genesis_prompt_hash TEXT, registered_at TEXT NOT NULL);
    `);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?,?,?)").run("0xa", 499_863, "2026-09-05T03:17:00Z");
    db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?,?,?,?,?)").run("0xa", "topup", 500_000, "0xalt", "2026-09-05T03:17:00Z");
    db.prepare("INSERT INTO ledger (address, kind, delta_mc, created_at) VALUES (?,?,?,?)").run("0xa", "inference", -137, "2026-09-05T03:18:00Z");
    db.prepare(
      "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at, settled_at) VALUES (?,?,?,?,?, 'settled', ?, ?)",
    ).run("0xalt", "0xa", "0xa", "5000000", 500_000, "2026-09-05T03:17:00Z", "2026-09-05T03:17:01Z");
    db.close();

    const vorher = new Database(alt, { readonly: true });
    const spalten = (t: string) => (vorher.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    expect(spalten("wallets")).not.toContain("reserved_mc");
    expect(spalten("payments")).not.toContain("balance_after_mc");
    vorher.close();

    const migriert = openDb(alt);
    offen.push(migriert);
    const namen = (t: string) => (migriert.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    expect(namen("wallets"), "der erste Start ergänzt reserved_mc").toContain("reserved_mc");
    expect(namen("payments"), "und balance_after_mc").toContain("balance_after_mc");
    expect(namen("kv"), "und legt die kv-Tabelle an").toContain("value");
    expect((migriert.prepare("SELECT balance_mc n FROM wallets WHERE address = '0xa'").get() as { n: number }).n, "die Salden bleiben unberührt").toBe(499_863);
    expect((migriert.prepare("SELECT count(*) n FROM kv").get() as { n: number }).n, "der Preiskatalog aus dem kv ist weg, der Start hängt wieder an OpenRouter").toBe(0);
  });
});

describe("Zurückgespielte Datei prüfen (ops/restore-pruefen.cjs)", () => {
  function pruefe(pfad: string): { code: number; ausgabe: string } {
    try {
      return { code: 0, ausgabe: execFileSync(process.execPath, [PRUEFEN, pfad], { encoding: "utf8" }) };
    } catch (err) {
      const e = err as { status: number; stdout: string };
      return { code: e.status, ausgabe: e.stdout };
    }
  }

  it("nimmt ein sauberes Backup ab", () => {
    const dir = tmpDir();
    const { pfad } = betriebsDatenbank(dir);
    const sicherung = path.join(dir, "cp-backup.db");
    backup(pfad, sicherung);

    const { code, ausgabe } = pruefe(sicherung);
    expect(code).toBe(0);
    expect(ausgabe).toContain("balance_mc == ledger_sum_mc je Wallet");
    expect(JSON.parse(ausgabe.trim().split("\n").pop() as string)).toMatchObject({ fehler: 0, wallets: 3, settled_ohne_buchung: 0 });
  });

  it("schlägt an, wenn eine x402-Nonce zwei Gutschriften hat", () => {
    // Der Bestandsfehler, wegen dem ledger_topup_ref nur mit try/catch angelegt wird. In einer
    // aktuellen Datenbank hält der Index ihn auf, ein altes Backup kann ihn noch enthalten: Dann
    // meldet der Start ihn nur ins Log und läuft weiter, und ohne diese Prüfung merkt es niemand.
    const dir = tmpDir();
    const alt = path.join(dir, "cp-alt.db");
    const db = new Database(alt);
    db.exec(`
      CREATE TABLE wallets (address TEXT PRIMARY KEY, balance_mc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, kind TEXT NOT NULL,
        delta_mc INTEGER NOT NULL, ref TEXT, meta TEXT, created_at TEXT NOT NULL);
      CREATE TABLE payments (nonce TEXT PRIMARY KEY, from_address TEXT NOT NULL, to_address TEXT NOT NULL,
        value_atomic TEXT NOT NULL, credits_mc INTEGER NOT NULL, status TEXT NOT NULL, tx_hash TEXT, error TEXT,
        created_at TEXT NOT NULL, settled_at TEXT);
      CREATE TABLE api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE automatons (automaton_id TEXT PRIMARY KEY, address TEXT NOT NULL, creator_address TEXT NOT NULL,
        name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', genesis_prompt_hash TEXT, registered_at TEXT NOT NULL);
      INSERT INTO wallets (address, balance_mc, created_at) VALUES ('0xa', 1000000, '2026-09-05T03:17:00Z');
      INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES ('0xa', 'topup', 500000, '0xnonce0', '2026-09-05T03:17:00Z');
      INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES ('0xa', 'topup', 500000, '0xnonce0', '2026-09-05T03:19:00Z');
      INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at, settled_at)
        VALUES ('0xnonce0', '0xa', '0xa', '5000000', 500000, 'settled', '2026-09-05T03:17:00Z', '2026-09-05T03:17:01Z');
    `);
    db.close();

    const { code, ausgabe } = pruefe(alt);
    expect(code, "eine doppelte Gutschrift darf nicht durchgehen").toBe(1);
    expect(ausgabe).toContain("0xnonce0 (2x)");
  });

  it("meldet ein Backup, dessen Schema älter ist als der Code, ohne es abzulehnen", () => {
    const dir = tmpDir();
    const alt = path.join(dir, "cp-alt.db");
    const db = new Database(alt);
    db.exec(`
      CREATE TABLE wallets (address TEXT PRIMARY KEY, balance_mc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, kind TEXT NOT NULL,
        delta_mc INTEGER NOT NULL, ref TEXT, meta TEXT, created_at TEXT NOT NULL);
      CREATE TABLE payments (nonce TEXT PRIMARY KEY, from_address TEXT NOT NULL, to_address TEXT NOT NULL,
        value_atomic TEXT NOT NULL, credits_mc INTEGER NOT NULL, status TEXT NOT NULL, tx_hash TEXT, error TEXT,
        created_at TEXT NOT NULL, settled_at TEXT);
      CREATE TABLE api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE automatons (automaton_id TEXT PRIMARY KEY, address TEXT NOT NULL, creator_address TEXT NOT NULL,
        name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', genesis_prompt_hash TEXT, registered_at TEXT NOT NULL);
    `);
    db.close();

    const { code, ausgabe } = pruefe(alt);
    expect(code, "ein altes Schema ist kein Grund, das Backup zu verwerfen").toBe(0);
    expect(ausgabe).toContain("Schema älter als der Code");
    expect(JSON.parse(ausgabe.trim().split("\n").pop() as string).schema_fehlt).toEqual([
      "wallets.reserved_mc",
      "payments.balance_after_mc",
      "kv",
    ]);
  });
});
