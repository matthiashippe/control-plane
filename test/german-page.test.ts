import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { detectBriefLanguage, MISSING_DE, COSTS_DE } from "../src/bounties/brief.de.js";
import { reviewBrief } from "../src/bounties/brief.js";

// The box and its two buttons are behind CP_FORM_ON_CHECK, which docker-compose.prod.yml sets and
// a test process does not. This file is about what a person reads on that box, so it switches the
// flag on rather than testing the page a production visitor does not get.
process.env.CP_FORM_ON_CHECK = "1";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const app = () => createApp({ db: openDb(":memory:") });

const KURZ_DE =
  "FACT SHEET über den Energieausweis für ein Mehrfamilienhaus von 1974 mit sechs Wohnungen " +
  "und Gasheizung in Hamburg-Eimsbüttel.";
const KURZ_EN = "FACT SHEET on the energy certificate for a 1974 apartment block with gas heating.";

describe("which language the person wrote in", () => {
  it("reads a German brief as German, English as English", () => {
    expect(detectBriefLanguage(KURZ_DE)).toBe("de");
    expect(detectBriefLanguage(KURZ_EN)).toBe("en");
  });

  it("is not fooled by the English words both real briefs start with", () => {
    // Every example on the site begins "FACT SHEET", so a detector that weighs those two words
    // heavily calls every German brief English. That is the exact failure this replaces.
    expect(detectBriefLanguage("FACT SHEET " + KURZ_DE)).toBe("de");
  });

  it("does not need umlauts, because half of them are typed without", () => {
    expect(detectBriefLanguage(KURZ_DE.replace(/ü/g, "ue").replace(/ä/g, "ae"))).toBe("de");
  });

  it("stays English when there is nothing to go on", () => {
    expect(detectBriefLanguage("")).toBe("en");
    expect(detectBriefLanguage("FACT SHEET")).toBe("en");
  });
});

describe("a German brief is answered in German", () => {
  it("names every finding in German and none of them in English", () => {
    const f = reviewBrief(KURZ_DE, "factual");
    expect(f.length).toBeGreaterThan(2);
    for (const one of f) {
      expect(one.missing, `${one.id} is still English`).not.toMatch(
        /^(No |Nothing |The whole brief)/,
      );
      if (one.id !== "too_short") {
        expect(one.missing).toBe(MISSING_DE[one.id]);
        expect(one.costs).toBe(COSTS_DE[one.id]);
      }
    }
  });

  it("answers an English brief in English, which is the other direction", () => {
    for (const one of reviewBrief(KURZ_EN, "factual")) {
      expect(one.missing, `${one.id} went German`).toMatch(/^(No |Nothing |The whole brief)/);
    }
  });

  it("never mixes the two on one page", async () => {
    const res = await app().request("/v1/briefs/check", {
      method: "POST",
      headers: { accept: BROWSER, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ brief: KURZ_DE, kind: "factual" }),
    });
    const html = await res.text();
    const body = html.slice(html.indexOf("<section"), html.indexOf("</section>"));
    expect(body, "the heading is German").toMatch(/Dinge, die Ihr Auftrag nicht sagt|Nichts Offensichtliches/);
    expect(body, "the button is German").toContain("Noch einmal prüfen");
    for (const englisch of [
      "your brief does not say",
      "Check it again",
      "Post it as a job",
      "From a terminal",
      "Nothing was stored",
      "no account, no wallet, no card",
    ]) {
      expect(body, `"${englisch}" is still on a German page`).not.toContain(englisch);
    }
  });

  it("leaves an English brief's page English, so the switch is the brief and not the site", async () => {
    const res = await app().request("/v1/briefs/check", {
      method: "POST",
      headers: { accept: BROWSER, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ brief: KURZ_EN, kind: "factual" }),
    });
    const html = await res.text();
    expect(html).toContain("Check it again");
    expect(html).not.toContain("Noch einmal prüfen");
  });
});

describe("the empty page, where there is no brief to read", () => {
  it("follows the browser when it asks for German", async () => {
    const html = await (
      await app().request("/check", { headers: { accept: BROWSER, "accept-language": "de-DE,de;q=0.9,en;q=0.8" } })
    ).text();
    expect(html).toMatch(/Die kostenlose Prüfung|Wenn ein Auftrag genug sagt|Zum Einstellen brauchen Sie/);
  });

  it("stays English for a browser that did not ask for German", async () => {
    const html = await (
      await app().request("/check", { headers: { accept: BROWSER, "accept-language": "en-US,en;q=0.9" } })
    ).text();
    expect(html).not.toMatch(/Zum Einstellen brauchen Sie/);
  });

  it("stays English when the browser says nothing at all", async () => {
    const html = await (await app().request("/check", { headers: { accept: BROWSER } })).text();
    expect(html).not.toMatch(/Zum Einstellen brauchen Sie/);
  });
});

describe("the last screen of the walk, in the same language as the first", () => {
  const post = (brief: string) =>
    app().request("/start", {
      method: "POST",
      headers: { accept: BROWSER, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ brief, kind: "factual" }),
    });

  it("hands a German buyer their key in German", async () => {
    const html = await (await post(KURZ_DE + " 400 Wörter. Nur den Text abgeben.")).text();
    expect(html).toContain("Kopieren Sie diesen Schlüssel");
    expect(html).toMatch(/<html lang="de">/);
    for (const englisch of ["Copy this key", "What just happened", "Coming back", "Your job is on the board"]) {
      expect(html, `"${englisch}" is still on a German page`).not.toContain(englisch);
    }
  });

  it("hands an English buyer theirs in English", async () => {
    const html = await (
      await post("FACT SHEET on a 1974 apartment block with gas heating, for a landlord. 400 words. Deliver the text only.")
    ).text();
    expect(html).toContain("Copy this key");
    expect(html).toMatch(/<html lang="en">/);
    expect(html).not.toContain("Kopieren Sie diesen Schlüssel");
  });

  it("says no in German too, because a refusal is the screen people remember", async () => {
    const a = app();
    const send = (n: number) =>
      a.request("/start", {
        method: "POST",
        headers: { accept: BROWSER, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ brief: `${KURZ_DE} Lauf ${n}. 400 Wörter. Nur den Text abgeben.`, kind: "factual" }),
      });
    await send(1);
    await send(2);
    const res = await send(3);
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain("Mitternacht UTC");
    expect(html).not.toContain("midnight UTC");
  });
});
