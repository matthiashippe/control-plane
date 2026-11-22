// Bundles the script of the passkey step (src/public/konto-client/main.mjs and flow.mjs, with viem) into
// src/public/konto-client/konto.js, which /h/konto.js serves. The bundle is committed, because the image (harness/cp/Dockerfile)
// builds with tsc only; test/konto-client.test.ts builds it again and fails when the committed file differs.
//
//   node ops/konto/build-client.mjs           writes the bundle
//   node ops/konto/build-client.mjs --check   exit 1 when the committed bundle is not what the sources give
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const BUNDLE = path.join(ROOT, "src/public/konto-client/konto.js");

/** The bundle as text; the same sources give the same bytes. */
export async function bundle() {
  const out = await build({
    entryPoints: [path.join(ROOT, "src/public/konto-client/main.mjs")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    minify: true,
    legalComments: "none",
    charset: "utf8",
    write: false,
    absWorkingDir: ROOT,
    logLevel: "silent",
  });
  return out.outputFiles[0].text;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = await bundle();
  if (process.argv.includes("--check")) {
    const committed = readFileSync(BUNDLE, "utf8");
    if (committed !== text) {
      console.error("konto client: src/public/konto-client/konto.js is not the bundle of its sources; run node ops/konto/build-client.mjs");
      process.exit(1);
    }
  } else {
    writeFileSync(BUNDLE, text);
    console.log(`konto client: wrote ${path.relative(ROOT, BUNDLE)}, ${Buffer.byteLength(text)} bytes`);
  }
}
