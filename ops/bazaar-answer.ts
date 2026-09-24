/**
 * What does the facilitator say about our catalogue entry?
 *
 * Until 2026-09-24 nobody asked. `FacilitatorClient.post` returned the parsed body and dropped
 * every header, so the `EXTENSION-RESPONSES` header the specification describes
 * (coinbase/x402, docs/extensions/bazaar.mdx) was thrown away on every verify and every settle.
 * This service settled through PayAI between one and nine times, stayed out of both catalogues,
 * and the sentence explaining why went in the bin each time.
 *
 * This asks `/verify`. Nothing moves either way: verify checks and answers, it does not pay.
 *
 * Two shots, because the first one was not enough. With a made-up signature the facilitator
 * answers `invalid_exact_evm_signature` and no header at all, measured 2026-09-24 06:15 UTC. So
 * it does not process the extension on a payment it rejects at the first hurdle.
 *
 * The second shot signs a REAL EIP-3009 authorization with the operator wallet, which holds
 * 0.00 USDC. The signature is valid; only the funds are missing. If the facilitator checks the
 * signature first and the balance second, this gets past the hurdle that stopped the first shot,
 * and it costs nothing. If it then carries the header, the answer arrives without anybody sending
 * five dollars anywhere.
 *
 *   npx tsx ops/bazaar-answer.ts
 *
 * Exit 0 either way: an absent header is a finding too. It would mean the catalogue is only ever
 * written on a settled payment, and then the five USDC are the only way to ask.
 */
import { buildV1Requirements, buildV1Payload } from "../src/payments/facilitator.js";
import type { Hex } from "viem";

const URL_ = process.env.CP_FACILITATOR_URL ?? "https://facilitator.payai.network";
const cfg = {
  url: URL_,
  network: "base",
  payTo: (process.env.CP_PAY_TO ?? "0x914102284463F4F58B1D2f6DB9aC80BFcaA7d614") as Hex,
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Hex,
  maxTimeoutSeconds: 300,
};
const auth = {
  from: ("0x" + "11".repeat(20)) as Hex,
  to: cfg.payTo,
  value: 5_000_000n,
  validAfter: 0n,
  validBefore: 9_999_999_999n,
  nonce: ("0x" + "22".repeat(32)) as Hex,
};
const resource = "https://postyourprice.com/pay/5/0x1111111111111111111111111111111111111111";
const body = JSON.stringify({
  x402Version: 1,
  paymentPayload: buildV1Payload(cfg, auth, ("0x" + "33".repeat(65)) as Hex),
  paymentRequirements: buildV1Requirements(cfg, auth, resource),
});

const req = buildV1Requirements(cfg, auth, resource) as Record<string, unknown>;
const ext = (req.extensions as { bazaar?: Record<string, unknown> })?.bazaar;
console.log(`asking ${URL_}/verify with the block we now publish:`);
console.log(`  discoverable=${ext?.discoverable}  routeTemplate=${ext?.routeTemplate}`);
console.log();

async function ask(label: string, payload: string): Promise<void> {
  const res = await fetch(`${URL_}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  const text = await res.text();
  const raw = res.headers.get("extension-responses");
  console.log(`  ${label}`);
  console.log(`    status ${res.status}  body ${text.slice(0, 160)}`);
  if (raw) {
    console.log(`    EXTENSION-RESPONSES: ${Buffer.from(raw, "base64").toString("utf8")}`);
  } else {
    console.log("    EXTENSION-RESPONSES: absent");
  }
  console.log();
}

await ask("made-up signature", body);

// The real one. Signed by the operator wallet, which is empty; the signature is valid and only
// the funds are missing.
import fs from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
const walletFile = "harness/state/mainnet-wallet.json";
if (!fs.existsSync(walletFile)) {
  console.log("  no operator wallet on this machine, so the second shot is skipped.");
} else {
  const account = privateKeyToAccount(
    (JSON.parse(fs.readFileSync(walletFile, "utf8")) as { privateKey: Hex }).privateKey,
  );
  const now = Math.floor(Date.now() / 1000);
  const realAuth = {
    from: account.address as Hex,
    to: cfg.payTo,
    value: 5_000_000n,
    validAfter: BigInt(now - 60),
    validBefore: BigInt(now + cfg.maxTimeoutSeconds),
    nonce: (`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`) as Hex,
  };
  const sig = await account.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: cfg.usdcAddress },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: realAuth,
  });
  const realResource = `https://postyourprice.com/pay/5/${account.address}`;
  await ask(
    `real signature from ${account.address} (0.00 USDC)`,
    JSON.stringify({
      x402Version: 1,
      paymentPayload: buildV1Payload(cfg, realAuth, sig),
      paymentRequirements: buildV1Requirements(cfg, realAuth, realResource),
    }),
  );
}
