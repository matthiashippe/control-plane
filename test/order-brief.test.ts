/**
 * Goal 21: nobody reaches Stripe without saying what they need and leaving an address.
 *
 * Every rule here is held from both sides, because a check that has only seen "allowed" is a
 * constant. The conditions come from the sceptic (HAN-24, HAN-25) and from Recht (HAN-26); each
 * test names the one it holds. The positive examples are GOAL.md's, word for word.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupOrderBriefs, openDb, PAID_BRIEF_DAYS, UNPAID_BRIEF_DAYS } from "../src/db.js";
import { createApp } from "../src/app.js";
import { beginOfferCheckout, beginCheckout, CheckoutError, fakeProvider, hasTwoWords, settleCheckout } from "../src/checkout/index.js";
import { stripeProvider } from "../src/payments/stripe.js";
import { OFFERS, PRIVACY_SENTENCE, TEST_MODE_LINE } from "../src/public/catalog.js";
import { ACCESS_LOG_DAYS } from "../src/public/datenschutz.js";

const TEST_KEY = "sk_test_placeholder";
const OFFER = OFFERS[0];
const EMAIL = "someone@mail.example.de";

/** GOAL.md, Goal 21, point 4: the example per offer that has to go through. */
const EXAMPLES: Record<string, Record<string, string>> = {
  "rede-zum-fest": {
    anlass: "70. Geburtstag",
    person: "meine Mutter Ingrid",
    laenge: "5 Minuten",
    inhalt: "Sie war 35 Jahre Grundschullehrerin in Kassel, singt im Kirchenchor und hat uns jeden Sommer an die Ostsee gefahren.",
  },
  "anschreiben-bewerbung": {
    stellenanzeige: readFileSync("test/fixtures/stellenanzeige.txt", "utf-8"),
    erfahrung: "Sechs Jahre Buchhaltung in einem Handwerksbetrieb, DATEV, Jahresabschluss vorbereitet.",
  },
  "text-ueber-ihr-angebot": {
    was: "Fahrradreparatur mit Abholung",
    fuer_wen: "Familien und Pendler im Viertel",
    wo: "Aushang",
  },
};
const BRIEF = EXAMPLES[OFFER.id];
const allX = (o: (typeof OFFERS)[number]) => Object.fromEntries(o.fields.map((f) => [f.name, "x"]));

/** A Stripe that creates sessions and records every call. It is never asked to read one here. */
function stagedStripe() {
  const calls: { url: string; body: URLSearchParams | null }[] = [];
  let n = 0;
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body instanceof URLSearchParams ? init.body : null });
    n += 1;
    return Response.json({ id: `cs_test_order${n}`, url: `https://checkout.stripe.com/c/pay/cs_test_order${n}` });
  }) as typeof fetch;
  return { calls, provider: stripeProvider({ secretKey: TEST_KEY, origin: () => "https://postyourprice.com", fetch: fetchImpl }) };
}

const count = (d: ReturnType<typeof openDb>, table: string) =>
  (d.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

beforeEach(() => {
  delete process.env.CP_CHECKOUT;
  process.env.CP_STRIPE_SECRET_KEY = TEST_KEY;
});
afterEach(() => {
  delete process.env.CP_CHECKOUT;
  delete process.env.CP_STRIPE_SECRET_KEY;
});

describe("beginOfferCheckout asks for the offer's fields and an address before anything else", () => {
  it("has an example for every offer, so no offer goes untested", () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual(OFFERS.map((o) => o.id).sort());
  });

  it.each(OFFERS.map((o) => [o.id, o] as const))("%s: GOAL.md's example goes through and writes exactly one row", async (_, o) => {
    const s = stagedStripe();
    const d = openDb(":memory:");
    const padded = Object.fromEntries(Object.entries(EXAMPLES[o.id]).map(([k, v]) => [k, `  ${v}  `]));
    const { checkout } = await beginOfferCheckout(d, s.provider, { offerId: o.id, brief: { ...padded, extra: "not asked for" }, email: " Someone@Mail.Example.DE " });
    expect(s.calls).toHaveLength(1);
    const row = d.prepare("SELECT brief, email FROM order_briefs WHERE reference = ?").get(checkout.reference) as { brief: string; email: string };
    const trimmed = Object.fromEntries(Object.entries(EXAMPLES[o.id]).map(([k, v]) => [k, v.trim()]));
    expect(JSON.parse(row.brief), "trimmed, in the offer's order, and nothing the page did not ask").toEqual(trimmed);
    expect(Object.keys(JSON.parse(row.brief))).toEqual(o.fields.map((f) => f.name));
    expect(row.email).toBe(EMAIL);
    expect([count(d, "checkouts"), count(d, "order_briefs")]).toEqual([1, 1]);
  });

  it.each(OFFERS.map((o) => [o.id, o] as const))("%s: every field \"x\" is 400, before Stripe and without a row", async (_, o) => {
    const s = stagedStripe();
    const d = openDb(":memory:");
    const e = await beginOfferCheckout(d, s.provider, { offerId: o.id, brief: allX(o), email: EMAIL }).catch((x) => x as CheckoutError);
    expect([e.code, e.status, e.field]).toEqual(["brief_invalid", 400, o.fields[0].name]);
    expect(s.calls).toHaveLength(0);
    expect([count(d, "checkouts"), count(d, "order_briefs")]).toEqual([0, 0]);
  });

  // Each field alone: the example with exactly one field spoiled is refused, and names that field.
  it.each(OFFERS.flatMap((o) => o.fields.map((f) => [o.id, f.name, o] as const)))("%s: a spoiled %s alone is refused", async (_, name, o) => {
    const d = openDb(":memory:");
    const spoiled = { ...EXAMPLES[o.id], [name]: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" };
    const e = await beginOfferCheckout(d, fakeProvider(), { offerId: o.id, brief: spoiled, email: EMAIL }).catch((x) => x as CheckoutError);
    expect([e.code, e.field]).toEqual(["brief_invalid", name]);
    expect(count(d, "order_briefs")).toBe(0);
  });

  it("holds each length at its edge, one character inside and one outside", async () => {
    const d = openDb(":memory:");
    const provider = fakeProvider();
    const word = (n: number) => `ab ${"c".repeat(n - 3)}`;
    const inhalt = OFFER.fields.find((f) => f.name === "inhalt")!;
    if (inhalt.kind === "choice") throw new Error("inhalt is a text field");
    for (const [n, ok] of [[inhalt.min - 1, false], [inhalt.min, true], [inhalt.max, true], [inhalt.max + 1, false]] as const) {
      const r = await beginOfferCheckout(d, provider, { offerId: OFFER.id, brief: { ...BRIEF, inhalt: word(n) }, email: EMAIL }).then(() => true, () => false);
      expect(r, `inhalt of ${n} characters`).toBe(ok);
    }
  });

  it("takes only the listed choices", async () => {
    const d = openDb(":memory:");
    for (const [laenge, ok] of [["5 Minuten", true], ["60 Minuten", false], ["", false]] as const) {
      const r = await beginOfferCheckout(d, fakeProvider(laenge || "none"), { offerId: OFFER.id, brief: { ...BRIEF, laenge }, email: EMAIL }).then(() => true, () => false);
      expect(r, laenge).toBe(ok);
    }
  });

  it("counts two words, with digits as a word and single letters not", () => {
    for (const t of ["70. Geburtstag", "meine Mutter Ingrid", "Fahrradreparatur mit Abholung"]) expect(hasTwoWords(t), t).toBe(true);
    for (const t of ["xxxxxxxxxx", "x x x x", "70 80", "Geburtstag", "", "!!! ???"]) expect(hasTwoWords(t), t).toBe(false);
  });

  it.each([
    ["no address", ""],
    ["an address without a dot", "a@b"],
    ["an address with a space", "a b@c.de"],
    ["an address over 254 characters", `${"a".repeat(250)}@b.de`],
  ])("refuses %s with 400, before Stripe and without a row", async (_, email) => {
    const s = stagedStripe();
    const d = openDb(":memory:");
    const e = await beginOfferCheckout(d, s.provider, { offerId: OFFER.id, brief: BRIEF, email }).catch((x) => x as CheckoutError);
    expect([e.code, e.status]).toEqual(["email_invalid", 400]);
    expect(s.calls).toHaveLength(0);
    expect([count(d, "checkouts"), count(d, "order_briefs")]).toEqual([0, 0]);
  });

  it("writes no checkout when the brief row cannot be written, because both go in one transaction", async () => {
    const d = openDb(":memory:");
    // A planted failure on the second insert. The examples above are the other direction.
    d.exec("CREATE TRIGGER planted BEFORE INSERT ON order_briefs BEGIN SELECT RAISE(ABORT, 'planted'); END;");
    await expect(beginOfferCheckout(d, fakeProvider(), { offerId: OFFER.id, brief: BRIEF, email: EMAIL })).rejects.toThrow(/planted/);
    expect([count(d, "checkouts"), count(d, "order_briefs")]).toEqual([0, 0]);
  });
});

/**
 * GOAL.md, Goal 21, point 10 (HAN-24): the address is never a wallet. `finishSettle` credits every
 * row whose `address` is set, so an email there would turn a paid text into spendable credits.
 */
describe("an offer paid with an email credits nothing", () => {
  const rows = (d: ReturnType<typeof openDb>) => [count(d, "ledger"), count(d, "wallets")];

  it("leaves ledger and wallets empty after it is paid and settled", async () => {
    const d = openDb(":memory:");
    const p = fakeProvider();
    const { checkout } = await beginOfferCheckout(d, p, { offerId: OFFER.id, brief: BRIEF, email: EMAIL });
    expect(d.prepare("SELECT address FROM checkouts").get()).toEqual({ address: null });
    const r = await settleCheckout(d, p, { reference: checkout.reference, paid: true });
    expect([r.status, r.credited_cents]).toEqual(["paid", 0]);
    expect(rows(d)).toEqual([0, 0]);
  });

  it("writes exactly one ledger row and one wallet for a top-up with an address, the counter-proof", async () => {
    const d = openDb(":memory:");
    process.env.CP_CHECKOUT = "1";
    const p = fakeProvider();
    const { checkout } = await beginCheckout(d, p, { address: "key:someone", cents: 1_000 });
    await settleCheckout(d, p, { reference: checkout.reference, paid: true });
    expect(rows(d)).toEqual([1, 1]);
  });
});

describe("the order_briefs table holds the rule on its own", () => {
  it("refuses a brief that is not a JSON object and an address without an at sign, and takes a proper row", async () => {
    const d = openDb(":memory:");
    d.prepare("INSERT INTO checkouts (reference, offer, cents, provider, status, created_at) VALUES ('r', ?, 1900, 'fake', 'pending', 'x')").run(OFFER.id);
    const insert = d.prepare("INSERT INTO order_briefs (reference, brief, email, created_at) VALUES ('r', ?, ?, 'x')");
    for (const bad of ["  ", "free text", '"a string"', "[1,2]"]) expect(() => insert.run(bad, EMAIL), bad).toThrow(/CHECK/);
    expect(() => insert.run(JSON.stringify(BRIEF), "nobody")).toThrow(/CHECK/);
    expect(() => insert.run(JSON.stringify(BRIEF), EMAIL)).not.toThrow();
  });

  it("refuses a brief for a checkout that does not exist", () => {
    const d = openDb(":memory:");
    expect(() =>
      d.prepare("INSERT INTO order_briefs (reference, brief, email, created_at) VALUES ('none', ?, ?, 'x')").run(JSON.stringify(BRIEF), EMAIL),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe("Stripe gets the address in the body and nowhere else", () => {
  it("sets customer_email, and neither return URL carries an at sign or the address", async () => {
    const s = stagedStripe();
    await beginOfferCheckout(openDb(":memory:"), s.provider, { offerId: OFFER.id, brief: BRIEF, email: EMAIL });
    const body = s.calls[0].body!;
    expect(body.get("customer_email")).toBe(EMAIL);
    for (const key of ["success_url", "cancel_url"]) {
      expect(body.get(key), key).not.toContain("@");
      expect(body.get(key), key).not.toContain(EMAIL);
    }
    expect(s.calls[0].url).not.toContain("@");
  });

  it("sets no customer_email for a payment without one", async () => {
    const s = stagedStripe();
    await s.provider.begin({ cents: 1900, offer: { id: OFFER.id, name: OFFER.name } });
    expect(s.calls[0].body!.has("customer_email")).toBe(false);
  });
});

describe("/katalog/kaufen since Goal 21", () => {
  const setup = () => {
    const s = stagedStripe();
    const d = openDb(":memory:");
    return { s, d, app: createApp({ db: d, checkout: s.provider, rateLimit: null }) };
  };
  const post = (a: ReturnType<typeof createApp>, body: string) =>
    a.request("/katalog/kaufen", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

  // The old way, `angebot` alone, is now the refusal. Once without the fields, once without the
  // address, and once with neither (HAN-25, condition 5).
  it.each([
    ["the offer alone", form({ angebot: OFFER.id })],
    ["no fields", form({ angebot: OFFER.id, email: EMAIL })],
    ["no address", form({ angebot: OFFER.id, ...BRIEF })],
  ])("answers 400 to %s, with no Stripe call and no row", async (_, body) => {
    const { s, d, app } = setup();
    const res = await post(app, body);
    expect(res.status).toBe(400);
    expect(s.calls).toHaveLength(0);
    expect(count(d, "checkouts")).toBe(0);
    expect(count(d, "order_briefs")).toBe(0);
  });

  it.each(OFFERS.map((o) => [o.id] as const))("%s: answers 303 to Stripe with GOAL.md's example, and \"x\" everywhere with 400", async (id) => {
    const o = OFFERS.find((x) => x.id === id)!;
    const { s, d, app } = setup();
    expect((await post(app, form({ angebot: id, ...allX(o), email: EMAIL }))).status).toBe(400);
    expect([s.calls.length, count(d, "checkouts"), count(d, "order_briefs")]).toEqual([0, 0, 0]);
    const res = await post(app, form({ angebot: id, ...EXAMPLES[id], email: EMAIL }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect([s.calls.length, count(d, "checkouts"), count(d, "order_briefs")]).toEqual([1, 1, 1]);
  });

  it("gives a person the page back with what they typed and a German sentence naming the field", async () => {
    const { app } = setup();
    const res = await post(app, form({ angebot: OFFER.id, ...BRIEF, email: "a@b" }));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("gültige E-Mail-Adresse");
    expect(html).toContain(BRIEF.inhalt);
    expect(html).toContain(`value="${BRIEF.anlass}"`);
    expect(html).toContain("<option selected>5 Minuten</option>");
    expect(html).toContain('value="a@b"');
    const short = await (await post(app, form({ angebot: OFFER.id, ...BRIEF, inhalt: "zu kurz", email: EMAIL }))).text();
    expect(short).toContain("Bitte schreiben Sie bei „Was soll vorkommen: Namen, eine gemeinsame Geschichte?“ mindestens 40 Zeichen");
    expect(short).toContain(`value="${EMAIL}"`);
    const choice = await (await post(app, form({ angebot: OFFER.id, ...BRIEF, laenge: "", email: EMAIL }))).text();
    expect(choice).toContain("Bitte wählen Sie bei „Wie lang darf sie sein?“ eine Möglichkeit aus.");
  });

  it("escapes what it gives back", async () => {
    const { app } = setup();
    const html = await (await post(app, form({ angebot: OFFER.id, ...BRIEF, inhalt: "</textarea><script>x()</script>", email: "x" }))).text();
    expect(html).not.toContain("<script>x()</script>");
    expect(html).toContain("&lt;/textarea&gt;&lt;script&gt;");
  });
});

describe("/katalog/bestellen", () => {
  const app = () => createApp({ db: openDb(":memory:"), checkout: stagedStripe().provider, rateLimit: null });

  it("asks the offer's fields, all required, says Recht's sentence and links the privacy page", async () => {
    for (const o of OFFERS) {
      const res = await app().request(`/katalog/bestellen?angebot=${o.id}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(o.name);
      for (const f of o.fields) {
        expect(html, `${o.id}: ${f.name}`).toContain(f.label);
        expect(html, `${o.id}: ${f.name}`).toMatch(
          f.kind === "choice"
            ? new RegExp(`<select id="${f.name}" name="${f.name}" required`)
            : new RegExp(`<(textarea|input) id="${f.name}" name="${f.name}"[^>]* minlength="${f.min}" maxlength="${f.max}" required`),
        );
      }
      expect(html).toMatch(/<input id="email" name="email" type="email" required autocomplete="email"/);
      expect(html).toContain(`<input type="hidden" name="angebot" value="${o.id}">`);
      expect(html).toContain(PRIVACY_SENTENCE);
      expect(html).toContain('href="/datenschutz"');
      expect(html).toContain("Weiter zur Bezahlung");
      expect(html).toContain(TEST_MODE_LINE);
    }
  });

  it("is noindex and not in the sitemap, and the catalogue links to it with nofollow", async () => {
    const a = app();
    const html = await (await a.request(`/katalog/bestellen?angebot=${OFFER.id}`)).text();
    expect(html).toContain('<meta name="robots" content="noindex">');
    const catalogue = await (await a.request("/katalog")).text();
    expect(catalogue).toContain(`href="/katalog/bestellen?angebot=${OFFER.id}" rel="nofollow"`);
    expect(catalogue, "the catalogue posts nothing any more").not.toContain('action="/katalog/kaufen"');
    expect(await (await a.request("/sitemap.xml")).text()).not.toContain("bestellen");
  });

  it("sends an unknown offer, a missing one and a switched-off card path back to the catalogue", async () => {
    for (const q of ["?angebot=gibt-es-nicht", ""]) {
      const res = await app().request(`/katalog/bestellen${q}`);
      expect([res.status, res.headers.get("location")], q).toEqual([303, "/katalog"]);
    }
    delete process.env.CP_STRIPE_SECRET_KEY;
    const off = await app().request(`/katalog/bestellen?angebot=${OFFER.id}`);
    expect([off.status, off.headers.get("location")]).toEqual([303, "/katalog"]);
  });

  it("is under the rate limit for strangers, like the POST behind it", async () => {
    const a = createApp({ db: openDb(":memory:"), checkout: stagedStripe().provider, rateLimit: { limit: 2, windowMs: 60_000 } });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await a.request(`/katalog/bestellen?angebot=${OFFER.id}`)).status);
    expect(codes).toEqual([200, 200, 429]);
    expect((await a.request("/katalog")).status).toBe(200);
  });
});

describe("/datenschutz", () => {
  it("answers 200 in German, is in the sitemap and in the German footer", async () => {
    const a = createApp({ db: openDb(":memory:"), checkout: stagedStripe().provider, rateLimit: null });
    const res = await a.request("/datenschutz");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html lang="de">');
    expect(html).toContain("Stripe Payments Europe");
    expect(await (await a.request("/sitemap.xml")).text()).toContain("/datenschutz</loc>");
    expect(await (await a.request("/katalog")).text()).toContain('<a href="/datenschutz">Datenschutz</a>');
  });

  it("promises the periods the code keeps, not numbers of its own", async () => {
    const html = await (await createApp({ db: openDb(":memory:") }).request("/datenschutz")).text();
    expect(html).toContain(`löschen wir Angaben und Adresse nach ${UNPAID_BRIEF_DAYS} Tagen`);
    expect(html).toContain(`löschen wir sie ${PAID_BRIEF_DAYS} Tage nach der Zahlung`);
    expect(html).toContain(`Nach ${ACCESS_LOG_DAYS} Tagen`);
    const keep = /roll_keep_for (\d+)h/.exec(readFileSync("deploy/Caddyfile", "utf-8"));
    expect(keep, "deploy/Caddyfile no longer says how long the access log is kept").not.toBeNull();
    expect(Number(keep![1]) / 24, "the page and the Caddyfile disagree about the access log").toBe(ACCESS_LOG_DAYS);
  });
});

describe("cleanupOrderBriefs, Recht's periods in both directions (HAN-26)", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 15, 12, 0, 0);
  const at = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();
  const plant = (d: ReturnType<typeof openDb>, ref: string, createdDaysAgo: number, status: string, settledDaysAgo?: number) => {
    d.prepare("INSERT INTO checkouts (reference, offer, cents, provider, status, created_at, settled_at) VALUES (?, ?, 1900, 'stripe_test', ?, ?, ?)")
      .run(ref, OFFER.id, status, at(createdDaysAgo), settledDaysAgo === undefined ? null : at(settledDaysAgo));
    d.prepare("INSERT INTO order_briefs (reference, brief, email, created_at) VALUES (?, ?, ?, ?)").run(ref, JSON.stringify(BRIEF), EMAIL, at(createdDaysAgo));
  };

  it("deletes an unpaid brief after 30 days and keeps it before, and keeps a paid one for 120 days after payment", () => {
    const d = openDb(":memory:");
    plant(d, "unpaid-31", 31, "pending");
    plant(d, "abandoned-31", 31, "abandoned");
    plant(d, "unpaid-29", 29, "pending");
    plant(d, "paid-121", 130, "paid", 121);
    plant(d, "paid-119", 130, "paid", 119);
    plant(d, "paid-old-order-recent-payment", 200, "paid", 10);
    expect(cleanupOrderBriefs(d, now)).toBe(3);
    const left = (d.prepare("SELECT reference FROM order_briefs ORDER BY reference").all() as { reference: string }[]).map((r) => r.reference);
    expect(left).toEqual(["paid-119", "paid-old-order-recent-payment", "unpaid-29"]);
    expect(count(d, "checkouts"), "checkouts names no person and stays").toBe(6);
  });
});

describe("ops/ours.txt and the report mean the same buyers", () => {
  const fromFile = (kind: string) =>
    readFileSync("ops/ours.txt", "utf-8")
      .split("\n")
      .filter((l) => l.trim() && !l.trimStart().startsWith("#"))
      .map((l) => l.trim().split(/\s+/))
      .filter(([k]) => k === kind)
      .map(([, v]) => v);
  const fromReport = (name: string) => {
    const source = readFileSync("ops/db-report.cjs", "utf-8").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(source);
    expect(m, `${name} is not in ops/db-report.cjs any more`).not.toBeNull();
    return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  };

  it("has the same domains and the same addresses on both sides", () => {
    expect(fromFile("email-domain").sort()).toEqual(fromReport("OUR_EMAIL_DOMAINS").sort());
    expect(fromFile("email").sort()).toEqual(fromReport("OUR_EMAILS").sort());
    expect(fromFile("email-domain")).toContain("postyourprice.com");
  });

  it("knows only these two kinds of line", () => {
    const kinds = readFileSync("ops/ours.txt", "utf-8")
      .split("\n")
      .filter((l) => l.trim() && !l.trimStart().startsWith("#"))
      .map((l) => l.trim().split(/\s+/)[0]);
    expect([...new Set(kinds)].sort()).toEqual(["email-domain"].concat(kinds.includes("email") ? ["email"] : []).sort());
  });
});

describe("order_briefs_30d and human_orders_paid_30d in ops/db-report.cjs", () => {
  const report = (plant: (d: ReturnType<typeof openDb>) => void): { market: Record<string, unknown>; raw: string } => {
    const dir = mkdtempSync(join(tmpdir(), "cp-briefs-"));
    const path = join(dir, "cp.db");
    try {
      const d = openDb(path);
      plant(d);
      d.close();
      const raw = execFileSync("node", ["ops/db-report.cjs"], { env: { ...process.env, CP_DB_PATH: path }, encoding: "utf-8" });
      return { market: JSON.parse(raw).market, raw };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const row = (d: ReturnType<typeof openDb>, ref: string, email: string, provider: string, status = "paid", daysAgo = 1) => {
    const t = new Date(Date.now() - daysAgo * 86400e3).toISOString();
    d.prepare("INSERT INTO checkouts (reference, offer, cents, provider, status, created_at, settled_at) VALUES (?, ?, 1900, ?, ?, ?, ?)")
      .run(ref, OFFER.id, provider, status, t, status === "paid" ? t : null);
    d.prepare("INSERT INTO order_briefs (reference, brief, email, created_at) VALUES (?, ?, ?, ?)").run(ref, JSON.stringify(BRIEF), email, t);
  };

  it("counts a stranger's paid live order in both", () => {
    const { market } = report((d) => row(d, "a", EMAIL, "stripe"));
    expect([market.order_briefs_30d, market.human_orders_paid_30d]).toEqual([1, 1]);
  });

  it.each([
    "vorfuehrung@postyourprice.com",
    "Someone@Sub.PostYourPrice.com",
    "x@handsel.dev",
    "test@example.com",
    "agent@probe.test",
    "a@b.invalid",
  ])("counts the same order under %s in neither", (email) => {
    const { market } = report((d) => row(d, "a", email, "stripe"));
    expect([market.order_briefs_30d, market.human_orders_paid_30d]).toEqual([0, 0]);
  });

  it("does not take a domain that only ends in the same letters", () => {
    const { market } = report((d) => row(d, "a", "me@notpostyourprice.com", "stripe"));
    expect(market.order_briefs_30d).toBe(1);
  });

  it("counts a stranger's test-card order as a brief and not as a paid order", () => {
    const { market } = report((d) => row(d, "a", EMAIL, "stripe_test"));
    expect([market.order_briefs_30d, market.human_orders_paid_30d]).toEqual([1, 0]);
  });

  it("counts an unpaid brief, and nothing older than thirty days", () => {
    const { market } = report((d) => {
      row(d, "open", EMAIL, "stripe", "pending");
      row(d, "old", EMAIL, "stripe", "paid", 31);
    });
    expect([market.order_briefs_30d, market.human_orders_paid_30d]).toEqual([1, 0]);
  });

  // HAN-24: without a webhook a buyer who closes the tab after paying stays pending, and this is
  // the number that tells a 0 in human_orders_paid_30d from not looking.
  it("counts a stranger's live order still pending after an hour, and not one of ten minutes, ours, a test card or a paid one", () => {
    const { market } = report((d) => {
      row(d, "two-hours", EMAIL, "stripe", "pending", 2 / 24);
      row(d, "ten-minutes", EMAIL, "stripe", "pending", 10 / 1440);
      row(d, "ours", "vorfuehrung@postyourprice.com", "stripe", "pending", 2 / 24);
      row(d, "test-card", EMAIL, "stripe_test", "pending", 2 / 24);
      row(d, "paid", EMAIL, "stripe", "paid", 2 / 24);
      row(d, "old", EMAIL, "stripe", "pending", 31);
    });
    expect(market.human_orders_pending_30d).toBe(1);
  });

  it("says 0 pending, not nothing, when there is nobody", () => {
    const { market } = report(() => {});
    expect([market.order_briefs_30d, market.human_orders_paid_30d, market.human_orders_pending_30d]).toEqual([0, 0, 0]);
  });

  it("prints neither an address nor a brief (HAN-25, condition 8)", () => {
    const { raw } = report((d) => row(d, "a", EMAIL, "stripe"));
    expect(raw).not.toContain(EMAIL);
    expect(raw).not.toContain("@");
    expect(raw).not.toContain(BRIEF.person);
  });
});
