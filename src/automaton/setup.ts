/**
 * What the control plane writes into the sandbox of a hosted automaton (goals/sandbox/08, decision 5): one setup file in the
 * format of harness/runtime/setup-headless.mjs, which `automaton-start` in the image hands to that script and deletes after.
 *
 * - `conwayApiUrl` and `socialRelayUrl` are the public base of this control plane, so the runtime thinks, pays and writes here.
 * - `creatorAddress` is where the customer gets paid: the smart wallet of a konto account (`konto_accounts`, whose address is
 *   the account itself) or the SIWE address of the account. A keyless account (`key:` handle) has no address that can take a
 *   payment, so it gets the zero address. The runtime at d8f8168 reads `creatorAddress` only as an identity: src/index.ts:221
 *   and :232 (identity and its database), :258 (POST /v1/automatons/register, which wants an EVM address), and the text of its
 *   system prompt (src/agent/system-prompt.ts:591, :810). It never sends money there by itself.
 * - `payTo` is the same address; the runtime has no such field, so `creatorMessage` tells it in plain words.
 * - `genesisPrompt` is the customer's text unchanged.
 * - The heartbeat `check_for_updates` is off, because an update would leave the pin (rule 13); `check_social_inbox` stays on.
 * Nothing here reads the wallet the runtime makes in the sandbox; its address comes from automaton.json later.
 */
import { isKeylessAddress } from "../auth/keyless.js";
import type { Db } from "../db.js";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
/** Where the setup file lies in the sandbox until automaton-start deletes it. */
export const SETUP_PATH = "/root/.automaton-setup.json";

export interface AutomatonSetup {
  name: string;
  genesisPrompt: string;
  creatorAddress: string;
  creatorMessage: string;
  payTo: string;
  conwayApiUrl: string;
  conwayApiKey: string;
  socialRelayUrl: string;
  disableHeartbeats: string[];
}

/** The address payments for the automaton of this account go to, or the zero address when it has none. */
export function payoutAddress(db: Db, address: string): string {
  const a = address.toLowerCase();
  if (db.prepare("SELECT 1 FROM konto_accounts WHERE address = ?").get(a)) return a;
  if (isKeylessAddress(a) || !/^0x[0-9a-f]{40}$/.test(a)) return ZERO_ADDRESS;
  return a;
}

export function creatorMessage(payTo: string): string {
  if (payTo === ZERO_ADDRESS) {
    return (
      "Your creator's account has no wallet address yet, so you do not take payments for now. Never ask anybody to pay " +
      "your own wallet: it must never hold money. Inference and your sandbox are paid from your creator's credits."
    );
  }
  return (
    `Every payment for your work goes to your creator's account: set payTo to ${payTo} in every offer and every payment ` +
    "request. Your own wallet never takes money; never give out its address for a payment. Inference and your sandbox are " +
    "paid from your creator's credits."
  );
}

export function buildSetup(input: { db: Db; address: string; name: string; genesisPrompt: string; apiKey: string; publicUrl: string }): AutomatonSetup {
  const payTo = payoutAddress(input.db, input.address);
  const base = input.publicUrl.replace(/\/+$/, "");
  return {
    name: input.name,
    genesisPrompt: input.genesisPrompt,
    creatorAddress: payTo,
    creatorMessage: creatorMessage(payTo),
    payTo,
    conwayApiUrl: base,
    conwayApiKey: input.apiKey,
    socialRelayUrl: base,
    disableHeartbeats: ["check_for_updates"],
  };
}
