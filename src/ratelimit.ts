/**
 * Einfaches Rate Limiting für die Pfade, die ohne API-Key erreichbar sind.
 *
 * Warum überhaupt: `/v1/auth/nonce`, `/v1/auth/verify`, `/v1/auth/api-keys` und `/pay/...`
 * schreiben je Aufruf in die Datenbank, `/pay` löst zusätzlich einen Request an den Facilitator
 * aus. Ohne Grenze kann jeder die Platte füllen und unsere Facilitator-Kosten treiben
 * (Sicherheitsprüfung 19.09.2026). Ein API-Key kostet nichts, also hilft es nicht, erst dahinter
 * zu begrenzen.
 *
 * Bewusst im Prozess und ohne Abhängigkeit: Der Dienst läuft als ein Container, ein Neustart
 * setzt die Zähler zurück, und das ist verkraftbar. Ein verteilter Limiter wäre hier
 * Scheingenauigkeit.
 */

/** Ein Fenster je Schlüssel: Zählerstand und wann das Fenster begann. */
interface Fenster {
  anzahl: number;
  seit: number;
}

export interface RateLimitOptions {
  /** Erlaubte Anfragen je Fenster. */
  limit: number;
  /** Fensterlänge in Millisekunden. */
  fensterMs: number;
  /** Testbare Uhr. */
  now?: () => number;
  /** Obergrenze für die Zahl beobachteter Schlüssel, damit der Limiter nicht selbst zum Leck wird. */
  maxSchluessel?: number;
}

export class RateLimiter {
  private readonly fenster = new Map<string, Fenster>();
  private readonly limit: number;
  private readonly fensterMs: number;
  private readonly now: () => number;
  private readonly maxSchluessel: number;

  constructor(opts: RateLimitOptions) {
    this.limit = opts.limit;
    this.fensterMs = opts.fensterMs;
    this.now = opts.now ?? Date.now;
    this.maxSchluessel = opts.maxSchluessel ?? 50_000;
  }

  /** true = durchlassen. Bei false steht in `retryAfterSec`, wie lange das Fenster noch läuft. */
  pruefe(schluessel: string): { erlaubt: boolean; retryAfterSec: number } {
    const jetzt = this.now();
    const vorhanden = this.fenster.get(schluessel);

    if (!vorhanden || jetzt - vorhanden.seit >= this.fensterMs) {
      // Beim Anlegen eines neuen Schlüssels abgelaufene Einträge wegräumen. Das verteilt die
      // Aufräumarbeit über die Aufrufe, statt einen Timer zu brauchen.
      if (this.fenster.size >= this.maxSchluessel) this.raeumeAuf(jetzt);
      this.fenster.set(schluessel, { anzahl: 1, seit: jetzt });
      return { erlaubt: true, retryAfterSec: 0 };
    }

    vorhanden.anzahl += 1;
    if (vorhanden.anzahl > this.limit) {
      return { erlaubt: false, retryAfterSec: Math.ceil((vorhanden.seit + this.fensterMs - jetzt) / 1000) };
    }
    return { erlaubt: true, retryAfterSec: 0 };
  }

  private raeumeAuf(jetzt: number): void {
    for (const [schluessel, f] of this.fenster) {
      if (jetzt - f.seit >= this.fensterMs) this.fenster.delete(schluessel);
    }
    // Wenn danach immer noch alles voll ist, läuft ein verteilter Angriff. Dann lieber den
    // ältesten Teil verwerfen als unbegrenzt Speicher zu belegen.
    if (this.fenster.size >= this.maxSchluessel) {
      const haelfte = Math.floor(this.fenster.size / 2);
      let i = 0;
      for (const schluessel of this.fenster.keys()) {
        if (i++ >= haelfte) break;
        this.fenster.delete(schluessel);
      }
    }
  }

  /** Nur für Tests und Diagnose. */
  groesse(): number {
    return this.fenster.size;
  }
}

/**
 * Client-IP hinter Caddy. `X-Forwarded-For` ist vom Client fälschbar, aber Caddy hängt die echte
 * Adresse als letzten Eintrag an, deshalb wird von hinten gelesen. Fehlt der Header, greift ein
 * fester Schlüssel: Dann begrenzen wir eben global, was immer noch besser ist als gar nicht.
 */
export function clientSchluessel(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const teile = xff.split(",").map((t) => t.trim()).filter(Boolean);
    if (teile.length) return teile[teile.length - 1];
  }
  return headers.get("x-real-ip") ?? "unbekannt";
}
