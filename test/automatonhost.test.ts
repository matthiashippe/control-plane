import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { buildPaymentRequired, payConfigFromEnv } from "../src/payments/pay.js";
import { stripeProvider } from "../src/payments/stripe.js";
import { siteOrigin } from "../src/public/site.js";
import { closeWorlds } from "./sandbox-world.js";
import { automatonWorld } from "./automaton-world.js";

/**
 * The service answers under three names: automatonhost.com, postyourprice.com and cp.hippe.eu (goals/umzug/01).
 *
 * Pages live on exactly one of them, the one CP_PUBLIC_URL names, and the other two send a page there with a 301.
 * Everything a machine calls answers on every host, because a runtime that carries an old host as conwayApiUrl is a
 * real client and a cross-host redirect drops its Authorization header. The move from postyourprice.com to
 * automatonhost.com is then one line, CP_PUBLIC_URL, and this file shows both sides of that line.
 *
 * The list of hosts is not imported here on purpose: the counter-check runs these cases against the code before the
 * fix, and an import that does not exist there would only show an import error instead of red cases.
 */
const OLD = "https://postyourprice.com";
const NEW = "https://automatonhost.com";
const WALLET = "0x1111111111111111111111111111111111111111";

const app = () => createApp({ db: openDb(":memory:") });
const at = (host: string, path: string, method = "GET") =>
  app().request(path, { method, headers: { host, accept: "text/html" } });

afterEach(() => {
  delete process.env.CP_PUBLIC_URL;
  closeWorlds();
});

describe("a page on a host that is not the canonical one moves there", () => {
  it("sends a page on automatonhost.com to postyourprice.com while that is canonical", async () => {
    process.env.CP_PUBLIC_URL = OLD;
    const res = await at("automatonhost.com", "/fix");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://postyourprice.com/fix");
  });

  it("keeps path and query on the way from automatonhost.com", async () => {
    process.env.CP_PUBLIC_URL = OLD;
    const res = await at("automatonhost.com", "/check?src=nit&kind=factual");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://postyourprice.com/check?src=nit&kind=factual");
  });

  it("sends a page on postyourprice.com to automatonhost.com once that is canonical", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const res = await at("postyourprice.com", "/fix");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://automatonhost.com/fix");
  });

  it("keeps path and query on the way from postyourprice.com", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const res = await at("postyourprice.com", "/check?src=nit&kind=creative");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://automatonhost.com/check?src=nit&kind=creative");
  });

  it("sends a page on cp.hippe.eu to automatonhost.com once that is canonical", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const res = await at("cp.hippe.eu", "/?src=issue");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://automatonhost.com/?src=issue");
  });

  it("redirects a HEAD like a GET, whatever case the host is written in", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const res = await at("PostYourPrice.com", "/post", "HEAD");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://automatonhost.com/post");
  });

  it("leaves the canonical host alone, before and after the move", async () => {
    process.env.CP_PUBLIC_URL = OLD;
    expect((await at("postyourprice.com", "/fix")).status).toBe(200);
    process.env.CP_PUBLIC_URL = NEW;
    expect((await at("automatonhost.com", "/fix")).status).toBe(200);
  });

  it("does not touch a host this service is not known by", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    expect((await at("example.invalid", "/fix")).status).toBe(200);
    expect((await at("www.automatonhost.com.evil.example", "/fix")).status).toBe(200);
  });

  it("redirects no page and says so once when CP_PUBLIC_URL names a host this service is not known by", async () => {
    // A typo in the move: Caddy does not serve this name, and a browser keeps a 301 to it.
    process.env.CP_PUBLIC_URL = "https://automatonhost.de";
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const host of ["automatonhost.com", "postyourprice.com", "cp.hippe.eu", "automatonhost.com"]) {
        const res = await at(host, "/fix");
        expect(res.status, host).toBe(200);
        expect(res.headers.get("location"), host).toBeNull();
      }
      const lines = said.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("is not in SERVICE_HOSTS"));
      expect(lines).toEqual(["[app] canonical host automatonhost.de is not in SERVICE_HOSTS, pages are not redirected"]);
    } finally {
      said.mockRestore();
    }
  });

  it("sends a page on a host written with :443 like the bare host", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const res = await at("postyourprice.com:443", "/fix");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://automatonhost.com/fix");
  });

  it("sends a page on a host written with a dot at the end like the bare host", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const res = await at("cp.hippe.eu.", "/jobs?src=issue");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://automatonhost.com/jobs?src=issue");
  });

  it("leaves the canonical host alone when it is written with a dot at the end and :443", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    expect((await at("automatonhost.com.:443", "/fix")).status).toBe(200);
    expect((await at("automatonhost.com:443", "/fix")).status).toBe(200);
  });

  it("redirects nothing while CP_PUBLIC_URL is unset", async () => {
    for (const host of ["automatonhost.com", "postyourprice.com"]) {
      expect((await at(host, "/fix")).status, host).toBe(200);
    }
  });
});

describe("what a machine calls answers on every host", () => {
  const STAY = [
    "/v1/status",
    "/v1/models",
    "/health",
    "/.well-known/x402",
    `/pay/5/${WALLET}`,
    "/robots.txt",
    "/llms.txt",
  ];

  for (const canonical of [OLD, NEW]) {
    it(`never redirects the API, /pay/, /.well-known/ or /health with CP_PUBLIC_URL=${canonical}`, async () => {
      process.env.CP_PUBLIC_URL = canonical;
      for (const host of ["automatonhost.com", "postyourprice.com", "cp.hippe.eu"]) {
        for (const path of STAY) {
          const res = await at(host, path);
          expect(res.status, `${host}${path}`).not.toBe(301);
          expect(res.status, `${host}${path}`).not.toBe(308);
        }
      }
    });

    it(`never redirects a POST with CP_PUBLIC_URL=${canonical}`, async () => {
      process.env.CP_PUBLIC_URL = canonical;
      for (const host of ["automatonhost.com", "postyourprice.com", "cp.hippe.eu"]) {
        const res = await app().request("/v1/briefs/check", {
          method: "POST",
          headers: { host, "content-type": "application/json" },
          body: JSON.stringify({ brief: "FACT SHEET on a roof, 200 words, deliver the text only." }),
        });
        expect(res.status, host).not.toBe(301);
      }
    });
  }
});

describe("the move is one line: everything that names the service follows CP_PUBLIC_URL", () => {
  it("names automatonhost.com in the canonical link of the start page", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const html = await (await at("automatonhost.com", "/")).text();
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/automatonhost\.com\//);
  });

  it("names automatonhost.com in every curl example and no other host of ours", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    let seen = 0;
    for (const path of ["/", "/post", "/check"]) {
      const html = await (await at("automatonhost.com", path)).text();
      const curls = html.match(/curl[^\n<]*https:\/\/[a-z0-9.-]+/g) ?? [];
      seen += curls.length;
      for (const line of curls) {
        expect(line, `${path}: ${line}`).toContain("https://automatonhost.com");
      }
      expect(html, path).not.toContain("cp.hippe.eu");
    }
    expect(seen, "at least one curl example to check").toBeGreaterThan(0);
  });

  it("sends the buyer back from Stripe to /katalog/danke on automatonhost.com", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const forms: URLSearchParams[] = [];
    const fake = (async (_url: string, init?: RequestInit) => {
      forms.push(new URLSearchParams(String(init?.body ?? "")));
      return new Response(JSON.stringify({ id: "cs_test_move", url: "https://checkout.stripe.com/c/pay/cs_test_move" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const provider = stripeProvider({ secretKey: "sk_test_move", origin: siteOrigin, fetch: fake });
    await provider.begin({ cents: 500 });
    expect(forms[0].get("success_url")).toBe("https://automatonhost.com/katalog/danke?session_id={CHECKOUT_SESSION_ID}");
    expect(forms[0].get("cancel_url")).toBe("https://automatonhost.com/katalog");
  });

  it("names automatonhost.com as the resource of the x402 offer", () => {
    process.env.CP_PUBLIC_URL = NEW;
    const cfg = payConfigFromEnv({ ...process.env, CP_PAY_TO: "0x2222222222222222222222222222222222222222" });
    expect(cfg).not.toBeNull();
    const offer = buildPaymentRequired(cfg!, 5, WALLET);
    expect(offer.accepts[0].resource).toBe(`https://automatonhost.com/pay/5/${WALLET}`);
  });

  it("writes automatonhost.com as conwayApiUrl of a hosted automaton", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const w = await automatonWorld();
    const res = await w.account().call("POST", "/v1/automatons", { name: "mover", genesis_prompt: "Sell one thing a day." });
    expect(res.status).toBe(201);
    const setup = w.setupOf(res.json.sandbox_id)!;
    expect(setup.conwayApiUrl).toBe("https://automatonhost.com");
    expect(setup.socialRelayUrl).toBe("https://automatonhost.com");
  });

  it("lets POST /start take the origin https://automatonhost.com and refuse the old one", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const post = (origin: string) =>
      app().request("/start", {
        method: "POST",
        headers: { host: "automatonhost.com", origin, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ brief: "FACT SHEET on a roof, 200 words.", kind: "factual" }).toString(),
      });
    expect((await post("https://automatonhost.com")).status).not.toBe(403);
    expect((await post("https://postyourprice.com")).status).toBe(403);
  });
});
