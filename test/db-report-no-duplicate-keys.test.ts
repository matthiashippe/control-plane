import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const FILE = join(__dirname, "..", "ops", "db-report.cjs");

/**
 * A duplicate key in that file is silent, and it decides THE number.
 *
 * `ops/db-report.cjs` is one large object literal. Every figure that splits the market from us is
 * a property on it, `foreign_buyers` and `foreign_gmv_30d_mc` among them. JavaScript allows the
 * same key twice in an object literal outside strict mode: the later one wins, node says nothing,
 * and `node --check` passes because it is valid syntax.
 *
 * On 2026-09-23 a cycle added `unclassified_key_names` to the end of that object without noticing
 * it was already there, sixty lines up, with its own tests and its own exit code in
 * ops/check-all.sh. The new one overrode the working one. It was caught only because the two
 * happened to return different shapes and an existing test compared the shape. Two implementations
 * that agreed on shape would have swapped silently, and the one that lost would have been the one
 * with the tests.
 *
 * So the file is parsed, by a parser and not by a regular expression, and every object literal in
 * it is checked for a key that appears twice.
 */
describe("the database report has no key twice", () => {
  const source = readFileSync(FILE, "utf-8");
  const tree = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true);

  function duplicatesIn(node: ts.Node, found: string[] = []): string[] {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Set<string>();
      for (const prop of node.properties) {
        const name = prop.name;
        if (!name) continue;
        const key = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
        if (key === null) continue;
        if (seen.has(key)) {
          const { line } = tree.getLineAndCharacterOfPosition(prop.getStart(tree));
          found.push(`${key} (again at line ${line + 1})`);
        }
        seen.add(key);
      }
    }
    // `void`, and it is the whole reason this comment exists. ts.forEachChild STOPS as soon as the
    // callback returns something truthy, and duplicatesIn returns the array it is filling, which is
    // always truthy. Written without the void, the walk descended into the first child of every
    // node and stopped, so the first version of this test passed against a file that had the
    // duplicate planted in it. A test that stays green without its fix is not a test, and this one
    // was written to catch exactly that class of mistake.
    node.forEachChild((child) => void duplicatesIn(child, found));
    return found;
  }

  it("parses the file, so a finding of none is a finding", () => {
    // Without this, a file that failed to parse would produce an empty list and read as clean.
    const literals: ts.ObjectLiteralExpression[] = [];
    const walk = (n: ts.Node) => {
      if (ts.isObjectLiteralExpression(n)) literals.push(n);
      n.forEachChild(walk);
    };
    walk(tree);
    expect(literals.length, "no object literal found, so nothing was actually checked").toBeGreaterThan(3);
  });

  it("names no figure twice, because the second one would win in silence", () => {
    const duplicates = duplicatesIn(tree);
    expect(duplicates, `these keys appear more than once: ${duplicates.join(", ")}`).toEqual([]);
  });
});
