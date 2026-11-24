import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { approve, FIXTURE, HEADER, NAMED_HEADER, patches, sandbox, sha12, values, writes } from "./relink-sandbox";

/**
 * ops/relink-comments.py edits our own comments in Conway-Research/automaton so that their links point at automatonhost.com
 * (goals/reichweite/02). Under Matthias' name only the text the Tech Lead approved by its value may appear, so the tool changes
 * nothing in the dry run, edits with --send only the approved comments of our account, reads every one back, logs it without an
 * address or a text and never creates a comment. Every run happens in the sandbox of test/relink-sandbox.ts: a fake `gh`, no
 * network, no port.
 */
const T = 120_000;
const q = "```";
const NONCE = "invalid-or-expired-nonce";
const DB = "verify-500-database-error";
const CREDITS = "credits-never-granted";

/** Decision 3 with the titles of 2026-11-22: the page of every issue; #373 has no old link and stays. */
const TABLE: Record<number, string> = {
  ...Object.fromEntries([447, 442, 435, 419, 408, 379, 377, 372, 339].map((n) => [n, DB])),
  ...Object.fromEntries([440, 434, 432, 406, 392, 376, 359, 356, 355, 353, 333].map((n) => [n, NONCE])),
  ...Object.fromEntries([427, 393, 293].map((n) => [n, CREDITS])),
  ...Object.fromEntries([443, 430, 390, 385, 335, 294].map((n) => [n, "home"])),
};
const OWN = FIXTURE.comments.filter((c) => c.user === "matthiashippe");
const WITH_LINK = OWN.filter((c) => c.issue !== 373);
const pageOf = (issue: number) => (TABLE[issue] === "home" ? null : TABLE[issue]);
const LOG_LINE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z comment \d+ issue \d+ page (verify-500-database-error|invalid-or-expired-nonce|credits-never-granted|home) old [0-9a-f]{12} new [0-9a-f]{12}$/;

describe("ops/relink-comments.py", () => {
  it("the dry run changes nothing and prints sha12 for every comment it would change", async () => {
    const s = sandbox();
    const before = JSON.stringify(s.state());
    const r = await s.run([]);
    expect(r.status).toBe(0);
    expect(writes(r.calls)).toEqual([]);
    expect(JSON.stringify(s.state())).toBe(before);
    expect(r.log).toBe(HEADER);
    const v = values(r.out);
    expect(v.size).toBe(29);
    for (const c of WITH_LINK) expect(v.get(String(c.id))).toBe(sha12(await s.relink(c.body, pageOf(c.issue))));
    expect(r.out).toContain("relink: 29 to change, 1 unchanged, 30 comments of matthiashippe\n");
    expect(r.out).toContain(`send: ops/relink-comments.py --send 29 --approved ${approve(v)}\n`);
    expect(r.out).toContain("  - https://cp.hippe.eu/fix\n  + https://automatonhost.com/fix\n");
  }, T);

  it("keeps every character outside the old links", async () => {
    const s = sandbox();
    const body =
      "Grüße, 500 → 401 (\"nonce\").\r\nDisclosure: I run Handsel (https://postyourprice.com), PostYourPrice <https://cp.hippe.eu/fix>, " +
      "[docs](https://postyourprice.com/fix#steps) and [home](https://www.postyourprice.com/); see api.postyourprice.com, " +
      "x@cp.hippe.eu, postyourprice.community and https://github.com/matthiashippe/control-plane. Ends at https://cp.hippe.eu/.\n\n  trailing spaces  \n";
    const want =
      "Grüße, 500 → 401 (\"nonce\").\r\nDisclosure: I run Handsel (https://automatonhost.com/errors/invalid-or-expired-nonce), PostYourPrice <https://automatonhost.com/fix>, " +
      "[docs](https://automatonhost.com/fix#steps) and [home](https://automatonhost.com/errors/invalid-or-expired-nonce); see api.postyourprice.com, " +
      "x@cp.hippe.eu, postyourprice.community and https://github.com/matthiashippe/control-plane. Ends at https://automatonhost.com/errors/invalid-or-expired-nonce.\n\n  trailing spaces  \n";
    expect(await s.relink(body, NONCE)).toBe(want);
    expect(await s.relink("See HTTPS://CP.HIPPE.EU/fix; and https://www.postyourprice.com!", CREDITS)).toBe(
      "See https://automatonhost.com/fix; and https://automatonhost.com/errors/credits-never-granted!",
    );
    // What goes out is that text: the PATCH carries exactly the relinked body.
    const t = sandbox([{ id: 1, issue: 440, user: "matthiashippe", body }]);
    const v = values((await t.run([])).out);
    expect(v.get("1")).toBe(sha12(want));
    const sent = await t.run(["--send", "1", "--approved", approve(v)]);
    expect(sent.status).toBe(0);
    expect(patches(sent.calls).map((c) => JSON.parse(c.stdin ?? "{}").body)).toEqual([want]);
  }, T);

  it("points a link in code at the same path on automatonhost.com", async () => {
    const s = sandbox();
    const body = [
      "Put this in `~/.automaton/automaton.json`:",
      "",
      `${q}json`,
      '"conwayApiUrl": "https://postyourprice.com"',
      `${q}`,
      "",
      `  ${q}sh`,
      "curl https://cp.hippe.eu/v1/status",
      `  ${q}`,
      "",
      "Inline `https://postyourprice.com/v1/status` and `https://cp.hippe.eu`, prose https://postyourprice.com.",
      "",
    ].join("\n");
    const want = [
      "Put this in `~/.automaton/automaton.json`:",
      "",
      `${q}json`,
      '"conwayApiUrl": "https://automatonhost.com"',
      `${q}`,
      "",
      `  ${q}sh`,
      "curl https://automatonhost.com/v1/status",
      `  ${q}`,
      "",
      "Inline `https://automatonhost.com/v1/status` and `https://automatonhost.com`, prose https://automatonhost.com/errors/verify-500-database-error.",
      "",
    ].join("\n");
    expect(await s.relink(body, DB)).toBe(want);
    expect(await s.relink(body, null)).toBe(want.replace("/errors/verify-500-database-error", ""));
  }, T);

  it("maps the titles of 2026-11-22 to their pages", async () => {
    const s = sandbox();
    expect(FIXTURE.issues.length).toBe(30);
    const r = await s.run([]);
    expect(r.status).toBe(0);
    const pages = Object.fromEntries([...r.out.matchAll(/^comment \d+ issue (\d+) page (\S+) sha12 /gm)].map((m) => [Number(m[1]), m[2]]));
    expect(pages).toEqual(TABLE);
    expect(Object.keys(TABLE).length).toBe(29);
  }, T);

  it("leaves comments without an old link alone", async () => {
    const s = sandbox();
    const plain = OWN.find((c) => c.issue === 373)!;
    const r = await s.run([]);
    expect(r.out).not.toContain(`comment ${plain.id} `);
    expect(r.out).toContain(", 1 unchanged, ");
    expect(await s.relink(plain.body, null)).toBe(plain.body);
    const again = await s.run(["--send", "1", "--approved", `${plain.id}:${sha12(plain.body)}`]);
    expect(again.status).toBe(0);
    expect(again.out).toContain(`ALREADY ${plain.id}`);
    expect(patches(again.calls)).toEqual([]);
  }, T);

  it("never touches a comment of another account", async () => {
    const s = sandbox();
    const other = FIXTURE.comments.find((c) => c.user !== "matthiashippe")!;
    expect(other.body).toContain("https://postyourprice.com");
    const dry = await s.run([]);
    expect(dry.out).not.toContain(`comment ${other.id} `);
    const value = sha12(await s.relink(other.body, DB));
    const r = await s.run(["--send", "1", "--approved", `${other.id}:${value}`]);
    expect(r.out).toContain(`REFUSED: ${other.id} is not a comment of matthiashippe`);
    expect(r.status).toBe(1);
    expect(writes(r.calls)).toEqual([]);
    expect(s.state().comments.find((c) => c.id === other.id)!.body).toBe(other.body);
  }, T);

  it("refuses --send without --approved", async () => {
    const s = sandbox();
    const r = await s.run(["--send", "29"]);
    expect(r.out).toContain("REFUSED: --send needs --approved");
    expect(r.status).toBe(1);
    expect(r.calls).toEqual([]);
    const alone = await s.run(["--approved", "9000:0123456789ab"]);
    expect(alone.out).toContain("REFUSED: --approved goes with --send");
    expect(alone.status).toBe(1);
    expect(alone.calls).toEqual([]);
  }, T);

  it("refuses when the count does not match the approved values", async () => {
    const s = sandbox();
    const v = values((await s.run([])).out);
    const two = approve(v, [...v.keys()].slice(0, 2));
    for (const k of ["1", "3"]) {
      const r = await s.run(["--send", k, "--approved", two]);
      expect(r.out).toContain(`REFUSED: --send ${k} but 2 approved values`);
      expect(r.status).toBe(1);
      expect(r.calls).toEqual([]);
    }
    for (const bad of ["9000:abc", "9000:0123456789AB", `${two},${two.split(",")[0]}`]) {
      const r = await s.run(["--send", "3", "--approved", bad]);
      expect(r.status).toBe(1);
      expect(r.calls).toEqual([]);
    }
  }, T);

  it("refuses when a comment changed since it was approved", async () => {
    const s = sandbox();
    const v = values((await s.run([])).out);
    const [a, b] = WITH_LINK;
    const ok = approve(v, [String(a.id), String(b.id)]);
    s.setBody(b.id, b.body.replace("Invented reply", "Invented answer"));
    const r = await s.run(["--send", "2", "--approved", ok]);
    expect(r.out).toContain(`REFUSED: ${b.id} changed since it was approved`);
    expect(r.status).toBe(1);
    expect(writes(r.calls)).toEqual([]);
    expect(r.log).toBe(HEADER);
    // Counter-proof: back on the text the value was computed over, the same values go through.
    s.setBody(b.id, b.body);
    const same = await s.run(["--send", "2", "--approved", ok]);
    expect(same.status).toBe(0);
    expect(patches(same.calls).length).toBe(2);
  }, T);

  it("skips a comment that already carries the approved text", async () => {
    const s = sandbox();
    const v = values((await s.run([])).out);
    const ids = WITH_LINK.slice(0, 3).map((c) => String(c.id));
    const first = await s.run(["--send", "3", "--approved", approve(v, ids)]);
    expect(first.status).toBe(0);
    expect(patches(first.calls).length).toBe(3);
    const again = await s.run(["--send", "3", "--approved", approve(v, ids)]);
    expect(again.status).toBe(0);
    for (const id of ids) expect(again.out).toContain(`ALREADY ${id}\n`);
    expect(patches(again.calls)).toEqual([]);
    expect(again.log).toBe(first.log);
  }, T);

  it("patches only the approved comments and reads each one back", async () => {
    const s = sandbox();
    const v = values((await s.run([])).out);
    const [a, b] = [WITH_LINK[4], WITH_LINK[7]];
    const r = await s.run(["--send", "2", "--approved", approve(v, [String(a.id), String(b.id)])]);
    expect(r.status).toBe(0);
    const p = patches(r.calls);
    expect(p.map((c) => c.args.find((x) => x.includes("/issues/comments/")))).toEqual([
      `repos/Conway-Research/automaton/issues/comments/${a.id}`,
      `repos/Conway-Research/automaton/issues/comments/${b.id}`,
    ]);
    for (const [k, c] of [a, b].entries()) {
      const want = await s.relink(c.body, pageOf(c.issue));
      expect(JSON.parse(p[k].stdin ?? "{}").body).toBe(want);
      // The read back by id comes after its own PATCH.
      const at = r.calls.indexOf(p[k]);
      expect(r.calls.slice(at + 1).some((x) => !x.args.includes("PATCH") && x.args[1] === `repos/Conway-Research/automaton/issues/comments/${c.id}`)).toBe(true);
    }
    expect(r.out).toContain(`edited ${a.id} issue ${a.issue} page ${TABLE[a.issue]}: read back same`);
    const after = s.state().comments;
    for (const c of FIXTURE.comments) {
      const now = after.find((x) => x.id === c.id)!;
      expect(now.body).toBe(c.id === a.id || c.id === b.id ? await s.relink(c.body, pageOf(c.issue)) : c.body);
    }
  }, T);

  it("stops with DIFFERS when the read back differs", async () => {
    const s = sandbox();
    const v = values((await s.run([])).out);
    const ids = WITH_LINK.slice(0, 2).map((c) => String(c.id));
    const r = await s.run(["--send", "2", "--approved", approve(v, ids)], { FAKE_READBACK: "something else\n" });
    expect(r.out).toMatch(new RegExp(`DIFFERS ${ids[0]}: live 15 characters, sent \\d+, first difference at 0`));
    expect(r.status).toBe(1);
    expect(patches(r.calls).length).toBe(1);
    expect(r.log).toBe(HEADER);
  }, T);

  it("writes one log line per patch without an address or a text", async () => {
    const s = sandbox();
    const v = values((await s.run([])).out);
    const chosen = WITH_LINK.slice(0, 3);
    const r = await s.run(["--send", "3", "--approved", approve(v, chosen.map((c) => String(c.id)))]);
    expect(r.status).toBe(0);
    expect(r.log.startsWith(HEADER)).toBe(true);
    const lines = r.log.slice(HEADER.length).split("\n").filter(Boolean);
    expect(lines.length).toBe(3);
    for (const [k, c] of chosen.entries()) {
      expect(lines[k]).toMatch(LOG_LINE);
      expect(lines[k]).toContain(` comment ${c.id} issue ${c.issue} page ${TABLE[c.issue]} old ${sha12(c.body)} new ${v.get(String(c.id))}`);
    }
    expect(r.log).not.toMatch(/https?:|postyourprice|automatonhost|hippe|Invented|@/);
    // The log of the repository has the same header and nothing but log lines.
    const repo = readFileSync(join(__dirname, "..", "ops", "relinked-comments.log"), "utf8").split("\n").filter(Boolean);
    expect(repo.every((l) => l.startsWith("#") || LOG_LINE.test(l))).toBe(true);
  }, T);

  it("verify reports every logged comment as same and no old link left", async () => {
    const s = sandbox();
    const empty = await s.run(["--verify"]);
    expect(empty.out.trim().split("\n").at(-1)).toBe("relink verify: 0 same, 0 differ, 29 with old links");
    expect(empty.status).toBe(1);
    const v = values((await s.run([])).out);
    expect((await s.run(["--send", "29", "--approved", approve(v)])).status).toBe(0);
    const r = await s.run(["--verify"]);
    expect(r.out.trim().split("\n").at(-1)).toBe("relink verify: 29 same, 0 differ, 0 with old links");
    expect(r.status).toBe(0);
    expect(writes(r.calls)).toEqual([]);
    expect((await s.run([])).out).toContain("relink: 0 to change, 30 unchanged, 30 comments of matthiashippe\n");
    // Counter-proof: one comment edited by hand afterwards is a difference.
    const c = WITH_LINK[0];
    s.setBody(c.id, `${await s.relink(c.body, pageOf(c.issue))} `);
    const off = await s.run(["--verify"]);
    expect(off.out).toContain(`DIFFERS ${c.id}`);
    expect(off.out.trim().split("\n").at(-1)).toBe("relink verify: 28 same, 1 differ, 0 with old links");
    expect(off.status).toBe(1);
  }, T);

  it("never posts a new comment", async () => {
    const s = sandbox();
    const v = values((await s.run([])).out);
    const all = [
      ...(await s.run([])).calls,
      ...(await s.run(["--send", "29", "--approved", approve(v)])).calls,
      ...(await s.run(["--verify"])).calls,
    ];
    const w = writes(all);
    expect(w.length).toBe(29);
    for (const c of w) {
      expect(c.args.slice(0, 3)).toEqual(["api", "-X", "PATCH"]);
      expect(c.args[3]).toMatch(/^repos\/Conway-Research\/automaton\/issues\/comments\/\d+$/);
    }
    expect(all.some((c) => c.args.some((a) => /POST|DELETE|\/issues\/\d+\/comments$/.test(a) && c.args.includes("-X")))).toBe(false);
    const source = readFileSync(join(__dirname, "..", "ops", "relink-comments.py"), "utf8");
    expect(source).not.toMatch(/"POST"|"DELETE"|"-f", f?"body=|state=closed/);
  }, T);

  it("exits 1 on an unknown argument before asking GitHub", async () => {
    const s = sandbox();
    for (const args of [["--sned", "3"], ["--send", "1", "--approved", "9000:0123456789ab", "--bogus"], ["--verify", "--send", "1"], ["send"]]) {
      const r = await s.run(args);
      expect(r.status).toBe(1);
      expect(r.out).toContain("REFUSED: ");
      expect(r.calls).toEqual([]);
    }
  }, T);

  it("exits 2 when GitHub cannot be read", async () => {
    const s = sandbox();
    for (const args of [[], ["--send", "1", "--approved", "9000:0123456789ab"], ["--verify"]]) {
      const r = await s.run(args, { FAKE_GH_FAIL: "1" });
      expect(r.out).toContain("GitHub not readable");
      expect(r.status).toBe(2);
      expect(writes(r.calls)).toEqual([]);
    }
  }, T);
});

/**
 * ops/relink-comments.py --name (goals/reichweite/04): every comment of our account opens with the sentence LEAD and says
 * automatonhost.com where it said Handsel or PostYourPrice in prose. The same rules as above hold: the dry run changes nothing,
 * --send edits only the approved comments of our account and reads each one back, and nothing is ever posted. The log of the name
 * is ops/named-comments.log; ops/relinked-comments.log stays as it is.
 */
const LEAD =
  "If you need it running before Conway fixes this: automatonhost.com, which I run, speaks the same API, so the unchanged runtime " +
  "keeps working after one changed line, `conwayApiUrl` (https://automatonhost.com/llms.txt), and you can top it up by card, " +
  "PayPal or Apple Pay with money back through Digistore24.";
const pageOrHome = (issue: number) => (TABLE[issue] && TABLE[issue] !== "home" ? TABLE[issue] : null);
/** The first paragraph: up to the first blank line, a line of spaces or tabs counts as blank, \r\n like \n. */
const firstParagraph = (text: string) => text.split(/\r?\n[ \t]*\r?\n/)[0];
/**
 * What --name makes of a comment of the fixture, computed here: relinked, the old names in prose replaced, and LEAD in front
 * unless the first paragraph already says automatonhost.com (decision 2), which a relinked link to the write-up does.
 */
const namedText = async (s: ReturnType<typeof sandbox>, c: (typeof OWN)[number]) => {
  const relinked = await s.relink(c.body, pageOrHome(c.issue));
  const renamed = relinked.replace(/(?<![\w./-])(Handsel|PostYourPrice)(?![\w-]|\.[A-Za-z0-9])/g, "automatonhost.com");
  return firstParagraph(relinked).includes("automatonhost.com") ? renamed : `${LEAD}\n\n${renamed}`;
};
const lastLine = (out: string) => out.trim().split("\n").at(-1);
/**
 * Four comments of the fixture for the runs that send and verify: Handsel in prose, a link to the write-up in the first
 * paragraph, PostYourPrice next to a block of code, no old link at all; plus the comment of the other account. Every fake `gh`
 * call is a process, and sending all 30 several times per test took minutes under load on the code-host.
 */
const FEW_OWN = [OWN[0], OWN[1], OWN[2], OWN.find((c) => c.issue === 373)!];
const FEW = [...FEW_OWN, FIXTURE.comments.find((c) => c.user !== "matthiashippe")!];
const FEW_LINKED = FEW_OWN.filter((c) => c.issue !== 373);

describe("ops/relink-comments.py --name", () => {
  it("the name dry run changes nothing and puts the lead in front of every comment without the name", async () => {
    const s = sandbox();
    const before = JSON.stringify(s.state());
    const r = await s.run(["--name"]);
    expect(r.status).toBe(0);
    expect(writes(r.calls)).toEqual([]);
    expect(JSON.stringify(s.state())).toBe(before);
    expect(r.log).toBe(HEADER);
    expect(r.named).toBe(NAMED_HEADER);
    const v = values(r.out);
    expect(v.size).toBe(30);
    // Nine comments link to the write-up in their first paragraph, which after the relink says automatonhost.com already.
    const early: number[] = [];
    for (const c of OWN) {
      const want = await namedText(s, c);
      expect(v.get(String(c.id))).toBe(sha12(want));
      if (!want.startsWith(`${LEAD}\n\n`)) early.push(c.id);
    }
    expect(early.length).toBe(9);
    const withLead = [...r.out.matchAll(/^comment (\d+) issue \d+ page \S+ sha12 [0-9a-f]{12}\n(?:  [-+] .*\n)*?  \+ lead\n/gm)].map((m) => Number(m[1]));
    expect(withLead.sort()).toEqual(OWN.map((c) => c.id).filter((id) => !early.includes(id)).sort());
    for (const id of early) expect(v.has(String(id))).toBe(true);
    expect(r.out).toContain("  + lead\n  - Handsel\n  + automatonhost.com\n");
    expect(r.out).toContain("  + lead\n  - PostYourPrice\n  + automatonhost.com\n");
    expect(r.out).toContain("name: 30 to change, 0 already named, 30 comments of matthiashippe\n");
    expect(r.out).toContain(`send: ops/relink-comments.py --name --send 30 --approved ${approve(v)}\n`);
    const other = FIXTURE.comments.find((c) => c.user !== "matthiashippe")!;
    expect(r.out).not.toContain(`comment ${other.id} `);
  }, T);

  it("the name dry run leaves a comment that already names us without a second lead", async () => {
    const early = { id: 1, issue: 440, user: "matthiashippe", body: "Use automatonhost.com, it speaks the API.\n\nI run Handsel (https://automatonhost.com).\n" };
    const done = { id: 2, issue: 447, user: "matthiashippe", body: `${LEAD}\n\nInvented reply, I run automatonhost.com.\n` };
    const leadLater = { id: 3, issue: 434, user: "matthiashippe", body: `${LEAD}\n\nInvented reply, I run PostYourPrice.\n` };
    const crlf = { id: 4, issue: 432, user: "matthiashippe", body: "Invented reply.\r\n\r\nSee automatonhost.com.\r\n" };
    const s = sandbox([early, done, leadLater, crlf]);
    const r = await s.run(["--name"]);
    expect(r.status).toBe(0);
    expect(r.out).toContain("name: 3 to change, 1 already named, 4 comments of matthiashippe\n");
    expect(r.out).not.toContain(`comment ${done.id} `);
    expect(r.out).toMatch(/^comment 1 issue 440 page \S+ sha12 [0-9a-f]{12}\n  - Handsel\n  \+ automatonhost\.com\ncomment /m);
    expect(r.out).toMatch(/^comment 3 issue 434 page \S+ sha12 [0-9a-f]{12}\n  - PostYourPrice\n  \+ automatonhost\.com\n/m);
    expect(r.out).toMatch(/^comment 4 issue 432 page \S+ sha12 [0-9a-f]{12}\n  \+ lead\n/m);
    const sent = await s.run(["--name", "--send", "3", "--approved", approve(values(r.out))]);
    expect(sent.status).toBe(0);
    const after = new Map(s.state().comments.map((c) => [c.id, c.body]));
    expect(after.get(1)).toBe("Use automatonhost.com, it speaks the API.\n\nI run automatonhost.com (https://automatonhost.com).\n");
    expect(after.get(2)).toBe(done.body);
    expect(after.get(3)).toBe(`${LEAD}\n\nInvented reply, I run automatonhost.com.\n`);
    expect(after.get(4)).toBe(`${LEAD}\n\n${crlf.body}`);
    for (const body of after.values()) expect(body.split(LEAD).length).toBeLessThanOrEqual(2);
    expect((await s.run(["--name"])).out).toContain("name: 0 to change, 4 already named, 4 comments of matthiashippe\n");
  }, T);

  it("replaces Handsel and PostYourPrice in prose and keeps them in code", async () => {
    const body = [
      "Handsel answers here. PostYourPrice too, and so does Handsel.",
      "",
      "Not: handsel, HANDSEL, Handselx, xHandsel, Handsel_notice, Handsel-ish, PostYourPrice.org, a/Handsel, postyourprice.",
      "Code: `Handsel` and `PostYourPrice run`.",
      "",
      `${q}sh`,
      "echo Handsel PostYourPrice",
      `${q}`,
      "(Handsel), [PostYourPrice] and Handsel!",
      "",
    ].join("\n");
    const want = [
      "automatonhost.com answers here. automatonhost.com too, and so does automatonhost.com.",
      "",
      "Not: handsel, HANDSEL, Handselx, xHandsel, Handsel_notice, Handsel-ish, PostYourPrice.org, a/Handsel, postyourprice.",
      "Code: `Handsel` and `PostYourPrice run`.",
      "",
      `${q}sh`,
      "echo Handsel PostYourPrice",
      `${q}`,
      "(automatonhost.com), [automatonhost.com] and automatonhost.com!",
      "",
    ].join("\n");
    const s = sandbox([{ id: 1, issue: 440, user: "matthiashippe", body }]);
    expect(await s.name(body)).toBe(`${LEAD}\n\n${want}`);
    expect(await s.name(`${LEAD}\n\n${want}`)).toBe(`${LEAD}\n\n${want}`);
    const dry = await s.run(["--name"]);
    expect(dry.out.match(/^  - (Handsel|PostYourPrice)$/gm)).toEqual([
      "  - Handsel",
      "  - PostYourPrice",
      "  - Handsel",
      "  - Handsel",
      "  - PostYourPrice",
      "  - Handsel",
    ]);
    const sent = await s.run(["--name", "--send", "1", "--approved", approve(values(dry.out))]);
    expect(sent.status).toBe(0);
    expect(patches(sent.calls).map((c) => JSON.parse(c.stdin ?? "{}").body)).toEqual([`${LEAD}\n\n${want}`]);
  }, T);

  it("the name send patches only the approved comments and reads each one back", async () => {
    const s = sandbox();
    const v = values((await s.run(["--name"])).out);
    const [a, b] = [OWN[3], OWN[19]];
    const r = await s.run(["--name", "--send", "2", "--approved", approve(v, [String(a.id), String(b.id)])]);
    expect(r.status).toBe(0);
    const p = patches(r.calls);
    expect(p.map((c) => c.args[3])).toEqual([
      `repos/Conway-Research/automaton/issues/comments/${a.id}`,
      `repos/Conway-Research/automaton/issues/comments/${b.id}`,
    ]);
    for (const [k, c] of [a, b].entries()) {
      expect(JSON.parse(p[k].stdin ?? "{}").body).toBe(await namedText(s, c));
      const at = r.calls.indexOf(p[k]);
      expect(r.calls.slice(at + 1).some((x) => !x.args.includes("PATCH") && x.args[1] === `repos/Conway-Research/automaton/issues/comments/${c.id}`)).toBe(true);
    }
    expect(r.out).toContain(`edited ${a.id} issue ${a.issue} page `);
    expect(r.out).toContain("name send: 2 edited, 0 already\n");
    const after = s.state().comments;
    for (const c of FIXTURE.comments) {
      const now = after.find((x) => x.id === c.id)!;
      expect(now.body).toBe(c.id === a.id || c.id === b.id ? await namedText(s, c) : c.body);
    }
    // The read back differs: stop before the log.
    const t = sandbox(FEW);
    const w = values((await t.run(["--name"])).out);
    const first = FEW_OWN[0].id;
    const off = await t.run(["--name", "--send", "1", "--approved", approve(w, [String(first)])], { FAKE_READBACK: "something else\n" });
    expect(off.out).toContain(`DIFFERS ${first}: live 15 characters`);
    expect(off.status).toBe(1);
    expect(off.named).toBe(NAMED_HEADER);
  }, T);

  it("the name send writes named-comments.log and never relinked-comments.log", async () => {
    const s = sandbox();
    const v = values((await s.run(["--name"])).out);
    const chosen = OWN.slice(0, 3);
    const r = await s.run(["--name", "--send", "3", "--approved", approve(v, chosen.map((c) => String(c.id)))]);
    expect(r.status).toBe(0);
    expect(r.log).toBe(HEADER);
    expect(r.named.startsWith(NAMED_HEADER)).toBe(true);
    const lines = r.named.slice(NAMED_HEADER.length).split("\n").filter(Boolean);
    expect(lines.length).toBe(3);
    for (const [k, c] of chosen.entries()) {
      expect(lines[k]).toMatch(LOG_LINE);
      expect(lines[k]).toContain(` comment ${c.id} issue ${c.issue} page ${TABLE[c.issue]} old ${sha12(c.body)} new ${v.get(String(c.id))}`);
    }
    expect(r.named).not.toMatch(/https?:|postyourprice|automatonhost|hippe|Invented|Handsel|@/i);
    const repo = readFileSync(join(__dirname, "..", "ops", "named-comments.log"), "utf8").split("\n");
    expect(repo.at(-1)).toBe("");
    expect(repo.slice(0, -1).every((l) => l.startsWith("#") || LOG_LINE.test(l))).toBe(true);
  }, T);

  it("the name send refuses when a comment changed since it was approved", async () => {
    const s = sandbox(FEW);
    const v = values((await s.run(["--name"])).out);
    const [a, b] = OWN;
    const ok = approve(v, [String(a.id), String(b.id)]);
    s.setBody(b.id, b.body.replace("Invented reply", "Invented answer"));
    const r = await s.run(["--name", "--send", "2", "--approved", ok]);
    expect(r.out).toContain(`REFUSED: ${b.id} changed since it was approved`);
    expect(r.status).toBe(1);
    expect(writes(r.calls)).toEqual([]);
    expect(r.named).toBe(NAMED_HEADER);
    // A value of the relink mode is not a value of the name: the same comment, approved for the other mode, is refused.
    const relinkValues = values((await sandbox(FEW).run([])).out);
    const wrong = await s.run(["--name", "--send", "1", "--approved", approve(relinkValues, [String(a.id)])]);
    expect(wrong.out).toContain(`REFUSED: ${a.id} changed since it was approved`);
    expect(writes(wrong.calls)).toEqual([]);
    // Counter-proof: back on the text the value was computed over, the same values go through.
    s.setBody(b.id, b.body);
    const same = await s.run(["--name", "--send", "2", "--approved", ok]);
    expect(same.status).toBe(0);
    expect(patches(same.calls).length).toBe(2);
    const again = await s.run(["--name", "--send", "2", "--approved", ok]);
    expect(again.out).toContain(`ALREADY ${a.id}\n`);
    expect(patches(again.calls)).toEqual([]);
  }, T);

  it("name verify reports every named comment as same and none to change", async () => {
    const s = sandbox(FEW);
    const empty = await s.run(["--name", "--verify"]);
    expect(lastLine(empty.out)).toBe("name verify: 0 same, 0 differ, 4 to change");
    expect(empty.status).toBe(1);
    const v = values((await s.run(["--name"])).out);
    expect((await s.run(["--name", "--send", "4", "--approved", approve(v)])).status).toBe(0);
    const r = await s.run(["--name", "--verify"]);
    expect(lastLine(r.out)).toBe("name verify: 4 same, 0 differ, 0 to change");
    expect(r.status).toBe(0);
    expect(writes(r.calls)).toEqual([]);
    expect((await s.run(["--name"])).out).toContain("name: 0 to change, 4 already named, 4 comments of matthiashippe\n");
    // Counter-proof: one comment edited by hand afterwards is a difference.
    const c = OWN[0];
    s.setBody(c.id, `${await namedText(s, c)} `);
    const off = await s.run(["--name", "--verify"]);
    expect(off.out).toContain(`DIFFERS ${c.id}`);
    expect(lastLine(off.out)).toBe("name verify: 3 same, 1 differ, 0 to change");
    expect(off.status).toBe(1);
  }, T);

  it("relink verify compares a named comment with its newest logged value", async () => {
    const s = sandbox(FEW);
    const relinked = values((await s.run([])).out);
    expect((await s.run(["--send", "3", "--approved", approve(relinked)])).status).toBe(0);
    expect(lastLine((await s.run(["--verify"])).out)).toBe("relink verify: 3 same, 0 differ, 0 with old links");
    const v = values((await s.run(["--name"])).out);
    expect(v.size).toBe(4);
    const sent = await s.run(["--name", "--send", "4", "--approved", approve(v)]);
    expect(sent.status).toBe(0);
    expect(sent.log.slice(HEADER.length).split("\n").filter(Boolean).length).toBe(3);
    const r = await s.run(["--verify"]);
    expect(r.out).not.toContain("DIFFERS");
    expect(lastLine(r.out)).toBe("relink verify: 3 same, 0 differ, 0 with old links");
    expect(r.status).toBe(0);
    expect(writes(r.calls)).toEqual([]);
    // Counter-proof: a named comment edited by hand afterwards is still a difference for the relink mode.
    const c = FEW_LINKED[0];
    s.setBody(c.id, `${await namedText(s, c)} `);
    const off = await s.run(["--verify"]);
    expect(off.out).toContain(`DIFFERS ${c.id}: live sha12 `);
    expect(lastLine(off.out)).toBe("relink verify: 2 same, 1 differ, 0 with old links");
    expect(off.status).toBe(1);
  }, T);

  it("the name mode never posts a new comment", async () => {
    const s = sandbox(FEW);
    const v = values((await s.run(["--name"])).out);
    const all = [
      ...(await s.run(["--name"])).calls,
      ...(await s.run(["--name", "--send", "4", "--approved", approve(v)])).calls,
      ...(await s.run(["--name", "--verify"])).calls,
    ];
    const w = writes(all);
    expect(w.length).toBe(4);
    for (const c of w) {
      expect(c.args.slice(0, 3)).toEqual(["api", "-X", "PATCH"]);
      expect(c.args[3]).toMatch(/^repos\/Conway-Research\/automaton\/issues\/comments\/\d+$/);
    }
    expect(w.map((c) => c.args[3].split("/").at(-1)).sort()).toEqual(FEW_OWN.map((c) => String(c.id)).sort());
    expect(all.some((c) => c.args.some((a) => /POST|DELETE|\/issues\/\d+\/comments$/.test(a) && c.args.includes("-X")))).toBe(false);
  }, T);

  it("the name mode exits 1 on an unknown argument and 2 when GitHub cannot be read", async () => {
    const s = sandbox();
    for (const args of [["--name", "--sned", "3"], ["--name", "--name"], ["--name", "--send", "1"], ["--name", "--verify", "--send", "1"], ["--name", "name"]]) {
      const r = await s.run(args);
      expect(r.status).toBe(1);
      expect(r.out).toContain("REFUSED: ");
      expect(r.calls).toEqual([]);
    }
    for (const args of [["--name"], ["--name", "--send", "1", "--approved", "9000:0123456789ab"], ["--name", "--verify"]]) {
      const r = await s.run(args, { FAKE_GH_FAIL: "1" });
      expect(r.out).toContain("GitHub not readable");
      expect(r.status).toBe(2);
      expect(writes(r.calls)).toEqual([]);
      expect(r.named).toBe(NAMED_HEADER);
    }
  }, T);
});
