import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { approve, FIXTURE, HEADER, patches, sandbox, sha12, values, writes } from "./relink-sandbox";

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
  it("the dry run changes nothing and prints sha12 for every comment it would change", () => {
    const s = sandbox();
    const before = JSON.stringify(s.state());
    const r = s.run([]);
    expect(r.status).toBe(0);
    expect(writes(r.calls)).toEqual([]);
    expect(JSON.stringify(s.state())).toBe(before);
    expect(r.log).toBe(HEADER);
    const v = values(r.out);
    expect(v.size).toBe(29);
    for (const c of WITH_LINK) expect(v.get(String(c.id))).toBe(sha12(s.relink(c.body, pageOf(c.issue))));
    expect(r.out).toContain("relink: 29 to change, 1 unchanged, 30 comments of matthiashippe\n");
    expect(r.out).toContain(`send: ops/relink-comments.py --send 29 --approved ${approve(v)}\n`);
    expect(r.out).toContain("  - https://cp.hippe.eu/fix\n  + https://automatonhost.com/fix\n");
  }, T);

  it("keeps every character outside the old links", () => {
    const s = sandbox();
    const body =
      "Grüße, 500 → 401 (\"nonce\").\r\nDisclosure: I run Handsel (https://postyourprice.com), PostYourPrice <https://cp.hippe.eu/fix>, " +
      "[docs](https://postyourprice.com/fix#steps) and [home](https://www.postyourprice.com/); see api.postyourprice.com, " +
      "x@cp.hippe.eu, postyourprice.community and https://github.com/matthiashippe/control-plane. Ends at https://cp.hippe.eu/.\n\n  trailing spaces  \n";
    const want =
      "Grüße, 500 → 401 (\"nonce\").\r\nDisclosure: I run Handsel (https://automatonhost.com/errors/invalid-or-expired-nonce), PostYourPrice <https://automatonhost.com/fix>, " +
      "[docs](https://automatonhost.com/fix#steps) and [home](https://automatonhost.com/errors/invalid-or-expired-nonce); see api.postyourprice.com, " +
      "x@cp.hippe.eu, postyourprice.community and https://github.com/matthiashippe/control-plane. Ends at https://automatonhost.com/errors/invalid-or-expired-nonce.\n\n  trailing spaces  \n";
    expect(s.relink(body, NONCE)).toBe(want);
    expect(s.relink("See HTTPS://CP.HIPPE.EU/fix; and https://www.postyourprice.com!", CREDITS)).toBe(
      "See https://automatonhost.com/fix; and https://automatonhost.com/errors/credits-never-granted!",
    );
    // What goes out is that text: the PATCH carries exactly the relinked body.
    const t = sandbox([{ id: 1, issue: 440, user: "matthiashippe", body }]);
    const v = values(t.run([]).out);
    expect(v.get("1")).toBe(sha12(want));
    const sent = t.run(["--send", "1", "--approved", approve(v)]);
    expect(sent.status).toBe(0);
    expect(patches(sent.calls).map((c) => JSON.parse(c.stdin ?? "{}").body)).toEqual([want]);
  }, T);

  it("points a link in code at the same path on automatonhost.com", () => {
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
    expect(s.relink(body, DB)).toBe(want);
    expect(s.relink(body, null)).toBe(want.replace("/errors/verify-500-database-error", ""));
  }, T);

  it("maps the titles of 2026-11-22 to their pages", () => {
    const s = sandbox();
    expect(FIXTURE.issues.length).toBe(30);
    const r = s.run([]);
    expect(r.status).toBe(0);
    const pages = Object.fromEntries([...r.out.matchAll(/^comment \d+ issue (\d+) page (\S+) sha12 /gm)].map((m) => [Number(m[1]), m[2]]));
    expect(pages).toEqual(TABLE);
    expect(Object.keys(TABLE).length).toBe(29);
  }, T);

  it("leaves comments without an old link alone", () => {
    const s = sandbox();
    const plain = OWN.find((c) => c.issue === 373)!;
    const r = s.run([]);
    expect(r.out).not.toContain(`comment ${plain.id} `);
    expect(r.out).toContain(", 1 unchanged, ");
    expect(s.relink(plain.body, null)).toBe(plain.body);
    const again = s.run(["--send", "1", "--approved", `${plain.id}:${sha12(plain.body)}`]);
    expect(again.status).toBe(0);
    expect(again.out).toContain(`ALREADY ${plain.id}`);
    expect(patches(again.calls)).toEqual([]);
  }, T);

  it("never touches a comment of another account", () => {
    const s = sandbox();
    const other = FIXTURE.comments.find((c) => c.user !== "matthiashippe")!;
    expect(other.body).toContain("https://postyourprice.com");
    const dry = s.run([]);
    expect(dry.out).not.toContain(`comment ${other.id} `);
    const value = sha12(s.relink(other.body, DB));
    const r = s.run(["--send", "1", "--approved", `${other.id}:${value}`]);
    expect(r.out).toContain(`REFUSED: ${other.id} is not a comment of matthiashippe`);
    expect(r.status).toBe(1);
    expect(writes(r.calls)).toEqual([]);
    expect(s.state().comments.find((c) => c.id === other.id)!.body).toBe(other.body);
  }, T);

  it("refuses --send without --approved", () => {
    const s = sandbox();
    const r = s.run(["--send", "29"]);
    expect(r.out).toContain("REFUSED: --send needs --approved");
    expect(r.status).toBe(1);
    expect(r.calls).toEqual([]);
    const alone = s.run(["--approved", "9000:0123456789ab"]);
    expect(alone.out).toContain("REFUSED: --approved goes with --send");
    expect(alone.status).toBe(1);
    expect(alone.calls).toEqual([]);
  }, T);

  it("refuses when the count does not match the approved values", () => {
    const s = sandbox();
    const v = values(s.run([]).out);
    const two = approve(v, [...v.keys()].slice(0, 2));
    for (const k of ["1", "3"]) {
      const r = s.run(["--send", k, "--approved", two]);
      expect(r.out).toContain(`REFUSED: --send ${k} but 2 approved values`);
      expect(r.status).toBe(1);
      expect(r.calls).toEqual([]);
    }
    for (const bad of ["9000:abc", "9000:0123456789AB", `${two},${two.split(",")[0]}`]) {
      const r = s.run(["--send", "3", "--approved", bad]);
      expect(r.status).toBe(1);
      expect(r.calls).toEqual([]);
    }
  }, T);

  it("refuses when a comment changed since it was approved", () => {
    const s = sandbox();
    const v = values(s.run([]).out);
    const [a, b] = WITH_LINK;
    const ok = approve(v, [String(a.id), String(b.id)]);
    s.setBody(b.id, b.body.replace("Invented reply", "Invented answer"));
    const r = s.run(["--send", "2", "--approved", ok]);
    expect(r.out).toContain(`REFUSED: ${b.id} changed since it was approved`);
    expect(r.status).toBe(1);
    expect(writes(r.calls)).toEqual([]);
    expect(r.log).toBe(HEADER);
    // Counter-proof: back on the text the value was computed over, the same values go through.
    s.setBody(b.id, b.body);
    const same = s.run(["--send", "2", "--approved", ok]);
    expect(same.status).toBe(0);
    expect(patches(same.calls).length).toBe(2);
  }, T);

  it("skips a comment that already carries the approved text", () => {
    const s = sandbox();
    const v = values(s.run([]).out);
    const ids = WITH_LINK.slice(0, 3).map((c) => String(c.id));
    const first = s.run(["--send", "3", "--approved", approve(v, ids)]);
    expect(first.status).toBe(0);
    expect(patches(first.calls).length).toBe(3);
    const again = s.run(["--send", "3", "--approved", approve(v, ids)]);
    expect(again.status).toBe(0);
    for (const id of ids) expect(again.out).toContain(`ALREADY ${id}\n`);
    expect(patches(again.calls)).toEqual([]);
    expect(again.log).toBe(first.log);
  }, T);

  it("patches only the approved comments and reads each one back", () => {
    const s = sandbox();
    const v = values(s.run([]).out);
    const [a, b] = [WITH_LINK[4], WITH_LINK[7]];
    const r = s.run(["--send", "2", "--approved", approve(v, [String(a.id), String(b.id)])]);
    expect(r.status).toBe(0);
    const p = patches(r.calls);
    expect(p.map((c) => c.args.find((x) => x.includes("/issues/comments/")))).toEqual([
      `repos/Conway-Research/automaton/issues/comments/${a.id}`,
      `repos/Conway-Research/automaton/issues/comments/${b.id}`,
    ]);
    for (const [k, c] of [a, b].entries()) {
      const want = s.relink(c.body, pageOf(c.issue));
      expect(JSON.parse(p[k].stdin ?? "{}").body).toBe(want);
      // The read back by id comes after its own PATCH.
      const at = r.calls.indexOf(p[k]);
      expect(r.calls.slice(at + 1).some((x) => !x.args.includes("PATCH") && x.args[1] === `repos/Conway-Research/automaton/issues/comments/${c.id}`)).toBe(true);
    }
    expect(r.out).toContain(`edited ${a.id} issue ${a.issue} page ${TABLE[a.issue]}: read back same`);
    const after = s.state().comments;
    for (const c of FIXTURE.comments) {
      const now = after.find((x) => x.id === c.id)!;
      expect(now.body).toBe(c.id === a.id || c.id === b.id ? s.relink(c.body, pageOf(c.issue)) : c.body);
    }
  }, T);

  it("stops with DIFFERS when the read back differs", () => {
    const s = sandbox();
    const v = values(s.run([]).out);
    const ids = WITH_LINK.slice(0, 2).map((c) => String(c.id));
    const r = s.run(["--send", "2", "--approved", approve(v, ids)], { FAKE_READBACK: "something else\n" });
    expect(r.out).toMatch(new RegExp(`DIFFERS ${ids[0]}: live 15 characters, sent \\d+, first difference at 0`));
    expect(r.status).toBe(1);
    expect(patches(r.calls).length).toBe(1);
    expect(r.log).toBe(HEADER);
  }, T);

  it("writes one log line per patch without an address or a text", () => {
    const s = sandbox();
    const v = values(s.run([]).out);
    const chosen = WITH_LINK.slice(0, 3);
    const r = s.run(["--send", "3", "--approved", approve(v, chosen.map((c) => String(c.id)))]);
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

  it("verify reports every logged comment as same and no old link left", () => {
    const s = sandbox();
    const empty = s.run(["--verify"]);
    expect(empty.out.trim().split("\n").at(-1)).toBe("relink verify: 0 same, 0 differ, 29 with old links");
    expect(empty.status).toBe(1);
    const v = values(s.run([]).out);
    expect(s.run(["--send", "29", "--approved", approve(v)]).status).toBe(0);
    const r = s.run(["--verify"]);
    expect(r.out.trim().split("\n").at(-1)).toBe("relink verify: 29 same, 0 differ, 0 with old links");
    expect(r.status).toBe(0);
    expect(writes(r.calls)).toEqual([]);
    expect(s.run([]).out).toContain("relink: 0 to change, 30 unchanged, 30 comments of matthiashippe\n");
    // Counter-proof: one comment edited by hand afterwards is a difference.
    const c = WITH_LINK[0];
    s.setBody(c.id, `${s.relink(c.body, pageOf(c.issue))} `);
    const off = s.run(["--verify"]);
    expect(off.out).toContain(`DIFFERS ${c.id}`);
    expect(off.out.trim().split("\n").at(-1)).toBe("relink verify: 28 same, 1 differ, 0 with old links");
    expect(off.status).toBe(1);
  }, T);

  it("never posts a new comment", () => {
    const s = sandbox();
    const v = values(s.run([]).out);
    const all = [
      ...s.run([]).calls,
      ...s.run(["--send", "29", "--approved", approve(v)]).calls,
      ...s.run(["--verify"]).calls,
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

  it("exits 1 on an unknown argument before asking GitHub", () => {
    const s = sandbox();
    for (const args of [["--sned", "3"], ["--send", "1", "--approved", "9000:0123456789ab", "--bogus"], ["--verify", "--send", "1"], ["send"]]) {
      const r = s.run(args);
      expect(r.status).toBe(1);
      expect(r.out).toContain("REFUSED: ");
      expect(r.calls).toEqual([]);
    }
  }, T);

  it("exits 2 when GitHub cannot be read", () => {
    const s = sandbox();
    for (const args of [[], ["--send", "1", "--approved", "9000:0123456789ab"], ["--verify"]]) {
      const r = s.run(args, { FAKE_GH_FAIL: "1" });
      expect(r.out).toContain("GitHub not readable");
      expect(r.status).toBe(2);
      expect(writes(r.calls)).toEqual([]);
    }
  }, T);
});
