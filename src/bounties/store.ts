/**
 * Ausgeschriebene Auftraege, und das Geld dahinter.
 *
 * Ein Auftrag ohne hinterlegtes Geld ist ein Versprechen, das der Auftraggeber nicht halten muss.
 * Deshalb wird der Preis beim Einstellen sofort abgebucht: eine Ledger-Zeile `bounty_hold` mit
 * negativem Betrag. Das Guthaben des Auftraggebers sinkt, und der Auftrag traegt das Geld, bis er
 * zurueckgezogen oder vergeben wird.
 *
 * **Warum nicht ueber `wallets.reserved_mc`:** Diese Spalte wird bei jedem Start auf null gesetzt
 * (`migrate()` in src/db.ts), weil sie abgebrochene Inferenz-Reservierungen aufraeumt, und das ist
 * dort richtig. Fuer eine Hinterlegung waere es toedlich: Ein Deploy gaebe jedem Auftraggeber sein
 * Geld zurueck, waehrend sein Auftrag weiter ausgeschrieben ist, und niemand merkte es. Der Ledger
 * ist die dauerhafte Wahrheit, also liegt die Hinterlegung dort.
 *
 * Credits bleiben dabei, was sie sind: nicht auszahlbar und nur innerhalb dieses Control Plane
 * beweglich (loop-constraints.md). Ein Auftrag verschiebt sie zwischen zwei Konten desselben
 * Systems, mehr nicht.
 */

import { randomUUID } from "node:crypto";
import type { Db } from "../db.js";
import { postLedger } from "../db.js";

export type Auftragsart = "factual" | "creative";
export type Status = "open" | "cancelled" | "expired";

export interface Bounty {
  id: string;
  creator: string;
  kind: Auftragsart;
  brief: string;
  price_mc: number;
  deadline: string;
  status: Status;
  created_at: string;
  closed_at: string | null;
}

export const BRIEF_MAX = 20_000;
/** Ein Cent ist der kleinste sinnvolle Auftrag, 1.000 USD die Grenze gegen den Zahlendreher. */
export const PREIS_MIN_MC = 1_000;
export const PREIS_MAX_MC = 100_000_000;
/** Laenger als 30 Tage bindet Geld ohne Gegenwert; kuerzer als eine Minute schafft niemand. */
export const FRIST_MIN_MS = 60_000;
export const FRIST_MAX_MS = 30 * 24 * 3_600_000;

export class BountyError extends Error {
  constructor(readonly code: string, readonly status: number, readonly hint: string) {
    super(code);
  }
}

export interface NeuerAuftrag {
  creator: string;
  kind: Auftragsart;
  brief: string;
  priceMc: number;
  deadline: string;
}

/**
 * Einstellen und im selben Zug bezahlen.
 *
 * Beides in einer Transaktion: Ein Auftrag ohne Abbuchung waere Geld, das es nicht gibt, eine
 * Abbuchung ohne Auftrag waere Geld, das niemandem gehoert. `postLedger` oeffnet selbst eine
 * Transaktion; better-sqlite3 schachtelt das ueber Savepoints, die aeussere bleibt also die, die
 * zaehlt.
 */
export function auftragEinstellen(db: Db, a: NeuerAuftrag): Bounty {
  const brief = a.brief.trim();
  if (!brief) throw new BountyError("brief_required", 400, "The brief is what the agents work from; it cannot be empty.");
  if (brief.length > BRIEF_MAX) {
    throw new BountyError("brief_too_long", 400, `The brief is limited to ${BRIEF_MAX} characters; yours is ${brief.length}.`);
  }
  if (!Number.isInteger(a.priceMc) || a.priceMc < PREIS_MIN_MC || a.priceMc > PREIS_MAX_MC) {
    throw new BountyError(
      "price_out_of_range", 400,
      `price_cents must be a whole number between ${PREIS_MIN_MC / 1000} and ${PREIS_MAX_MC / 1000}.`,
    );
  }
  const frist = Date.parse(a.deadline);
  if (Number.isNaN(frist)) throw new BountyError("deadline_invalid", 400, "deadline must be an ISO 8601 timestamp.");
  const abstand = frist - Date.now();
  if (abstand < FRIST_MIN_MS) {
    throw new BountyError("deadline_too_soon", 400, "The deadline must be at least a minute away; nobody can work in less.");
  }
  if (abstand > FRIST_MAX_MS) {
    throw new BountyError("deadline_too_far", 400, "The deadline must be within 30 days; a longer one ties up money for nothing.");
  }

  const id = randomUUID();
  const jetzt = new Date().toISOString();
  const creator = a.creator.toLowerCase();

  const run = db.transaction(() => {
    db.prepare(
      "INSERT INTO bounties (id, creator, kind, brief, price_mc, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)",
    ).run(id, creator, a.kind, brief, a.priceMc, new Date(frist).toISOString(), jetzt);
    // Wirft "insufficient_balance", wenn das Guthaben nicht reicht; die Transaktion faellt
    // zurueck und der Auftrag existiert nie.
    postLedger(db, {
      address: creator,
      kind: "bounty_hold",
      deltaMc: -a.priceMc,
      ref: `bounty:${id}`,
      meta: { bounty_id: id, deadline: new Date(frist).toISOString() },
    });
  });
  try {
    run();
  } catch (e) {
    if ((e as Error).message === "insufficient_balance") {
      throw new BountyError("insufficient_balance", 402, "A bounty is paid when it is posted, not when it is awarded. Top up first.");
    }
    throw e;
  }
  return auftragLesen(db, id)!;
}

export function auftragLesen(db: Db, id: string): Bounty | null {
  return (db.prepare("SELECT * FROM bounties WHERE id = ?").get(id) as Bounty | undefined) ?? null;
}

/** Offene Auftraege, deren Frist noch laeuft, aelteste zuerst: wer laenger wartet, kommt zuerst. */
export function offeneAuftraege(db: Db, limit = 50): Bounty[] {
  return db
    .prepare("SELECT * FROM bounties WHERE status = 'open' AND deadline > ? ORDER BY created_at LIMIT ?")
    .all(new Date().toISOString(), Math.min(Math.max(limit, 1), 200)) as Bounty[];
}

/**
 * Zurueckziehen und das Geld zurueckgeben.
 *
 * Nur der Auftraggeber, und nur einmal: Die Bedingung `status = 'open'` im UPDATE ist das, was
 * einen doppelten Aufruf unschaedlich macht. Ohne sie zahlte der zweite Aufruf ein zweites Mal
 * zurueck, und das Geld waere aus dem Nichts entstanden.
 */
export function auftragZurueckziehen(db: Db, id: string, wer: string): Bounty {
  const adresse = wer.toLowerCase();
  const auftrag = auftragLesen(db, id);
  if (!auftrag) throw new BountyError("not_found", 404, "No bounty with that id.");
  if (auftrag.creator !== adresse) throw new BountyError("not_yours", 403, "Only the address that posted a bounty can withdraw it.");
  if (auftrag.status !== "open") throw new BountyError("not_open", 409, `This bounty is already ${auftrag.status}.`);

  const run = db.transaction(() => {
    const res = db
      .prepare("UPDATE bounties SET status = 'cancelled', closed_at = ? WHERE id = ? AND status = 'open'")
      .run(new Date().toISOString(), id);
    if (res.changes !== 1) throw new BountyError("not_open", 409, "This bounty is no longer open.");
    postLedger(db, {
      address: adresse,
      kind: "bounty_release",
      deltaMc: auftrag.price_mc,
      ref: `bounty-release:${id}`,
      meta: { bounty_id: id },
    });
  });
  run();
  return auftragLesen(db, id)!;
}

/**
 * Abgelaufene Auftraege schliessen und das hinterlegte Geld zurueckgeben.
 *
 * Ohne diesen Durchlauf liegt das Geld eines Auftrags, dessen Frist verstreicht, ohne dass jemand
 * vergibt, fuer immer fest. Der Auftraggeber sieht es nicht mehr im Guthaben, bekommt aber auch
 * nichts dafuer, und keine Zeile im Ledger erklaert, wo es geblieben ist.
 *
 * `expired` und nicht `cancelled`: Dieselbe Geldbewegung, aber eine andere Geschichte, und wer
 * spaeter wissen will, warum ein Markt nicht funktioniert, muss die beiden unterscheiden koennen.
 * Ein zurueckgezogener Auftrag ist ein Auftraggeber, der es sich anders ueberlegt hat; ein
 * abgelaufener ist einer, fuer den niemand gearbeitet hat.
 *
 * Laeuft beim Start und zu Beginn jeder Auftragsanfrage. Das deckt jeden Fall ab, in dem jemand
 * den Markt anfasst; was es nicht deckt, ist ein Dienst, den monatelang niemand aufruft. Dann
 * liegt das Geld bis zum naechsten Start, und der kommt bei jedem Deploy.
 */
export function abgelaufeneFreigeben(db: Db, jetzt = new Date()): number {
  const faellig = db
    .prepare("SELECT id, creator, price_mc FROM bounties WHERE status = 'open' AND deadline <= ?")
    .all(jetzt.toISOString()) as { id: string; creator: string; price_mc: number }[];
  let freigegeben = 0;
  for (const b of faellig) {
    const run = db.transaction(() => {
      // Die Bedingung steht im UPDATE, nicht nur in der Abfrage davor: Zwei gleichzeitige
      // Durchlaeufe wuerden sonst beide zurueckzahlen, und Geld entstuende aus dem Nichts.
      const res = db
        .prepare("UPDATE bounties SET status = 'expired', closed_at = ? WHERE id = ? AND status = 'open'")
        .run(jetzt.toISOString(), b.id);
      if (res.changes !== 1) return false;
      postLedger(db, {
        address: b.creator,
        kind: "bounty_release",
        deltaMc: b.price_mc,
        ref: `bounty-expired:${b.id}`,
        meta: { bounty_id: b.id, grund: "deadline" },
      });
      return true;
    });
    if (run()) freigegeben++;
  }
  return freigegeben;
}
