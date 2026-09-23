import { describe, expect, it } from "vitest";
import { reviewBrief } from "../src/bounties/brief.js";

const gut_de =
  "FACT SHEET ueber den Energieausweis (Verbrauchs- oder Bedarfsausweis) fuer ein Mehrfamilienhaus " +
  "von 1974 mit sechs Wohnungen und Gasheizung, fuer einen Vermieter, der zum ersten Mal einen " +
  "bestellt. 400 bis 500 Woerter in fuenf Abschnitten: was der Ausweis ist, welcher der beiden " +
  "Typen hier gilt und warum, was der Vermieter beibringen muss, was es kostet und wie lange es " +
  "dauert, und was passiert, wenn er bei einer Besichtigung fehlt. Nur den Text abgeben, kein " +
  "Anschreiben. Keinen Preis eines einzelnen Anbieters nennen und kein Gesetz ohne " +
  "Paragraphennummer zitieren.";

const gut_de_umlaute = gut_de
  .replace(/fuer/g, "für").replace(/Woerter/g, "Wörter").replace(/fuenf/g, "fünf");

const schlecht_de =
  "FACT SHEET ueber den Energieausweis fuer ein Mehrfamilienhaus von 1974 mit sechs Wohnungen " +
  "und Gasheizung.";

describe("the check reads German as well as English", () => {
  it("finds nothing wrong with a German brief that says everything", () => {
    expect(reviewBrief(gut_de, "factual").map((f) => f.id)).toEqual([]);
  });

  it("does the same with real umlauts, because a web form produces those", () => {
    expect(reviewBrief(gut_de_umlaute, "factual").map((f) => f.id)).toEqual([]);
  });

  // The other direction, and the one that matters more: teaching it German must not make it blind.
  // Asserted on ids and not on wording, since a German brief now answers in German and the point
  // here is which checks fired, not what they said.
  it("still names what a short German brief leaves out", () => {
    const ids = reviewBrief(schlecht_de, "factual").map((x) => x.id);
    expect(ids.length, "a fifteen-word brief is missing several things").toBeGreaterThanOrEqual(3);
    expect(ids).toContain("no_length");
    expect(ids).toContain("no_deliverable");
  });

  it("names each thing only when it is really absent, one at a time", () => {
    const ohneLaenge = gut_de.replace("400 bis 500 Woerter in fuenf Abschnitten", "in Abschnitten");
    expect(reviewBrief(ohneLaenge, "factual").map((f) => f.id)).toEqual(["no_length"]);
    const ohneAbgabe = gut_de.replace("Nur den Text abgeben, kein Anschreiben.", "");
    expect(reviewBrief(ohneAbgabe, "factual").map((f) => f.id)).toEqual(["no_deliverable"]);
  });

  // Die andere Richtung der deutschen Muster, und die teurere: "kein" kommt im Deutschen
  // beschreibend vor ("das keinen Keller hat"), und wenn das als Verbot zaehlt, schweigt der
  // Check ueber eine echte Luecke. Ein falscher Befund aergert, ein ausgelassener ist wertlos.
  it("does not read a described absence as a prohibition", () => {
    const beschreibend =
      "FACT SHEET ueber ein Reihenhaus von 1998 in Kiel, das keinen Keller und keine Garage hat, " +
      "fuer einen Kaeufer, der zum ersten Mal kauft. 300 Woerter. Nur den Text abgeben.";
    expect(reviewBrief(beschreibend, "factual").map((f) => f.id)).toContain("nothing_ruled_out");
  });

  it("stays quiet about it when the brief really forbids something", () => {
    const verbietend =
      "FACT SHEET ueber ein Reihenhaus von 1998 in Kiel fuer einen Kaeufer, der zum ersten Mal " +
      "kauft. 300 Woerter. Nur den Text abgeben. Keinen Preis eines einzelnen Anbieters nennen " +
      "und kein Gesetz ohne Paragraphennummer zitieren.";
    expect(reviewBrief(verbietend, "factual").map((f) => f.id)).not.toContain("nothing_ruled_out");
  });
});

// Measured on 2026-09-23 over 50 real German commissions with real money behind them (freelance
// project postings and public tender descriptions, collected outside the repository because the
// texts belong to other people): 12 of the 50 were told they had left out something their own
// text carried. Every case below is one of those briefs, shortened to the sentence that refutes
// the finding, and every case is asserted in both directions, because the cheaper failure is the
// one where teaching the check a new phrase makes it blind to a brief that really is missing it.
const contract_base =
  "Auftragsgegenstand ist die redaktionelle Betreuung des Internetportals einer Behoerde: " +
  "Aktualisierung bestehender Inhalte, Erstellung neuer Beitraege und die Abstimmung mit dem " +
  "Fachreferat. Der Vertrag laeuft zwei Jahre und wird danach neu ausgeschrieben.";

const idsFor = (text: string) => reviewBrief(text, "factual").map((f) => f.id);

describe("the check does not accuse a German brief of leaving out what it says", () => {
  // "Die technische Betreuung ... ist nicht Bestandteil der Ausschreibung" draws the scope from
  // the outside, which answers two of the four questions at once. Four of the 50 briefs said it.
  it("reads a scope drawn by exclusion as both a deliverable and a ban", () => {
    const withScope = `${contract_base} Die technische Betreuung des Internetauftritts ist nicht Bestandteil dieses Vertrages.`;
    expect(idsFor(withScope)).not.toContain("no_deliverable");
    expect(idsFor(withScope)).not.toContain("nothing_ruled_out");
    expect(idsFor(contract_base)).toContain("no_deliverable");
    expect(idsFor(contract_base)).toContain("nothing_ruled_out");
  });

  it("does the same for a scope drawn with umfasst keine", () => {
    const withScope = `${contract_base} Die Leistung umfasst keine grafische Gestaltung.`;
    expect(idsFor(withScope)).not.toContain("no_deliverable");
    expect(idsFor(withScope)).not.toContain("nothing_ruled_out");
  });

  it("reads nicht gewuenscht as a ban, and stays loud without it", () => {
    const banned = `${contract_base} Allgemeine oder austauschbare Texte sind nicht gewuenscht.`;
    expect(idsFor(banned)).not.toContain("nothing_ruled_out");
    expect(idsFor(contract_base)).toContain("nothing_ruled_out");
  });

  it("reads a Was ich nicht suche section as a ban", () => {
    const banned = `${contract_base} Was ich nicht suche: Floskeln, Fuellwoerter und Superlative.`;
    expect(idsFor(banned)).not.toContain("nothing_ruled_out");
  });

  it("reads a banned kind of text as a ban, without reading a described absence as one", () => {
    const banned = `${contract_base} Reine Datenpflege der Artikel, keine Produkttexte.`;
    expect(idsFor(banned)).not.toContain("nothing_ruled_out");
    const described = `${contract_base} Das Portal hat keinen Kalender und keine Suchfunktion.`;
    expect(idsFor(described)).toContain("nothing_ruled_out");
  });

  // The one that had to be measured rather than guessed: "nicht X, sondern Y" forbids X, while
  // "nicht nur X, sondern auch Y" adds Y and forbids nothing. Three of the 50 briefs used the
  // second one, and reading it as a ban would have silenced the check on all three.
  it("reads nicht X sondern Y as a ban and nicht nur X sondern auch Y as none", () => {
    const redirected = `${contract_base} Die Beitraege sind nicht auf Suchmaschinen ausgerichtet, sondern auf fachliche Genauigkeit.`;
    expect(idsFor(redirected)).not.toContain("nothing_ruled_out");
    const widened = `${contract_base} Die Beitraege erscheinen nicht nur im Portal, sondern auch im Newsletter.`;
    expect(idsFor(widened)).toContain("nothing_ruled_out");
  });

  it("reads Erwartetes Ergebnis as the statement of what is handed in", () => {
    const withResult = `${contract_base} Erwartetes Ergebnis: ein fertiger Beitrag im Redaktionssystem.`;
    expect(idsFor(withResult)).not.toContain("no_deliverable");
    expect(idsFor(contract_base)).toContain("no_deliverable");
  });

  // A page and a Normzeile are lengths. The Normzeile is the unit every German translation
  // contract is priced in, and one of the 50 gave its whole volume in it.
  it("counts pages and Normzeilen as a length, but not a page number", () => {
    expect(idsFor(`${contract_base} Jeder Beitrag hat hoechstens 12 Seiten.`)).not.toContain("no_length");
    expect(idsFor(`${contract_base} Das Volumen betraegt 508.727 Normzeilen.`)).not.toContain("no_length");
    expect(idsFor(`${contract_base} Das Impressum steht auf Seite 3 des Hefts.`)).toContain("no_length");
    expect(idsFor(contract_base)).toContain("no_length");
  });

  // German names its audience without an article far more often than with one. The two counter
  // cases are the reason the group has to be a word for people: an agency writing "fuer unseren
  // Kunden" is talking about its client, and "verschiedene Zielgruppen" names nobody.
  it("reads fuer plus a group of people as a reader, and neither client nor Zielgruppen as one", () => {
    const named = `${contract_base} Geschrieben wird fuer Lehrkraefte, Fachkraefte und Eltern.`;
    expect(idsFor(named)).not.toContain("no_reader");
    const investors = `${contract_base} Die Beitraege entstehen fuer Finanzberater und private Anleger.`;
    expect(idsFor(investors)).not.toContain("no_reader");
    expect(idsFor(`${contract_base} Fuer unseren Kunden suchen wir kurzfristig Unterstuetzung.`)).toContain("no_reader");
    expect(idsFor(`${contract_base} Die Inhalte werden fuer verschiedene Zielgruppen aufbereitet.`)).toContain("no_reader");
    expect(idsFor(contract_base)).toContain("no_reader");
  });
});
