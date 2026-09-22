import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { EXAMPLES } from "../src/public/checkpage.js";
import { reviewBrief } from "../src/bounties/brief.js";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
const BRIEF = "FACT SHEET on the energy certificate for a 1974 apartment block with six flats and gas heating.";

function app() {
  return createApp({ db: openDb(":memory:") });
}

/**
 * The free check is the one thing here that costs nothing and needs no account, and until now it
 * was reachable only as a curl line. Measured on 2026-09-22 over the whole access log: one address
 * has ever scrolled this site, and nobody has ever followed a link on it.
 */
describe("The free check, for somebody without a terminal", () => {
  it("takes a form post and answers a browser with a page", async () => {
    const res = await app().request("/v1/briefs/check", {
      method: "POST",
      headers: { accept: BROWSER, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ brief: BRIEF, kind: "factual" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toMatch(/your brief does not say|Nothing obvious is missing/);
    expect(html, "the reader has to see what was checked").toContain("1974 apartment block");
  });

  /**
   * The half that must not break. Every runtime and every script reads this answer as JSON, and a
   * page where an object was expected breaks all of them at once for the sake of one reader.
   */
  it("answers byte-identical JSON to everything that did not ask for a page", async () => {
    const a = app();
    for (const headers of [
      { "content-type": "application/json" },
      { accept: "*/*", "content-type": "application/json" },
      { accept: "application/json", "content-type": "application/json" },
      { accept: "application/json, text/html", "content-type": "application/json" },
    ]) {
      const res = await a.request("/v1/briefs/check", {
        method: "POST",
        headers,
        body: JSON.stringify({ brief: BRIEF, kind: "factual" }),
      });
      expect(res.status, JSON.stringify(headers)).toBe(200);
      expect(res.headers.get("content-type"), JSON.stringify(headers)).toMatch(/application\/json/);
      const body = (await res.json()) as { kind: string; words: number; findings: unknown[] };
      expect(body.kind).toBe("factual");
      expect(body.words).toBeGreaterThan(0);
      expect(Array.isArray(body.findings)).toBe(true);
    }
  });

  it("finds the same things whichever shape it was asked in", async () => {
    const a = app();
    const json = (await (
      await a.request("/v1/briefs/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief: BRIEF, kind: "factual" }),
      })
    ).json()) as { findings: { missing: string }[] };
    const html = await (
      await a.request("/v1/briefs/check", {
        method: "POST",
        headers: { accept: BROWSER, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ brief: BRIEF, kind: "factual" }),
      })
    ).text();
    expect(json.findings.length, "a brief with nothing to say about it proves nothing").toBeGreaterThan(0);
    for (const f of json.findings) {
      expect(html, `the JSON says "${f.missing}" and the page does not`).toContain(f.missing);
    }
  });

  it("reads a form post as a form, not as malformed JSON", async () => {
    // Parsing a form body as JSON yields nothing, and the caller would be told to send
    // {"brief": "…"}, which is advice about a shape they never chose.
    const res = await app().request("/v1/briefs/check", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ brief: BRIEF }),
    });
    expect(res.status, "a filled-in form is not an empty request").toBe(200);
    const body = (await res.json()) as { words: number };
    expect(body.words).toBeGreaterThan(0);
  });

  it("asks for the draft, as a page, when a browser sends none", async () => {
    const res = await app().request("/v1/briefs/check", {
      method: "POST",
      headers: { accept: BROWSER, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ brief: "  " }),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(await res.text()).toMatch(/needs a draft|Nothing obvious/i);
  });

  it("keeps the same ceiling on a form as on JSON", async () => {
    const long = "word ".repeat(40_000);
    const res = await app().request("/v1/briefs/check", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ brief: long }),
    });
    expect(res.status, "the keyless endpoint must not run over a megabyte of text").toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("brief_too_long");
  });

  it("escapes what it echoes back, because the brief came from a stranger", async () => {
    const html = await (
      await app().request("/v1/briefs/check", {
        method: "POST",
        headers: { accept: BROWSER, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ brief: 'FACT SHEET <script>alert("x")</script> about a roof' }),
      })
    ).text();
    expect(html, "an unescaped brief is a stored-nothing XSS with extra steps").not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("carries the same skin and structured data as every other page", async () => {
    const html = await (
      await app().request("/v1/briefs/check", {
        method: "POST",
        headers: { accept: BROWSER, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ brief: BRIEF }),
      })
    ).text();
    expect(html).toMatch(/<script type="application\/ld\+json">/);
    expect(html).toContain('href="/terms"');
    expect(html, "the way on has to be on it").toContain('href="/post"');
  });
});

/**
 * The clickable half. POST answers a browser, but a person has to arrive somewhere first, and the
 * only way to send a POST from a page is a form, which deploy/ refuses with form-action 'none'.
 * A GET needs none of that.
 */
describe("The check as a page you can reach by clicking", () => {
  it("shows the two examples and no form while the policy forbids one", async () => {
    const html = await (await app().request("/check")).text();
    expect(html).toMatch(/What your brief does not say/);
    expect(html, "a form that cannot submit is worse than no form").not.toMatch(/<form/);
    for (const e of EXAMPLES) {
      expect(html, `the ${e.label} link is missing`).toContain(encodeURIComponent(e.brief).slice(0, 40));
    }
  });

  it("answers a linked example with the findings for exactly that brief", async () => {
    const a = app();
    const first = EXAMPLES[0];
    const res = await a.request(`/check?kind=${first.kind}&brief=${encodeURIComponent(first.brief)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    for (const f of reviewBrief(first.brief, first.kind)) {
      expect(html, `the check says "${f.missing}" and the page does not`).toContain(f.missing);
    }
  });

  /**
   * The sentence on the intro page counts the findings of both examples. Written down by hand it
   * said four; the check finds three. This holds the page to the function instead of to a memory.
   */
  it("counts the examples instead of asserting a number", async () => {
    const html = await (await app().request("/check")).text();
    const real = EXAMPLES.map((e) => reviewBrief(e.brief, e.kind).length);
    expect(html, "the first example's count is wrong on the page").toContain(`${real[0]} things in the first`);
    if (real[1] === 0) {
      expect(html).toContain("and nothing in the second");
    }
  });

  it("keeps the second example clean, because that is the whole point of showing two", () => {
    expect(reviewBrief(EXAMPLES[1].brief, EXAMPLES[1].kind).length,
      "the good draft has to survive the check, or the pair teaches nothing").toBe(0);
    expect(reviewBrief(EXAMPLES[0].brief, EXAMPLES[0].kind).length,
      "the bad draft has to fail it").toBeGreaterThan(0);
  });

  it("refuses a draft longer than a postable brief, as a page", async () => {
    const res = await app().request(`/check?brief=${encodeURIComponent("word ".repeat(9000))}`);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
  });

  it("is in the sitemap, because it is the one page a stranger can act on", async () => {
    const xml = await (await app().request("/sitemap.xml")).text();
    expect(xml).toContain("https://cp.hippe.eu/check");
  });
});
