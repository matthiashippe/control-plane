/**
 * What does the facilitator say about our catalogue entry?
 *
 * Until 2026-09-24 nobody asked. `FacilitatorClient.post` returned the parsed body and dropped
 * every header, so the `EXTENSION-RESPONSES` header the specification describes
 * (coinbase/x402, docs/extensions/bazaar.mdx) was thrown away on every verify and every settle.
 * This service settled through PayAI between one and nine times, stayed out of both catalogues,
 * and the sentence explaining why went in the bin each time.
 *
 * This asks `/verify` with a deliberately invalid signature. Nothing moves: verify checks and
 * answers, it does not pay. What matters is not the verdict on the signature, which will be
 * `invalid_exact_evm_signature`, but whether the answer carries a bazaar status, and what it says.
 *
 *   npx tsx ops/bazaar-answer.ts
 *
 * Exit 0 either way: an absent header is a finding too, and it means the facilitator does not
 * process the extension on a failed verify, so the answer has to come from a real settlement.
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

const res = await fetch(`${URL_}/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});
const text = await res.text();
const raw = res.headers.get("extension-responses");
console.log(`  status ${res.status}`);
console.log(`  body   ${text.slice(0, 200)}`);
if (!raw) {
  console.log("  EXTENSION-RESPONSES: absent.");
  console.log("  That is a finding, not a failure: the facilitator does not answer the extension");
  console.log("  on a verify it rejects. The answer has to come from a real settlement, and the");
  console.log("  service now reads it there (src/payments/facilitator.ts).");
} else {
  console.log(`  EXTENSION-RESPONSES: ${raw}`);
  console.log(`  decoded: ${Buffer.from(raw, "base64").toString("utf8")}`);
}
