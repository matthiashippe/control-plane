/**
 * Zusammenlegen gleichzeitiger, identischer Inferenz-Anfragen.
 *
 * Warum das nötig ist: Die Upstream-Runtime bricht einen Inferenz-Aufruf nach 60 Sekunden ab
 * (`INFERENCE_TIMEOUT_MS` in `conway/inference.ts`) und wiederholt ihn bei 429, 500, 502, 503 und
 * 504. Unser eigener Aufruf beim Einkaufsanbieter läuft dagegen bis zu 120 Sekunden. Dauert eine
 * Antwort dazwischen, sieht der Client einen Timeout und schickt denselben Request erneut, während
 * der erste noch läuft. Ohne Zusammenlegung kaufen wir dann zweimal ein und buchen zweimal ab: der
 * Kunde zahlt doppelt für eine Antwort, die er einmal bekommt.
 *
 * Das ist derselbe Fehler, den Conway beim Aufladen hat (Issue #393, "Retry-driven duplicate USDC
 * topups"), und der Grund, warum dort 44 Wallets im Schnitt mehr als zwei Zahlungen im Monat
 * auslösen. Wir dokumentieren diesen Fehler in unserer eigenen Marktrecherche; ihn selbst zu haben
 * wäre peinlich und teuer.
 *
 * Bewusst eng gefasst: Zusammengelegt wird nur, solange der erste Aufruf **noch läuft**. Zwei
 * absichtlich gleiche Anfragen nacheinander bekommen weiterhin zwei Antworten, und bei
 * `temperature > 0` bleibt die Varianz erhalten, die ein Agent erwarten darf.
 */

import { createHash } from "node:crypto";

/** Alles, was die Antwort bestimmt. Die Adresse ist dabei, damit nie über Mandanten hinweg geteilt wird. */
export function anfrageSchluessel(address: string, body: unknown): string {
  return createHash("sha256")
    .update(address.toLowerCase())
    .update("\u0000")
    .update(JSON.stringify(body ?? null))
    .digest("hex");
}

export class AnfrageZusammenleger<T> {
  private readonly laufend = new Map<string, Promise<T>>();

  /**
   * Führt `arbeit` aus, oder hängt sich an einen bereits laufenden Aufruf mit demselben Schlüssel.
   * Gibt zusätzlich zurück, ob dieser Aufruf der erste war; das gehört ins Ledger-Meta, damit im
   * Nachhinein sichtbar ist, wie oft Retries zusammengelegt wurden.
   */
  async ausfuehren(schluessel: string, arbeit: () => Promise<T>): Promise<{ wert: T; zusammengelegt: boolean }> {
    const vorhanden = this.laufend.get(schluessel);
    if (vorhanden) return { wert: await vorhanden, zusammengelegt: true };

    const p = arbeit();
    this.laufend.set(schluessel, p);
    try {
      return { wert: await p, zusammengelegt: false };
    } finally {
      // Erst nach Abschluss entfernen, nicht vorher: Sonst startet ein Retry, der eine Millisekunde
      // zu spät kommt, doch einen zweiten Einkauf.
      this.laufend.delete(schluessel);
    }
  }

  /** Nur für Tests und Diagnose. */
  anzahlLaufend(): number {
    return this.laufend.size;
  }
}
