/**
 * The account of konto 03 as the service starts it (src/index.ts): off without CP_KONTO_CHAIN_ID, a start error for any chain
 * other than 84532, and otherwise the test key from CP_KONTO_KEY_FILE, one transport to CP_KONTO_RPC_URL and the background
 * top-up after each request with an API key.
 */
import { createPublicClient, http, type PublicClient, type Transport } from "viem";
import { baseSepolia } from "viem/chains";
import type { Db } from "../db.js";
import type { KontoDeps } from "../handoff/routes.js";
import { loadKontoKey } from "./chain.js";
import { readKontoConfig } from "./config.js";
import { createKontoChain, topUpIfLow } from "./topup.js";

export type KontoSetup = KontoDeps & { topUp: (address: string) => void };

export function kontoFromEnv(db: Db, env: Record<string, string | undefined>, transport?: Transport): KontoSetup | null {
  const config = readKontoConfig(env);
  if (!config) return null;
  if (!config.keyFile) throw new Error("CP_KONTO_CHAIN_ID is set, so CP_KONTO_KEY_FILE has to name the file of the test key");
  const account = loadKontoKey(config.keyFile);
  const rpc = transport ?? http(config.rpcUrl);
  const verifyClient = createPublicClient({ chain: baseSepolia, transport: rpc }) as unknown as PublicClient;
  const chain = createKontoChain({ chainId: config.chainId, account, transport: rpc, client: verifyClient });
  return {
    chainId: config.chainId,
    spender: account.address,
    token: config.token,
    verifyClient,
    topUp: (address) => {
      topUpIfLow({ db, chain, topupBelowUsdc: config.topupBelowUsdc, topupUsdc: config.topupUsdc }, address)
        .then((r) => {
          if (r.kind === "booked") console.log(`[konto] topped up ${r.mc} mc from the spend permission, tx ${r.hash}`);
          if (r.kind === "reverted") console.error(`[konto] spend reverted, nothing booked, tx ${r.hash}`);
        })
        .catch((err) => console.error(`[konto] top-up failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`));
    },
  };
}
