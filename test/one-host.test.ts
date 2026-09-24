import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

/**
 * One host for the pages, and both hosts for everything a machine calls.
 *
 * Nine comments on somebody else's tracker carry `cp.hippe.eu` permanently, because they were
 * posted before the move. Those comments are also the only thing that has ever brought Googlebot
 * here: measured 2026-09-23, it arrived seven seconds after one went up, and it has fetched four
 * things in total. Serving the same pages under two names spends that budget twice.
 *
 * The half that must not move is the API. A runtime configured with the old host is a real client,
 * and a cross-host 301 makes curl and most HTTP clients drop the Authorization header, so the call
 * would not fail; it would arrive unauthenticated.
 */
const app = () => createApp({ db: openDb(":memory:") });
const at = (host: string, path: string, method = "GET") =>
  app().request(path, { method, headers: { host, accept: "text/html" } });

afterEach(() => {
  delete process.env.CP_PUBLIC_URL;
});

describe("the pages live at one address", () => {
  it("sends a page on the old host to the new one, permanently", async () => {
    process.env.CP_PUBLIC_URL = "https://postyourprice.com";
    const res = await at("cp.hippe.eu", "/fix");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://postyourprice.com/fix");
  });

  it("keeps the query, or a channel mark is lost on the way", async () => {
    process.env.CP_PUBLIC_URL = "https://postyourprice.com";
    const res = await at("cp.hippe.eu", "/check?src=nit&kind=factual");
    expect(res.headers.get("location")).toBe("https://postyourprice.com/check?src=nit&kind=factual");
  });

  it("leaves the canonical host alone", async () => {
    process.env.CP_PUBLIC_URL = "https://postyourprice.com";
    expect((await at("postyourprice.com", "/fix")).status).toBe(200);
  });

  it("does not touch a host this service is not known by", async () => {
    // Somebody pointing their own name at this address is not ours to redirect.
    process.env.CP_PUBLIC_URL = "https://postyourprice.com";
    expect((await at("example.invalid", "/fix")).status).toBe(200);
  });
});

describe("what a machine calls answers where it was called", () => {
  it("never redirects the API, because a redirect drops the key", async () => {
    process.env.CP_PUBLIC_URL = "https://postyourprice.com";
    // `/pay/` is the one that was forgotten. An x402 client asks the resource URL for its 402;
    // a 301 with an empty body is not a payment offer, and a client is under no obligation to
    // follow it. Fifteen hours of the old host answering 301 there, while nine permanent comments
    // name that host.
    for (const path of [
      "/v1/status",
      "/v1/models",
      "/health",
      "/.well-known/x402",
      "/pay/5/0x1111111111111111111111111111111111111111",
      "/bounties.json",
      "/llms.txt",
      "/receipts.json",
    ]) {
      const res = await at("cp.hippe.eu", path);
      expect(res.status, `${path} must answer where it was asked`).not.toBe(301);
    }
  });

  it("never redirects a POST, which has a body to lose", async () => {
    process.env.CP_PUBLIC_URL = "https://postyourprice.com";
    const res = await app().request("/v1/briefs/check", {
      method: "POST",
      headers: { host: "cp.hippe.eu", "content-type": "application/json" },
      body: JSON.stringify({ brief: "FACT SHEET on a roof, 200 words, deliver the text only." }),
    });
    expect(res.status).not.toBe(301);
  });

  it("answers robots.txt on whichever host asked, as it has to", async () => {
    process.env.CP_PUBLIC_URL = "https://postyourprice.com";
    expect((await at("cp.hippe.eu", "/robots.txt")).status).toBe(200);
  });

  it("does nothing at all while no canonical host is configured", async () => {
    // Every test that does not set CP_PUBLIC_URL, and any deployment that has not moved.
    expect((await at("cp.hippe.eu", "/fix")).status).toBe(200);
  });
});
