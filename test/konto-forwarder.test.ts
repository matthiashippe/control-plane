/**
 * goals/konto/05, point 9: the forwarder can only pay its fixed destination. The source compiles without network to exactly the
 * code the service deploys, it has no function but payout, retire, flush and the readers of its fixed values, and its address
 * follows from account and destination.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { concat, encodeAbiParameters, getAddress, keccak256, pad, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
// @ts-expect-error the build script is plain JavaScript without types
import { compileForwarder, SOURCE } from "../ops/konto/build-forwarder.mjs";
import { SEPOLIA_USDC, SPEND_PERMISSION_MANAGER } from "../src/konto/config.js";
import { FORWARDER_ABI, FORWARDER_BYTECODE } from "../src/konto/forwarder.js";
import { DEPLOY_PROXY, forwarderAddress } from "../src/konto/payout.js";

const fresh = () => privateKeyToAccount(generatePrivateKey()).address;
const FIXED = { token: SEPOLIA_USDC as Address, manager: SPEND_PERMISSION_MANAGER as Address, caller: fresh() };

/** The CREATE2 address over the proxy with salt 0, computed here from the definition, not with the code under test. */
function create2(account: Address, destination: Address): Address {
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }],
    [account, destination, FIXED.token, FIXED.manager, FIXED.caller],
  );
  const initHash = keccak256(concat([FORWARDER_BYTECODE, args]));
  const digest = keccak256(concat(["0xff", "0x4e59b44847b379578588920ca78fbf26c0b4956c", pad("0x00", { size: 32 }), initHash]));
  return getAddress(`0x${digest.slice(-40)}`);
}

/** The opcodes of `code`, with the data of every PUSH skipped. */
function opcodes(code: Hex): number[] {
  const bytes = Buffer.from(code.slice(2), "hex");
  const ops: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const op = bytes[i];
    ops.push(op);
    if (op >= 0x60 && op <= 0x7f) i += op - 0x5f;
  }
  return ops;
}

const compiled = compileForwarder() as { abi: { type: string; name?: string; inputs?: { name: string; type: string }[] }[]; bytecode: Hex; runtime: Hex };

describe("PayoutForwarder", () => {
  it("compiles from src/konto/contracts/PayoutForwarder.sol without network to exactly FORWARDER_BYTECODE and FORWARDER_ABI", () => {
    expect(SOURCE).toMatch(/src\/konto\/contracts\/PayoutForwarder\.sol$/);
    expect(readFileSync(SOURCE, "utf8")).toMatch(/contract PayoutForwarder/);
    expect(compiled.bytecode).toBe(FORWARDER_BYTECODE);
    expect(compiled.abi).toEqual(FORWARDER_ABI);
    // The runtime code is part of the creation code, so what the opcode check below reads is what gets deployed.
    expect(FORWARDER_BYTECODE.includes(compiled.runtime.slice(2))).toBe(true);
  });

  it("has exactly the functions account, destination, token, manager, caller, payout, retire and flush, and nothing payable", () => {
    const functions = FORWARDER_ABI.filter((e) => e.type === "function").map((e) => (e as { name: string }).name).sort();
    expect(functions).toEqual(["account", "caller", "destination", "flush", "manager", "payout", "retire", "token"]);
    expect(FORWARDER_ABI.filter((e) => !["function", "constructor"].includes(e.type))).toEqual([]);
    for (const e of FORWARDER_ABI) expect((e as { stateMutability?: string }).stateMutability).not.toBe("payable");
    const views = FORWARDER_ABI.filter((e) => e.type === "function" && (e as { stateMutability: string }).stateMutability === "view");
    expect(views.map((e) => (e as { name: string }).name).sort()).toEqual(["account", "caller", "destination", "manager", "token"]);
  });

  it("has no DELEGATECALL, CALLCODE or SELFDESTRUCT in its runtime code outside PUSH data", () => {
    const ops = opcodes(compiled.runtime);
    expect(ops.length).toBeGreaterThan(100);
    expect(ops).not.toContain(0xf4);
    expect(ops).not.toContain(0xf2);
    expect(ops).not.toContain(0xff);
    // The walk itself finds a planted opcode, and skips the same byte inside PUSH data.
    expect(opcodes("0x6000f4")).toContain(0xf4);
    expect(opcodes("0x61f4ff00")).toEqual([0x61, 0x00]);
  });

  it("puts the forwarder at the CREATE2 address over the proxy with salt 0, another one for another destination or account", () => {
    const account = fresh();
    const destination = fresh();
    expect(DEPLOY_PROXY.toLowerCase()).toBe("0x4e59b44847b379578588920ca78fbf26c0b4956c");
    const at = forwarderAddress(account, destination, FIXED);
    expect(getAddress(at)).toBe(create2(account, destination));
    const otherDestination = forwarderAddress(account, fresh(), FIXED);
    const otherAccount = forwarderAddress(fresh(), destination, FIXED);
    expect(otherDestination).not.toBe(at);
    expect(otherAccount).not.toBe(at);
    expect(forwarderAddress(account, destination, { ...FIXED, caller: fresh() })).not.toBe(at);
    // Lowercase or checksummed in, the same address out.
    expect(forwarderAddress(account.toLowerCase() as Address, destination.toLowerCase() as Address, FIXED)).toBe(at);
  });

  it("takes exactly account, destination, token, manager and caller in its constructor", () => {
    const ctor = FORWARDER_ABI.filter((e) => e.type === "constructor");
    expect(ctor).toHaveLength(1);
    const inputs = (ctor[0] as { inputs: { name: string; type: string }[] }).inputs;
    expect(inputs.map((i) => i.name)).toEqual(["account", "destination", "token", "manager", "caller"]);
    expect(inputs.map((i) => i.type)).toEqual(["address", "address", "address", "address", "address"]);
    expect((ctor[0] as { stateMutability: string }).stateMutability).toBe("nonpayable");
  });

  it("fixes the permission it pays from: payout and retire take the SpendPermission tuple of the manager", () => {
    const payout = FORWARDER_ABI.find((e) => e.type === "function" && (e as { name: string }).name === "payout") as {
      inputs: { name: string; type: string; components?: { name: string; type: string }[] }[];
    };
    expect(payout.inputs.map((i) => i.type)).toEqual(["tuple", "uint160"]);
    expect(payout.inputs[0].components!.map((c) => `${c.name}:${c.type}`)).toEqual([
      "account:address",
      "spender:address",
      "token:address",
      "allowance:uint160",
      "period:uint48",
      "start:uint48",
      "end:uint48",
      "salt:uint256",
      "extraData:bytes",
    ]);
    const retire = FORWARDER_ABI.find((e) => e.type === "function" && (e as { name: string }).name === "retire") as { inputs: { type: string }[] };
    expect(retire.inputs.map((i) => i.type)).toEqual(["tuple"]);
  });
});
