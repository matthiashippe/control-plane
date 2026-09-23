import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { EXAMPLES, renderCheckIntro } from "../src/public/checkpage.js";
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

/**
 * The link, which is the part that decides whether any of the rest is reachable.
 *
 * Over the whole access log to 2026-09-22 nobody has ever followed a link on this site, and the
 * nav item called "The free check" pointed at an anchor. An anchor leaves no log line, so even a
 * reader who used it was invisible, and it led to a curl block rather than to something they could
 * do.
 */
describe("The way to the free check from the landing page", () => {
  it("offers it as a page and not only as an anchor", async () => {
    const html = await (await app().request("/")).text();
    const nav = html.slice(html.indexOf("<nav>"), html.indexOf("</nav>"));
    expect(nav, "the nav item for the check has to be a real link").toContain('href="/check"');
    expect(nav, "an anchor leaves no log line, so it cannot be measured").not.toContain('href="#how"');
  });

  it("offers a way out of the curl block for somebody without a terminal", async () => {
    const html = await (await app().request("/")).text();
    const panel = html.slice(html.indexOf('id="how"'), html.indexOf("/px/top.png"));
    const after = html.slice(html.indexOf('id="how"'), html.indexOf('id="proof"'));
    expect(panel.length + after.length, "the hero panel is gone").toBeGreaterThan(0);
    expect(after, "the curl block needs a door next to it").toContain('href="/check"');
  });
});

/**
 * What comes after the check, and the one sentence that says it.
 *
 * Two rewrites, and the second undoes the first for a good reason. The page once ended with "the
 * first three need no money", which is true and leaves out that step two on /post wants an
 * Ethereum signature; so the sentence was made to name the key pair, and this test held it there.
 *
 * Since Goal 16 the key pair is no longer what the reader needs. A job funded by the pool is
 * posted with one button and the key comes back on the next page, so naming a signature as the
 * price of posting would now be the misleading half. The requirement flipped with the fact, and
 * what has not changed is the rule underneath: **the sentence has to describe the route the reader
 * can actually take right now.** That is why it is tested in both states of the pool and not in
 * one, because the wallet route is still the only one when the pool cannot pay.
 */
describe("What the check says comes next", () => {
  it("offers the door that needs nothing while the pool can pay for it", async () => {
    const a = app();
    for (const path of ["/check", `/check?brief=${encodeURIComponent("FACT SHEET on a roof")}`]) {
      const html = await (await a.request(path)).text();
      expect(html, `${path} should not promise money is the only cost`).not.toMatch(
        /first three need no money/i,
      );
      expect(html, `${path} must not demand a key pair for a route that needs none`).not.toMatch(
        /needs? a\s+wallet|key pair on your own machine/i,
      );
      expect(html, `${path} should name what posting actually costs`).toMatch(
        /no account, no wallet, no card/i,
      );
    }
  });

  it("names the wallet again once the pool cannot pay, because then it is the only route", async () => {
    const db = openDb(":memory:");
    // Spend the pool the way it is really spent, through the ledger, so the page is reading the
    // same number the server would refuse on.
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(
      "key:" + "a".repeat(40),
      new Date().toISOString(),
    );
    db.prepare(
      "INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?, 'grant', ?, 'drain', ?)",
    ).run("key:" + "a".repeat(40), 500_000, new Date().toISOString());
    const a = createApp({ db });
    const post = await (await a.request("/post")).text();
    expect(post, "step 2 no longer asks for a signature, so this test is measuring the wrong thing")
      .toMatch(/Ethereum signature/i);
    for (const path of ["/check", `/check?brief=${encodeURIComponent("FACT SHEET on a roof")}`]) {
      const html = await (await a.request(path)).text();
      expect(html, `${path} should say what the remaining route wants`).toMatch(/key pair/i);
      expect(html, `${path} must not still offer the free job`).not.toMatch(
        /no account, no wallet, no card/i,
      );
    }
  });

  it("says the same thing on the intro and on a result, not two versions of it", async () => {
    const a = app();
    const intro = await (await a.request("/check")).text();
    const result = await (await a.request(`/check?brief=${encodeURIComponent("FACT SHEET on a roof")}`)).text();
    const sentence = /Posting it needs nothing you do not already have[\s\S]{0,600}?no key needed to\s+read them\./;
    expect(intro.match(sentence), "the intro lost the sentence").toBeTruthy();
    expect(result.match(sentence), "the result page lost the sentence").toBeTruthy();
  });

  it("keeps the claim that the first job is paid from the pool true", async () => {
    // The sentence says the operator's pool pays for the first job. If the pool is dry that is a
    // promise the server refuses in the same second, which is the one kind of untruth this project
    // cannot afford. starterOffer() is the single place allowed to make it.
    const { starterOffer } = await import("../src/credits/starter.js");
    const db = openDb(":memory:");
    expect(starterOffer(db), "the pool is empty in a fresh database, which it should not be").not.toBeNull();
  });
});

describe("the page says where the draft goes", () => {
  /**
   * "Paste a draft" stood in the opening sentence whether or not the form was rendered, and the
   * form is off: deploy/Caddyfile carries form-action 'none', which blocks a submission from this
   * origin to this origin. A reader looked for a box, found none, and had nothing left but the
   * curl line further down.
   *
   * The address bar needs nothing switched on. A browser encodes the spaces itself, and
   * GET /check?brief=... has answered since the page shipped.
   */
  it("does not promise a box when there is no box", () => {
    const html = renderCheckIntro(false, 15);
    expect(html, "no box, so no invitation to paste into one").not.toContain("Paste a draft");
    expect(html, "the way in that works has to be on the page").toContain("/check?brief=");
  });

  it("does promise one when the form is switched on", () => {
    const html = renderCheckIntro(true, 15);
    expect(html).toContain("Paste a draft");
    expect(html).toContain("<textarea");
  });

  it("never shows both the box and the address-bar instruction", () => {
    // Two ways to do the same thing, on the same screen, is a page that cannot decide.
    const withForm = renderCheckIntro(true, 15);
    expect(withForm).not.toContain("in the address bar");
  });
});

/**
 * What the page says is kept, against what is kept.
 *
 * `POST /v1/briefs/check` carries the draft in the request body and Caddy logs no bodies.
 * `GET /check?brief=...` carries it in the address and Caddy logs `request>uri` in full, into a
 * file `deploy/Caddyfile` keeps for 720 hours. Until 2026-09-23 three surfaces said "nothing
 * stored" without distinguishing the two, and the page recommended the address bar to anybody
 * without a terminal. A probe sent that way came back out of the access log three seconds later.
 *
 * `ops/what-the-log-keeps.sh` measures it against the running service, from both ends. These
 * tests hold the wording, which is the half that can drift without anybody deploying anything.
 */
describe("what the check says is kept", () => {
  // Reversed on 2026-09-23, hours after it was written, because the thing it asserted stopped
  // being true: deploy/Caddyfile gained `query { delete brief }` in its log filter, so the address
  // route keeps nothing either. ops/what-the-log-keeps.sh measured it against production, not
  // kept through the address and not kept through the body, and it is what decides. A page that
  // warns about a log which no longer keeps the draft is wrong in the harmless direction, and the
  // tool was written to fail on that direction too.
  it("no longer warns about a log that keeps nothing, whichever route the draft came by", async () => {
    for (const path of ["/check", `/check?brief=${encodeURIComponent(BRIEF)}`]) {
      const html = await (await app().request(path, { headers: { accept: BROWSER } })).text();
      expect(html, `${path} still warns about the access log`).not.toContain("access log");
      expect(html, `${path} still names a retention period`).not.toContain("30 days");
    }
  });

  it("says nothing was stored, because since the log filter nothing is", async () => {
    const res = await app().request("/v1/briefs/check", {
      method: "POST",
      headers: { accept: BROWSER, "content-type": "application/json" },
      body: JSON.stringify({ brief: BRIEF }),
    });
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Nothing was stored");
    expect(html).not.toContain("access log");
  });

  // The claim and the meta description both, because the description is what a search result
  // shows and a reader decides on it before the page has rendered.
  it("never claims nothing is stored on a route that puts the draft in the address", async () => {
    for (const path of ["/check", `/check?brief=${encodeURIComponent(BRIEF)}`]) {
      const html = await (await app().request(path, { headers: { accept: BROWSER } })).text();
      expect(html.toLowerCase(), `${path} still promises that nothing is stored`).not.toContain(
        "nothing stored",
      );
    }
  });

  // The address-bar route still answers, because links people already hold must not break and the
  // two examples are exactly that shape. What it must not do is stand there as the recommended
  // way in with no word about where the draft goes.
  // With the box switched off the page still explains the address route; it just no longer has a
  // cost to name, because the log filter took the cost away.
  it("still explains the address route when there is no box", () => {
    const intro = renderCheckIntro(false, 15);
    expect(intro).toContain("/check?brief=");
    expect(intro).not.toContain("Put your own draft");
  });

  it("offers the box when it is switched on, and submits to the page and not to the API", () => {
    const intro = renderCheckIntro(true, 15);
    expect(intro).toContain('method="GET" action="/check"');
    expect(intro).toContain('name="brief"');
    expect(intro, "and lets a reader say which kind of work it is").toContain('name="kind"');
  });
});

/**
 * The form made the address space infinite, and one line keeps it from costing anything.
 *
 * Since 2026-09-23 /check carries a textarea that submits GET to itself, so every draft anybody
 * ever pastes is its own URL. That is the right shape for a reader, who gets an address to send
 * on, and it is the wrong shape for a search engine unless every one of those URLs says which
 * page it really is.
 *
 * It already did, because page() is called with "/check" for both the intro and the result. This
 * holds it there. Nothing else in the suite would notice if the pathname were passed through from
 * the request instead, and the damage would be silent: a thousand thin pages competing with the
 * one that matters.
 */
describe("the result of a check is the same page as the check", () => {
  const canonicalOf = async (path: string) => {
    const html = await (await app().request(path, { headers: { accept: BROWSER } })).text();
    return (html.match(/<link rel="canonical" href="([^"]*)"/) ?? [])[1];
  };

  it("points a result at /check and not at the draft that produced it", async () => {
    const withDraft = await canonicalOf(`/check?brief=${encodeURIComponent(BRIEF)}&kind=creative`);
    expect(withDraft, "the canonical must not carry the query").not.toContain("brief=");
    expect(withDraft).toMatch(/\/check$/);
  });

  it("gives the empty page the same canonical, so the two do not compete", async () => {
    expect(await canonicalOf("/check")).toBe(await canonicalOf(`/check?brief=${encodeURIComponent(BRIEF)}`));
  });

  it("does the same for a draft too long to check, which is also a page somebody can link", async () => {
    const tooLong = "x".repeat(20_000);
    const html = await (await app().request(`/check?brief=${tooLong}`, { headers: { accept: BROWSER } })).text();
    expect((html.match(/<link rel="canonical" href="([^"]*)"/) ?? [])[1]).toMatch(/\/check$/);
  });
});

/**
 * What happens after the findings, which is where the page used to put the wall.
 *
 * It ended on "posting it is six steps, and they do need a wallet", directly after the one moment
 * a stranger is convinced, and that step is locked until a buyer can pay with a card. The move the
 * findings actually ask for is smaller and needs nothing: fix the brief and check it again. That
 * is also the outcome somebody came for, because a brief that comes back clean is the product.
 */
describe("what the page offers after it has found something", () => {
  const resultHtml = async (brief: string, kind = "factual") =>
    (await (await app().request(`/check?brief=${encodeURIComponent(brief)}&kind=${kind}`, {
      headers: { accept: BROWSER },
    })).text());

  it("hands the draft back in a box, so the next move is the one the findings ask for", async () => {
    process.env.CP_FORM_ON_CHECK = "1";
    const html = await resultHtml(BRIEF);
    expect(html).toContain("Check it again");
    expect(html, "the draft comes back so it can be edited rather than retyped").toContain(
      BRIEF.replace(/&/g, "&amp;"),
    );
    delete process.env.CP_FORM_ON_CHECK;
  });

  it("keeps the kind the reader chose, because re-checking as the other one is a different answer", async () => {
    process.env.CP_FORM_ON_CHECK = "1";
    const html = await resultHtml("Write something lovely about a dog.", "creative");
    expect(html).toMatch(/value="creative" checked|value="creative"\s+checked/);
    delete process.env.CP_FORM_ON_CHECK;
  });

  it("escapes the draft it hands back, because it came from a stranger", async () => {
    process.env.CP_FORM_ON_CHECK = "1";
    const html = await resultHtml('FACT SHEET </textarea><script>alert(1)</script> about a thing.');
    expect(html, "a draft must not be able to close its own box").not.toContain("</textarea><script>");
    expect(html).toContain("&lt;script&gt;");
    delete process.env.CP_FORM_ON_CHECK;
  });

  // Without the policy that allows forms there is no box, and the page must not pretend otherwise.
  it("falls back to showing the draft when the policy refuses forms", async () => {
    const html = await resultHtml(BRIEF);
    expect(html).toContain("What was checked");
    expect(html).not.toContain("Check it again");
  });
});
