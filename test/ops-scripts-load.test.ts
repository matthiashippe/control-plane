import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const OPS = join(__dirname, "..", "ops");

/**
 * The language pass on 2026-09-22 renamed 38 files. One of them was the module
 * `ops/fact-probe.py` imports, and the import was not carried along, so the script raised
 * ModuleNotFoundError on every run from then until 2026-09-23. Nobody noticed for a day, because
 * `docs/journeys.md` cites its result as evidence and a cited result is not a re-run.
 *
 * Nothing in the suite looked at these scripts at all: they are not imported by the service, so a
 * broken one stays green. This file is the smallest thing that would have caught it.
 */
describe("the ops scripts still load", () => {
  const python = readdirSync(OPS).filter((f) => f.endsWith(".py"));

  it("finds the python scripts to check", () => {
    expect(python.length).toBeGreaterThan(5);
  });

  // Whether a module can be found is a question with an exact answer, and Python has it twice
  // over: `ast` says which names a file actually imports, and `importlib.util.find_spec` says
  // whether each one resolves. Neither guesses.
  //
  // Two earlier versions of this block guessed, and each failed in its own direction. The first
  // carried a hand-written list of standard library names and only judged files containing
  // `sys.path.insert`; that guard skipped the single file that had the bug, so the test passed
  // against the restored bug. The second read the imports with a regular expression and found the
  // word "the" in a prose comment reading "from the file that is supposed to prove it". A test
  // that certifies the bug and a test that cries wolf are the same mistake: reading source code
  // with something that is not a parser.
  for (const file of python) {
    it(`${file} imports only modules that exist`, () => {
      const probe = [
        "import ast, importlib.util, sys",
        `path = ${JSON.stringify(join(OPS, "PLACEHOLDER"))}`,
        `sys.path.insert(0, ${JSON.stringify(OPS)})`,
        "tree = ast.parse(open(path, encoding='utf-8').read())",
        "names = set()",
        "for node in ast.walk(tree):",
        "    if isinstance(node, ast.Import):",
        "        names.update(a.name.split('.')[0] for a in node.names)",
        "    elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:",
        "        names.add(node.module.split('.')[0])",
        "for name in sorted(names):",
        "    try:",
        "        found = importlib.util.find_spec(name) is not None",
        "    except Exception:",
        "        found = False",
        "    if not found:",
        "        print(name)",
      ].join("\n").replace("PLACEHOLDER", file);
      const missing = execFileSync("python3", ["-c", probe], { stdio: "pipe" })
        .toString().trim().split("\n").filter(Boolean);
      expect(missing, `${file} imports ${missing.join(", ")}, which python cannot find`).toEqual([]);
    });
  }

  const shell = readdirSync(OPS).filter((f) => f.endsWith(".sh"));

  it("finds the shell scripts to check", () => {
    expect(shell.length).toBeGreaterThan(5);
  });

  for (const file of shell) {
    it(`${file} is valid shell`, () => {
      // -n parses without running. It catches the unbalanced quote that silently disabled whole
      // sections of two scripts on 2026-09-22, each time because an apostrophe inside embedded
      // python ended the surrounding shell string.
      expect(() => execFileSync("bash", ["-n", join(OPS, file)], { stdio: "pipe" })).not.toThrow();
    });
  }
});
