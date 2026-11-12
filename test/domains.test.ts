/**
 * The domain endpoints of the unmodified runtime, held against docs/sandbox/vertrag.md.
 *
 * On 2026-11-10 a stranger's automaton searched for a domain here five times and got the 404 of the
 * fallback route twenty times, because the runtime retries every 404 three times
 * (`src/conway/client.ts:51` at d8f8168). Every row with `/v1/domains` in the section
 * `## Endpunkte` of docs/sandbox/vertrag.md has a route now, and each test below checks status and
 * fields against its row.
 *
 * What the runtime reads is copied from `src/conway/client.ts:465` to `:535` at the pin: the
 * mapping functions below are the same expressions, so a field this service leaves out or names
 * differently shows up here as the value the runtime would actually see.
 *
 * Nothing here is bought: no domain can be registered through this control plane (a purchase is
 * the human gate `server_kauf`), so search and register answer 501 (a search list would make the
 * runtime's tool call every name "taken"), and the DNS endpoints answer 403 for a domain this account does not hold, which
 * today is every domain.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";

const VERTRAG = path.join(__dirname, "..", "docs", "sandbox", "vertrag.md");

/** The statuses the runtime's HTTP client retries and counts toward its circuit breaker (`src/types.ts:613`). */
const RETRYABLE = [429, 500, 502, 503, 504];

type Row = { method: string; path: string; answer: string };

/** The rows of `## Endpunkte` in docs/sandbox/vertrag.md that name `/v1/domains`. */
function contractRows(): Row[] {
  const text = fs.readFileSync(VERTRAG, "utf8");
  const section = text.split(/^## /m).find((s) => s.startsWith("Endpunkte"));
  if (!section) throw new Error("docs/sandbox/vertrag.md has no section ## Endpunkte");
  return section
    .split("\n")
    .filter((l) => /^\| (GET|POST|PUT|PATCH|DELETE) /.test(l) && l.includes("/v1/domains"))
    .map((l) => {
      const cells = l.split("|").map((c) => c.trim());
      return { method: cells[1], path: cells[2].replace(/`/g, ""), answer: cells[4] };
    });
}

/** A concrete URL for a contract path: every placeholder filled with a plausible value. */
function concrete(p: string): string {
  return p
    .replace("<q>", "myagent")
    .replace("<liste>", "com,io,ai")
    .replace("{domain}", "myagent.com")
    .replace("{record}", "rec-1");
}

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db });
  const address = "0x" + "12".repeat(20);
  const key = "cnwy_k_" + "d0".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address,
    hashApiKey(key),
    key.slice(0, 15),
    "test",
    new Date().toISOString(),
  );
  // The runtime sends the key raw, without "Bearer" (`src/conway/client.ts:59`).
  const call = (method: string, url: string, body?: unknown, withKey = true) =>
    app.request(url, {
      method,
      headers: { "Content-Type": "application/json", ...(withKey ? { Authorization: key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const ledgerRows = () => (db.prepare("SELECT count(*) AS n FROM ledger").get() as { n: number }).n;
  const balance = () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
  return { app, call, ledgerRows, balance };
}

// The runtime's own reading of each answer, expression for expression from src/conway/client.ts at d8f8168.
const readSearch = (result: any) =>
  (result.results || result.domains || []).map((d: any) => ({
    domain: d.domain,
    available: d.available ?? d.purchasable ?? false,
    registrationPrice: d.registration_price ?? d.purchase_price,
    renewalPrice: d.renewal_price,
    currency: d.currency || "USD",
  }));

/**
 * The text the runtime's tool `search_domains` hands the model for our answer, expression for expression
 * from d8f8168: on 2xx `src/agent/tools.ts` (`search_domains.execute`) over `searchDomains` of
 * `src/conway/client.ts`; on any other status `request()` throws `Conway API error: <method> <path> -> <status>: <body>`
 * and `executeTool` hands `err.message` on as the tool's error.
 */
async function searchToolText(res: Response, path: string): Promise<string> {
  if (!res.ok) return `Conway API error: GET ${path} -> ${res.status}: ${await res.text()}`;
  const results = readSearch(await res.json());
  if (results.length === 0) return "No results found.";
  return results
    .map(
      (d: any) =>
        `${d.domain}: ${d.available ? "AVAILABLE" : "taken"}${d.registrationPrice != null ? ` ($${(d.registrationPrice / 100).toFixed(2)}/yr)` : ""}`,
    )
    .join("\n");
}

/** What `request()` does with a status before any body is read: 404 is retried three times, these five open the breaker. */
function runtimeFate(status: number): "ok" | "retried-404" | "breaker" | "error-to-tool" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 404) return "retried-404";
  if (RETRYABLE.includes(status)) return "breaker";
  return "error-to-tool";
}

describe("domain endpoints from docs/sandbox/vertrag.md", () => {
  it("the contract still lists exactly the five domain rows this file covers", () => {
    const rows = contractRows().map((r) => `${r.method} ${r.path.replace(/\?.*/, "")}`);
    expect(rows).toEqual([
      "GET /v1/domains/search",
      "POST /v1/domains/register",
      "GET /v1/domains/{domain}/dns",
      "POST /v1/domains/{domain}/dns",
      "DELETE /v1/domains/{domain}/dns/{record}",
    ]);
  });

  it("every domain row of the contract has a route: none answers the fallback 404, none opens the runtime's breaker", async () => {
    const { call } = setup();
    for (const row of contractRows()) {
      const body = row.method === "GET" || row.method === "DELETE" ? undefined : { domain: "myagent.com", type: "A", host: "@", value: "192.0.2.1" };
      const res = await call(row.method, concrete(row.path), body);
      const json = (await res.json()) as { error?: string };
      expect(res.status, `${row.method} ${row.path}`).not.toBe(404);
      expect(json.error, `${row.method} ${row.path}`).not.toBe("not_found");
      expect(runtimeFate(res.status), `${row.method} ${row.path}`).not.toBe("breaker");
    }
  });

  it("GET /v1/domains/search: 501 not_implemented with the names it covers, which the runtime hands to search_domains as an error, never as a list of taken names", async () => {
    // vertrag.md row: `results[]` oder `domains[]`, je Eintrag `domain`, `available` oder `purchasable`, ...;
    // "Fehler an das Werkzeug `search_domains`". No list: the runtime would print every entry without a
    // true `available` as taken (src/agent/tools.ts at d8f8168), so the answer is the error the tool shows.
    const { call } = setup();
    const res = await call("GET", "/v1/domains/search?query=myagent&tlds=com,io,ai");
    expect(res.status).toBe(501);
    expect(runtimeFate(res.status)).toBe("error-to-tool");
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as any;
    expect(body.error).toBe("not_implemented");
    expect(body.reason).toBe("domain search is not offered");
    expect(body.names).toEqual(["myagent.com", "myagent.io", "myagent.ai"]);
    // Neither list field the runtime reads, and no invented price.
    expect(body.results).toBeUndefined();
    expect(body.domains).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/registration_price|purchase_price|renewal_price/);
    expect(body.message).toMatch(/no domain can be registered here/i);
    expect(body.message).toMatch(/nothing was charged/i);
    expect(body.docs).toContain("docs/errors.md#domains");
  });

  it("search_domains tool text: claims no name as taken and says that no domain can be registered here", async () => {
    // vertrag.md row GET /v1/domains/search: "Fehler an das Werkzeug `search_domains`". Whatever status we pick,
    // the text the customer's agent reads must not call a name taken that may well be free.
    const { call } = setup();
    for (const path of ["/v1/domains/search?query=myagent&tlds=com,io,ai", "/v1/domains/search?query=myagent.dev"]) {
      const text = await searchToolText(await call("GET", path), path);
      expect(text, path).not.toMatch(/taken/i);
      expect(text, path).not.toMatch(/AVAILABLE/);
      expect(text, path).toMatch(/no domain can be registered here/i);
      expect(text, path).toMatch(/availability was not checked/i);
    }
  });

  it("GET /v1/domains/search: without tlds the default set, a full name stays one name, a bad query is 400 and not retried", async () => {
    const { call } = setup();
    const plain = (await (await call("GET", "/v1/domains/search?query=MyAgent")).json()) as any;
    expect(plain.names).toEqual(["myagent.com", "myagent.io", "myagent.ai"]);
    const full = (await (await call("GET", "/v1/domains/search?query=myagent.dev&tlds=com")).json()) as any;
    expect(full.names).toEqual(["myagent.dev"]);
    for (const url of ["/v1/domains/search", "/v1/domains/search?query=", "/v1/domains/search?query=a_b", "/v1/domains/search?query=ok&tlds=c%20m"]) {
      const res = await call("GET", url);
      expect(res.status, url).toBe(400);
      expect(runtimeFate(res.status)).toBe("error-to-tool");
    }
  });

  it("POST /v1/domains/register: a purchase, so 501 not_implemented, which the runtime hands to register_domain as an error, never a registration", async () => {
    // vertrag.md row: Fehler an das Werkzeug `register_domain`; ein 402 löst hier kein Topup aus.
    const { call, ledgerRows, balance } = setup();
    const res = await call("POST", "/v1/domains/register", { domain: "myagent.com", years: 1 });
    expect(res.status).toBe(501);
    expect(runtimeFate(res.status)).toBe("error-to-tool");
    const body = (await res.json()) as any;
    expect(body.error).toBe("not_implemented");
    expect(body.message).toMatch(/not registered/);
    expect(body.docs).toContain("docs/errors.md#domains");
    // None of the fields the runtime would read as a success.
    expect(body.status).toBeUndefined();
    expect(body.expires_at).toBeUndefined();
    expect(body.transaction_id).toBeUndefined();
    // The marker that would send the runtime into a topup stays out of the body.
    expect(JSON.stringify(body)).not.toContain("INSUFFICIENT_CREDITS");
    expect(ledgerRows()).toBe(0);
    expect(balance()).toBe(0);
  });

  it("GET /v1/domains/{domain}/dns: 403 domain_not_held, no records invented for a zone this service does not hold", async () => {
    // vertrag.md row: `records[]` oder Array, je Eintrag `id`, `type`, `host`, `value`, `ttl`; Fehler an `manage_dns`.
    const { call } = setup();
    const res = await call("GET", `/v1/domains/${encodeURIComponent("myagent.com")}/dns`);
    expect(res.status).toBe(403);
    expect(runtimeFate(res.status)).toBe("error-to-tool");
    const body = (await res.json()) as any;
    expect(body.error).toBe("domain_not_held");
    expect(body.domain).toBe("myagent.com");
    expect(body.records).toBeUndefined();
    expect(body.message).toMatch(/myagent\.com/);
  });

  it("POST /v1/domains/{domain}/dns: 403 domain_not_held, nothing written", async () => {
    // vertrag.md row: JSON `type`, `host`, `value`, `ttl`; Antwort `id` oder `record_id`; Fehler an `manage_dns`.
    const { call, ledgerRows } = setup();
    const res = await call("POST", "/v1/domains/myagent.com/dns", { type: "A", host: "@", value: "192.0.2.1", ttl: 3600 });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("domain_not_held");
    expect(body.id).toBeUndefined();
    expect(body.record_id).toBeUndefined();
    expect(ledgerRows()).toBe(0);
  });

  it("DELETE /v1/domains/{domain}/dns/{record}: 403 domain_not_held, not the 2xx that would claim a deletion", async () => {
    // vertrag.md row: nur Status 2xx; Fehler an `manage_dns`.
    const { call } = setup();
    const res = await call("DELETE", "/v1/domains/myagent.com/dns/rec-1");
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error).toBe("domain_not_held");
  });

  it("every domain endpoint wants the API key, also the ones behind the wildcard", async () => {
    const { call } = setup();
    for (const row of contractRows()) {
      const res = await call(row.method, concrete(row.path), row.method === "POST" ? {} : undefined, false);
      expect(res.status, `${row.method} ${row.path}`).toBe(401);
    }
  });

  it("a path or method under /v1/domains that the contract does not name is not answered as a domain", async () => {
    const { call } = setup();
    expect((await call("GET", "/v1/domains/myagent.com")).status).toBe(404);
    expect((await call("GET", "/v1/domains/myagent.com/dns/rec-1/x")).status).toBe(404);
    const wrong = await call("PUT", "/v1/domains/myagent.com/dns");
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("GET, POST");
    expect((await call("GET", "/v1/domains/not_a_domain/dns")).status).toBe(400);
  });
});
