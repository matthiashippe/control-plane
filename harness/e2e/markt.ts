/**
 * Der Auftragsmarkt gegen eine laufende Instanz, ohne Geld.
 *
 * Die Unit-Tests fahren die App im selben Prozess. Was sie nicht beweisen: dass dieselben Regeln
 * auf dem ausgerollten Stand gelten, hinter Caddy, ueber echtes HTTP, mit einem Schluessel, den
 * die Provisionierung wirklich ausgegeben hat. Genau daran ist am 19.09. ein fremder Kunde
 * gescheitert, dessen Runtime nie einen Gedanken fasste: Lokal lief alles.
 *
 * Geprueft wird der Weg bis zur Kasse und die Kasse selbst. Weiter kommt dieser Lauf nicht, denn
 * einen Auftrag einzustellen kostet Guthaben, und Guthaben entsteht nur durch eine Zahlung on
 * chain; die verbietet loop-constraints.md. Die wichtigste Eigenschaft des Marktes laesst sich
 * trotzdem belegen, naemlich dass ohne Deckung nichts entsteht.
 *
 *   CP_URL=https://cp.hippe.eu pnpm tsx harness/e2e/markt.ts
 *
 * Legt zwei Wegwerf-Schluessel in der Zieldatenbank an. Das kostet nichts und ist beabsichtigt.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

const BASE = (process.env.CP_URL || "https://cp.hippe.eu").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";

let fehler = 0;
function ok(was: string) {
  console.log(`OK      ${was}`);
}
function fehlt(was: string, gesehen: unknown) {
  fehler++;
  console.log(`FEHLER  ${was}\n        gesehen: ${JSON.stringify(gesehen).slice(0, 300)}`);
}

async function provisionieren(name: string): Promise<{ key: string; address: string }> {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonceRes = await fetch(`${BASE}/v1/auth/nonce`, { method: "POST" });
  if (!nonceRes.ok) throw new Error(`nonce: ${nonceRes.status}`);
  const { nonce } = (await nonceRes.json()) as { nonce: string };
  const message = createSiweMessage({
    domain: DOMAIN,
    address: account.address,
    statement: "Sign in to Conway",
    uri: `https://${DOMAIN}`,
    version: "1",
    chainId: 8453,
    nonce,
  });
  const signature = await account.signMessage({ message });
  const verifyRes = await fetch(`${BASE}/v1/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  const verify = (await verifyRes.json()) as Record<string, unknown>;
  if (!verifyRes.ok) throw new Error(`verify: ${verifyRes.status} ${JSON.stringify(verify)}`);
  const token = (verify.access_token ?? verify.accessToken) as string;
  const keyRes = await fetch(`${BASE}/v1/auth/api-keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `harness-markt-${name}` }),
  });
  const keyBody = (await keyRes.json()) as Record<string, unknown>;
  if (!keyRes.ok) throw new Error(`api-keys: ${keyRes.status} ${JSON.stringify(keyBody)}`);
  const key = (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string;
  return { key, address: account.address.toLowerCase() };
}

async function ruf(pfad: string, key: string | null, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${pfad}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: key } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* Text bleibt Text */
  }
  return { status: res.status, body: body as Record<string, unknown> };
}

async function main(): Promise<number> {
  console.log(`Auftragsmarkt gegen ${BASE}\n`);

  const auftraggeber = await provisionieren("auftraggeber");
  const bewerber = await provisionieren("bewerber");
  ok(`zwei Wallets provisioniert (${auftraggeber.address.slice(0, 10)}…, ${bewerber.address.slice(0, 10)}…)`);

  const ohne = await ruf("/v1/bounties", null);
  ohne.status === 401 ? ok("/v1/bounties ohne Schluessel: 401") : fehlt("/v1/bounties ohne Schluessel sollte 401 geben", ohne);

  const liste = await ruf("/v1/bounties", auftraggeber.key);
  Array.isArray(liste.body.bounties)
    ? ok(`/v1/bounties mit Schluessel: ${(liste.body.bounties as unknown[]).length} offene`)
    : fehlt("/v1/bounties sollte eine Liste liefern", liste);

  const frist = new Date(Date.now() + 3_600_000).toISOString();
  const auftrag = { brief: "Harness-Lauf, wird nie ausgeschrieben.", kind: "factual", price_cents: 200, deadline: frist };

  // Der Kern: ohne Deckung entsteht kein Auftrag. Ein Markt, der das falsch macht, verspricht
  // Geld, das es nicht gibt.
  const ohneDeckung = await ruf("/v1/bounties", auftraggeber.key, { method: "POST", body: JSON.stringify(auftrag) });
  ohneDeckung.status === 402 && ohneDeckung.body.error === "insufficient_balance"
    ? ok("Auftrag ohne Guthaben: 402 insufficient_balance, kein Auftrag entsteht")
    : fehlt("ein Auftrag ohne Guthaben muss 402 insufficient_balance geben", ohneDeckung);

  const faelle: [string, Record<string, unknown>, string][] = [
    ["leeres Briefing", { ...auftrag, brief: "   " }, "brief_required"],
    ["Preis null", { ...auftrag, price_cents: 0 }, "price_out_of_range"],
    ["Preis zu hoch", { ...auftrag, price_cents: 200_000 }, "price_out_of_range"],
    ["Frist in der Vergangenheit", { ...auftrag, deadline: new Date(Date.now() - 1000).toISOString() }, "deadline_too_soon"],
    ["Frist zu weit weg", { ...auftrag, deadline: new Date(Date.now() + 40 * 864e5).toISOString() }, "deadline_too_far"],
  ];
  for (const [name, koerper, code] of faelle) {
    const res = await ruf("/v1/bounties", auftraggeber.key, { method: "POST", body: JSON.stringify(koerper) });
    res.status === 400 && res.body.error === code
      ? ok(`${name}: 400 ${code}`)
      : fehlt(`${name} sollte 400 ${code} geben`, res);
  }

  const fremd = await ruf("/v1/submissions", bewerber.key, {
    method: "POST",
    body: JSON.stringify({ bounty_id: "gibt-es-nicht", body: "x" }),
  });
  fremd.status === 404 ? ok("Einreichung auf einen unbekannten Auftrag: 404") : fehlt("unbekannter Auftrag sollte 404 geben", fremd);

  const vergabe = await ruf("/v1/bounties/award", auftraggeber.key, {
    method: "POST",
    body: JSON.stringify({ bounty_id: "gibt-es-nicht", submission_id: "auch-nicht" }),
  });
  vergabe.status === 404 ? ok("Vergabe auf einen unbekannten Auftrag: 404") : fehlt("unbekannte Vergabe sollte 404 geben", vergabe);

  const mitId = await fetch(`${BASE}/v1/bounties/irgendeine-id`, { method: "POST" });
  mitId.status === 404
    ? ok("ein Pfad mit angehaengter Kennung bleibt 404, steht also nicht ohne Schluessel offen")
    : fehlt("ein Pfad mit Kennung darf nicht erreichbar sein", { status: mitId.status });

  console.log(`\n${fehler === 0 ? "MARKT OK" : `MARKT FAIL: ${fehler} Fehler`}`);
  return fehler === 0 ? 0 : 1;
}

main().then((c) => process.exit(c), (e) => {
  console.error("MARKT FAIL:", (e as Error).message);
  process.exit(2);
});
