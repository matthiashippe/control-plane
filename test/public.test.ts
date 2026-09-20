import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { MockProvider } from "../src/inference/mock.js";
import { Catalog, MARKUP } from "../src/inference/proxy.js";

function setup() {
  const db = openDb(":memory:");
  const app = createApp({
    db,
    catalog: new Catalog([new MockProvider()], { "gpt-5.2": "mock-1", "gpt-5-mini": "mock-1" }),
  });
  return { db, app };
}

describe("Öffentliche Seite und Status", () => {
  it("liefert unter / eine HTML-Seite mit Hostname, Setup-Zeile und den Grenzen von Phase 1", async () => {
    const { app } = setup();
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("cp.hippe.eu");
    expect(html).toContain("conwayApiUrl");
    expect(html).toContain("automaton --provision");
    expect(html).toMatch(/501/); // Sandboxes und Transfers sind als nicht verfügbar benannt
    expect(html).toMatch(/not transferable|not redeemable/i);
    expect(html).not.toMatch(/<script[^>]+src=/i); // keine externen Skripte
    expect(html).not.toMatch(/fonts\.googleapis|googletagmanager|analytics/i);
  });

  it("liefert /v1/status ohne API-Key mit Modellen, Tiers, Markup und Automaton-Zahl", async () => {
    const { app } = setup();
    const res = await app.request("/v1/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      version: string;
      phase: number;
      markup: number;
      models: { id: string; aliases: string[]; input_per_million: number; output_per_million: number }[];
      topup_tiers_usd: number[];
      automatons: number;
    };
    expect(body.ok).toBe(true);
    expect(body.phase).toBe(1);
    expect(body.markup).toBe(MARKUP);
    // Ein Eintrag je echtem Modell, die Runtime-IDs stehen als Aliase daneben.
    expect(body.models).toHaveLength(1);
    expect(body.models[0].id).toBe("mock-1");
    expect(body.models[0].aliases.sort()).toEqual(["gpt-5-mini", "gpt-5.2"]);
    expect(body.models[0].input_per_million).toBeGreaterThan(0);
    expect(body.topup_tiers_usd).toContain(5);
    expect(body.automatons).toBe(0);
  });

  it("zählt in /v1/status nur Automatons, hinter denen eine Zahlung steht", async () => {
    // Die Registrierung ist kostenlos und beliebig oft möglich, ein API-Key ebenso. Zählte der
    // Endpunkt jede Registrierung, könnte jeder die öffentliche Kennzahl des Dienstes und damit
    // die Messgröße des 30-Tage-Tests auf einen beliebigen Wert setzen. Im Sicherheitsreview vom
    // 19.09.2026 stand dort nach kurzer Zeit 100.
    const { app, db } = setup();
    const zahl = async () => ((await (await app.request("/v1/status")).json()) as { automatons: number }).automatons;
    const anlegen = (id: string, address: string) => {
      db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(
        address,
        new Date().toISOString(),
      );
      db.prepare(
        "INSERT INTO automatons (automaton_id, address, creator_address, name, bio, registered_at) VALUES (?, ?, ?, ?, '', ?)",
      ).run(id, address, "0xdef", "Test", new Date().toISOString());
    };

    anlegen("a-1", "0xabc");
    expect(await zahl(), "eine Registrierung ohne Zahlung zählt nicht").toBe(0);

    for (let i = 2; i <= 20; i++) anlegen(`a-${i}`, "0xabc");
    expect(await zahl(), "auch zwanzig kostenlose Registrierungen zählen nicht").toBe(0);

    postLedger(db, { address: "0xabc", kind: "topup", deltaMc: 500_000, ref: "x402-nonce-1" });
    expect(await zahl(), "eine zahlende Wallet ist eine, egal wie viele Automatons sie registriert").toBe(1);

    anlegen("b-1", "0xbbb");
    postLedger(db, { address: "0xbbb", kind: "topup", deltaMc: 500_000, ref: "x402-nonce-2" });
    expect(await zahl(), "ein zweiter zahlender Betreiber zählt dazu").toBe(2);
  });

  it("zählt auch eine zahlende Wallet ohne Eintrag in der automatons-Tabelle", async () => {
    // Der erste echte Kunde am 19.09.2026 hatte einen bereits registrierten Automaton von
    // api.conway.tech auf uns umgebogen. Die Runtime prüft ihr Registrierungs-Flag nur beim
    // Prozessstart und schickt dann nie ein Register (Upstream src/index.ts:249-255). Über die
    // automatons-Tabelle gezählt war er unsichtbar, während unser eigener Abnahmelauf die Zahl
    // füllte. Wer zahlt, zählt, mit oder ohne Registrierung.
    const { app, db } = setup();
    const zahl = async () => ((await (await app.request("/v1/status")).json()) as { automatons: number }).automatons;
    postLedger(db, { address: "0xumsteiger", kind: "topup", deltaMc: 500_000, ref: "x402-nonce-3" });
    expect(await zahl()).toBe(1);
  });

  it("weist getrennt aus, wie viele zahlende Wallets tatsächlich Inferenz kaufen", async () => {
    // Zahlen heißt noch nicht denken. Der Unterschied zwischen beiden Zahlen ist die eigentliche
    // Frage des Dienstes.
    const { app, db } = setup();
    const status = async () => (await (await app.request("/v1/status")).json()) as { automatons: number; active: number };

    postLedger(db, { address: "0xzahler", kind: "topup", deltaMc: 500_000, ref: "n-1" });
    expect(await status()).toMatchObject({ automatons: 1, active: 0 });

    postLedger(db, { address: "0xzahler", kind: "inference", deltaMc: -1_000, ref: "gen-1" });
    expect(await status()).toMatchObject({ automatons: 1, active: 1 });
  });

  it("gibt in /v1/status nichts preis, was einen Mandanten identifiziert", async () => {
    const { app, db } = setup();
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, ?, ?)").run("0xdeadbeef", 123456, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "0xdeadbeef",
      "hash",
      "cnwy_k_visible",
      "t",
      new Date().toISOString(),
    );
    const text = await (await app.request("/v1/status")).text();
    expect(text).not.toContain("0xdeadbeef");
    expect(text).not.toContain("cnwy_k_");
    expect(text).not.toContain("123456");
    expect(text.toLowerCase()).not.toContain("balance");
  });

  it("lässt /v1/* sonst weiterhin nur mit API-Key durch und antwortet auf Unbekanntes mit JSON-404", async () => {
    const { app } = setup();
    expect((await app.request("/v1/credits/balance")).status).toBe(401);
    expect((await app.request("/v1/models")).status).toBe(401);
    const missing = await app.request("/gibtsnicht");
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as { error: string; message: string; docs: string };
    expect(Object.keys(body).sort()).toEqual(["docs", "error", "message"]);
    expect(body.error).toBe("not_found");
    expect(body.message).toContain("/.well-known/x402");
    expect(body.docs).toContain("docs/errors.md");
  });

  it("nennt auf der Seite den Betreiber und eine Kontaktmöglichkeit", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toMatch(/Matthias Hippe/);
    expect(html).toMatch(/mailto:[^"]+@/);
    expect(html).toContain("github.com/matthiashippe/control-plane");
  });

  it("führt ein Impressum mit ladungsfähiger Anschrift (§ 5 DDG), erreichbar unter /impressum", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toMatch(/id="impressum"/);
    expect(html).toMatch(/Matthias Hippe/);
    expect(html).toMatch(/San-Francisco-Straße 1/);
    expect(html).toMatch(/20457 Hamburg/);
    const redirect = await app.request("/impressum");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/#impressum");
  });

  it("verspricht keine Auszahlung von Credits (Regulatorik: kein Rückzahlungsanspruch)", async () => {
    const { app } = setup();
    const html = (await (await app.request("/")).text()).toLowerCase();
    expect(html).toContain("not redeemable");
    expect(html).not.toMatch(/refund|pay ?out|cash out|redeem your|withdraw/);
  });

  it("verlinkt den kostenlosen Weg sichtbar, damit niemand zahlt, der nicht muss", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toContain("ohne-control-plane.md");
    expect(html).toMatch(/you may not need this/i);
  });

  it("liefert /.well-known/x402 mit Endpunkten, Zahlungsangebot und dem kostenlosen Weg", async () => {
    const { app } = setup();
    const res = await app.request("/.well-known/x402");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as Record<string, any>;
    expect(doc.x402Version).toBe(1);
    expect(doc.endpoints.topup).toBe("/pay/{usd}/{address}");
    expect(doc.endpoints.inference).toBe("/v1/chat/completions");
    expect(doc.markup).toBe(MARKUP);
    expect(doc.credits).toMatchObject({ redeemable: false, transferable: false });
    expect(doc.free_alternative).toContain("ohne-control-plane.md");
    expect(JSON.stringify(doc)).not.toMatch(/refund|cash out|withdraw/i);
  });

  it("nennt in /.well-known/x402 das Zahlungsangebot, sobald Pay konfiguriert ist", async () => {
    const db = openDb(":memory:");
    const app = createApp({
      db,
      catalog: new Catalog([new MockProvider()], { "gpt-5.2": "mock-1" }),
      pay: {
        payTo: "0x914102284463F4F58B1D2f6DB9aC80BFcaA7d614",
        network: "base",
        chainId: 8453,
        usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        maxTimeoutSeconds: 120,
        tiers: [5, 25],
      },
    });
    const doc = (await (await app.request("/.well-known/x402")).json()) as Record<string, any>;
    expect(doc.accepts).toHaveLength(1);
    expect(doc.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "base",
      chainId: 8453,
      payTo: "0x914102284463F4F58B1D2f6DB9aC80BFcaA7d614",
      amounts_usd: [5, 25],
    });
  });

  it("liefert llms.txt als Text mit Setup-Zeile, Tiers und dem kostenlosen Weg", async () => {
    const { app } = setup();
    const res = await app.request("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const txt = await res.text();
    expect(txt).toContain("# control-plane");
    expect(txt).toContain("conwayApiUrl");
    expect(txt).toContain("cp.hippe.eu");
    expect(txt).toContain("ohne-control-plane.md");
    expect(txt).toMatch(/not redeemable and not transferable/i);
    expect(txt).not.toMatch(/refund|cash out|withdraw/i);
  });
});

describe("Die Fragen eines Zweiflers", () => {
  // Wer über einen GitHub-Issue hierher kommt, überlegt, ob er einem Fremden Geld in
  // Kryptowährung schickt. Die Antworten darauf gehören dorthin, wo er über das Geld nachdenkt,
  // also zwischen die Preisangabe und die Funktionsübersicht, nicht an das Ende der Seite.
  function geldteil(html: string) {
    const von = html.indexOf("<h2>Price</h2>");
    const bis = html.indexOf("<h2>What works");
    expect(von, "Abschnitt Price fehlt").toBeGreaterThan(-1);
    expect(bis, "Abschnitt 'What works, what does not' fehlt oder steht vor dem Preis").toBeGreaterThan(von);
    return html.slice(von, bis);
  }
  const seite = async () => await (await setup().app.request("/")).text();

  it("beantwortet an der Preisangabe, was mit dem Guthaben passiert, wenn der Dienst abgeschaltet wird", async () => {
    // Die zwei Wochen Vorlauf standen vorher nur unter "Honest limits", weit unter den Tiers.
    const geld = geldteil(await seite());
    expect(geld).toMatch(/shut this down|shutting it down/i);
    expect(geld, "die Frist gehört neben den Preis").toMatch(/at least two weeks/i);
    expect(geld, "was mit dem Rest passiert, muss dort stehen").toMatch(/is gone/i);
    expect(geld).toMatch(/not redeemable for money/i);
  });

  it("verspricht auch in der Abschaltklausel kein Geld zurück", async () => {
    // Credits sind nie auszahlbar (loop-constraints.md, Regulatorik). Eine Abschaltklausel ist
    // genau die Stelle, an der sich sonst ein gut gemeintes Rückzahlungsversprechen einschleicht.
    const html = (await seite()).toLowerCase();
    expect(html).not.toMatch(/refund|pay ?out|cash out|redeem your|withdraw|money back|reimburs|compensat/);
    expect(html).toContain("not transferable and not redeemable");
  });

  it("nennt neben dem Preis, wer das Geld bekommt, und nicht erst im Impressum", async () => {
    const geld = geldteil(await seite());
    expect(geld).toContain("Matthias Hippe");
    expect(geld).toMatch(/Hamburg/);
    expect(geld, "Verweis auf die ladungsfähige Anschrift").toContain('href="#impressum"');
    expect(geld, "auch hier der Hinweis auf den kostenlosen Weg").toMatch(/href="#free"/);
  });

  it("sagt an derselben Stelle, wie man Hilfe bekommt, ohne eine Reaktionszeit zuzusagen", async () => {
    const geld = geldteil(await seite());
    expect(geld).toContain("github.com/matthiashippe/control-plane/issues");
    expect(geld).toMatch(/mailto:[^"]+@/);
    expect(geld).toContain("docs/errors.md");
    expect(geld).toMatch(/no\s+guaranteed response time/i);
    const html = await seite();
    expect(html, "keine Reaktionszeit, kein Bereitschaftsdienst").not.toMatch(
      /within \d+\s*(minutes?|hours?|business days?|days?)|24\/7|round the clock/i,
    );
  });

  it("belegt mit dem Abnahmelauf, dass die unveränderte Runtime gegen diese Produktion lief", async () => {
    const html = await seite();
    expect(html, "Upstream-Pin, damit nachvollziehbar ist, was da lief").toContain("d8f8168");
    expect(html).toMatch(/PROD OK topup=true registered=true turns=5 api_errors=0 ledger_consistent=true/);
    expect(html).toContain("goals/2026-09-19-goal-5b-betrieb.md");
    expect(html, "jeder kann denselben Lauf ohne Geld wiederholen").toMatch(/pnpm e2e/);
  });

  it("nennt keine Transaktion als Beleg, die nicht in den Goal-Protokollen steht", async () => {
    // Eine Zahl auf der Seite, die im Repo nicht nachprüfbar ist, ist eine Behauptung.
    const fs = await import("node:fs");
    const html = await seite();
    const belege = fs
      .readdirSync(new URL("../goals/", import.meta.url))
      .map((f) => fs.readFileSync(new URL(`../goals/${f}`, import.meta.url), "utf-8"))
      .join("\n");
    const hashes = html.match(/0x[0-9a-f]{64}/g) ?? [];
    expect(hashes.length, "die Seite soll mindestens einen On-Chain-Beleg nennen").toBeGreaterThan(0);
    for (const h of hashes) expect(belege, `${h} steht in keinem Goal-Protokoll`).toContain(h);
  });

  it("beziffert an der Preisangabe, was ein Turn tatsächlich gekostet hat, aus dem protokollierten Lauf", async () => {
    const fs = await import("node:fs");
    const log = fs.readFileSync(new URL("../goals/2026-09-19-goal-5a-openrouter.md", import.meta.url), "utf-8");
    const kosten = [...log.matchAll(/cost_usd=([0-9.]+) \(Marge|LIVE OK[^\n]*cost_usd=([0-9.]+)/g)]
      .map((m) => Number(m[1] ?? m[2]))
      .filter((n) => n > 0.01);
    expect(kosten.length, "im Protokoll stehen die Kosten der Fünf-Turn-Läufe").toBeGreaterThanOrEqual(2);

    const geld = geldteil(await seite());
    for (const einkauf of kosten) {
      const berechnet = (einkauf * 100 * MARKUP).toFixed(1);
      expect(geld, `${berechnet} cents (Einkauf ${einkauf} USD mal ${MARKUP}) fehlt auf der Seite`).toContain(berechnet);
    }
    expect(geld, "Einkaufspreis des ersten Laufs").toContain((kosten[0] * 100).toFixed(1));
    expect(geld).toMatch(/cents? per turn/i);
    expect(geld, "keine Zusage, sondern eine Größenordnung").toMatch(/order of magnitude/i);
  });

  it("bleibt nüchtern: keine Verfügbarkeitszusage, keine Nutzerzahlen, kein Werbevokabular", async () => {
    const html = await seite();
    expect(html).toMatch(/no SLA/);
    expect(html).not.toMatch(/uptime|99\.9|guaranteed availability/i);
    expect(html, "Nutzerzahlen kommen live aus /v1\/status, nicht aus dem HTML").not.toMatch(
      /trusted by|thousands of|hundreds of (users|operators|teams)|loved by/i,
    );
    expect(html).not.toMatch(
      /seamless|effortless|revolutionary|cutting.edge|unleash|supercharge|blazing|game.?changer|best.in.class|world.class/i,
    );
  });
});

describe("Auslieferung durch Caddy", () => {
  it("hält den CSP-Hash im Caddyfile mit dem Inline-Skript der Seite synchron", async () => {
    // Die Content-Security-Policy erlaubt das Inline-Skript per sha256-Hash statt per
    // 'unsafe-inline'. Ändert jemand das Skript, ohne den Hash im Caddyfile nachzuziehen,
    // blockiert der Browser es und die Seite zeigt keine Live-Zahlen mehr, ohne dass ein
    // Test anschlägt. Genau das fängt dieser Test.
    const fs = await import("node:fs");
    const crypto = await import("node:crypto");
    const html = fs.readFileSync(new URL("../src/public/index.html", import.meta.url), "utf-8");
    const caddyfile = fs.readFileSync(new URL("../deploy/Caddyfile", import.meta.url), "utf-8");

    const script = /<script>([\s\S]*?)<\/script>/.exec(html);
    expect(script, "Seite hat kein Inline-Skript mehr: dann kann der Hash aus der CSP raus").not.toBeNull();

    const hash = "sha256-" + crypto.createHash("sha256").update(script![1]).digest("base64");
    expect(caddyfile, `CSP-Hash im Caddyfile passt nicht zum Skript. Erwartet: ${hash}`).toContain(hash);
  });

  it("begrenzt die Größe eines Request-Bodys in der Caddy-Konfiguration", async () => {
    const fs = await import("node:fs");
    const caddyfile = fs.readFileSync(new URL("../deploy/Caddyfile", import.meta.url), "utf-8");
    expect(caddyfile).toMatch(/request_body\s*\{[\s\S]*?max_size\s+\d+\s*[KMG]?B/);
  });

  it("setzt die Sicherheits-Header, die ein zahlungsverarbeitender Dienst braucht", async () => {
    const fs = await import("node:fs");
    const caddyfile = fs.readFileSync(new URL("../deploy/Caddyfile", import.meta.url), "utf-8");
    for (const header of [
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Content-Security-Policy",
    ]) {
      expect(caddyfile, `${header} fehlt im Caddyfile`).toContain(header);
    }
  });
});

describe("Favicon", () => {
  it("liefert ein Icon statt 404, und die Seite trägt es selbst im Head", async () => {
    // Zwei Besucher haben am 19.09.2026 favicon.ico abgerufen und 404 bekommen. Das kostet nichts
    // und sieht sonst unfertig aus. Der data-URI im Head spart den Request ganz, die Route fängt
    // Clients, die trotzdem fragen.
    const { app } = setup();
    const res = await app.request("/favicon.ico");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/svg\+xml/);
    expect((await res.text()).length).toBeGreaterThan(50);

    const html = await (await app.request("/")).text();
    expect(html, "ohne den data-URI fragt jeder Browser die Route an").toMatch(/rel="icon"/);
  });
});

describe("Nichts ausliefern, was nicht ausgeliefert werden soll", () => {
  it("antwortet auf typische Scan-Pfade mit 404 und ohne Inhalt", async () => {
    // Am 20.09.2026 fuhr ein Scanner 261 bekannte Pfade gegen den Dienst (.env, .git/config,
    // Varianten davon), alle 404. Das war zu erwarten, weil die App genau eine Datei liest, die
    // Startseite, und zwar einmal beim Start (src/app.ts, loadIndexHtml). Dieser Test hält das
    // fest: Sollte jemals ein statischer Dateiserver dazukommen, fällt er hier auf.
    const { app } = setup();
    const pfade = [
      "/.env",
      "/.env.production",
      "/.git/config",
      "/config.json",
      "/package.json",
      "/deploy/.env",
      "/src/app.ts",
      "/data/cp.db",
      "/admin",
      "/../package.json",
      "/public/../../package.json",
    ];
    for (const pfad of pfade) {
      const res = await app.request(pfad);
      expect(res.status, `${pfad} darf nichts liefern`).toBe(404);
      const text = await res.text();
      expect(text, `${pfad} verrät Inhalt`).not.toMatch(/(dependencies|BEGIN |cnwy_k_|sk-|PRIVATE KEY|CP_)/);
      expect(text.length, `${pfad} antwortet zu ausführlich`).toBeLessThan(600);
    }
  });
});

/**
 * Was eine geteilte URL hergibt. Der Artikel und die Reddit-Beitraege stellen die Adresse in
 * Threads, und ohne diese Angaben zeigen Reddit, Discord, Slack und Hacker News nur die nackte
 * Adresse. Wer sie nicht kennt, klickt dann nicht.
 */
describe("Vorschau und Auffindbarkeit", () => {
  it("liefert robots.txt statt eines 404", async () => {
    const db = openDb(":memory:");
    const res = await createApp({ db }).request("/robots.txt");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/User-agent: \*/);
    expect(text, "nichts darf versehentlich gesperrt sein").not.toMatch(/Disallow: \/\s*$/m);
  });

  it("traegt Titel, Beschreibung und Adresse fuer die Vorschau", async () => {
    const db = openDb(":memory:");
    const html = await (await createApp({ db }).request("/")).text();
    for (const feld of ["og:title", "og:description", "og:url", "og:type", "twitter:card"]) {
      expect(html, `${feld} fehlt`).toMatch(new RegExp(feld));
    }
    expect(html).toMatch(/rel="canonical" href="https:\/\/cp\.hippe\.eu\/"/);
    // Die Beschreibung muss sagen, wofuer das hier der Ersatz ist, sonst ist die Vorschau leer.
    expect(html).toMatch(/og:description" content="[^"]*api\.conway\.tech/);
  });

  it("verwendet keinen Gedankenstrich in der Copy", async () => {
    const db = openDb(":memory:");
    const html = await (await createApp({ db }).request("/")).text();
    // Nur der Text, den ein Besucher liest. Das Inline-Skript bleibt aussen vor: Seine Zeichen
    // sind Code, und eine Aenderung daran macht den CSP-Hash im Caddyfile ungueltig.
    const copy = html.replace(/<script[\s\S]*?<\/script>/g, "");
    const treffer = copy.match(/[\u2013\u2014]/g) ?? [];
    expect(treffer, `Gedankenstriche in der Copy: ${treffer.length}`).toEqual([]);
  });
});
