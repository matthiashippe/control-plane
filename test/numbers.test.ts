/**
 * Every number that appears in a publication is recomputed here against the raw data.
 *
 * The reason is uncomfortably concrete: on 20.09. the title of the article said "By June, three
 * were left", while the table two lines below said 34. Each was right on its own and together they
 * were a contradiction the first commenter would have found. Numbers in texts go stale silently;
 * this test turns that into a red run.
 *
 * The strings that are matched stay German: they are quotes from the reports under
 * docs/research/, which this pass does not translate.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * CSV with quotation marks. A `split(",")` is not enough: descriptions and addresses contain
 * commas, and the columns then shift silently. The first draft of this test did exactly that and
 * computed 138 instead of 130, so a wrong number that almost made it into the report.
 */
function splitRow(row: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (inQuotes) {
      if (c === '"') {
        if (row[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { fields.push(field); field = ""; }
    else field += c;
  }
  fields.push(field);
  return fields;
}

function csv(name: string): Record<string, string>[] {
  const text = readFileSync(fileURLToPath(new URL(`../docs/research/data/${name}`, import.meta.url)), "utf8");
  const [head, ...rows] = text.trim().split("\n");
  const fields = head.split(",");
  return rows.map((r) => Object.fromEntries(fields.map((f, i) => [f, splitRow(r)[i] ?? ""])));
}

function text(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../docs/research/${path}`, import.meta.url)), "utf8");
}

describe("the numbers in the x402 demand report match the raw data", () => {
  const rows = csv("2026-09-20-x402-verzeichnis.csv");
  const cdp = rows.filter((r) => r.verzeichnis === "cdp");
  const report = text("2026-09-20-x402-nachfrage.md");
  const num = (s: string) => (s === "" ? null : Number(s));

  it("names the right number of services per directory", () => {
    expect(report).toContain(String(cdp.length).replace(/\B(?=(\d{3})+(?!\d))/g, "."));
    expect(report).toContain(String(rows.filter((r) => r.verzeichnis === "payai").length).replace(/\B(?=(\d{3})+(?!\d))/g, "."));
  });


  it("tells rows apart from distinct services", () => {
    const urls = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!urls.has(r.verzeichnis)) urls.set(r.verzeichnis, new Set());
      urls.get(r.verzeichnis)!.add(r.resource ?? "");
    }
    const c = urls.get("cdp")!;
    const p = urls.get("payai")!;
    const inBoth = [...c].filter((u) => p.has(u)).length;
    expect(inBoth, "983 URLs are in both directories").toBe(983);
    expect(new Set([...c, ...p]).size, "distinct services, not rows").toBe(20543);
    expect(report).toContain("20.543");
    expect(report, "the double counting has to be named").toMatch(/beiden Verzeichnissen/);
  });

  it("names the right number of services with twenty payers or more", () => {
    const n = cdp.filter((r) => (num(r.unique_payers_30d) ?? 0) >= 20).length;
    expect(n, "the core claim of the headline").toBe(130);
    expect(report).toMatch(new RegExp(`\\b${n}\\b`));
    expect(report).toMatch(new RegExp(`${n} zwanzig Kunden oder mehr`));
  });

  it("names the right number of services with exactly one paying wallet", () => {
    const one = cdp.filter((r) => num(r.unique_payers_30d) === 1);
    expect(report).toContain("10.340");
    expect(one.length).toBe(10340);
    const upTo3 = one.filter((r) => (num(r.calls_30d) ?? 0) <= 3).length;
    expect(Math.round((upTo3 / one.length) * 1000) / 10, "89.5 percent of that group").toBe(89.5);
  });

  it("names the right sum of calls and the right concentration", () => {
    const calls = cdp.map((r) => num(r.calls_30d)).filter((c): c is number => c !== null);
    const sum = calls.reduce((a, b) => a + b, 0);
    expect(sum).toBe(490044);
    expect(report).toContain("490.044");
    const top10 = [...calls].sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0);
    expect(Math.round((top10 / sum) * 1000) / 10).toBe(58.8);
    expect(report).toContain("58,8 Prozent");
  });

  it("claims nothing about Conway entries that is not in the data", () => {
    const conway = rows.filter((r) => (r.resource ?? "").toLowerCase().includes("conway")).length;
    expect(conway, "the report says: exactly one").toBe(1);
  });
});

/**
 * The same check for the Conway data set. The monthly table appears in two documents and in the
 * article; if the CSV is ever collected again, the texts have to move with it or turn red.
 */
describe("the Conway numbers match the transfer list", () => {
  const rows = csv("2026-09-19-conway-payto-transfers.csv");
  const report = text("2026-09-19-nachfrage.md");
  const month = (m: string) => rows.filter((r) => (r.timestamp_utc ?? "").startsWith(m));

  it("names the right number of February wallets", () => {
    const feb = new Set(month("2026-02").map((r) => (r.from ?? "").toLowerCase()));
    expect(feb.size).toBe(1582);
    expect(report).toMatch(/1[.,]582/);
  });

  it("names the right total and the right wallet count", () => {
    const sum = rows.reduce((a, r) => a + Number(r.usdc ?? 0), 0);
    expect(Math.round(sum)).toBe(62621);
    expect(new Set(rows.map((r) => (r.from ?? "").toLowerCase())).size).toBe(2492);
    expect(rows.length).toBe(9027);
  });

  it("backs up the cohort claim that stands in the article title", () => {
    const feb = new Set(month("2026-02").map((r) => (r.from ?? "").toLowerCase()));
    const fromJune = new Set(
      rows.filter((r) => (r.timestamp_utc ?? "") >= "2026-06").map((r) => (r.from ?? "").toLowerCase()),
    );
    const inJune = new Set(month("2026-06").map((r) => (r.from ?? "").toLowerCase()));
    expect([...feb].filter((w) => fromJune.has(w)).length, "three paid again from June on").toBe(3);
    expect([...feb].filter((w) => inJune.has(w)).length, "exactly one in June itself: the title").toBe(1);
    expect(inJune.size, "the June row of the table").toBe(34);
  });

  it("backs up the number of one-time payers", () => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const w = (r.from ?? "").toLowerCase();
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    expect([...counts.values()].filter((n) => n === 1).length).toBe(1036);
  });
});
