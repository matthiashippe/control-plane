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
 * the comments already match, so a failed run comes again. Every run happens in the sandbox of test/breaker-comments-sandbox.ts:
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
    // The next run with the same breaker finds the stored state.
    const again = await s.run([], { FAKE_BREAKER: BREAKER_ON });
    expect(again.last).toBe("breaker on, last on, no change");
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
      ["on", BREAKER_ON, LEAD],
      ["off", BREAKER_OFF, LEAD_NO_CARD],
    ] as const) {
      // The comments do not match on purpose: without a change of the breaker the tool does not even look.
      const s = sandbox(lead, { stored });
      const r = await s.run([], { FAKE_BREAKER: breaker });
      expect(r.status).toBe(0);
      expect(r.last).toBe(`breaker ${stored}, last ${stored}, no change`);
      expect(r.posts).toEqual([]);
      expect(r.curl).toEqual([]);
      expect(r.gh).toEqual([]);
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
