/**
 * /datenschutz, the privacy notice for the order page (HAN-26, 2026-09-29).
 *
 * Recht's condition for Goal 21: the email field and this page go live together, because Art. 13
 * GDPR asks for more than fits in the sentence under the field. The text is Recht's draft, not
 * legal advice; a lawyer reads it before the first live payment.
 *
 * The periods are not typed here. They come from `cleanupOrderBriefs` in src/db.ts and from the
 * access log setting in deploy/Caddyfile (test/order-brief.test.ts holds the second), so the page
 * cannot promise a deletion the code does not do. `/openapi.json` once documented a price tier
 * that answered 400; that is the mistake this avoids.
 *
 * The controller named is the one in the Impressum on /terms, so both pages agree. Whether it has
 * to be HTC once Stripe runs live over HTC is Matthias' call and open.
 */
import { PAID_BRIEF_DAYS, UNPAID_BRIEF_DAYS } from "../db.js";

/** Days Caddy keeps an access log line: `roll_keep_for 720h` in deploy/Caddyfile. */
export const ACCESS_LOG_DAYS = 30;

export function renderPrivacy(): string {
  return `
  <section>
    <div class="wrap narrow doc">
      <h1 class="ph">Datenschutz</h1>
      <p class="sub">Was wir speichern, wenn Sie die Seite aufrufen oder bestellen, wie lange, und welche Rechte Sie haben.</p>

      <h2>Wer verantwortlich ist</h2>
      <p>Matthias Hippe, San-Francisco-Straße 1, 20457 Hamburg,
        <a href="mailto:matthias@hanseatictech.de">matthias@hanseatictech.de</a>.</p>

      <h2>Wenn Sie die Seite aufrufen</h2>
      <p>Unser Server schreibt bei jedem Aufruf eine Zeile: Ihre IP-Adresse, die Uhrzeit, die
        aufgerufene Adresse und die Kennung Ihres Browsers. Das brauchen wir, um die Seite zu
        betreiben und Angriffe abzuwehren (Art. 6 Abs. 1 Buchst. f DSGVO). Nach ${ACCESS_LOG_DAYS} Tagen
        ist die Zeile gelöscht. Wir setzen keine Cookies, benutzen keine Analyse-Werkzeuge und laden
        nichts von fremden Servern.</p>

      <h2>Wenn Sie bestellen</h2>
      <p>Wir speichern Ihre Angaben zum Text und Ihre E-Mail-Adresse, um die Bestellung zu
        bearbeiten und Sie dazu zu erreichen (Art. 6 Abs. 1 Buchst. b DSGVO). Ohne beides können Sie
        nicht bestellen. Schreiben Sie bitte nur hinein, was der Text braucht; wenn es um andere
        Menschen geht, etwa in einer Rede, nur das, womit diese einverstanden wären.</p>

      <h2>Bezahlen</h2>
      <p>Die Zahlung läuft über Stripe (Stripe Payments Europe, Ltd., Dublin, Irland). Stripe bekommt
        Ihre E-Mail-Adresse von uns und Ihre Kartendaten direkt von Ihnen; Ihre Kartendaten sehen wir
        nie. Stripe verarbeitet Daten auch in den USA. Stripes eigene Hinweise:
        <a href="https://stripe.com/de/privacy">stripe.com/de/privacy</a>.</p>

      <h2>Wie lange</h2>
      <p>Bezahlen Sie nicht, löschen wir Angaben und Adresse nach ${UNPAID_BRIEF_DAYS} Tagen. Bezahlen
        Sie, löschen wir sie ${PAID_BRIEF_DAYS} Tage nach der Zahlung. Werbung schicken wir Ihnen
        nicht.</p>

      <h2>Ihre Rechte</h2>
      <p>Sie können Auskunft verlangen, Berichtigung, Löschung, Einschränkung und Ihre Daten in einer
        üblichen Datei, und Sie können der Protokollierung widersprechen. Eine E-Mail an
        <a href="mailto:matthias@hanseatictech.de">matthias@hanseatictech.de</a> genügt. Sie können
        sich auch bei einer Aufsichtsbehörde beschweren, in Hamburg beim Hamburgischen Beauftragten
        für Datenschutz und Informationsfreiheit.</p>

      <p class="fine"><a href="/katalog">Zum Katalog</a></p>
    </div>
  </section>`;
}
