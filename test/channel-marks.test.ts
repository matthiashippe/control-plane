import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

// The box is behind the production flag, and the two hidden fields live inside it.
process.env.CP_FORM_ON_CHECK = "1";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const app = () => createApp({ db: openDb(":memory:") });
const get = (path: string) => app().request(path, { headers: { accept: BROWSER } });

/**
 * How the week of 24.09. is counted, and why none of it is stored.
 *
 * The number that week is "a stranger typed their own text". Two things separate that from a click
 * on one of our examples and from a crawler: the form carries `via=form`, and everything that
 * arrives through a channel carries `src`. Both travel in the URL, the access log already records
 * the URI, and deploy/Caddyfile deletes only `brief` from it. So the count is a log query, the
 * draft still never reaches disk, and the sentence on the page stays true word for word.
 */
describe("the marks that let a channel be counted without storing anything", () => {
  it("puts via=form in the box, so a typed draft is not a clicked example", async () => {
    const html = await (await get("/check")).text();
    expect(html).toContain('<input type="hidden" name="via" value="form">');
  });

  it("keeps it on the result page, so the second run counts as typing too", async () => {
    const html = await (await get("/check?brief=FACT+SHEET+on+a+roof")).text();
    expect(html).toContain('<input type="hidden" name="via" value="form">');
  });

  it("marks the two examples apart from each other and from the box", async () => {
    const html = await (await get("/check")).text();
    expect(html).toContain("src=ex1");
    expect(html).toContain("src=ex2");
  });

  it("carries the channel through the form, so a second run still names it", async () => {
    const html = await (await get("/check?src=nit")).text();
    expect(html).toContain('<input type="hidden" name="src" value="nit">');
    expect(html, "and into the example links, or a click loses the channel").toContain("src=nit");
  });

  it("takes nothing but short, boring channel names", async () => {
    const html = await (await get('/check?src=%3Cscript%3Ex%2F..%2Fnit')).text();
    expect(html).not.toContain("<script>x");
    expect(html).toContain('value="scriptxnit"');
  });

  it("does not invent a channel when none was given", async () => {
    const html = await (await get("/check")).text();
    expect(html).not.toContain('name="src"');
  });
});

describe("the short address that fits under a QR code", () => {
  it("sends /b?src=nit to the check with the channel intact", async () => {
    const res = await get("/b?src=nit");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/check?src=nit");
  });

  it("works bare, because somebody will type it without the tail", async () => {
    const res = await get("/b");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/check");
  });

  it("is a 302 and never a 301", async () => {
    // A permanent redirect is cached by the browser and by everything between, and the cards are
    // printed. The day this points elsewhere, a 301 would still send them to the old place.
    expect((await get("/b?src=nit")).status).not.toBe(301);
  });
});

describe("what the page still promises", () => {
  it("says nothing is stored, and that is still true of the draft", async () => {
    const html = await (await get("/check")).text();
    expect(html).toMatch(/Nothing is stored/i);
  });

  it("says it in German too", async () => {
    const html = await (
      await app().request("/check", { headers: { accept: BROWSER, "accept-language": "de-DE,de;q=0.9" } })
    ).text();
    expect(html).toContain("Nichts wird gespeichert");
  });
});
