// The real error pages /errors/{slug} as ops/soll-errors.mjs compares them (goals/reichweite/01, Punkt 4). Renders each page from
// createApp with an empty database, without a port and without network, on https://automatonhost.com, and writes it to
// <dir>/errors-<slug>.html, which ops/soll-errors.mjs loads with --check --source <dir>.
//
//   node --import tsx ops/soll-live-errors.mjs --out <dir>
//
// The page is reduced by exactly what the SOLL sources leave out, because neither draws anything: the JSON-LD script and the
// canonical link (docs/soll/README.md, Fehlerseiten). Every other difference to the approved pictures is a difference of the page
// and has to be fixed in src/public/error-pages.ts, never here. That is why no text of the pages appears in this file.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const at = args.indexOf("--out");
if (at < 0 || !args[at + 1] || args.length !== 2) {
  console.error("usage: node --import tsx ops/soll-live-errors.mjs --out <dir>");
  process.exit(1);
}
const out = path.resolve(args[at + 1]);
mkdirSync(out, { recursive: true });

// Before the import: the page takes its origin from the environment on every request.
process.env.CP_PUBLIC_URL = "https://automatonhost.com";
const { createApp } = await import("../src/app.ts");
const { openDb } = await import("../src/db.ts");
const { ERROR_PAGES } = await import("../src/public/error-pages.ts");

/** Each reduction must find something, so a renamed element shows up as an error instead of a silent difference. */
function reduce(page, name, pattern) {
  const next = page.replace(pattern, "");
  if (next === page) {
    console.error(`soll-live-errors: nothing to remove for ${name}`);
    process.exit(2);
  }
  return next;
}

const app = createApp({ db: openDb(":memory:") });
for (const { slug } of ERROR_PAGES) {
  const res = await app.request(`/errors/${slug}`, { headers: { "accept-language": "en-US,en;q=0.9" } });
  if (res.status !== 200) {
    console.error(`soll-live-errors: /errors/${slug} answered ${res.status}`);
    process.exit(2);
  }
  const html = await res.text();
  let page = reduce(html, "scripts", /<script\b[^>]*>[\s\S]*?<\/script>/g);
  page = reduce(page, "canonical link", /<link rel="canonical"[^>]*>\n?/g);
  writeFileSync(path.join(out, `errors-${slug}.html`), page);
  console.error(`soll-live-errors: /errors/${slug} rendered, ${html.length} bytes, ${page.length} after reduction`);
}
console.error(`soll-live-errors: written to ${out}`);
