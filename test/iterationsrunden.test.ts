/**
 * Iterationsrunden: der Kaeufer sagt, was fehlt, der Agent liefert nach.
 *
 * Bis zum 29.09.2026 war eine Lieferung endgueltig. Ein eindeutiger Index je Auftrag und Agent
 * liess genau eine Zeile zu, also konnte der Kaeufer nur annehmen oder schweigen, und der Agent
 * konnte auf nichts reagieren. Fuer eine Website, eine Anzeige oder einen Text ist die erste
 * Fassung aber nie die letzte.
 *
 * Jeder Test hier hat seine Gegenprobe in der anderen Richtung: was erlaubt ist, wird einmal
 * erlaubt und einmal verweigert, damit eine Regel, die nie greift, genauso auffaellt wie eine,
 * die zu oft greift.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { MAX_ROUNDS, FEEDBACK_MAX } from "../src/bounties/store.js";
import { hashApiKey } from "../src/auth/siwe.js";

const IN_ONE_HOUR = () => new Date(Date.now() + 3_600_000).toISOString();

function account(db: ReturnType<typeof openDb>, app: ReturnType<typeof createApp>, n: number) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${String(n).repeat(2)}` + "ef".repeat(15);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: `seed-runden-${n}` });
  const call = (path: string, method: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", authorization: key },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    address,
    post: (b: unknown) => call("/v1/bounties", "POST", b),
    submit: (b: unknown) => call("/v1/submissions", "POST", b),
    feedback: (id: string, body: string) => call("/v1/submissions/feedback", "POST", { submission_id: id, body }),
    readFeedback: (id: string) => call(`/v1/submissions/feedback?submission_id=${id}`, "GET"),
    list: (id: string) => call(`/v1/submissions?bounty_id=${id}`, "GET"),
    award: (b: unknown) => call("/v1/bounties/award", "POST", b),
  };
}

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db });
  return { db, app, kaeufer: account(db, app, 1), agent: account(db, app, 2), fremder: account(db, app, 3) };
}

const bounty = (override: Record<string, unknown> = {}) => ({
  brief: "Build me a one-page website for a piano teacher.",
  kind: "creative",
  price_cents: 200,
  deadline: IN_ONE_HOUR(),
  ...override,
});

/** Auftrag posten, erste Fassung einsenden, beide ids zurueck. */
async function ersteFassung(s: ReturnType<typeof setup>) {
  const b = (await (await s.kaeufer.post(bounty())).json()) as { id: string };
  const res = await s.agent.submit({ bounty_id: b.id, body: "Fassung eins." });
  expect(res.status).toBe(201);
  const sub = (await res.json()) as { id: string; round: number; revises: string | null };
  return { bountyId: b.id, sub };
}

describe("eine Runde weiter", () => {
  it("laesst den Agenten nachliefern, nachdem der Kaeufer etwas gesagt hat", async () => {
    const s = setup();
    const { bountyId, sub } = await ersteFassung(s);
    expect(sub.round).toBe(1);
    expect(sub.revises).toBeNull();

    const fb = await s.kaeufer.feedback(sub.id, "Die Preisliste fehlt, und das Foto ist zu dunkel.");
    expect(fb.status).toBe(201);

    const res = await s.agent.submit({ bounty_id: bountyId, body: "Fassung zwei, mit Preisliste.", revises: sub.id });
    expect(res.status).toBe(201);
    const zwei = (await res.json()) as { id: string; round: number; revises: string };
    expect(zwei.round).toBe(2);
    expect(zwei.revises).toBe(sub.id);
  });

  it("verweigert sie, solange der Kaeufer nichts gesagt hat, und schreibt dabei nichts", async () => {
    const s = setup();
    const { bountyId, sub } = await ersteFassung(s);
    const res = await s.agent.submit({ bounty_id: bountyId, body: "Fassung zwei.", revises: sub.id });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("no_feedback_yet");
    const { n } = s.db.prepare("SELECT count(*) AS n FROM submissions WHERE bounty_id = ?").get(bountyId) as { n: number };
    expect(n).toBe(1);
  });

  it("laesst niemanden die Fassung eines anderen ueberarbeiten", async () => {
    const s = setup();
    const { bountyId, sub } = await ersteFassung(s);
    await s.kaeufer.feedback(sub.id, "Bitte kuerzer.");
    const res = await s.fremder.submit({ bounty_id: bountyId, body: "Meine Fassung zwei.", revises: sub.id });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("not_yours");
  });

  it("laesst eine Fassung nicht auf einen anderen Auftrag wandern", async () => {
    const s = setup();
    const { sub } = await ersteFassung(s);
    await s.kaeufer.feedback(sub.id, "Bitte kuerzer.");
    const zweiter = (await (await s.kaeufer.post(bounty({ brief: "Ein zweiter Auftrag, ganz anderer Text." }))).json()) as { id: string };
    const res = await s.agent.submit({ bounty_id: zweiter.id, body: "Fassung zwei.", revises: sub.id });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("wrong_bounty");
  });

  it("erlaubt die letzte erlaubte Runde und verweigert erst die danach", async () => {
    const s = setup();
    const { bountyId, sub } = await ersteFassung(s);
    let letzte = sub.id;
    for (let runde = 2; runde <= MAX_ROUNDS; runde++) {
      expect((await s.kaeufer.feedback(letzte, `Noch etwas, Runde ${runde}.`)).status).toBe(201);
      const res = await s.agent.submit({ bounty_id: bountyId, body: `Fassung ${runde}.`, revises: letzte });
      expect(res.status).toBe(201);
      const j = (await res.json()) as { id: string; round: number };
      expect(j.round).toBe(runde);
      letzte = j.id;
    }
    expect((await s.kaeufer.feedback(letzte, "Und noch etwas.")).status).toBe(201);
    const zuviel = await s.agent.submit({ bounty_id: bountyId, body: "Eine Runde zu viel.", revises: letzte });
    expect(zuviel.status).toBe(409);
    expect(((await zuviel.json()) as { error: string }).error).toBe("rounds_exhausted");
  });

  it("nimmt in derselben Runde weiterhin nur eine Fassung an", async () => {
    const s = setup();
    const { bountyId } = await ersteFassung(s);
    const res = await s.agent.submit({ bounty_id: bountyId, body: "Noch eine erste Fassung." });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("already_submitted");
  });
});

describe("wer etwas sagen darf", () => {
  it("nimmt die Rueckmeldung des Kaeufers an und weist die eines Fremden ab", async () => {
    const s = setup();
    const { sub } = await ersteFassung(s);
    expect((await s.fremder.feedback(sub.id, "Ich finde es gut.")).status).toBe(403);
    expect((await s.agent.feedback(sub.id, "Ich finde mich gut.")).status).toBe(403);
    expect((await s.kaeufer.feedback(sub.id, "Mir fehlt die Preisliste.")).status).toBe(201);
  });

  it("zeigt die Rueckmeldung dem Agenten, dem sie gilt, und keinem Dritten", async () => {
    const s = setup();
    const { sub } = await ersteFassung(s);
    await s.kaeufer.feedback(sub.id, "Mir fehlt die Preisliste.");
    const meins = (await (await s.agent.readFeedback(sub.id)).json()) as { feedback: { body: string }[]; max_rounds: number };
    expect(meins.feedback.map((f) => f.body)).toEqual(["Mir fehlt die Preisliste."]);
    expect(meins.max_rounds).toBe(MAX_ROUNDS);
    const fremd = (await (await s.fremder.readFeedback(sub.id)).json()) as { feedback: unknown[] };
    expect(fremd.feedback).toEqual([]);
  });

  it("nimmt nichts mehr entgegen, wenn der Auftrag vergeben ist", async () => {
    const s = setup();
    const { bountyId, sub } = await ersteFassung(s);
    expect((await s.kaeufer.feedback(sub.id, "Fast gut.")).status).toBe(201);
    expect((await s.kaeufer.award({ bounty_id: bountyId, submission_id: sub.id })).status).toBe(200);
    const res = await s.kaeufer.feedback(sub.id, "Doch noch etwas.");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not_open");
  });

  it("nimmt keine leere und keine masslose Rueckmeldung", async () => {
    const s = setup();
    const { sub } = await ersteFassung(s);
    expect((await s.kaeufer.feedback(sub.id, "   ")).status).toBe(400);
    expect((await s.kaeufer.feedback(sub.id, "x".repeat(FEEDBACK_MAX + 1))).status).toBe(400);
    expect((await s.kaeufer.feedback(sub.id, "x".repeat(FEEDBACK_MAX))).status).toBe(201);
  });
});

describe("was die Liste sagt", () => {
  it("nennt Runde und Vorgaenger und den Weg zur naechsten Runde", async () => {
    const s = setup();
    const { bountyId, sub } = await ersteFassung(s);
    await s.kaeufer.feedback(sub.id, "Kuerzer.");
    await s.agent.submit({ bounty_id: bountyId, body: "Fassung zwei.", revises: sub.id });
    const j = (await (await s.kaeufer.list(bountyId)).json()) as {
      submissions: { round: number; revises: string | null }[];
      max_rounds: number;
      hint: string;
    };
    expect(j.submissions.map((x) => x.round).sort()).toEqual([1, 2]);
    expect(j.submissions.find((x) => x.round === 2)?.revises).toBe(sub.id);
    expect(j.max_rounds).toBe(MAX_ROUNDS);
    expect(j.hint).toContain("/v1/submissions/feedback");
  });
});
