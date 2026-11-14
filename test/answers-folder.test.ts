import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GOOD, GOOD_BODY, NO_DISCLOSURE, posts, sandbox, sha12 } from "./answers-sandbox";

/**
 * ops/before-the-answers.py and ops/post-the-answers.py used to read only `.scratch/gtm/issue-antworten/`, which is not in the
 * repository, so no goal could put a draft where a reviewer sees it. Both take `--folder <dir in the repo>` now.
 *
 * Every run here happens in the sandbox of test/answers-sandbox.ts: a throwaway copy of the scripts with `gh`, `curl` and `ssh`
 * replaced by fakes on PATH, no network, every call in a log. The fake `gh` is how "the dry run posts nothing" is proven, and the
 * `--send 1` case below is the counter-proof that the same log does see a post when one happens. Since kanal 04 a send needs
 * `--approved <n>:<sha12>` from the dry run; the cases below pass the value that belongs to their draft.
 */
const APPROVED_434 = `434:${sha12(GOOD_BODY)}`;
const APPROVED_430 = `430:${sha12(NO_DISCLOSURE)}`;

describe("the issue answers take a folder in the repository", () => {
  it("before-the-answers.py checks the drafts in --folder and only there", () => {
    const s = sandbox({ "434.md": GOOD, "README.md": "# not a draft\n" });
    const withFolder = s.run("before-the-answers.py", ["--folder", "goals/kanal/antworten"]);
    expect(withFolder.out).toContain("#434");
    expect(withFolder.out).toContain("1 still to send: #434");
    expect(withFolder.out).toContain("READY");
    expect(withFolder.status).toBe(0);
    const without = s.run("before-the-answers.py", []);
    expect(without.out).toContain("No drafts to check.");
    expect(without.out).not.toContain("#434");
  }, 120_000);

  it("before-the-answers.py stays a gate in --folder: a draft that names the service without a disclosure is NOT READY", () => {
    const s = sandbox({ "430.md": NO_DISCLOSURE });
    const r = s.run("before-the-answers.py", ["--folder", "goals/kanal/antworten"]);
    expect(r.out).toContain("FAILED  carries a disclosure line");
    expect(r.out).toContain("NOT READY");
    expect(r.status).toBe(1);
  }, 120_000);

  it("before-the-answers.py refuses a --folder that is missing or outside the repository instead of finding no drafts", () => {
    const s = sandbox({ "434.md": GOOD });
    const missing = s.run("before-the-answers.py", ["--folder", "goals/kanal/antwort"]);
    expect(missing.out).toContain("REFUSED");
    expect(missing.out).not.toContain("No drafts to check.");
    expect(missing.status).toBe(1);
    const outside = s.run("before-the-answers.py", ["--folder", tmpdir()]);
    expect(outside.out).toContain("REFUSED");
    expect(outside.status).toBe(1);
    const bare = s.run("before-the-answers.py", ["--folder"]);
    expect(bare.out).toContain("REFUSED");
    expect(bare.status).toBe(1);
  }, 120_000);

  it("post-the-answers.py dry run with --folder shows the draft from that folder and posts nothing", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", ["--folder", "goals/kanal/antworten"]);
    expect(r.out).toContain("DRY RUN. Nothing was sent.");
    expect(r.out).toContain("#434");
    expect(r.out).toContain("opens: The 401 is the retry");
    expect(r.out).toContain("--folder goals/kanal/antworten");
    expect(r.status).toBe(0);
    expect(posts(r.calls)).toEqual([]);
    expect(r.calls.length).toBeGreaterThan(0);
    expect(r.log).toBe("# <iso8601-utc> <issue> <url>\n");
  }, 120_000);

  it("post-the-answers.py --send 1 with --folder posts that draft, which is what the dry run is measured against", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", ["--folder", "goals/kanal/antworten", "--send", "1", "--approved", APPROVED_434]);
    expect(r.status).toBe(0);
    const sent = posts(r.calls);
    expect(sent.length).toBe(1);
    expect(sent[0][1]).toBe("repos/Conway-Research/automaton/issues/434/comments");
    expect(sent[0].find((a) => a.startsWith("body="))).toBe(
      "body=The 401 is the retry, not the first answer. The first verify answers 500.\n\nDisclosure: I run PostYourPrice (https://postyourprice.com), a control plane for this runtime.\n",
    );
    expect(r.log).toMatch(/\n\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ 434 https:\/\/github\.com\/Conway-Research\/automaton\/issues\/434#issuecomment-1\n$/);
  }, 120_000);

  it("post-the-answers.py refuses to post when the gate on --folder is NOT READY", () => {
    const s = sandbox({ "430.md": NO_DISCLOSURE });
    const r = s.run("post-the-answers.py", ["--folder", "goals/kanal/antworten", "--send", "1", "--approved", APPROVED_430]);
    expect(r.out).toContain("REFUSED");
    expect(r.out).toContain("ops/before-the-answers.py is not READY");
    expect(r.status).toBe(1);
    expect(posts(r.calls)).toEqual([]);
  }, 120_000);

  it("post-the-answers.py dry run says nothing is pending when every draft in --folder is already answered", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", ["--folder", "goals/kanal/antworten"], { FAKE_ANSWERED: "434" });
    expect(r.out).toContain("Nothing pending.");
    expect(r.status).toBe(0);
    expect(posts(r.calls)).toEqual([]);
    expect(existsSync(join(s.folder, "none.md"))).toBe(false);
  }, 120_000);

  it("post-the-answers.py --folder=<dir> --send 1 posts the draft from that folder, like --folder <dir>", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", ["--folder=goals/kanal/antworten", "--send", "1", `--approved=${APPROVED_434}`]);
    expect(r.status).toBe(0);
    const sent = posts(r.calls);
    expect(sent.length).toBe(1);
    expect(sent[0][1]).toBe("repos/Conway-Research/automaton/issues/434/comments");
    expect(r.log).toMatch(/ 434 https:\/\/github\.com\/Conway-Research\/automaton\/issues\/434#issuecomment-1\n$/);
  }, 120_000);

  it("post-the-answers.py stops on an unknown argument with exit 1 before anything is sent", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", ["--folder", "goals/kanal/antworten", "--send", "1", "--approved", APPROVED_434, "--no-such-flag"]);
    expect(r.out).toContain("REFUSED: unknown argument --no-such-flag");
    expect(r.status).toBe(1);
    expect(r.calls).toEqual([]);
    expect(r.log).toBe("# <iso8601-utc> <issue> <url>\n");
  }, 120_000);

  it("before-the-answers.py stops on an unknown argument with exit 1 before it asks the network", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("before-the-answers.py", ["--folder", "goals/kanal/antworten", "--send", "1"]);
    expect(r.out).toContain("REFUSED: unknown argument --send");
    expect(r.status).toBe(1);
    expect(r.calls).toEqual([]);
  }, 120_000);

  it("post-the-answers.py --verify-posted says same when the live comment is the body the draft would send", () => {
    const s = sandbox({ "434.md": GOOD });
    s.posted([
      "2026-11-10T14:03:20Z 440 https://github.com/Conway-Research/automaton/issues/440#issuecomment-41",
      "2026-11-11T07:04:50Z 434 https://github.com/Conway-Research/automaton/issues/434#issuecomment-42",
    ]);
    const live = "The 401 is the retry, not the first answer. The first verify answers 500.\n\nDisclosure: I run PostYourPrice (https://postyourprice.com), a control plane for this runtime.\n";
    const r = s.run("post-the-answers.py", ["--verify-posted", "--folder", "goals/kanal/antworten"], {
      FAKE_COMMENTS: JSON.stringify({ "42": live }),
    });
    expect(r.out).toContain("no draft #440");
    expect(r.out).toContain("same #434");
    expect(r.out.trim().split("\n").at(-1)).toBe("VERIFY POSTED OK: 1 same");
    expect(r.status).toBe(0);
    expect(posts(r.calls)).toEqual([]);
    expect(r.calls.map((c) => c[1])).toEqual(["repos/Conway-Research/automaton/issues/comments/42"]);
  }, 120_000);

  it("post-the-answers.py --verify-posted fails with exit 1 when the live comment differs by one character", () => {
    const s = sandbox({ "434.md": GOOD });
    s.posted(["2026-11-11T07:04:50Z 434 https://github.com/Conway-Research/automaton/issues/434#issuecomment-42"]);
    const live = "The 401 is the retry, not the first answer. The first verify answers 501.\n\nDisclosure: I run PostYourPrice (https://postyourprice.com), a control plane for this runtime.\n";
    const r = s.run("post-the-answers.py", ["--verify-posted", "--folder=goals/kanal/antworten"], {
      FAKE_COMMENTS: JSON.stringify({ "42": live }),
    });
    expect(r.out).toContain("DIFFERS #434");
    expect(r.out).toContain("VERIFY POSTED FAILED");
    expect(r.status).toBe(1);
    expect(posts(r.calls)).toEqual([]);
  }, 120_000);

  it("post-the-answers.py --verify-posted fails when a comment cannot be read or nothing was compared", () => {
    const s = sandbox({ "434.md": GOOD });
    s.posted(["2026-11-11T07:04:50Z 434 https://github.com/Conway-Research/automaton/issues/434#issuecomment-42"]);
    const missing = s.run("post-the-answers.py", ["--verify-posted", "--folder", "goals/kanal/antworten"]);
    expect(missing.out).toContain("VERIFY POSTED FAILED");
    expect(missing.status).toBe(1);
    s.posted(["2026-11-10T14:03:20Z 440 https://github.com/Conway-Research/automaton/issues/440#issuecomment-41"]);
    const none = s.run("post-the-answers.py", ["--verify-posted", "--folder", "goals/kanal/antworten"]);
    expect(none.out).toContain("no draft #440");
    expect(none.out).toContain("VERIFY POSTED FAILED");
    expect(none.status).toBe(1);
    expect(posts([...missing.calls, ...none.calls])).toEqual([]);
  }, 120_000);
});
