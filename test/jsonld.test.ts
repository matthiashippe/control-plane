import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { block, dataset, howToFrom, organization, webPage, webSite } from "../src/public/jsonld.js";
import { sitemapPages } from "./site-pages.js";

// Not a hand-kept list. On 2026-09-22 /check was added and this array did not grow, so the newest
// page was the one page nobody checked for structured data. See test/site-pages.ts.
const PAGES = await sitemapPages(createApp({ db: openDb(":memory:") }));

function app() {
  return createApp({ db: openDb(":memory:") });
}

/** The one block a page carries, parsed. Fails loudly rather than returning something empty. */
async function graphOf(a: ReturnType<typeof createApp>, path: string): Promise<Record<string, unknown>[]> {
  const html = await (await a.request(path)).text();
  const all = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  expect(all.length, `${path} should carry exactly one ld+json block`).toBe(1);
  const parsed = JSON.parse(all[0][1].replace(/\\u003c/g, "<")) as { "@graph": Record<string, unknown>[] };
  return parsed["@graph"];
}

describe("Structured data", () => {
  it("is on every page that a crawler is pointed at, and is valid JSON", async () => {
    const a = app();
    for (const p of PAGES) {
      const graph = await graphOf(a, p);
      expect(graph.length, `${p} has no nodes`).toBeGreaterThan(0);
      expect(graph.map((n) => n["@type"])).toContain("WebPage");
      expect(graph.map((n) => n["@type"])).toContain("Organization");
    }
  });

  it("names each page by its own title and canonical path, not the landing page's", async () => {
    const a = app();
    const post = (await graphOf(a, "/post")).find((n) => n["@type"] === "WebPage") as Record<string, string>;
    expect(post.url).toBe("https://cp.hippe.eu/post");
    expect(post.name).toMatch(/post a job/i);
    const terms = (await graphOf(a, "/terms")).find((n) => n["@type"] === "WebPage") as Record<string, string>;
    expect(terms.url).toBe("https://cp.hippe.eu/terms");
    expect(terms.name).not.toBe(post.name);
  });

  /**
   * The point of reading the steps out of the body: this test fails the day somebody renames a
   * step on the page and nowhere else, which is exactly what a hand-kept second list would hide.
   */
  it("describes the steps that are actually printed on /post, in order", async () => {
    const a = app();
    const html = await (await a.request("/post")).text();
    const onPage = [...html.matchAll(/<b>\s*(\d+)\.\s+([^<]{3,120}?)\s*<\/b>/g)].map((m) => ({
      n: Number(m[1]),
      text: m[2].replace(/\s+/g, " ").trim(),
    }));
    expect(onPage.length).toBeGreaterThanOrEqual(6);
    const howto = (await graphOf(a, "/post")).find((n) => n["@type"] === "HowTo") as
      | { step: { position: number; name: string }[] }
      | undefined;
    expect(howto, "/post should carry a HowTo").toBeDefined();
    expect(howto!.step.map((s) => `${s.position}. ${s.name}`)).toEqual(
      onPage.sort((x, y) => x.n - y.n).map((s) => `${s.n}. ${s.text}`),
    );
  });

  it("offers the two measured pages as datasets with the file behind them", async () => {
    const a = app();
    for (const [path, file] of [
      ["/x402", "https://cp.hippe.eu/bounties.json"],
      ["/receipts", "https://cp.hippe.eu/receipts.json"],
    ]) {
      const ds = (await graphOf(a, path)).find((n) => n["@type"] === "Dataset") as
        | { license: string; distribution: { contentUrl: string }[] }
        | undefined;
      expect(ds, `${path} should carry a Dataset`).toBeDefined();
      expect(ds!.license).toMatch(/creativecommons\.org\/publicdomain\/zero/);
      expect(ds!.distribution.map((d) => d.contentUrl)).toContain(file);
    }
  });

  it("does not claim a HowTo on a page that has no numbered steps", async () => {
    const a = app();
    for (const p of ["/", "/terms", "/receipts"]) {
      expect((await graphOf(a, p)).map((n) => n["@type"])).not.toContain("HowTo");
    }
  });

  it("returns nothing rather than an empty HowTo when the steps are gone", () => {
    expect(howToFrom("<p>no steps here</p>", "x", "y", "/z")).toBeNull();
    expect(howToFrom("<b>1. only one</b>", "x", "y", "/z")).toBeNull();
    expect(howToFrom("<b>1. one</b><b>2. two</b>", "x", "y", "/z")).not.toBeNull();
  });

  /**
   * A brief, a job title or a submission can contain the six characters that end a script block.
   * Without the escape the rest of the head would land in the body and the page would break in a
   * way no schema validator catches, because the block itself still parses.
   */
  it("cannot be ended early by content that contains a closing script tag", () => {
    const html = block(dataset("</script><h1>broken</h1>", "d", "/p", [{ url: "/f.json", format: "application/json" }]));
    expect(html).not.toContain("</script><h1>");
    expect(html.match(/<\/script>/g)!.length).toBe(1);
    const json = JSON.parse(html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "").replace(/\\u003c/g, "<")) as {
      "@graph": { name: string }[];
    };
    expect(json["@graph"][0].name).toBe("</script><h1>broken</h1>");
  });

  it("ties every node to the same operator and site, so a crawler reads one entity", async () => {
    const a = app();
    for (const p of PAGES) {
      const graph = await graphOf(a, p);
      const page = graph.find((n) => n["@type"] === "WebPage") as Record<string, { "@id": string }>;
      expect(page.publisher["@id"]).toBe("https://cp.hippe.eu/#operator");
      expect(page.isPartOf["@id"]).toBe("https://cp.hippe.eu/#website");
      const org = graph.find((n) => n["@type"] === "Organization") as Record<string, unknown>;
      expect(org["@id"]).toBe("https://cp.hippe.eu/#operator");
    }
  });

  it("says what the footer says about who runs this", () => {
    const org = organization() as { address: Record<string, string>; founder: { name: string } };
    expect(org.founder.name).toBe("Matthias Hippe");
    expect(org.address.addressLocality).toBe("Hamburg");
    expect(org.address.postalCode).toBe("20457");
  });

  it("builds a graph, not a bare object, so nodes can be added without nesting", () => {
    const html = block(organization(), webSite(), webPage("t", "d", "/p"));
    const json = JSON.parse(html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")) as Record<string, unknown>;
    expect(json["@context"]).toBe("https://schema.org");
    expect((json["@graph"] as unknown[]).length).toBe(3);
  });
});
