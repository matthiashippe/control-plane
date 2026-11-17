/**
 * The service is sold as automatonhost.com since 2026-11-17 (goals/umzug/02). No page a visitor, an operator or their automaton
 * reads may name the old brand any more: every page in /sitemap.xml, /llms.txt, /openapi.json, every state of the phone pages
 * under /h/{code} and the sources of both preview cards. The one allowed mention is the JSON field handsel_notice on /terms,
 * named in <code> because runtimes read that field (Entscheidung 2 of the goal).
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { renderHandoffPage } from "../src/public/handoff.js";
import { renderKontoPage } from "../src/public/konto.js";
import { renderLimitPage } from "../src/public/limit.js";
import { renderMoneyPage } from "../src/public/money.js";

const OLD_NAME = /postyourprice|handsel/i;
/** The single field name /terms may show, as the code element it stands in. */
const ALLOWED_FIELD = "<code>handsel_notice</code>";

const before = process.env.CP_PUBLIC_URL;
beforeAll(() => {
  process.env.CP_PUBLIC_URL = "https://automatonhost.com";
});
afterAll(() => {
  if (before === undefined) delete process.env.CP_PUBLIC_URL;
  else process.env.CP_PUBLIC_URL = before;
});

const app = () => createApp({ db: openDb(":memory:") });

/** Every hit of the old name, with a little context, so a failure says where it stands. */
function hits(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(OLD_NAME.source, "gi");
  for (const m of text.matchAll(re)) out.push(text.slice(Math.max(0, m.index! - 40), m.index! + 40).replace(/\s+/g, " "));
  return out;
}

describe("the old name is gone from what we serve", () => {
  it("names no old brand on any page listed in /sitemap.xml, only the field handsel_notice on /terms", async () => {
    const a = app();
    const xml = await (await a.request("/sitemap.xml")).text();
    const paths = [...xml.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(paths.length, "the sitemap lists no page, so this test would prove nothing").toBeGreaterThan(5);
    expect(xml, "the sitemap names the canonical host").toContain("https://automatonhost.com/");
    const found: string[] = [];
    for (const path of new Set(paths)) {
      for (const lang of ["en-US,en;q=0.9", "de-DE,de;q=0.9"]) {
        const res = await a.request(path, { headers: { "accept-language": lang } });
        expect(res.status, `${path} answers ${res.status}`).toBeLessThan(400);
        let body = await res.text();
        // /terms shows the field only while an inference end date is set; wherever else it stood, it would count.
        if (path === "/terms") body = body.split(ALLOWED_FIELD).join("");
        for (const h of hits(body)) found.push(`${path} (${lang.slice(0, 2)}): ${h}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("names automatonhost.com and no old brand in /llms.txt and /openapi.json", async () => {
    const a = app();
    const llms = await (await a.request("/llms.txt")).text();
    expect(hits(llms)).toEqual([]);
    expect(llms.split("\n")[0]).toBe("# automatonhost.com");
    const openapi = await (await a.request("/openapi.json")).text();
    expect(hits(openapi)).toEqual([]);
    expect((JSON.parse(openapi) as { info: { title: string } }).info.title).toBe("automatonhost.com");
  });

  it("names automatonhost.com and no old brand in any state of the phone pages", () => {
    const pages = [
      renderHandoffPage({ state: "approve", automatonName: "Atlas", dailyLimitUsdc: 5_000_000n, amountUsdc: 5_000_000n, choices: [62, 47, 18] }, ""),
      renderHandoffPage({ state: "approved" }, ""),
      ...(["expired", "used", "wrong", "unknown"] as const).map((reason) => renderHandoffPage({ state: "invalid", reason }, "")),
      renderKontoPage(
        { state: "passkey", code: "abc", automatonName: "Atlas", dailyLimitUsdc: 5_000_000n, chainId: 84532, spender: "0x" + "1".repeat(40), token: "0x" + "2".repeat(40) },
        "",
      ),
      ...(["cancelled", "unreachable", "refused"] as const).map((reason) => renderKontoPage({ state: "failed", reason }, "")),
      renderLimitPage({ state: "approve", accountName: "Atlas", previousLimitUsdc: 5_000_000n, dailyLimitUsdc: 10_000_000n, choices: [62, 47, 18] }, ""),
      renderLimitPage(
        {
          state: "passkey", code: "abc", accountName: "Atlas", previousLimitUsdc: 5_000_000n, dailyLimitUsdc: 10_000_000n, chainId: 84532,
          spender: "0x" + "1".repeat(40), token: "0x" + "2".repeat(40), account: "0x" + "3".repeat(40), owner: "0x" + "4".repeat(40), organizationId: "org",
        },
        "",
      ),
      renderMoneyPage({ state: "deposit-approve", automatonName: "Atlas", amountUsdc: 20_000_000n, choices: [62, 47, 18] }, ""),
      renderMoneyPage(
        { state: "deposit-card", code: "abc", automatonName: "Atlas", amountUsdc: 20_000_000n, address: "0x" + "3".repeat(40), chainId: 84532, organizationId: "org", owner: "0x" + "4".repeat(40) },
        "",
      ),
      renderMoneyPage({ state: "payout-approve", automatonName: "Atlas", choices: [62, 47, 18] }, ""),
      renderMoneyPage({ state: "payout-verify", code: "abc", automatonName: "Atlas", kycLink: "https://example.com/kyc" }, ""),
      renderMoneyPage({ state: "payout-bank", code: "abc", automatonName: "Atlas" }, ""),
      renderMoneyPage(
        {
          state: "payout-passkey", code: "abc", automatonName: "Atlas", bankLast4: "3000", chainId: 84532, spender: "0x" + "1".repeat(40),
          token: "0x" + "2".repeat(40), account: "0x" + "3".repeat(40), owner: "0x" + "4".repeat(40), organizationId: "org",
        },
        "",
      ),
      renderMoneyPage({ state: "retry", code: "abc", automatonName: "Atlas" }, ""),
    ];
    for (const html of pages) {
      expect(hits(html)).toEqual([]);
      expect(html, "the page names the service in its title").toMatch(/<title>[^<]*\| automatonhost\.com<\/title>/);
      expect(html, "and in the bar").toMatch(/class="brand"[\s\S]{0,400}automatonhost\.com/);
    }
  });

  it("names automatonhost.com and no old brand on either preview card, og-card.html and og-card-x402.html", () => {
    for (const file of ["src/public/og-card.html", "src/public/og-card-x402.html"]) {
      const html = readFileSync(file, "utf8");
      expect(hits(html), file).toEqual([]);
      expect(html, `${file} carries the address in its corner`).toMatch(/<div class="url">automatonhost\.com/);
    }
  });
});
