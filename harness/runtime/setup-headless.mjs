#!/usr/bin/env node
/**
 * Headless-Erstlauf gegen das unveränderte Upstream-dist: schreibt automaton.json, heartbeat.yml,
 * SOUL.md und Default-Skills, wie es der interaktive Wizard (`--setup`) täte, gesteuert durch eine
 * JSON-Datei. Kein Patch an der Runtime, nur ihre exportierten Funktionen.
 *
 *   node setup-headless.mjs /setup.json
 *
 * setup.json: name, genesisPrompt, creatorAddress, conwayApiUrl, optional conwayApiKey
 * (leer = Provisionierung folgt per `--provision`), socialRelayUrl ("" schaltet den Relay ab),
 * inferenceModel, treasuryPolicy, disableHeartbeats.
 */

import fs from "node:fs";
import path from "node:path";

const dist = "/opt/automaton/dist";
const { getWallet, getAutomatonDir } = await import(path.join(dist, "identity", "wallet.js"));
const { createConfig, saveConfig, getConfigPath } = await import(path.join(dist, "config.js"));
const { writeDefaultHeartbeatConfig, loadHeartbeatConfig, saveHeartbeatConfig } = await import(
  path.join(dist, "heartbeat", "config.js")
);
const { generateSoulMd, installDefaultSkills } = await import(path.join(dist, "setup", "defaults.js"));
const { DEFAULT_TREASURY_POLICY } = await import(path.join(dist, "types.js"));

const setupPath = process.argv[2];
if (!setupPath) {
  console.error("usage: setup-headless.mjs <setup.json>");
  process.exit(2);
}
const setup = JSON.parse(fs.readFileSync(setupPath, "utf-8"));

if (fs.existsSync(getConfigPath())) {
  console.error(`refusing: ${getConfigPath()} already exists`);
  process.exit(1);
}

const name = String(setup.name || "").trim();
const genesisPrompt = String(setup.genesisPrompt || "").trim();
const creatorAddress = String(setup.creatorAddress || "").trim();
const apiKey = String(setup.conwayApiKey || "").trim();
const problems = [];
if (!name) problems.push("name is required");
if (!genesisPrompt) problems.push("genesisPrompt is required");
if (!/^0x[0-9a-fA-F]{40}$/.test(creatorAddress)) problems.push("creatorAddress must be a 0x address");
if (!setup.conwayApiUrl) problems.push("conwayApiUrl is required");
if (problems.length) {
  for (const p of problems) console.error(`setup.json: ${p}`);
  process.exit(1);
}

const { chainIdentity, isNew } = await getWallet("evm");
const walletAddress = chainIdentity.address;
console.log(`${isNew ? "wallet created" : "wallet loaded"}: ${walletAddress}`);

const automatonDir = getAutomatonDir();
fs.mkdirSync(automatonDir, { recursive: true, mode: 0o700 });
if (apiKey) {
  fs.writeFileSync(
    path.join(automatonDir, "config.json"),
    JSON.stringify({ apiKey, walletAddress, provisionedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
}

const treasuryPolicy = { ...DEFAULT_TREASURY_POLICY, ...(setup.treasuryPolicy || {}) };
const config = createConfig({
  name,
  genesisPrompt,
  creatorMessage: setup.creatorMessage,
  creatorAddress,
  registeredWithConway: false,
  sandboxId: "",
  walletAddress,
  apiKey,
  treasuryPolicy,
  chainType: "evm",
});
config.conwayApiUrl = setup.conwayApiUrl;
if (setup.socialRelayUrl !== undefined) config.socialRelayUrl = setup.socialRelayUrl;
if (setup.inferenceModel) config.inferenceModel = setup.inferenceModel;
saveConfig(config);
console.log(`automaton.json written (${getConfigPath()}, api: ${config.conwayApiUrl})`);

writeDefaultHeartbeatConfig();
const disable = new Set(setup.disableHeartbeats || []);
if (disable.size) {
  const hb = loadHeartbeatConfig();
  for (const entry of hb.entries) {
    if (disable.has(entry.name)) entry.enabled = false;
  }
  saveHeartbeatConfig(hb);
}
console.log(`heartbeat.yml written${disable.size ? ` (disabled: ${[...disable].join(", ")})` : ""}`);

const constitutionSrc = "/opt/automaton/constitution.md";
if (fs.existsSync(constitutionSrc)) {
  const dst = path.join(automatonDir, "constitution.md");
  if (fs.existsSync(dst)) fs.rmSync(dst, { force: true });
  fs.copyFileSync(constitutionSrc, dst);
  fs.chmodSync(dst, 0o444);
}
fs.writeFileSync(
  path.join(automatonDir, "SOUL.md"),
  generateSoulMd(name, walletAddress, creatorAddress, genesisPrompt),
  { mode: 0o600 },
);
installDefaultSkills(config.skillsDir || "~/.automaton/skills");
console.log(`automaton "${name}" configured, wallet ${walletAddress}`);
