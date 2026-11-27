/**
 * No amount a single customer paid or spent may land in the public repo (loop-constraints.md, rule 8).
 *
 * On 2026-11-26 two reports named how often, how much and at what time the one sandbox customer topped
 * up. Time and amount together lead to the public USDC transfer on Base and from there to the wallet.
 * The check that should have caught it only looked for amounts with two decimals, so a whole amount passed.
 *
 * This test reads every file that carries reports about customers and fails on each paragraph that
 * names a single customer and also carries an amount that is not masked as `*.**`. A paragraph (lines
 * up to the next blank line) is one unit, so a line break between "Kunde 1" and the amount does not
 * hide it. Totals over all customers and fixed amounts of the product stay allowed, but only through
 * the context directly in front of the amount; there is no exception for a file or a line.
 * The failure names file and line, never the amount.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

/** Text that points at one single customer. */
const CUSTOMER_PATTERNS: readonly RegExp[] = [
  /\bKunden? [0-9]+\b(?![.,][0-9])/,
  /\b(?:CUSTOMER|DAY|LEDGER|SANDBOX|AFTER|PATH|LAST|QUIET) [0-9]+\b/,
  /Sandbox-Kunde/,
  /\b[Ee]in(?:e[mnr])? (?:einzelne[mnr]? )?fremde[mnr]? Automaton\b/,
  /von einer Adresse/,
  /\bseine[mnrs]? Wallet/,
  /\bihre[mnrs]? Wallet/,
  /\bseine[mnrs]? Aufladung/,
  /\bihre[mnrs]? Aufladung/,
  /\blud\b.*\bauf\b/,
  /\bgezahlt\b/,
  /\bzahlte\b/,
  /\bverbrauchte\b/,
];

/** An amount: whole or with decimals, in USD or USDC. `*.** USD` does not match. */
const AMOUNT = /(?<![\w.,*])[0-9]+(?:[.,][0-9]+)? ?(?:USD|USDC)\b/g;

/**
 * A paragraph that names an address from the documentation ranges of RFC 5737 describes a fixture, and
 * amounts in fixtures are made up.
 */
const FIXTURE_ADDRESS = /\b(?:192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]{1,3}\b/;

/** Start of a word, aware of umlauts (`\b` in a JavaScript RegExp is not). */
const W = "(?<![\\p{L}\\p{N}_])";
/** Small words that may stand between a context and its amount. */
const LINK = "(?: (?:von|ist|zu|mit|heute|den|dem|der|die|des))?(?: (?:etwa|rund))?:?";
const before = (context: string) => new RegExp(`${W}(?:${context})${LINK} $`, "iu");

/**
 * Contexts that make the amount directly after them a fixed amount of the product or a total over all
 * customers. Each one is matched against the text right before the amount and has to end there.
 */
const ALLOWED_BEFORE: readonly RegExp[] = [
  before("unter|über|ab|bis|höchstens|mindestens"),
  before("Paket\\p{L}*"),
  before("Preis\\p{L}*"),
  before("Stufe\\p{L}*(?: (?:der|des) [\\p{L}-]+)?"),
  before("Tier\\p{L}*"),
  before("Startgutschrift\\p{L}*"),
  before("Schrittguthaben\\p{L}*"),
  before("Marge"),
  /(?<![\p{L}\p{N}_])Summe (?:aller|über alle) [^.;:]*: $/iu,
  // inside the parentheses right after a named test: the made-up amounts of its fixture
  /\.test\.ts` \([^()]*$/,
];

/** Context right after the amount: a total over two or more addresses or payers. */
const ALLOWED_AFTER: readonly RegExp[] = [/^ \((?:[2-9]|[1-9][0-9]+) (?:Adressen|Zahler)\b/];

/**
 * Context that makes an amount the amount of exactly one payment, payer or address. Such an amount belongs
 * to one customer even when the paragraph names no customer and even behind `über`, so it always counts.
 */
const SINGLE_BEFORE: readonly RegExp[] = [/(?<![\p{N}.,])1 über $/u];
const SINGLE_AFTER: readonly RegExp[] = [/^ \(1 (?:Adresse|Zahler|Wallet)\b/];

const SCANNED_DIRS: readonly { dir: string; recursive: boolean; name: RegExp }[] = [
  { dir: "docs/kunden", recursive: true, name: /\.md$/ },
  { dir: "docs/richtung", recursive: false, name: /\.md$/ },
  { dir: "goals/kunden", recursive: false, name: /^[0-9].*\.md$/ },
];
const SCANNED_FILES: readonly string[] = ["docs/kette.md", "ROADMAP.md", "STATE.md"];

type Unit = { line: number; text: string };

/** A list item or a table row starts a unit of its own, as in Markdown. */
const UNIT_START = /^\s*(?:[-*+]|[0-9]+\.)\s|^\s*\|/;
const FENCE = /^\s*```/;

/**
 * Joins the lines of each paragraph, list item or table row; `line` is its first line, counted from 1.
 * Wrapped lines stay together up to the next blank line, so a line break between the customer and the
 * amount does not hide the amount. Inside a fenced block every line is a record of its own (tool output),
 * so a total line of a tool does not count as part of the customer line above it.
 */
function paragraphs(content: string): Unit[] {
  const units: Unit[] = [];
  let start = 0;
  let lines: string[] = [];
  const flush = () => {
    if (lines.length) units.push({ line: start + 1, text: lines.join(" ") });
    lines = [];
  };
  let fenced = false;
  content.split("\n").forEach((raw, i) => {
    if (FENCE.test(raw)) {
      flush();
      fenced = !fenced;
      return;
    }
    if (raw.trim() === "") return flush();
    if (fenced || UNIT_START.test(raw)) flush();
    if (!lines.length) start = i;
    lines.push(raw.trim());
  });
  flush();
  return units;
}

function around(text: string, index: number, length: number): { head: string; tail: string } {
  return { head: text.slice(Math.max(0, index - 160), index), tail: text.slice(index + length, index + length + 40) };
}

function allowedAmount(text: string, index: number, length: number): boolean {
  const { head, tail } = around(text, index, length);
  return ALLOWED_BEFORE.some((re) => re.test(head)) || ALLOWED_AFTER.some((re) => re.test(tail));
}

function singlePayerAmount(text: string, index: number, length: number): boolean {
  const { head, tail } = around(text, index, length);
  return SINGLE_BEFORE.some((re) => re.test(head)) || SINGLE_AFTER.some((re) => re.test(tail));
}

/** Line numbers (first line of the paragraph) of every paragraph with an amount of a single customer. */
function customerAmountLines(content: string): number[] {
  const hits: number[] = [];
  for (const unit of paragraphs(content)) {
    if (FIXTURE_ADDRESS.test(unit.text)) continue;
    const customer = CUSTOMER_PATTERNS.some((re) => re.test(unit.text));
    const amounts = [...unit.text.matchAll(AMOUNT)];
    const leaks = amounts.some(
      (m) =>
        singlePayerAmount(unit.text, m.index, m[0].length) ||
        (customer && !allowedAmount(unit.text, m.index, m[0].length)),
    );
    if (leaks) hits.push(unit.line);
  }
  return hits;
}

function scannedFiles(): string[] {
  const files: string[] = [];
  for (const { dir, recursive, name } of SCANNED_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { recursive, withFileTypes: true })) {
      if (!entry.isFile() || !name.test(entry.name)) continue;
      files.push(relative(ROOT, join(entry.parentPath, entry.name)));
    }
  }
  for (const file of SCANNED_FILES) if (existsSync(join(ROOT, file))) files.push(file);
  return files.sort();
}

describe("no revenue of a single customer in the public repo", () => {
  it("catches a whole amount of a single customer", () => {
    expect(customerAmountLines("Er hat dreimal 7 USD gezahlt und dann aufgehört.")).toEqual([1]);
    expect(customerAmountLines("Kunde 2 zahlte 20 USD.")).toEqual([1]);
  });

  it("catches an amount with decimals of a single customer", () => {
    expect(customerAmountLines("Kunde 9 gab 12,34 USD aus.")).toEqual([1]);
    expect(customerAmountLines("Kunde 9 gab 12.34 USDC aus.")).toEqual([1]);
    expect(customerAmountLines("Der Sandbox-Kunde hat noch 0,85 USD.")).toEqual([1]);
  });

  it("catches an amount of one single foreign automaton", () => {
    expect(customerAmountLines("Ein fremder Automaton brach 4 Anfragen ab, berechnet wurden 3,57 USD.")).toEqual([1]);
    expect(customerAmountLines("Einem einzelnen fremden Automaton haben wir 3,57 USD berechnet.")).toEqual([1]);
    expect(customerAmountLines("Ein fremder Automaton brach 4 Anfragen ab, berechnet wurden *.** USD.")).toEqual([]);
  });

  it("catches an amount that a line break separates from the customer", () => {
    const text = ["Intro.", "", "Kunde 3 kam am Montag wieder und", "gab dann 17 USD aus.", "", "Next."].join("\n");
    expect(customerAmountLines(text)).toEqual([3]);
  });

  it("catches a forbidden amount next to an allowed one in the same paragraph", () => {
    expect(customerAmountLines("Kunde 1 lag unter 5 USD und gab 13 USD aus.")).toEqual([1]);
  });

  it("lets totals over all customers through", () => {
    expect(customerAmountLines("Summe aller fremden Kunden: 56,78 USD in der Woche.")).toEqual([]);
    expect(customerAmountLines("Kunde 1 war dabei. Summe aller fremden Kunden: 56,78 USD in der Woche.")).toEqual([]);
  });

  it("catches an amount of exactly one payment, payer or address without a customer pattern", () => {
    expect(customerAmountLines("| Fremde Zahlungen | 1 über 4,56 USD (1 Zahler) |")).toEqual([1]);
    expect(customerAmountLines("| Fremde Zahlungen | 1 über 4,56 USD |")).toEqual([1]);
    expect(customerAmountLines("| Fremde Inferenz-Ausgabe | 0,97 USD (1 Adresse) |")).toEqual([1]);
    expect(customerAmountLines("| Fremde Zahlungen | 6 über 43,21 USD (2 Zahler) | 11 über 4,56 USD |")).toEqual([]);
    expect(customerAmountLines("| Fremde Zahlungen | 1 über *.** USD (1 Zahler) |")).toEqual([]);
  });

  it("lets fixed amounts of the product through", () => {
    expect(customerAmountLines("Kunde 1 bekam ein Schrittguthaben von 10 Cent.")).toEqual([]);
    expect(customerAmountLines("Kunde 1 bekam ein Schrittguthaben von 2,19 USD.")).toEqual([]);
    expect(customerAmountLines("Seine Wallet liegt unter 5 USD, die kleinste Stufe ist 5 USD.")).toEqual([]);
    expect(customerAmountLines("Kunde 1 kaufte das Paket zu 20 USD nicht, der Preis von 2 USD blieb.")).toEqual([]);
  });

  it("lets totals over two or more addresses through, not over one", () => {
    expect(customerAmountLines("| Sandbox-Kunde | 43,21 USD (3 Adressen) | 65,43 USD (2 Zahler) |")).toEqual([]);
    expect(customerAmountLines("| Sandbox-Kunde | 87,65 USD (1 Zahler) |")).toEqual([1]);
  });

  it("reads every line of a fenced block as a record of its own", () => {
    const block = ["```", "CUSTOMER 1: first 2026-11-10, balance *.** USD", "WEEK: 8.76 USD foreign inference", "```"];
    expect(customerAmountLines(block.join("\n"))).toEqual([]);
    const leak = ["```", "WEEK: 8.76 USD foreign inference", "DAY 1 2026-11-12: 3 calls, 4.32 USD", "```"];
    expect(customerAmountLines(leak.join("\n"))).toEqual([3]);
  });

  it("lets made-up amounts of fixtures and named tests through", () => {
    expect(customerAmountLines("Fixture: Kunde 1 ruft von `198.51.100.7` und hat 5.43 USD ausgegeben.")).toEqual([]);
    expect(customerAmountLines("Kunde 1 ohne Geld; neuer Test `test/x.test.ts` (sechs Läufe von 3,21 USD auf 0).")).toEqual([]);
    expect(customerAmountLines("Kunde 1 ohne Geld; Test `test/x.test.ts`, dann gab Kunde 1 3,21 USD aus.")).toEqual([1]);
  });

  it("lets masked amounts through", () => {
    expect(customerAmountLines("Er hat dreimal *.** USD gezahlt, um **:** UTC.")).toEqual([]);
  });

  it("finds no amount of a single customer in the reports about customers", () => {
    const files = scannedFiles();
    expect(files).toContain("docs/kunden/sandbox-kunde-2026-11.md");
    expect(files).toContain("ROADMAP.md");
    const found = files.flatMap((file) =>
      customerAmountLines(readFileSync(join(ROOT, file), "utf-8")).map((line) => `${file}:${line}`),
    );
    expect(found, "paragraphs with an amount of a single customer (rule 8), mask it as *.**").toEqual([]);
  });
});
