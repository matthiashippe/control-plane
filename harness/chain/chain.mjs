#!/usr/bin/env node
/**
 * Chain tools for the harness.
 *
 *   node chain.mjs setup                  compile MockUSDC and place it at USDC_ADDRESS via anvil_setCode
 *   node chain.mjs fund <address> <usd>   mint test USDC
 *   node chain.mjs balance <address>      print the USDC balance (in USD)
 *
 * Env: RPC_URL (default http://chain:8545), USDC_ADDRESS (default Base mainnet USDC)
 */

import fs from "node:fs";
import solc from "solc";
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.RPC_URL || "http://chain:8545";
const USDC = (process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
// Anvil account 0: pays the gas for mint().
const FUNDER_KEY = process.env.FUNDER_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const chain = {
  id: Number(process.env.CHAIN_ID || 8453),
  name: "harness",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};
const pub = createPublicClient({ chain, transport: http(RPC_URL) });

const ABI = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
];

function compile() {
  const source = fs.readFileSync(new URL("./MockUSDC.sol", import.meta.url), "utf-8");
  const input = {
    language: "Solidity",
    sources: { "MockUSDC.sol": { content: source } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["evm.deployedBytecode.object"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    process.exit(1);
  }
  return "0x" + out.contracts["MockUSDC.sol"].MockUSDC.evm.deployedBytecode.object;
}

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

async function setup() {
  const code = await pub.getCode({ address: USDC });
  if (code && code !== "0x") {
    const name = await pub.readContract({ address: USDC, abi: ABI, functionName: "name" });
    console.log(`USDC mock already in place at ${USDC} (${name})`);
    return;
  }
  const bytecode = compile();
  await rpc("anvil_setCode", [USDC, bytecode]);
  const name = await pub.readContract({ address: USDC, abi: ABI, functionName: "name" });
  console.log(`USDC mock placed at ${USDC} (${name}), chainId ${await pub.getChainId()}`);
}

async function fund(address, usd) {
  const account = privateKeyToAccount(FUNDER_KEY);
  const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
  const hash = await wallet.writeContract({ address: USDC, abi: ABI, functionName: "mint", args: [address, parseUnits(String(usd), 6)] });
  await pub.waitForTransactionReceipt({ hash });
  console.log(`funded ${address} with ${usd} USDC, balance now ${await balance(address)} USDC`);
}

async function balance(address) {
  const raw = await pub.readContract({ address: USDC, abi: ABI, functionName: "balanceOf", args: [address] });
  return formatUnits(raw, 6);
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "setup") await setup();
  else if (cmd === "fund") await fund(args[0], args[1] || "6");
  else if (cmd === "balance") console.log(await balance(args[0]));
  else {
    console.error("usage: chain.mjs setup | fund <address> [usd] | balance <address>");
    process.exit(2);
  }
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
