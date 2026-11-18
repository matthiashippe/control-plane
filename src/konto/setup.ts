/**
 * The account of konto 03 as the service starts it (src/index.ts): off without CP_KONTO_CHAIN_ID, a start error for any chain
 * other than 84532 (8453 only with CP_KONTO_MAINNET=1, konto 05), and otherwise the test key from CP_KONTO_KEY_FILE, one transport to CP_KONTO_RPC_URL and the background
 * top-up after each request with an API key.
 */
import { createPublicClient, http, type PublicClient, type Transport } from "viem";
import type { Db } from "../db.js";
import type { KontoDeps } from "../handoff/routes.js";
import { loadKontoKey } from "./chain.js";
import { readKontoConfig } from "./config.js";
import { createKontoChain, topUpIfLow } from "./topup.js";
import { createPayoutChain } from "./payout.js";

export type KontoSetup = KontoDeps & { topUp: (address: string) => void };

export function kontoFromEnv(db: Db, env: Record<string, string | undefined>, transport?: Transport): KontoSetup | null {
  const config = readKontoConfig(env);
  if (!config) return null;
  if (!config.keyFile) throw new Error("CP_KONTO_CHAIN_ID is set, so CP_KONTO_KEY_FILE has to name the file of the test key");
  const account = loadKontoKey(config.keyFile);
  const rpc = transport ?? http(config.rpcUrl);
  const verifyClient = createPublicClient({ chain: config.net.chain, transport: rpc }) as unknown as PublicClient;
  const chain = createKontoChain({ chainId: config.chainId, net: config.net, account, transport: rpc, client: verifyClient });
  return {
    chainId: config.chainId,
    spender: account.address,
    token: config.token,
    verifyClient,
    authProxyId: config.authProxyId,
    topupUsdc: config.topupUsdc,
    // The payout of konto 05: the same key and transport, every transaction through sendKontoTx.
    payoutChain: createPayoutChain({ chainId: config.chainId, net: config.net, account, transport: rpc, token: config.token, client: verifyClient }),
    topUp: (address) => {
      topUpIfLow({ db, chain, net: config.net, topupBelowUsdc: config.topupBelowUsdc, topupUsdc: config.topupUsdc }, address)
        .then((r) => {
          if (r.kind === "booked") console.log(`[konto] topped up ${r.mc} mc from the spend permission, tx ${r.hash}`);
          if (r.kind === "reverted") console.error(`[konto] spend reverted, nothing booked, tx ${r.hash}`);
          if (r.kind === "pending") console.error(`[konto] no receipt yet, spend stays open and is settled on the next request, tx ${r.hash}`);
        })
        .catch((err) => console.error(`[konto] top-up failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`));
    },
  };
}
