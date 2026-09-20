/**
 * Jede Zahl, die in einer Veroeffentlichung steht, wird hier gegen die Rohdaten nachgerechnet.
 *
 * Der Grund ist unangenehm konkret: Am 20.09. stand im Titel des Artikels "By June, three were
 * left", waehrend die Tabelle zwei Zeilen darunter 34 nannte. Beides war fuer sich richtig und
 * zusammen ein Widerspruch, den der erste Kommentar gefunden haette. Zahlen in Texten veralten
 * lautlos; dieser Test macht daraus einen roten Lauf.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * CSV mit Anfuehrungszeichen. Ein `split(",")` reicht nicht: Beschreibungen und Adressen enthalten
 * Kommata, und die Spalten verrutschen dann lautlos. Der erste Entwurf dieses Tests tat genau das
 * und rechnete 138 statt 130, also eine falsche Zahl, die fast in den Bericht gewandert waere.
 */
function zerlege(zeile: string): string[] {
  const felder: string[] = [];
  let feld = "";
  let inAnfuehrung = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (inAnfuehrung) {
      if (c === '"') {
        if (zeile[i + 1] === '"') { feld += '"'; i++; } else inAnfuehrung = false;
      } else feld += c;
    } else if (c === '"') inAnfuehrung = true;
    else if (c === ",") { felder.push(feld); feld = ""; }
    else feld += c;
  }
  felder.push(feld);
  return felder;
}

function csv(name: string): Record<string, string>[] {
  const text = readFileSync(fileURLToPath(new URL(`../docs/research/data/${name}`, import.meta.url)), "utf8");
  const [kopf, ...zeilen] = text.trim().split("\n");
  const felder = kopf.split(",");
  return zeilen.map((z) => Object.fromEntries(felder.map((f, i) => [f, zerlege(z)[i] ?? ""])));
}

function text(pfad: string): string {
  return readFileSync(fileURLToPath(new URL(`../docs/research/${pfad}`, import.meta.url)), "utf8");
}

describe("Die Zahlen im x402-Nachfragebericht stimmen mit den Rohdaten", () => {
  const zeilen = csv("2026-09-20-x402-verzeichnis.csv");
  const cdp = zeilen.filter((r) => r.verzeichnis === "cdp");
  const bericht = text("2026-09-20-x402-nachfrage.md");
  const zahl = (s: string) => (s === "" ? null : Number(s));

  it("nennt die richtige Zahl der Dienste je Verzeichnis", () => {
    expect(bericht).toContain(String(cdp.length).replace(/\B(?=(\d{3})+(?!\d))/g, "."));
    expect(bericht).toContain(String(zeilen.filter((r) => r.verzeichnis === "payai").length).replace(/\B(?=(\d{3})+(?!\d))/g, "."));
  });

  it("nennt die richtige Zahl der Dienste mit zwanzig Zahlern oder mehr", () => {
    const n = cdp.filter((r) => (zahl(r.unique_payers_30d) ?? 0) >= 20).length;
    expect(n, "die Kernaussage der Ueberschrift").toBe(130);
    expect(bericht).toMatch(new RegExp(`\\b${n}\\b`));
    expect(bericht).toMatch(new RegExp(`${n} zwanzig Kunden oder mehr`));
  });

  it("nennt die richtige Zahl der Dienste mit genau einer zahlenden Wallet", () => {
    const eins = cdp.filter((r) => zahl(r.unique_payers_30d) === 1);
    expect(bericht).toContain("10.340");
    expect(eins.length).toBe(10340);
    const bis3 = eins.filter((r) => (zahl(r.calls_30d) ?? 0) <= 3).length;
    expect(Math.round((bis3 / eins.length) * 1000) / 10, "89,5 Prozent dieser Gruppe").toBe(89.5);
  });

  it("nennt die richtige Summe der Aufrufe und die richtige Konzentration", () => {
    const calls = cdp.map((r) => zahl(r.calls_30d)).filter((c): c is number => c !== null);
    const summe = calls.reduce((a, b) => a + b, 0);
    expect(summe).toBe(490044);
    expect(bericht).toContain("490.044");
    const top10 = [...calls].sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0);
    expect(Math.round((top10 / summe) * 1000) / 10).toBe(58.8);
    expect(bericht).toContain("58,8 Prozent");
  });

  it("behauptet nichts ueber Conway-Eintraege, was nicht in den Daten steht", () => {
    const conway = zeilen.filter((r) => (r.resource ?? "").toLowerCase().includes("conway")).length;
    expect(conway, "im Bericht steht: genau einer").toBe(1);
  });
});
