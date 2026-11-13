import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GOOD, GOOD_BODY, HEADER, posts, sandbox } from "./answers-sandbox";

/**
 * Matthias approves a text at the human gate `public_post`, but ops/post-the-answers.py --send used to read the draft from the file
 * at the moment of sending. A draft edited between his "ok" and the run went out under his name, and --verify-posted said `same`
 * afterwards, because it compared against the same edited file. Since kanal 04 the approval is a value: the dry run prints the first
 * 12 hex digits of sha256 over the body that would be posted, and --send only posts with --approved <n>:<value> for every number
 * it sends. After each POST the comment is read back by its id and compared with what was sent.
 *
 * The value is computed here with node:crypto, independent of the script under test.
 */
const sha12 = (body: string) => createHash("sha256").update(body, "utf8").digest("hex").slice(0, 12);

const OTHER = [
  "<!-- Zweiter Entwurf, intern -->",
  "The 402 comes from the proxy, not from the runtime. Retry with the header set.",
  "",
  "Disclosure: I run PostYourPrice (https://postyourprice.com), a control plane for this runtime.",
  "",
].join("\n");
const OTHER_BODY =
  "The 402 comes from the proxy, not from the runtime. Retry with the header set.\n\nDisclosure: I run PostYourPrice (https://postyourprice.com), a control plane for this runtime.\n";
const FOLDER = ["--folder", "goals/kanal/antworten"];

describe("the approval is the hash of the approved text", () => {
  it("the dry run prints sha12 of the body for every draft and the send line with --only and --approved", () => {
    const s = sandbox({ "434.md": GOOD, "436.md": OTHER });
    const r = s.run("post-the-answers.py", FOLDER);
    expect(r.status).toBe(0);
    expect(r.out).toContain("DRY RUN. Nothing was sent.");
    expect(r.out).toContain(`  #434  sha12 ${sha12(GOOD_BODY)}\n`);
    expect(r.out).toContain(`  #436  sha12 ${sha12(OTHER_BODY)}\n`);
    expect(r.out).toContain(
      `ops/post-the-answers.py --send 2 --only 434,436 --approved 434:${sha12(GOOD_BODY)},436:${sha12(OTHER_BODY)} --folder goals/kanal/antworten`,
    );
    expect(posts(r.calls)).toEqual([]);
  }, 120_000);

  it("--send with the value from the dry run posts that body and reads the comment back as the same", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", [...FOLDER, "--send", "1", "--approved", `434:${sha12(GOOD_BODY)}`]);
    expect(r.status).toBe(0);
    const sent = posts(r.calls);
    expect(sent.length).toBe(1);
    expect(sent[0].find((a) => a.startsWith("body="))).toBe(`body=${GOOD_BODY}`);
    expect(r.calls.map((c) => c[1])).toContain("repos/Conway-Research/automaton/issues/comments/1");
    expect(r.out).toContain("#434 read back: same");
    expect(r.out).not.toContain("DIFFERS");
    expect(r.log).toMatch(/ 434 https:\/\/github\.com\/Conway-Research\/automaton\/issues\/434#issuecomment-1\n$/);
  }, 120_000);

  it("a draft changed after the dry run by one character does not go out: exit 1 and not a single POST", () => {
    const s = sandbox({ "434.md": GOOD });
    const dry = s.run("post-the-answers.py", FOLDER);
    const value = dry.out.match(/#434 {2}sha12 ([0-9a-f]{12})\n/)?.[1];
    expect(value).toBe(sha12(GOOD_BODY));
    s.write("434.md", GOOD.replace("answers 500.", "answers 501."));
    const changed = s.run("post-the-answers.py", [...FOLDER, "--send", "1", "--approved", `434:${value}`]);
    expect(changed.out).toContain("REFUSED: #434 changed since it was approved");
    expect(changed.status).toBe(1);
    expect(posts(changed.calls)).toEqual([]);
    expect(changed.log).toBe(HEADER);
    // Counter-proof: the same value on the text it was computed over does go out.
    s.write("434.md", GOOD);
    const same = s.run("post-the-answers.py", [...FOLDER, "--send", "1", "--approved", `434:${value}`]);
    expect(same.status).toBe(0);
    expect(posts(same.calls).length).toBe(1);
  }, 120_000);

  it("--send without --approved refuses with exit 1 before the gate or GitHub is asked", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", [...FOLDER, "--send", "1"]);
    expect(r.out).toContain("REFUSED: --send needs --approved");
    expect(r.status).toBe(1);
    expect(r.calls).toEqual([]);
    expect(r.log).toBe(HEADER);
  }, 120_000);

  it("a value for only one of two numbers that would be sent refuses the whole package: exit 1 and no POST", () => {
    const s = sandbox({ "434.md": GOOD, "436.md": OTHER });
    const r = s.run("post-the-answers.py", [...FOLDER, "--send", "2", "--approved", `434:${sha12(GOOD_BODY)}`]);
    expect(r.out).toContain("REFUSED: #436 is not approved");
    expect(r.status).toBe(1);
    expect(posts(r.calls)).toEqual([]);
    expect(r.log).toBe(HEADER);
  }, 120_000);

  it("a comment that reads back as another text ends with DIFFERS, exit 1 and no second POST", () => {
    const s = sandbox({ "434.md": GOOD, "436.md": OTHER });
    const r = s.run(
      "post-the-answers.py",
      [...FOLDER, "--send", "2", "--approved", `434:${sha12(GOOD_BODY)},436:${sha12(OTHER_BODY)}`],
      { FAKE_READBACK: GOOD_BODY.replace("answers 500.", "answers 501.") },
    );
    expect(r.out).toMatch(/DIFFERS #434: live \d+ characters, sent \d+, first difference at \d+/);
    expect(r.status).toBe(1);
    expect(posts(r.calls).length).toBe(1);
    expect(r.log).toMatch(/ 434 https:\/\/github\.com\/Conway-Research\/automaton\/issues\/434#issuecomment-1\n$/);
  }, 120_000);

  it("a comment that cannot be read back ends with DIFFERS and exit 1", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", [...FOLDER, "--send", "1", "--approved", `434:${sha12(GOOD_BODY)}`], { FAKE_READBACK: "404" });
    expect(r.out).toContain("DIFFERS #434: comment 1 not readable");
    expect(r.status).toBe(1);
    expect(posts(r.calls).length).toBe(1);
  }, 120_000);

  it("a malformed value, a number given twice or a number without a draft refuses before GitHub is asked", () => {
    const s = sandbox({ "434.md": GOOD });
    const v = sha12(GOOD_BODY);
    for (const [approved, says] of [
      ["434:abc", "--approved needs"],
      [`434:${v.toUpperCase()}x`, "--approved needs"],
      [`434:${v},434:${v}`, "#434 is approved twice"],
      [`434:${v},999:${v}`, "#999 has no draft"],
    ]) {
      const r = s.run("post-the-answers.py", [...FOLDER, "--send", "1", "--approved", approved]);
      expect(r.out).toContain(`REFUSED: ${says}`);
      expect(r.status).toBe(1);
      expect(r.calls).toEqual([]);
    }
  }, 120_000);

  it("a number approved but not among those to send refuses: with --only before GitHub, by the count before any POST", () => {
    const s = sandbox({ "434.md": GOOD, "436.md": OTHER });
    const both = `434:${sha12(GOOD_BODY)},436:${sha12(OTHER_BODY)}`;
    const only = s.run("post-the-answers.py", [...FOLDER, "--send", "1", "--only", "434", "--approved", both]);
    expect(only.out).toContain("REFUSED: #436 is approved but not in --only");
    expect(only.status).toBe(1);
    expect(only.calls).toEqual([]);
    const count = s.run("post-the-answers.py", [...FOLDER, "--send", "1", "--approved", both]);
    expect(count.out).toContain("REFUSED: #436 is approved but would not be sent");
    expect(count.status).toBe(1);
    expect(posts(count.calls)).toEqual([]);
  }, 120_000);

  it("the gate refuses --approved like any unknown argument, also under python3 -I from another directory", () => {
    const s = sandbox({ "434.md": GOOD });
    const elsewhere = mkdtempSync(join(tmpdir(), "answers-cwd-"));
    const r = s.run("before-the-answers.py", ["--approved", `434:${sha12(GOOD_BODY)}`], {}, { isolated: true, cwd: elsewhere });
    expect(r.out.trim().split("\n").at(-1)).toBe("REFUSED: unknown argument --approved");
    expect(r.status).toBe(1);
    expect(r.calls).toEqual([]);
  }, 120_000);

  it("post-the-answers.py loads answers_args under python3 -I from another directory", () => {
    const s = sandbox({});
    const elsewhere = mkdtempSync(join(tmpdir(), "answers-cwd-"));
    const r = s.run("post-the-answers.py", ["--selftest"], {}, { isolated: true, cwd: elsewhere });
    expect(r.out.trim().split("\n").at(-1)).toMatch(/^SELFTEST OK/);
    expect(r.status).toBe(0);
  }, 120_000);
});
