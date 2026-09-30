/**
 * HAN-77: the conversation that asks back.
 *
 * Every rule is held from both sides. An incomplete message gets a question, a complete one gets
 * the order and no question. The caps hold at the call that is still allowed and at the one that
 * is not. Unwanted data is thrown away, and ordinary words that look like it are not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import {
  CALLS_PER_CONVERSATION,
  CALLS_PER_DAY,
  COST_PER_DAY_MC,
  CONVERSATION_HOURS,
  LINES,
  MAX_CALL_MC,
  MAX_QUESTIONS,
  MODEL_TIMEOUT_MS,
  cleanupConversations,
  converse,
  doneLine,
  unwanted,
} from "../src/checkout/conversation.js";
import type { VersionWriter } from "../src/checkout/deliver.js";
import { fakeProvider } from "../src/checkout/index.js";
import { CONVERSATION_INVITES, OFFERS } from "../src/public/catalog.js";

const REDE = "rede-zum-fest";
const COMPLETE = {
  anlass: "70. Geburtstag",
  person: "meine Mutter Ingrid",
  laenge: "5 Minuten",
  inhalt: "Sie war 35 Jahre Grundschullehrerin in Kassel, singt im Kirchenchor und fuhr uns jeden Sommer an die Ostsee.",
};

/** A model that answers from a script and records what it was sent. */
function scripted(answers: Array<Record<string, string | null>>) {
  const calls: { system: string; user: string }[] = [];
  const model: VersionWriter = {
    models: ["stub/model"],
    async write(req) {
      calls.push({ system: req.system, user: req.user });
      const a = answers[Math.min(calls.length - 1, answers.length - 1)] ?? {};
      return { text: `Here you go: ${JSON.stringify(a)}`, costMc: 50, upstream: null };
    },
  };
  return { model, calls };
}
const nothing = () => ({ anlass: null, person: null, laenge: null, inhalt: null });

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  db = openDb(":memory:");
});

describe("an incomplete message gets a question, a complete one gets the order", () => {
  it("'Ich brauche eine Rede.' is asked for the occasion", async () => {
    const { model, calls } = scripted([nothing()]);
    const r = await converse(db, model, { offer: REDE, message: "Ich brauche eine Rede." });
    expect(calls).toHaveLength(1);
    expect(r.readBy).toBe("model");
    expect(r.done).toBe(false);
    expect(r.question).toBe("Zu welchem Anlass?");
    expect(r.values).toEqual({});
  });

  it("a message that says everything gets the order and no question", async () => {
    const { model } = scripted([COMPLETE]);
    const r = await converse(db, model, { offer: REDE, message: "Alles auf einmal." });
    expect(r.done).toBe(true);
    expect(r.question).toBeNull();
    expect(r.values).toEqual(COMPLETE);
    expect(r.note).toBe(doneLine(OFFERS[0]));
    expect(r.note).toContain("Der Preis bleibt 19 €.");
  });

  it("the second answer knows the first: the model is sent what is known, and the next gap is asked", async () => {
    const { model, calls } = scripted([
      { ...nothing(), anlass: "70. Geburtstag" },
      { ...nothing(), anlass: "70. Geburtstag", person: "meine Mutter Ingrid" },
    ]);
    const one = await converse(db, model, { offer: REDE, message: "Eine Rede zum 70. Geburtstag." });
    expect(one.question).toBe("Für wen ist die Rede?");
    const two = await converse(db, model, { offer: REDE, message: "Für meine Mutter Ingrid.", id: one.id });
    expect(two.id).toBe(one.id);
    expect(JSON.parse(calls[1].user)).toMatchObject({ known: { anlass: "70. Geburtstag" }, last_question: "Für wen ist die Rede?" });
    expect(two.question).toBe("Wie lang darf sie sein? 3 Minuten, 5 Minuten oder 10 Minuten.");
    expect(two.questions).toBe(2);
  });

  it("a model that answers a choice outside the options fills nothing, and the question stays", async () => {
    const { model } = scripted([{ ...COMPLETE, laenge: "zwanzig Minuten" }]);
    const r = await converse(db, model, { offer: REDE, message: "..." });
    expect(r.done).toBe(false);
    expect(r.question).toBe("Wie lang darf sie sein? 3 Minuten, 5 Minuten oder 10 Minuten.");
  });

  it("the questions are only the order page's labels: nothing about the look is ever asked", async () => {
    const { model } = scripted([nothing()]);
    let r = await converse(db, model, { offer: "text-ueber-ihr-angebot", message: "Ich brauche einen Text." });
    const asked: string[] = [];
    for (let i = 0; i < 8 && r.question; i++) {
      asked.push(r.question);
      r = await converse(db, model, { offer: "text-ueber-ihr-angebot", message: "hm", id: r.id });
    }
    for (const q of asked) expect(q).not.toMatch(/aussehen|farbe|schrift|design|stil/i);
  });
});

describe("at most six questions, then the form", () => {
  it("never asks a seventh: after six it hands over, with what it has", async () => {
    const { model } = scripted([nothing()]);
    let r = await converse(db, model, { offer: REDE, message: "Ich brauche eine Rede." });
    let n = 0;
    while (r.question) {
      n += 1;
      r = await converse(db, model, { offer: REDE, message: "weiss nicht", id: r.id });
    }
    expect(n).toBe(MAX_QUESTIONS);
    expect(r.questions).toBe(MAX_QUESTIONS);
    expect(r.done).toBe(false);
    expect(r.note).toBe(LINES.handover);
  });

  it("stops the moment the fields are complete, before six", async () => {
    const r = await converse(db, null, { offer: "anschreiben-bewerbung", message: "Hallo" });
    // Without a model the first message fills nothing; the answers fill the asked field.
    expect(r.question).toBe("Fügen Sie die Stellenanzeige ein.");
    const ad = "Wir suchen eine Buchhalterin in Teilzeit. ".repeat(6);
    const two = await converse(db, null, { offer: "anschreiben-bewerbung", message: ad, id: r.id });
    expect(two.question).toBe("Was bringen Sie mit?");
    const three = await converse(db, null, {
      offer: "anschreiben-bewerbung",
      message: "Sechs Jahre Buchhaltung in einem Handwerksbetrieb, DATEV, Jahresabschluss.",
      id: r.id,
    });
    expect(three.done).toBe(true);
    expect(three.question).toBeNull();
    expect(three.questions).toBe(2);
  });
});

describe("without a model, a person still gets through", () => {
  it("takes each answer as the answer to the question it asked, choices included", async () => {
    let r = await converse(db, null, { offer: REDE, message: "Ich brauche eine Rede." });
    expect(r.readBy).toBe("fallback");
    const answers = ["70. Geburtstag", "meine Mutter Ingrid", "fünf, also 5 Minuten bitte", COMPLETE.inhalt];
    for (const a of answers) r = await converse(db, null, { offer: REDE, message: a, id: r.id });
    expect(r.done).toBe(true);
    expect(r.values).toEqual({ ...COMPLETE, laenge: "5 Minuten" });
  });

  it("a short free-text answer is asked again, and the second part is added to the first", async () => {
    let r = await converse(db, null, { offer: REDE, message: "Rede bitte" });
    for (const a of ["70. Geburtstag", "meine Mutter", "3 Minuten"]) r = await converse(db, null, { offer: REDE, message: a, id: r.id });
    r = await converse(db, null, { offer: REDE, message: "Sie singt gern.", id: r.id });
    expect(r.question).toBe(LINES.shorter + "Was soll vorkommen: Namen, eine gemeinsame Geschichte?");
    r = await converse(db, null, { offer: REDE, message: "Und sie war lange Lehrerin in Kassel, alle kennen sie.", id: r.id });
    expect(r.done).toBe(true);
    expect(r.values.inhalt).toBe("Sie singt gern.\nUnd sie war lange Lehrerin in Kassel, alle kennen sie.");
  });
});

describe("the caps, from both sides", () => {
  it("per conversation: the last allowed answer is read by the model, the next is not", async () => {
    const { model, calls } = scripted([nothing()]);
    let r = await converse(db, model, { offer: REDE, message: "Rede" });
    for (let i = 1; i < CALLS_PER_CONVERSATION; i++) r = await converse(db, model, { offer: REDE, message: "hm", id: r.id });
    expect(calls).toHaveLength(CALLS_PER_CONVERSATION);
    expect(r.readBy).toBe("model");
    r = await converse(db, model, { offer: REDE, message: "hm", id: r.id });
    expect(calls).toHaveLength(CALLS_PER_CONVERSATION);
    expect(r.readBy).toBe("fallback");
  });

  it("per day by calls: one below the cap is read, at the cap it is not", async () => {
    const day = new Date().toISOString().slice(0, 10);
    db.prepare("INSERT INTO conversation_days (day, calls, cost_mc) VALUES (?, ?, 0)").run(day, CALLS_PER_DAY - 1);
    const { model, calls } = scripted([nothing()]);
    const a = await converse(db, model, { offer: REDE, message: "Rede" });
    expect(a.readBy).toBe("model");
    const b = await converse(db, model, { offer: REDE, message: "Rede" });
    expect(b.question).toBeNull();
    expect(b.note).toBe(LINES.dayLimit);
    expect(calls).toHaveLength(1);
  });

  const dayRow = (day: string) => db.prepare("SELECT calls, cost_mc FROM conversation_days WHERE day = ?").get(day) as { calls: number; cost_mc: number };

  it("per day by cost: with room for one reservation it is read, one millicent less and it is not", async () => {
    const day = new Date().toISOString().slice(0, 10);
    db.prepare("INSERT INTO conversation_days (day, calls, cost_mc) VALUES (?, 0, ?)").run(day, COST_PER_DAY_MC - MAX_CALL_MC);
    const { model, calls } = scripted([nothing()]);
    expect((await converse(db, model, { offer: REDE, message: "Rede" })).readBy).toBe("model");
    // The reservation became the real 50 mc, so there is room for exactly one more reservation minus 50.
    expect(dayRow(day)).toEqual({ calls: 1, cost_mc: COST_PER_DAY_MC - MAX_CALL_MC + 50 });
    expect((await converse(db, model, { offer: REDE, message: "Rede" })).note).toBe(LINES.dayLimit);
    expect(calls).toHaveLength(1);
    expect(dayRow(day)).toEqual({ calls: 1, cost_mc: COST_PER_DAY_MC - MAX_CALL_MC + 50 });
  });

  it("per day by cost: exactly at the cap nothing is read", async () => {
    const day = new Date().toISOString().slice(0, 10);
    db.prepare("INSERT INTO conversation_days (day, calls, cost_mc) VALUES (?, 0, ?)").run(day, COST_PER_DAY_MC);
    const { model, calls } = scripted([nothing()]);
    expect((await converse(db, model, { offer: REDE, message: "Rede" })).note).toBe(LINES.dayLimit);
    expect(calls).toHaveLength(0);
  });

  it("300 calls at once, each at MAX_CALL_MC, book no more than the cap (HAN-81)", async () => {
    const day = new Date().toISOString().slice(0, 10);
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: VersionWriter = {
      models: ["stub/model"],
      async write() {
        started += 1;
        await gate;
        return { text: JSON.stringify(nothing()), costMc: MAX_CALL_MC, upstream: null };
      },
    };
    const all = Promise.all(Array.from({ length: CALLS_PER_DAY }, () => converse(db, slow, { offer: REDE, message: "Rede" })));
    await new Promise((r) => setImmediate(r));
    release();
    const replies = await all;
    expect(started).toBe(COST_PER_DAY_MC / MAX_CALL_MC);
    expect(replies.filter((r) => r.readBy === "model")).toHaveLength(COST_PER_DAY_MC / MAX_CALL_MC);
    expect(replies.filter((r) => r.note === LINES.dayLimit)).toHaveLength(CALLS_PER_DAY - COST_PER_DAY_MC / MAX_CALL_MC);
    expect(dayRow(day).cost_mc).toBe(COST_PER_DAY_MC);
  });

  it("the same 300 at a real 50 mc each: the reservations are given back and all are read", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const { model } = scripted([nothing()]);
    for (let i = 0; i < CALLS_PER_DAY; i++) expect((await converse(db, model, { offer: REDE, message: "Rede" })).readBy).toBe("model");
    expect(dayRow(day)).toEqual({ calls: CALLS_PER_DAY, cost_mc: CALLS_PER_DAY * 50 });
  });

  it("a call that times out keeps its reservation, one that answers does not", async () => {
    vi.useFakeTimers();
    try {
      const day = new Date().toISOString().slice(0, 10);
      const hanging: VersionWriter = { models: ["x"], write: () => new Promise(() => {}) };
      const pending = converse(db, hanging, { offer: REDE, message: "Rede" });
      await vi.advanceTimersByTimeAsync(MODEL_TIMEOUT_MS);
      expect((await pending).readBy).toBe("fallback");
      expect(dayRow(day)).toEqual({ calls: 1, cost_mc: MAX_CALL_MC });
      await converse(db, scripted([nothing()]).model, { offer: REDE, message: "Rede" });
      expect(dayRow(day)).toEqual({ calls: 2, cost_mc: MAX_CALL_MC + 50 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("a call that throws keeps its reservation too", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const throwing: VersionWriter = { models: ["x"], write: async () => { throw new Error("upstream 500"); } };
    expect((await converse(db, throwing, { offer: REDE, message: "Rede" })).readBy).toBe("fallback");
    expect(dayRow(day)).toEqual({ calls: 1, cost_mc: MAX_CALL_MC });
  });

  it("a call across midnight UTC is booked on the day it was taken", async () => {
    let clock = new Date("2026-09-30T23:59:59.500Z");
    const late: VersionWriter = {
      models: ["stub/model"],
      async write() {
        clock = new Date("2026-10-01T00:00:00.500Z");
        return { text: JSON.stringify(nothing()), costMc: 50, upstream: null };
      },
    };
    expect((await converse(db, late, { offer: REDE, message: "Rede" }, () => clock)).readBy).toBe("model");
    expect(dayRow("2026-09-30")).toEqual({ calls: 1, cost_mc: 50 });
    expect(dayRow("2026-10-01")).toBeUndefined();
  });

  it("at the day's cap the answer to the question asked still reaches the form", async () => {
    const { model } = scripted([nothing()]);
    const r = await converse(db, model, { offer: REDE, message: "Rede" });
    db.prepare("UPDATE conversation_days SET calls = ?").run(CALLS_PER_DAY);
    const b = await converse(db, model, { offer: REDE, message: "70. Geburtstag", id: r.id });
    expect(b.note).toBe(LINES.dayLimit);
    expect(b.values).toEqual({ anlass: "70. Geburtstag" });
  });

  it("a new UTC day starts from zero", async () => {
    db.prepare("INSERT INTO conversation_days (day, calls, cost_mc) VALUES ('2000-01-01', ?, ?)").run(CALLS_PER_DAY, COST_PER_DAY_MC);
    const { model } = scripted([nothing()]);
    expect((await converse(db, model, { offer: REDE, message: "Rede" })).readBy).toBe("model");
  });

  it("a model that fails or answers nonsense is not waited for: the fallback answers", async () => {
    const broken: VersionWriter = { models: ["x"], write: async () => ({ text: "no json here", costMc: 5, upstream: null }) };
    const r = await converse(db, broken, { offer: REDE, message: "Rede" });
    expect(r.readBy).toBe("fallback");
    expect(r.question).toBe("Zu welchem Anlass?");
    const throwing: VersionWriter = { models: ["x"], write: async () => { throw new Error("upstream 500"); } };
    expect((await converse(db, throwing, { offer: REDE, message: "Rede" })).readBy).toBe("fallback");
  });
});

describe("data we do not need is thrown away, and said so", () => {
  const bad = [
    "Meine IBAN ist DE89 3704 0044 0532 0130 00",
    "DE89370400440532013000",
    "Karte 4242 4242 4242 4242",
    "Meine Kontonummer schicke ich Ihnen",
    "Nach ihrer Krebserkrankung hat sie wieder angefangen zu singen",
    "Sie hatte einen Schlaganfall",
    "Er hat eine Depression überstanden",
  ];
  const fine = [
    "Ich bewerbe mich als Pflegefachkraft im Krankenhaus",
    "Ich biete Physiotherapie in Altona an",
    "Rufen Sie mich an: 0171 1234567",
    "70. Geburtstag am 12.10.2026, 18 Uhr",
    "Wir sind 5 Minuten von der Haltestelle",
    "Postleitzahl 22765, Hausnummer 12",
  ];
  it.each(bad)("thrown away: %s", (m) => expect(unwanted(m)).toBe(true));
  it.each(fine)("kept: %s", (m) => expect(unwanted(m)).toBe(false));

  it("a thrown-away message reaches neither the model nor the database, and the question comes again uncounted", async () => {
    const { model, calls } = scripted([nothing()]);
    const r = await converse(db, model, { offer: REDE, message: "Rede bitte" });
    const again = await converse(db, model, { offer: REDE, message: "Meine IBAN ist DE89 3704 0044 0532 0130 00", id: r.id });
    expect(calls).toHaveLength(1);
    expect(again.note).toBe(LINES.discarded);
    expect(again.question).toBe("Zu welchem Anlass?");
    expect(again.questions).toBe(r.questions);
    const row = db.prepare("SELECT fields, turns FROM conversations WHERE id = ?").get(r.id) as { fields: string; turns: string };
    expect(row.fields + row.turns).not.toContain("3704");
    expect(again.turns.map((t) => t.text)).toContain(LINES.discarded);
  });

  it("only the line goes: the rest of the message is read, and the line appears nowhere", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { model, calls } = scripted([{ ...nothing(), anlass: "70. Geburtstag" }]);
    const r = await converse(db, model, { offer: REDE, message: "Eine Rede zum 70. Geburtstag.\nIBAN DE89 3704 0044 0532 0130 00" });
    expect(r.discarded).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].user).not.toContain("3704");
    expect(calls[0].user).toContain("70. Geburtstag");
    expect(r.question).toBe("Für wen ist die Rede?");
    expect(r.note).toBe(LINES.discarded);
    const row = db.prepare("SELECT fields, turns FROM conversations WHERE id = ?").get(r.id) as { fields: string; turns: string };
    expect(row.fields + row.turns).not.toContain("3704");
    expect(log.mock.calls.flat().join(" ")).not.toContain("3704");
    log.mockRestore();
  });

  it("the gap Gestalt named: a speech that mentions an illness loses that line (HAN-77, condition 3)", () => {
    expect(unwanted("Nach ihrer schweren Krankheit hat sie wieder angefangen zu unterrichten")).toBe(true);
  });

  describe("numbers over lines and with dots or slashes (HAN-82, found in HAN-79)", () => {
    const badNow = [
      "4111 1111\n1111 1111",
      "4111.1111.1111.1111",
      "4111/1111/1111/1111",
      "Karte:\n4111 1111 1111\n1111",
      "4111 1111 1111 1111\n12.10.2026",
      "DE89.3704.0044.0532.0130.00",
      "DE89 3704 0044\n0532 0130 00",
    ];
    const fineNow = [
      "70. Geburtstag am 12.10.2026, 18.30 Uhr",
      "Am 12.10.2026\num 18 Uhr",
      "Termin 2026/10/12, Raum 3.14",
      "Rufen Sie mich an: 0171 1234567\noder 040 1234567",
      "Postleitzahl 22765\nHausnummer 12",
      "DE-22765 Hamburg",
    ];
    it.each(badNow)("thrown away: %j", (m) => expect(unwanted(m)).toBe(true));
    it.each(fineNow)("kept: %j", (m) => expect(unwanted(m)).toBe(false));

    it("a card over two lines costs both lines and only those, and reaches neither model nor database", async () => {
      const { model, calls } = scripted([{ ...nothing(), anlass: "70. Geburtstag" }]);
      const r = await converse(db, model, { offer: REDE, message: "Eine Rede zum 70. Geburtstag.\nKarte 4111 1111\n1111 1111\nDanke" });
      expect(r.discarded).toBe(true);
      expect(calls[0].user).toContain("70. Geburtstag");
      expect(calls[0].user).toContain("Danke");
      expect(calls[0].user).not.toContain("4111");
      expect(calls[0].user).not.toContain("1111");
      const row = db.prepare("SELECT fields, turns FROM conversations WHERE id = ?").get(r.id) as { fields: string; turns: string };
      expect(row.fields + row.turns).not.toContain("1111");
    });

    it.each(["4111.1111.1111.1111", "DE89.3704.0044.0532.0130.00", "4111 1111\n1111 1111"])(
      "%j appears nowhere in conversations",
      async (m) => {
        const r = await converse(db, null, { offer: REDE, message: m });
        expect(r.note).toBe(LINES.discarded);
        const row = db.prepare("SELECT fields, turns FROM conversations WHERE id = ?").get(r.id) as { fields: string; turns: string };
        expect(row.fields + row.turns).not.toMatch(/1111|3704/);
      },
    );
  });

  it("a first message thrown away still gets the first question", async () => {
    const r = await converse(db, null, { offer: REDE, message: "Sie hatte einen Schlaganfall" });
    expect(r.note).toBe(LINES.discarded);
    expect(r.question).toBe("Zu welchem Anlass?");
  });
});

describe("the rows go after a day", () => {
  it("deletes a conversation older than a day and keeps a younger one", async () => {
    const old = await converse(db, null, { offer: REDE, message: "alt" }, () => new Date(Date.now() - (CONVERSATION_HOURS + 1) * 3600_000));
    const young = await converse(db, null, { offer: REDE, message: "neu" });
    expect(cleanupConversations(db)).toBe(1);
    const ids = (db.prepare("SELECT id FROM conversations").all() as { id: string }[]).map((x) => x.id);
    expect(ids).toEqual([young.id]);
    expect(ids).not.toContain(old.id);
  });
});

describe("POST /katalog/gespraech", () => {
  const TEST_KEY = "sk_test_placeholder";
  beforeEach(() => {
    process.env.CP_STRIPE_SECRET_KEY = TEST_KEY;
  });
  afterEach(() => {
    delete process.env.CP_STRIPE_SECRET_KEY;
  });
  const app = (model: VersionWriter | null) => createApp({ db, checkout: fakeProvider(), rateLimit: null, conversation: model });
  const postJson = (a: ReturnType<typeof createApp>, body: unknown) =>
    a.request("/katalog/gespraech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("answers ops/ziele.sh's probe with a question, and a complete message with the order and no question", async () => {
    const a = app(scripted([nothing(), COMPLETE]).model);
    const one = await (await postJson(a, { angebot: REDE, nachricht: "Ich brauche eine Rede." })).json();
    expect(one.frage).toBe("Zu welchem Anlass?");
    expect(one.fertig).toBe(false);
    expect(one.auftrag).toBeUndefined();
    const two = await (await postJson(a, { angebot: REDE, nachricht: "Alles.", gespraech: one.gespraech })).json();
    expect(two.fertig).toBe(true);
    expect(two.frage).toBeNull();
    expect(two.auftrag).toMatchObject({ angebot: REDE, angaben: COMPLETE });
    expect(JSON.stringify(two)).not.toContain("?");
  });

  it("is off, with 404, while buying is off", async () => {
    delete process.env.CP_STRIPE_SECRET_KEY;
    const res = await postJson(app(null), { angebot: REDE, nachricht: "Rede" });
    expect(res.status).toBe(404);
  });

  it("refuses an unknown offer and an empty message with 400", async () => {
    const a = app(null);
    expect((await postJson(a, { angebot: "nope", nachricht: "Rede" })).status).toBe(400);
    expect((await postJson(a, { angebot: REDE, nachricht: "   " })).status).toBe(400);
  });

  it("as a form: a page with the question and the conversation in the body, never in the address", async () => {
    const a = app(null);
    const res = await a.request("/katalog/gespraech", {
      method: "POST",
      body: new URLSearchParams({ angebot: REDE, nachricht: "Ich brauche eine Rede." }),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Zu welchem Anlass?");
    expect(html).toMatch(/<input type="hidden" name="gespraech" value="[A-Za-z0-9_-]{24}">/);
    expect(html).toContain("Ich brauche eine Rede.");
    expect(html).toContain('href="/katalog/bestellen?angebot=rede-zum-fest"');
    expect(html).not.toMatch(/gespraech=/);
  });

  it("as a form, at the end: the order page with the fields filled in and the address still to give", async () => {
    const a = app(scripted([COMPLETE]).model);
    const res = await a.request("/katalog/gespraech", {
      method: "POST",
      body: new URLSearchParams({ angebot: REDE, nachricht: "Alles auf einmal." }),
    });
    const html = await res.text();
    expect(html).toContain('action="/katalog/kaufen"');
    expect(html).toContain('value="meine Mutter Ingrid"');
    expect(html).toContain("<option selected>5 Minuten</option>");
    expect(html).toContain('name="email"');
    expect(html).toContain("Der Preis bleibt 19 €.");
  });

  it("has Gestalt's first sentence for every offer, and it is on the order page", async () => {
    expect(Object.keys(CONVERSATION_INVITES).sort()).toEqual(OFFERS.map((o) => o.id).sort());
    const html = await (await app(null).request("/katalog/bestellen?angebot=anschreiben-bewerbung")).text();
    expect(html).toContain(CONVERSATION_INVITES["anschreiben-bewerbung"]);
    expect(html).toContain("Die Fragen stellt eine KI.");
  });

  it("the form stays: the order page has both the way into the conversation and every field", async () => {
    const html = await (await app(null).request("/katalog/bestellen?angebot=rede-zum-fest")).text();
    expect(html).toContain('action="/katalog/gespraech"');
    expect(html).toContain('action="/katalog/kaufen"');
    for (const f of ["anlass", "person", "laenge", "inhalt", "email"]) expect(html).toContain(`name="${f}"`);
  });

  it("ops/ziele.sh finds the way in on the order page, and not once it is taken out (HAN-82)", async () => {
    const judge = (page: string) => execFileSync("python3", ["ops/gespraech_einstieg.py"], { input: page }).toString().trim();
    const html = await (await app(null).request("/katalog/bestellen?angebot=rede-zum-fest")).text();
    expect(judge(html)).toBe("1");
    const without = html.replace(/<form\b[^>]*action="\/katalog\/gespraech"[\s\S]*?<\/form>/g, "");
    expect(without).toContain('action="/katalog/kaufen"');
    expect(judge(without)).toBe("0");
    expect(judge(html.replace('name="nachricht"', 'name="notiz"'))).toBe("0");
  });
});
