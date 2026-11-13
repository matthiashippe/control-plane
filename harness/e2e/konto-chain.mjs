#!/usr/bin/env node
/**
 * Konto chain walk (goals/konto/03, point 8): on an anvil chain with chainId 84532 (Base Sepolia) carrying the
 * runtime code of the real Base Sepolia contracts, a secp256k1 address owns a Coinbase Smart Wallet, signs a
 * Spend Permission over ERC-6492 while the wallet is not deployed yet, approveWithSignature deploys the wallet
 * through CoinbaseSmartWalletFactory.createAccount and approves, spend() up to the allowance succeeds and the next
 * spend() aborts with ExceededSpendPermission (selector 0xfd1ebc88).
 *
 * The contract code comes from harness/chain/konto/*.hex (fetched once with eth_getCode from https://sepolia.base.org,
 * listed with address and keccak256 in harness/chain/konto/README.md) and is placed with anvil_setCode. Test USDC at
 * 0x036CbD53842c5426634e7929541eC2318f3dCF7e is the harness USDC mock (chain.mjs setup with CHAIN_ID 84532).
 *
 * All keys are generated at runtime; nothing is read from or written to disk except the code files.
 * Prints exactly one line "KONTO_CHAIN_VERDICT ok" or "KONTO_CHAIN_VERDICT fail <reason>" at the end.
 *
 * Env: RPC_URL (default http://chain-konto:8545), KONTO_DIR (default ./konto next to this file),
 *      USDC_ADDRESS (default Base Sepolia test USDC), KONTO_CHAIN_ALLOWANCE (allowance in USDC units, default 3000000).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  decodeFunctionData,
  encodeFunctionData,
  http,
  isErc6492Signature,
  keccak256,
  parseErc6492Signature,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toCoinbaseSmartAccount } from "viem/account-abstraction";

const CHAIN_ID = 84532;
const RPC_URL = process.env.RPC_URL || "http://chain-konto:8545";
const KONTO_DIR = process.env.KONTO_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "konto");
const USDC = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const SPM = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad";
const VALIDATOR = "0xcfCE48B757601F3f351CB6f434CB0517aEEE293D";
const FACTORY = "0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a";
const IMPLEMENTATION = "0x000100abaad02f1cfC8Bbe32bD5a564817339E72";
const EXCEEDED_SPEND_PERMISSION = "0xfd1ebc88"; // ExceededSpendPermission(uint256,uint256)

// The limit the walk spends up to: 1 USDC, then 2 USDC, then one unit more. The signed allowance is the same
// unless KONTO_CHAIN_ALLOWANCE says otherwise (used only to prove the walk fails when the limit does not hold).
const LIMIT = 3_000_000n;
const ALLOWANCE = BigInt(process.env.KONTO_CHAIN_ALLOWANCE || LIMIT);
const SPENDS = [1_000_000n, 2_000_000n];
const OVER = 1n;
const PERIOD = 86400;

const chain = {
  id: CHAIN_ID,
  name: "harness-base-sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};
const pub = createPublicClient({ chain, transport: http(RPC_URL) });

const spendPermissionComponents = [
  { name: "account", type: "address" },
  { name: "spender", type: "address" },
  { name: "token", type: "address" },
  { name: "allowance", type: "uint160" },
  { name: "period", type: "uint48" },
  { name: "start", type: "uint48" },
  { name: "end", type: "uint48" },
  { name: "salt", type: "uint256" },
  { name: "extraData", type: "bytes" },
];
const SPM_ABI = [
  { type: "function", name: "PUBLIC_ERC6492_VALIDATOR", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function", name: "approveWithSignature", stateMutability: "nonpayable",
    inputs: [{ name: "spendPermission", type: "tuple", components: spendPermissionComponents }, { name: "signature", type: "bytes" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "spend", stateMutability: "nonpayable",
    inputs: [{ name: "spendPermission", type: "tuple", components: spendPermissionComponents }, { name: "value", type: "uint160" }],
    outputs: [],
  },
  {
    type: "function", name: "isValid", stateMutability: "view",
    inputs: [{ name: "spendPermission", type: "tuple", components: spendPermissionComponents }],
    outputs: [{ type: "bool" }],
  },
  { type: "error", name: "ExceededSpendPermission", inputs: [{ name: "value", type: "uint256" }, { name: "allowance", type: "uint256" }] },
];
const FACTORY_ABI = [
  { type: "function", name: "implementation", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function", name: "createAccount", stateMutability: "payable",
    inputs: [{ name: "owners", type: "bytes[]" }, { name: "nonce", type: "uint256" }], outputs: [{ type: "address" }],
  },
];
const WALLET_ABI = [
  { type: "function", name: "isOwnerAddress", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "bool" }] },
];
const USDC_ABI = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
];

class WalkError extends Error {}
const fail = (reason) => { throw new WalkError(reason); };
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

// Rows of harness/chain/konto/README.md: | 0x<address> | <file> | 0x<keccak256> | <block> | <name> |
function readCodeTable() {
  const readme = fs.readFileSync(path.join(KONTO_DIR, "README.md"), "utf8");
  const rows = [...readme.matchAll(/^\| *(0x[0-9a-fA-F]{40}) *\| *([^ |]+) *\| *(0x[0-9a-f]{64}) *\|/gm)].map(
    ([, address, file, hash]) => ({ address, file, hash }),
  );
  for (const needed of [SPM, VALIDATOR, FACTORY, IMPLEMENTATION]) {
    if (!rows.some((r) => same(r.address, needed))) fail(`no code row for ${needed}`);
  }
  return rows;
}

async function placeCode(rows) {
  for (const { address, file, hash } of rows) {
    const code = fs.readFileSync(path.join(KONTO_DIR, file), "utf8").trim();
    if (!/^0x[0-9a-f]+$/i.test(code) || keccak256(code) !== hash) fail(`code file ${file} does not match its keccak256`);
    const set = await rpc("anvil_setCode", [address, code]);
    if (set.error) fail(`anvil_setCode ${address}: ${set.error.message}`);
    const onChain = await pub.getCode({ address });
    if (!onChain || keccak256(onChain) !== hash) fail(`code at ${address} differs from ${file}`);
  }
}

async function fundEth(address) {
  const r = await rpc("anvil_setBalance", [address, "0x8ac7230489e80000"]); // 10 ETH for gas
  if (r.error) fail(`anvil_setBalance: ${r.error.message}`);
}

async function send(wallet, tx) {
  const hash = await wallet.sendTransaction({ ...tx, gas: 3_000_000n });
  return pub.waitForTransactionReceipt({ hash });
}

async function walk() {
  const chainId = await pub.getChainId();
  if (chainId !== CHAIN_ID) fail(`chainId ${chainId}, expected 84532`);

  await placeCode(readCodeTable());
  const usdcCode = await pub.getCode({ address: USDC });
  if (!usdcCode || usdcCode === "0x") fail(`no USDC mock at ${USDC} (run chain.mjs setup first)`);
  const validator = await pub.readContract({ address: SPM, abi: SPM_ABI, functionName: "PUBLIC_ERC6492_VALIDATOR" });
  if (!same(validator, VALIDATOR)) fail(`PUBLIC_ERC6492_VALIDATOR is ${validator}`);
  const implementation = await pub.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "implementation" });
  if (!same(implementation, IMPLEMENTATION)) fail(`factory implementation is ${implementation}`);

  // The owner stands in for the Turnkey wallet: a plain secp256k1 key, made for this walk only.
  const owner = privateKeyToAccount(generatePrivateKey());
  const spender = privateKeyToAccount(generatePrivateKey());
  const relayer = privateKeyToAccount(generatePrivateKey());
  await fundEth(spender.address);
  await fundEth(relayer.address);
  const spenderWallet = createWalletClient({ account: spender, chain, transport: http(RPC_URL) });
  const relayerWallet = createWalletClient({ account: relayer, chain, transport: http(RPC_URL) });

  // SpendPermissionManager must be an owner too: spend() calls execute() on the wallet, which only owners may call.
  const smart = await toCoinbaseSmartAccount({ client: pub, owners: [owner, SPM], ownerIndex: 0, version: "1" });
  const account = smart.address;
  const before = await pub.getCode({ address: account });
  if (before && before !== "0x") fail("smart wallet already has code before approveWithSignature");

  let r = await send(relayerWallet, {
    to: USDC, data: encodeFunctionData({ abi: USDC_ABI, functionName: "mint", args: [account, 10_000_000n] }),
  });
  if (r.status !== "success") fail("mint to the smart wallet reverted");

  const now = Number((await pub.getBlock()).timestamp);
  const permission = {
    account,
    spender: spender.address,
    token: USDC,
    allowance: ALLOWANCE,
    period: PERIOD,
    start: now,
    end: now + 30 * PERIOD,
    salt: BigInt(keccak256(generatePrivateKey())),
    extraData: "0x",
  };
  const signature = await smart.signTypedData({
    domain: { name: "Spend Permission Manager", version: "1", chainId: CHAIN_ID, verifyingContract: SPM },
    types: {
      SpendPermission: spendPermissionComponents,
    },
    primaryType: "SpendPermission",
    message: permission,
  });
  if (!isErc6492Signature(signature)) fail("signature of the undeployed wallet is not ERC-6492");
  const wrapped = parseErc6492Signature(signature);
  if (!same(wrapped.address, FACTORY)) fail(`ERC-6492 factory is ${wrapped.address}`);
  const created = decodeFunctionData({ abi: FACTORY_ABI, data: wrapped.data });
  if (created.functionName !== "createAccount") fail(`ERC-6492 factory call is ${created.functionName}`);

  r = await send(relayerWallet, {
    to: SPM, data: encodeFunctionData({ abi: SPM_ABI, functionName: "approveWithSignature", args: [permission, signature] }),
  });
  if (r.status !== "success") fail("approveWithSignature reverted");
  const after = await pub.getCode({ address: account });
  if (!after || after === "0x") fail("smart wallet has no code after approveWithSignature");
  for (const who of [owner.address, SPM]) {
    const isOwner = await pub.readContract({ address: account, abi: WALLET_ABI, functionName: "isOwnerAddress", args: [who] });
    if (!isOwner) fail(`isOwnerAddress(${who}) is false`);
  }
  if (!(await pub.readContract({ address: SPM, abi: SPM_ABI, functionName: "isValid", args: [permission] }))) {
    fail("spend permission not valid after approveWithSignature");
  }

  const balance = (a) => pub.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [a] });
  const spenderStart = await balance(spender.address);
  const accountStart = await balance(account);
  for (const value of SPENDS) {
    r = await send(spenderWallet, { to: SPM, data: encodeFunctionData({ abi: SPM_ABI, functionName: "spend", args: [permission, value] }) });
    if (r.status !== "success") fail(`spend(${value}) up to the limit reverted`);
  }
  const spent = SPENDS.reduce((a, b) => a + b, 0n);
  if ((await balance(spender.address)) - spenderStart !== spent) fail("spender balance did not grow by the spent amount");
  if (accountStart - (await balance(account)) !== spent) fail("smart wallet balance did not shrink by the spent amount");

  // One unit over the limit: the call must revert with ExceededSpendPermission, and the mined transaction too.
  const overData = encodeFunctionData({ abi: SPM_ABI, functionName: "spend", args: [permission, OVER] });
  const call = await rpc("eth_call", [{ from: spender.address, to: SPM, data: overData }, "latest"]);
  const revertData = String((call.error && call.error.data) || "");
  if (!call.error) fail("spend over the limit went through in eth_call");
  if (!revertData.startsWith(EXCEEDED_SPEND_PERMISSION)) fail(`spend over the limit reverted with ${revertData.slice(0, 10) || "no data"}`);
  const decoded = decodeErrorResult({ abi: SPM_ABI, data: revertData });
  if (decoded.errorName !== "ExceededSpendPermission" || decoded.args[0] !== spent + OVER || decoded.args[1] !== ALLOWANCE) {
    fail(`unexpected ExceededSpendPermission arguments ${decoded.args}`);
  }
  r = await send(spenderWallet, { to: SPM, data: overData });
  if (r.status !== "reverted") fail("spend over the limit was mined as success");
  if ((await balance(spender.address)) - spenderStart !== spent) fail("spender balance moved after the spend over the limit");

  console.log(`KONTO_CHAIN_RESULT ${JSON.stringify({ chainId, account, owner: owner.address, spent: String(spent), allowance: String(ALLOWANCE), over: revertData.slice(0, 10) })}`);
}

try {
  await walk();
  console.log("KONTO_CHAIN_VERDICT ok");
} catch (err) {
  const reason = err instanceof WalkError ? err.message : `error ${String((err && (err.shortMessage || err.message)) || err).split("\n")[0]}`;
  console.log(`KONTO_CHAIN_VERDICT fail ${reason}`);
  process.exitCode = 1;
}
