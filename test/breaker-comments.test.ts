import { beforeAll, describe, expect, it } from "vitest";
import { writes, sha12 } from "./relink-sandbox";
import {
  API_KEY,
  BREAKER_OFF,
  BREAKER_ON,
  FIXTURE,
  leads,
  PROJECT,
  sandbox,
  TECH_LEAD,
  TITLE_OFF,
  TITLE_ON,
  type Run,
} from "./breaker-comments-sandbox";

/**
 * ops/breaker-comments.sh turns every change of the card breaker into exactly one issue for the Tech Lead with the dry run of the
 * new direction (goals/reichweite/05): on means our comments have to drop the card (`--name --no-card`), off means they get it
 * back (`--name`). The state is stored only after the issue exists, after an open issue with the same title was found, or when
 * the comments already match, so a failed run comes again. Without a change it still compares the comments with the breaker
 * (critique of the Tech Lead, point 7): an issue that was closed without a full send is created again. Every run happens in the sandbox of test/breaker-comments-sandbox.ts:
 * fake ssh, gh and curl, no network, no port, the state in a mktemp folder.
 */
const T = 120_000;
let LEAD = "";
let LEAD_NO_CARD = "";

beforeAll(async () => {
  ({ LEAD, LEAD_NO_CARD } = await leads());
});

const OURS = FIXTURE.comments;
const commentLine = (id: number, value: string) => new RegExp(`^comment ${id} issue \\d+ page \\S+ sha12 ${value}$`, "m");
const getsAndPosts = (r: Run) =>
  r.curl.map((c) => {
    const x = c.args.indexOf("-X");
    return x >= 0 ? c.args[x + 1] : "GET";
  });

describe("ops/breaker-comments.sh", () => {
  it("a change from off to on creates one issue with the no-card dry run", async () => {
    const s = sandbox(LEAD, { stored: "off" });
    const r = await s.run([], { FAKE_BREAKER: BREAKER_ON });
    expect(r.status).toBe(0);
    expect(r.last).toBe("breaker on, last off, issue PRO-100");
    expect(r.posts).toHaveLength(1);
    const issue = r.posts[0];
    expect(issue.title).toBe(TITLE_ON);
    expect(issue.status).toBe("todo");
    expect(issue.projectId).toBe(PROJECT);
    expect(issue.assigneeAgentId).toBe(TECH_LEAD);
    const d = issue.description ?? "";
    expect(d).toContain(`\`${BREAKER_ON}\``);
    expect(d).toContain("`python3 -I ops/relink-comments.py --name --no-card`");
    // Every comment of ours with the value of its text without the card, computed here and not by the tool.
    for (const c of OURS) expect(d).toMatch(commentLine(c.id, sha12(`${LEAD_NO_CARD}\n\n${c.text}`)));
    expect(d).toMatch(/^no-card: 3 to change, 0 unchanged, 3 comments of matthiashippe$/m);
    expect(d).toContain("`ok name`");
    expect(d).toContain("python3 -I ops/relink-comments.py --name --no-card --send <n> --approved <id>:<sha12>,...");
    expect(d).toContain("python3 -I ops/relink-comments.py --name --no-card --verify");
    expect(d).toContain("`bash ops/card-breaker.sh`");
    expect(r.state).toBe("on\n");
    // The breaker is asked read-only over ssh, the way ops/card-breaker.sh does it.
    expect(r.ssh).toHaveLength(1);
    expect(r.ssh[0].args.join(" ")).toContain("bash -s -- --container");
    // The next run with the same breaker finds the stored state and the open issue, and creates no second one.
    const again = await s.run([], { FAKE_BREAKER: BREAKER_ON });
    expect(again.last).toBe("breaker on, last on, issue PRO-100 already open");
    expect(again.posts).toEqual([]);
  }, T);

  it("a change from on to off creates one issue with the name dry run", async () => {
    const s = sandbox(LEAD_NO_CARD, { stored: "on" });
    const r = await s.run([], { FAKE_BREAKER: BREAKER_OFF });
    expect(r.status).toBe(0);
    expect(r.last).toBe("breaker off, last on, issue PRO-100");
    expect(r.posts).toHaveLength(1);
    const d = r.posts[0].description ?? "";
    expect(r.posts[0].title).toBe(TITLE_OFF);
    expect(r.posts[0].assigneeAgentId).toBe(TECH_LEAD);
    expect(d).toContain(`\`${BREAKER_OFF}\``);
    expect(d).toContain("`python3 -I ops/relink-comments.py --name`");
    expect(d).not.toContain("--no-card");
    for (const c of OURS) expect(d).toMatch(commentLine(c.id, sha12(`${LEAD}\n\n${c.text}`)));
    expect(d).toMatch(/^name: 3 to change, /m);
    expect(d).toContain("python3 -I ops/relink-comments.py --name --send <n> --approved <id>:<sha12>,...");
    expect(r.state).toBe("off\n");
  }, T);

  it("the same state creates no issue", async () => {
    for (const [stored, breaker, lead] of [
      ["on", BREAKER_ON, LEAD_NO_CARD],
      ["off", BREAKER_OFF, LEAD],
    ] as const) {
      // The comments match the breaker: the dry run of its direction finds nothing to change.
      const s = sandbox(lead, { stored });
      const r = await s.run([], { FAKE_BREAKER: breaker });
      expect(r.status).toBe(0);
      expect(r.last).toBe(`breaker ${stored}, last ${stored}, no change`);
      expect(r.posts).toEqual([]);
      expect(getsAndPosts(r).every((m) => m === "GET")).toBe(true);
      expect(r.state).toBe(`${stored}\n`);
    }
  }, T);

  it("a missing state file counts as off", async () => {
    const off = sandbox(LEAD);
    const r = await off.run([], { FAKE_BREAKER: BREAKER_OFF });
    expect(r.status).toBe(0);
    expect(r.last).toBe("breaker off, last none, no change");
    expect(r.posts).toEqual([]);
    expect(r.state).toBeNull();
    // A file with anything else than on or off is not a state either.
    const garbled = sandbox(LEAD, { stored: "maybe" });
    expect((await garbled.run([], { FAKE_BREAKER: BREAKER_OFF })).last).toBe("breaker off, last none, no change");
    const on = sandbox(LEAD);
    const r2 = await on.run([], { FAKE_BREAKER: BREAKER_ON });
    expect(r2.last).toBe("breaker on, last none, issue PRO-100");
    expect(r2.posts.map((i) => i.title)).toEqual([TITLE_ON]);
    expect(r2.state).toBe("on\n");
  }, T);

  it("a failed POST keeps the old state and the next run creates the issue", async () => {
    const s = sandbox(LEAD, { stored: "off" });
    const r = await s.run([], { FAKE_BREAKER: BREAKER_ON, FAKE_POST_FAIL: "1" });
    expect(r.status).toBe(2);
    expect(r.last).toBe("breaker on, last off, paperclip unreadable");
    expect(getsAndPosts(r)).toContain("POST");
    expect(r.posts).toEqual([]);
    expect(r.state).toBe("off\n");
    const next = await s.run([], { FAKE_BREAKER: BREAKER_ON });
    expect(next.status).toBe(0);
    expect(next.last).toBe("breaker on, last off, issue PRO-100");
    expect(next.posts).toHaveLength(1);
    expect(next.state).toBe("on\n");
  }, T);

  it("an open issue with the same title gets no second one", async () => {
    for (const status of ["todo", "in_progress", "in_review", "blocked"]) {
      const s = sandbox(LEAD, {
        stored: "off",
        issues: [{ title: TITLE_ON, status, projectId: PROJECT, identifier: "PRO-7" }],
      });
      const r = await s.run([], { FAKE_BREAKER: BREAKER_ON });
      expect(r.status).toBe(0);
      expect(r.last).toBe("breaker on, last off, issue PRO-7 already open");
      expect(getsAndPosts(r)).not.toContain("POST");
      expect(r.posts).toEqual([]);
      expect(r.state).toBe("on\n");
    }
    // A finished one, one in another project or one with the other title does not count.
    const s = sandbox(LEAD, {
      stored: "off",
      issues: [
        { title: TITLE_ON, status: "done", projectId: PROJECT, identifier: "PRO-8" },
        { title: TITLE_ON, status: "todo", projectId: "project-other", identifier: "PRO-9" },
        { title: TITLE_OFF, status: "todo", projectId: PROJECT, identifier: "PRO-10" },
      ],
    });
    const r = await s.run([], { FAKE_BREAKER: BREAKER_ON });
    expect(r.last).toBe("breaker on, last off, issue PRO-103");
    expect(r.posts.map((i) => i.title)).toEqual([TITLE_ON]);
  }, T);

  it("comments that already match create no issue and store the state", async () => {
    const on = sandbox(LEAD_NO_CARD, { stored: "off" });
    const r = await on.run([], { FAKE_BREAKER: BREAKER_ON });
    expect(r.status).toBe(0);
    expect(r.last).toBe("breaker on, last off, comments already match");
    expect(r.posts).toEqual([]);
    expect(r.curl).toEqual([]);
    expect(r.state).toBe("on\n");
    const off = sandbox(LEAD, { stored: "on" });
    const r2 = await off.run([], { FAKE_BREAKER: BREAKER_OFF });
    expect(r2.last).toBe("breaker off, last on, comments already match");
    expect(r2.posts).toEqual([]);
    expect(r2.state).toBe("off\n");
  }, T);

  it("an unreadable breaker or dry run creates no issue and keeps the state", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ FAKE_SSH_FAIL: "1" }, "breaker unreadable"],
      [{ FAKE_BREAKER: "card_breaker unreadable" }, "breaker unreadable"],
      [{ FAKE_BREAKER: "breaker on" }, "breaker unreadable"],
      [{ FAKE_BREAKER: BREAKER_ON, FAKE_GH_FAIL: "1" }, "breaker on, last off, dry run unreadable"],
    ];
    for (const [env, last] of cases) {
      const s = sandbox(LEAD, { stored: "off" });
      const r = await s.run([], env);
      expect(r.status, JSON.stringify(env)).toBe(2);
      expect(r.last).toBe(last);
      expect(r.posts).toEqual([]);
      expect(r.curl).toEqual([]);
      expect(r.state).toBe("off\n");
    }
    // Paperclip not readable: no issue, the state stays, and the next run tries again.
    const s = sandbox(LEAD, { stored: "off" });
    const r = await s.run([], { FAKE_BREAKER: BREAKER_ON, FAKE_API_KEY: "another-key" });
    expect(r.status).toBe(2);
    expect(r.last).toBe("breaker on, last off, paperclip unreadable");
    expect(r.posts).toEqual([]);
    expect(r.state).toBe("off\n");
    // A list of exactly 500 open issues may be cut by Paperclip, so the open issue may be missing: unreadable, not a second issue.
    const full = sandbox(LEAD, {
      stored: "on",
      issues: Array.from({ length: 500 }, (_, n) => ({ title: `other ${n}`, status: "todo", projectId: PROJECT, identifier: `PRO-${n + 1}` })),
    });
    const r2 = await full.run([], { FAKE_BREAKER: BREAKER_ON });
    expect(r2.status).toBe(2);
    expect(r2.last).toBe("breaker on, last on, paperclip unreadable");
    expect(r2.posts).toEqual([]);
    expect(r2.state).toBe("on\n");
  }, T);

  it("the same state with comments that do not match and no open issue creates the issue", async () => {
    for (const [stored, breaker, lead, title, dry] of [
      ["on", BREAKER_ON, LEAD, TITLE_ON, "`python3 -I ops/relink-comments.py --name --no-card`"],
      ["off", BREAKER_OFF, LEAD_NO_CARD, TITLE_OFF, "`python3 -I ops/relink-comments.py --name`"],
    ] as const) {
      // A finished or cancelled issue of the direction and an open one of the other direction do not hold it back.
      const other = stored === "on" ? TITLE_OFF : TITLE_ON;
      const s = sandbox(lead, {
        stored,
        issues: [
          { title, status: "done", projectId: PROJECT, identifier: "PRO-1" },
          { title, status: "cancelled", projectId: PROJECT, identifier: "PRO-2" },
          { title: other, status: "todo", projectId: PROJECT, identifier: "PRO-3" },
        ],
      });
      const preview = await s.run(["--dry-run"], { FAKE_BREAKER: breaker });
      expect(preview.status).toBe(0);
      expect(preview.last).toBe(`breaker ${stored}, last ${stored}, would create issue`);
      expect(preview.posts).toEqual([]);
      const r = await s.run([], { FAKE_BREAKER: breaker });
      expect(r.status).toBe(0);
      expect(r.last).toBe(`breaker ${stored}, last ${stored}, issue PRO-103`);
      expect(r.posts).toHaveLength(1);
      expect(r.posts[0].title).toBe(title);
      expect(r.posts[0].assigneeAgentId).toBe(TECH_LEAD);
      expect(r.posts[0].description).toContain(dry);
      expect(r.posts[0].description).toContain(`\`${breaker}\``);
      expect(r.state).toBe(`${stored}\n`);
    }
    // The case of the critique: the issue of a change is closed without a full send, the next run asks again.
    const s = sandbox(LEAD, { stored: "off" });
    expect((await s.run([], { FAKE_BREAKER: BREAKER_ON })).last).toBe("breaker on, last off, issue PRO-100");
    s.setIssueStatus("PRO-100", "done");
    const again = await s.run([], { FAKE_BREAKER: BREAKER_ON });
    expect(again.last).toBe("breaker on, last on, issue PRO-101");
    expect(again.posts.map((i) => i.title)).toEqual([TITLE_ON]);
    // Once the approved texts are sent, the same breaker leaves it at that.
    s.setIssueStatus("PRO-101", "done");
    s.setLead(LEAD_NO_CARD);
    const sent = await s.run([], { FAKE_BREAKER: BREAKER_ON });
    expect(sent.last).toBe("breaker on, last on, no change");
    expect(sent.posts).toEqual([]);
  }, T);

  it("the same state with an open issue of its direction runs no dry run", async () => {
    for (const status of ["todo", "in_progress", "in_review", "blocked"]) {
      const s = sandbox(LEAD, { stored: "on", issues: [{ title: TITLE_ON, status, projectId: PROJECT, identifier: "PRO-7" }] });
      for (const args of [[], ["--dry-run"]]) {
        const r = await s.run(args, { FAKE_BREAKER: BREAKER_ON });
        expect(r.status).toBe(0);
        expect(r.last).toBe("breaker on, last on, issue PRO-7 already open");
        expect(r.gh).toEqual([]);
        expect(getsAndPosts(r).every((m) => m === "GET")).toBe(true);
        expect(r.posts).toEqual([]);
        expect(r.state).toBe("on\n");
      }
    }
  }, T);

  it("the dry-run flag creates no issue and writes no state", async () => {
    const change = sandbox(LEAD, { stored: "off" });
    const r = await change.run(["--dry-run"], { FAKE_BREAKER: BREAKER_ON });
    expect(r.status).toBe(0);
    expect(r.last).toBe("breaker on, last off, would create issue");
    expect(getsAndPosts(r).every((m) => m === "GET")).toBe(true);
    expect(r.posts).toEqual([]);
    expect(r.state).toBe("off\n");
    // Without a change it still reads Paperclip, because the routine needs that way to work.
    const none = sandbox(LEAD);
    const r2 = await none.run(["--dry-run"], { FAKE_BREAKER: BREAKER_OFF });
    expect(r2.last).toBe("breaker off, last none, no change");
    expect(r2.curl.length).toBeGreaterThan(0);
    expect(getsAndPosts(r2).every((m) => m === "GET")).toBe(true);
    expect(r2.state).toBeNull();
    const match = sandbox(LEAD_NO_CARD);
    const r3 = await match.run(["--dry-run"], { FAKE_BREAKER: BREAKER_ON });
    expect(r3.last).toBe("breaker on, last none, comments already match");
    expect(r3.state).toBeNull();
    const open = sandbox(LEAD, { issues: [{ title: TITLE_ON, status: "todo", projectId: PROJECT, identifier: "PRO-7" }] });
    const r4 = await open.run(["--dry-run"], { FAKE_BREAKER: BREAKER_ON });
    expect(r4.last).toBe("breaker on, last none, issue PRO-7 already open");
    expect(r4.state).toBeNull();
    // Paperclip not readable fails the dry run as well.
    const broken = sandbox(LEAD);
    const r5 = await broken.run(["--dry-run"], { FAKE_BREAKER: BREAKER_OFF, FAKE_API_KEY: "another-key" });
    expect(r5.status).toBe(2);
    expect(r5.last).toBe("breaker off, last none, paperclip unreadable");
  }, T);

  it("never patches or posts on GitHub and never prints the api key", async () => {
    const runs: Run[] = [];
    const a = sandbox(LEAD, { stored: "off" });
    runs.push(await a.run([], { FAKE_BREAKER: BREAKER_ON, FAKE_POST_FAIL: "1" }));
    runs.push(await a.run([], { FAKE_BREAKER: BREAKER_ON }));
    const b = sandbox(LEAD_NO_CARD, { stored: "on" });
    runs.push(await b.run(["--dry-run"], { FAKE_BREAKER: BREAKER_OFF }));
    runs.push(await b.run([], { FAKE_BREAKER: BREAKER_OFF }));
    expect(runs.filter((r) => r.last.includes("issue PRO-")).length).toBe(2);
    for (const r of runs) {
      expect(r.gh.length).toBeGreaterThan(0);
      expect(writes(r.gh)).toEqual([]);
      expect(r.out).not.toContain(API_KEY);
      for (const c of r.curl) {
        expect(c.args.join(" ")).not.toContain(API_KEY);
        expect(c.stdin).toContain(`Authorization: Bearer ${API_KEY}`);
        expect(c.body ?? "").not.toContain(API_KEY);
      }
      for (const i of r.posts) expect(JSON.stringify(i)).not.toContain(API_KEY);
    }
  }, T);

  it("exits 1 on an unknown argument before asking anything", async () => {
    for (const args of [["--bogus"], ["--dry-run", "--dry-run"], ["on"], ["--dry-run", "--send"]]) {
      const s = sandbox(LEAD, { stored: "off" });
      const r = await s.run(args, { FAKE_BREAKER: BREAKER_ON });
      expect(r.status, args.join(" ")).toBe(1);
      expect(r.out).toContain("usage: ops/breaker-comments.sh [--dry-run]");
      expect(r.ssh).toEqual([]);
      expect(r.gh).toEqual([]);
      expect(r.curl).toEqual([]);
      expect(r.state).toBe("off\n");
    }
  }, T);
});
