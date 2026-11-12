// The real start page as ops/soll.mjs compares it (goals/seite/02). Renders / from createApp with an empty database, without a
// port and without network, as an English browser on https://postyourprice.com, and writes it to a file that ops/soll.mjs can
// load with --source.
//
//   node --import tsx ops/soll-live.mjs --out <file>
//
// The page is reduced by exactly what the SOLL source of seite 01 left out (goals/seite/ANNAHMEN.md), and by nothing else:
// HTML comments, the depth marks /px/*.png, both scripts, <noscript>, the canonical link, and the status line set to "online",
// the normal case the page script would write. Every other difference to the picture is a difference of the page and has to be
// fixed in src/public/index.html, never here. That is why no text of the page appears in this file.
import { writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const at = args.indexOf("--out");
if (at < 0 || !args[at + 1] || args.length !== 2) {
  console.error("usage: node --import tsx ops/soll-live.mjs --out <file>");
  process.exit(1);
}
const out = path.resolve(args[at + 1]);

// Before the import: the page takes its origin from the environment on every request.
process.env.CP_PUBLIC_URL = "https://postyourprice.com";
const { createApp } = await import("../src/app.ts");
const { openDb } = await import("../src/db.ts");

const res = await createApp({ db: openDb(":memory:") }).request("/", {
  headers: { "accept-language": "en-US,en;q=0.9" },
});
if (res.status !== 200) {
  console.error(`soll-live: / answered ${res.status}`);
  process.exit(2);
}
const html = await res.text();

/** Each reduction must find something, so a renamed element shows up as an error instead of a silent difference. */
function reduce(page, name, pattern, replacement = "") {
  const next = page.replace(pattern, replacement);
  if (next === page) {
    console.error(`soll-live: nothing to remove for ${name}`);
    process.exit(2);
  }
  return next;
}

let page = html;
page = reduce(page, "comments", /<!--[\s\S]*?-->/g);
page = reduce(page, "depth marks", /<img\b[^>]*\bsrc="\/px\/[a-z]+\.png"[^>]*>/g);
page = reduce(page, "scripts", /<script\b[^>]*>[\s\S]*?<\/script>/g);
page = reduce(page, "noscript", /<noscript>[\s\S]*?<\/noscript>/g);
page = reduce(page, "canonical link", /<link rel="canonical"[^>]*>/g);
page = reduce(page, "status line", /(<span id="s-health">)[^<]*(<\/span>)/, "$1online$2");

writeFileSync(out, page);
console.log(`soll-live: / rendered, ${html.length} bytes, ${page.length} after reduction, written to ${out}`);
