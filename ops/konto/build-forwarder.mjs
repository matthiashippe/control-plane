// Compiles src/konto/contracts/PayoutForwarder.sol with solc (devDependency, fixed version, no network) and writes
// src/konto/forwarder.ts with FORWARDER_BYTECODE and FORWARDER_ABI. The output is committed, because the service runs without
// development packages; test/konto-forwarder.test.ts compiles the source again and fails when the committed constants differ.
//
//   node ops/konto/build-forwarder.mjs           writes src/konto/forwarder.ts
//   node ops/konto/build-forwarder.mjs --check   exit 1 when the committed file is not what the source gives
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SOURCE = path.join(ROOT, "src/konto/contracts/PayoutForwarder.sol");
export const OUTPUT = path.join(ROOT, "src/konto/forwarder.ts");

/**
 * The fixed settings: optimizer on with 200 runs, EVM paris (no PUSH0, so the same code runs on every chain the proxy is on), and
 * no metadata hash appended, so a changed comment does not change the code.
 */
export const SOLC_SETTINGS = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "paris",
  metadata: { bytecodeHash: "none", appendCBOR: false },
  outputSelection: { "*": { PayoutForwarder: ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
};

/** Compiles the source; throws on any compiler error. */
export function compileForwarder(source = readFileSync(SOURCE, "utf8")) {
  const solc = createRequire(import.meta.url)("solc");
  const input = { language: "Solidity", sources: { "PayoutForwarder.sol": { content: source } }, settings: SOLC_SETTINGS };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(`solc: ${errors.map((e) => e.formattedMessage).join("\n")}`);
  const c = out.contracts["PayoutForwarder.sol"].PayoutForwarder;
  return {
    version: solc.version(),
    abi: c.abi,
    bytecode: `0x${c.evm.bytecode.object}`,
    runtime: `0x${c.evm.deployedBytecode.object}`,
    warnings: (out.errors ?? []).filter((e) => e.severity !== "error").map((e) => e.formattedMessage),
  };
}

/** The text of src/konto/forwarder.ts. */
export function forwarderModule(compiled = compileForwarder()) {
  return `/**
 * PayoutForwarder (src/konto/contracts/PayoutForwarder.sol) as the service deploys it, written by ops/konto/build-forwarder.mjs
 * with solc ${compiled.version}. Do not edit by hand: test/konto-forwarder.test.ts compiles the source again and compares.
 */
import type { Hex } from "viem";

/** Creation code; the constructor arguments (account, destination, token, manager, caller) are appended ABI-encoded. */
export const FORWARDER_BYTECODE: Hex =
  "${compiled.bytecode}";

export const FORWARDER_ABI = ${JSON.stringify(compiled.abi, null, 2)} as const;
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = forwarderModule();
  if (process.argv.includes("--check")) {
    if (readFileSync(OUTPUT, "utf8") !== text) {
      console.error("forwarder: src/konto/forwarder.ts is not what the source compiles to; run node ops/konto/build-forwarder.mjs");
      process.exit(1);
    }
    console.log("forwarder: src/konto/forwarder.ts matches the source");
  } else {
    writeFileSync(OUTPUT, text);
    console.log(`forwarder: wrote ${path.relative(ROOT, OUTPUT)}`);
  }
}
