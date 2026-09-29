/**
 * Kein Pfad unter /v1 darf ein variables Segment haben, solange die Auth-Middleware mit `has()`
 * gegen eine Liste exakter Pfade entscheidet.
 *
 * Die Regel stand seit dem Bau der Bounty-Routen als Kommentar im Code und ist am 29.09.2026
 * trotzdem gebrochen worden: `POST /v1/submissions/:id/feedback` lief an der Middleware vorbei,
 * `c.get("address")` war undefined, und der Handler antwortete 500 statt 401. Ein Kommentar haelt
 * eine Regel nicht, ein Test tut es.
 *
 * Die Gegenprobe steht darunter: der Test faellt auch dann, wenn ein exakter Pfad unter /v1 in der
 * App existiert, den die Middleware nicht kennt. Beide Richtungen, sonst prueft er nur die eine.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { V1_KEYLESS, V1_ROUTES } from "../src/app.js";

/** Die Wildcards, die absichtlich ohne Schluessel antworten, jede mit ihrem Grund. */
const ERLAUBTE_WILDCARDS = new Map([
  ["/v1/*", "die Auth-Middleware selbst"],
  ["/v1/auth/*", "eigene Middleware, die den 405 fuer nonce und verify traegt"],
  ["/v1/briefs/*", "eigene Middleware, /v1/briefs/check braucht keinen Schluessel"],
  ["/v1/sandboxes/*", "antwortet immer 501, ohne jemals eine Adresse zu lesen"],
  // Zwei exakte Pfade, die absichtlich ausserhalb der Liste liegen, jeder mit seinem Grund im Code:
  ["/v1/models", "bewusst nicht in V1_ROUTES, weil jeder OpenAI-Client ihn ohne Schluessel ruft"],
  ["/v1/briefs/check", "eigene Middleware darueber, braucht keinen Schluessel"],
]);

function v1Pfade() {
  const app = createApp({ db: openDb(":memory:") });
  const routes = (app as unknown as { routes: { path: string; method: string }[] }).routes;
  return [...new Set(routes.map((r) => r.path))].filter((p) => p.startsWith("/v1"));
}

describe("Pfade unter /v1", () => {
  it("haben kein variables Segment, weil die Middleware sie sonst nicht erkennt", () => {
    const variabel = v1Pfade().filter((p) => p.split("/").some((seg) => seg.startsWith(":")));
    expect(variabel).toEqual([]);
  });

  it("sind der Auth-Middleware alle bekannt, bis auf die benannten Wildcards", () => {
    const unbekannt = v1Pfade().filter(
      (p) => !V1_ROUTES.has(p) && !ERLAUBTE_WILDCARDS.has(p),
    );
    expect(unbekannt).toEqual([]);
  });

  it("faellt, wenn ein Pfad zwar in der Liste steht, aber keine Route dahinter liegt", () => {
    const vorhanden = new Set(v1Pfade());
    const verwaist = [...V1_ROUTES].filter((p) => !vorhanden.has(p));
    expect(verwaist).toEqual([]);
  });

  it("zaehlt /v1/models weiter als keyless, damit die Gegenprobe echte Pfade sieht", () => {
    expect([...V1_KEYLESS].every((p) => v1Pfade().includes(p))).toBe(true);
  });
});
