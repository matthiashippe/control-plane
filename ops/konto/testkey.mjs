// The test key of goals/konto/03 on the code-host: makes it once and prints only its address (loop-constraints.md, rule 10,
// exception Base Sepolia). The key pays the gas on Base Sepolia (84532) and is the spender of every spend permission there; it
// never leaves the file, which only its owner can read.
//
//   node ops/konto/testkey.mjs [file]     default ~/.config/control-plane/konto-sepolia.key
//
// An existing file is never overwritten: then the address of the key in it is printed, and a file that is not mode 0600 or does
// not hold one key is an error that does not show its content.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const file = path.resolve(process.argv[2] ?? path.join(os.homedir(), ".config", "control-plane", "konto-sepolia.key"));

if (existsSync(file)) {
  const mode = statSync(file).mode & 0o777;
  if (mode !== 0o600) {
    console.error(`testkey: ${file} has mode ${mode.toString(8)}, expected 600; nothing changed`);
    process.exit(1);
  }
  const key = readFileSync(file, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error(`testkey: ${file} does not hold one private key; nothing changed`);
    process.exit(1);
  }
  console.log(`testkey: kept ${file}, address ${privateKeyToAccount(key).address}`);
} else {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const key = generatePrivateKey();
  // wx: fails when the file appeared in between, so a key is never overwritten.
  const fd = openSync(file, "wx", 0o600);
  writeSync(fd, key + "\n");
  closeSync(fd);
  console.log(`testkey: wrote ${file} (mode 600), address ${privateKeyToAccount(key).address}`);
}
