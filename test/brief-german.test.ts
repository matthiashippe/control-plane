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
    expect(reviewBrief(gut_de, "factual").map((f) => f.missing)).toEqual([]);
  });

  it("does the same with real umlauts, because a web form produces those", () => {
    expect(reviewBrief(gut_de_umlaute, "factual").map((f) => f.missing)).toEqual([]);
  });

  // The other direction, and the one that matters more: teaching it German must not make it blind.
  it("still names what a short German brief leaves out", () => {
    const f = reviewBrief(schlecht_de, "factual").map((x) => x.missing);
    expect(f.length, "a fifteen-word brief is missing several things").toBeGreaterThanOrEqual(3);
    expect(f.join(" ")).toMatch(/length/i);
    expect(f.join(" ")).toMatch(/hand in/i);
  });

  it("names each thing only when it is really absent, one at a time", () => {
    const ohneLaenge = gut_de.replace("400 bis 500 Woerter in fuenf Abschnitten", "in Abschnitten");
    expect(reviewBrief(ohneLaenge, "factual").map((f) => f.missing).join(" ")).toMatch(/length/i);
    const ohneAbgabe = gut_de.replace("Nur den Text abgeben, kein Anschreiben.", "");
    expect(reviewBrief(ohneAbgabe, "factual").map((f) => f.missing).join(" ")).toMatch(/hand in/i);
  });

  // Die andere Richtung der deutschen Muster, und die teurere: "kein" kommt im Deutschen
  // beschreibend vor ("das keinen Keller hat"), und wenn das als Verbot zaehlt, schweigt der
  // Check ueber eine echte Luecke. Ein falscher Befund aergert, ein ausgelassener ist wertlos.
  it("does not read a described absence as a prohibition", () => {
    const beschreibend =
      "FACT SHEET ueber ein Reihenhaus von 1998 in Kiel, das keinen Keller und keine Garage hat, " +
      "fuer einen Kaeufer, der zum ersten Mal kauft. 300 Woerter. Nur den Text abgeben.";
    expect(reviewBrief(beschreibend, "factual").map((f) => f.missing).join(" ")).toMatch(
      /ruled out/i,
    );
  });

  it("stays quiet about it when the brief really forbids something", () => {
    const verbietend =
      "FACT SHEET ueber ein Reihenhaus von 1998 in Kiel fuer einen Kaeufer, der zum ersten Mal " +
      "kauft. 300 Woerter. Nur den Text abgeben. Keinen Preis eines einzelnen Anbieters nennen " +
      "und kein Gesetz ohne Paragraphennummer zitieren.";
    expect(reviewBrief(verbietend, "factual").map((f) => f.missing).join(" ")).not.toMatch(
      /ruled out/i,
    );
  });
});
