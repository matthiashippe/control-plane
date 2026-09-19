/**
 * Fehlerantworten, die einem Menschen sagen, was los ist und was er tun kann.
 *
 * Regeln, die hier durchgehalten werden und an denen jede neue Meldung gemessen wird:
 *
 * - Das Feld `error` bleibt, wie es ist. Die Upstream-Runtime entscheidet zwar nach Statuscode
 *   und nicht nach unserem Körper, aber sie packt den ganzen Body in `err.message`
 *   (`src/conway/client.ts:73` der Revision d8f8168) und sucht darin den Marker
 *   `INSUFFICIENT_CREDITS` (`src/conway/topup.ts:97`, `src/agent/tools.ts:1655`,
 *   `src/agent/loop.ts:247`). Ergänzt wird deshalb nur, nie ersetzt, und keine Meldung nimmt
 *   diesen Marker in den Mund, die nicht wirklich Guthabenmangel meint.
 * - `message` ist ein bis drei Sätze: was passiert ist, warum es so gewollt ist, und der nächste
 *   Schritt. Kein Stacktrace, kein Dateipfad, kein Hinweis auf andere Mandanten.
 * - `docs` zeigt auf den passenden Abschnitt von `docs/errors.md`.
 *
 * Englisch, weil die Leser fremde Betreiber und ihre Agenten sind: dieselbe Sprache wie
 * `/llms.txt`, `/.well-known/x402` und die bestehenden Meldungen.
 */

const DOCS_BASE = "https://github.com/matthiashippe/control-plane/blob/main/docs/errors.md";

/** URL auf einen Abschnitt der Fehlerdokumentation. */
export function docs(anchor: string): string {
  return `${DOCS_BASE}#${anchor}`;
}

/** Anker in `docs/errors.md`. Als Konstanten, damit Tippfehler beim Bauen auffallen. */
export const DOC = {
  authentication: docs("authentication"),
  inference: docs("inference"),
  models: docs("model_not_found"),
  payments: docs("payments"),
  rateLimits: docs("rate_limited"),
  registration: docs("registration"),
  sandboxes: docs("sandboxes"),
  service: docs("service-errors"),
  transfers: docs("credit_transfers"),
} as const;
