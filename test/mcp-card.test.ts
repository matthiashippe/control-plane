import { describe, expect, it } from "vitest";
import * as server from "../mcp/server.mjs";
import { createAutomatonTools, createClient, handleMessage } from "../mcp/server.mjs";
import { CARD_PACKAGES, cardCheckoutUrl } from "../src/payments/digistore.js";

/*
 * card_top_up of mcp/server.mjs (goals/karte/02, point 9): three links to the checkout of Digistore24 for one automaton, each
 * with the credit its package gives. Driven through tools/call against a stub fetch that records every request. The tool needs
 * no request at all, so the suite proves none is made. No network, no port.
 */

const BASE = "https://cp.test";
// Invented address in mixed case, assembled at runtime so that no literal here looks like a real wallet.
const ADDRESS = "0x" + "aB3d".repeat(10);

function harness() {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(String(url));
    return new Response("{}", { status: 404 });
  };
  const tools = createAutomatonTools({ baseUrl: BASE, env: {}, fetchImpl, keyFile: "/nonexistent/cp-mcp-card/api-key" });
  const ctx = { client: createClient({ baseUrl: BASE, fetchImpl }), automaton: tools };
  async function call(name: string, args: unknown) {
    const answer = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, ctx);
    const text = (answer.result?.content ?? []).map((c: any) => c.text as string).join("\n");
    return { answer, text, isError: Boolean(answer.result?.isError) };
  }
  return { ctx, calls, call };
}

describe("card_top_up in mcp/server.mjs", () => {
  it("lists card_top_up beside the other tools", async () => {
    const h = harness();
    const listed = (await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, h.ctx)).result.tools;
    const names = listed.map((t: any) => t.name);
    expect(names).toContain("card_top_up");
    for (const old of ["list_open_bounties", "start_automaton", "deposit", "payout", "set_payout_rule"]) expect(names).toContain(old);
    expect(names).toHaveLength(15);
    const tool = listed.find((t: any) => t.name === "card_top_up");
    expect(tool.inputSchema.required).toEqual(["address"]);
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(tool.inputSchema.properties.address.pattern).toBe("^0x[0-9a-fA-F]{40}$");
    expect(tool.description).toMatch(/Digistore24/);
    expect(JSON.stringify(tool)).not.toMatch(/[\u2013\u2014]/);
    expect(JSON.stringify(tool)).not.toMatch(/postyourprice/i);
  });

  it("prints the three card links for an address", async () => {
    const h = harness();
    const r = await h.call("card_top_up", { address: ADDRESS });
    expect(r.isError).toBe(false);
    const links = r.text.match(/https:\/\/www\.checkout-ds24\.com\/product\/\d+\/\?custom=0x[0-9a-f]{40}/g) ?? [];
    expect(links).toEqual(CARD_PACKAGES.map((p) => `https://www.checkout-ds24.com/product/${p.productId}/?custom=${ADDRESS.toLowerCase()}`));
    expect(r.text, "the address travels in lower case only").not.toContain(ADDRESS);
    expect(r.text).toMatch(/opens? the checkout of Digistore24 in (?:your|the) browser/i);
    expect(r.text).not.toMatch(/[\u2013\u2014]/);
    expect(h.calls, "the links are made here, without a request").toEqual([]);
  });

  it("names the credit each package gives", async () => {
    const h = harness();
    const r = await h.call("card_top_up", { address: ADDRESS });
    const lines = r.text.split("\n").filter((l) => l.includes("checkout-ds24"));
    expect(lines).toEqual(
      CARD_PACKAGES.map((p) => `${p.grossEurCents / 100} EUR, about $${p.aboutCreditUsd} credit: ${cardCheckoutUrl(p, ADDRESS)}`),
    );
    // mcp/server.mjs is plain Node and cannot import src/, so it keeps its own copy of the packages. That copy has to be the
    // list of the service, number for number, or the plugin promises a credit the IPN does not book.
    expect((server as any).CARD_PACKAGES).toEqual(
      CARD_PACKAGES.map((p) => ({ productId: p.productId, grossEurCents: p.grossEurCents, aboutCreditUsd: p.aboutCreditUsd })),
    );
    for (const p of CARD_PACKAGES) expect(p.aboutCreditUsd, p.productId).toBeGreaterThan(0);
  });

  it("refuses a malformed address without a link", async () => {
    const h = harness();
    for (const address of ["", "0x123", ADDRESS.slice(0, 41), ADDRESS + "0", "0x" + "g".repeat(40), ADDRESS.slice(2) + "00"]) {
      const r = await h.call("card_top_up", { address });
      expect(r.isError, `accepted ${JSON.stringify(address)}`).toBe(true);
      expect(r.text).not.toMatch(/checkout-ds24|https?:\/\//);
    }
    const missing = await h.call("card_top_up", {});
    expect(missing.isError).toBe(true);
    expect(missing.text).not.toMatch(/checkout-ds24/);
    const extra = await h.call("card_top_up", { address: ADDRESS, product: "771278" });
    expect(extra.isError).toBe(true);
    expect(extra.text).not.toMatch(/checkout-ds24/);
    expect(h.calls).toEqual([]);
  });
});
