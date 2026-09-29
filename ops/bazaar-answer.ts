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
 *
 * **Answered on 2026-09-29, and it is the absent one.** The second shot got past the hurdle that
 * stopped the first: PayAI answered `invalid_exact_evm_insufficient_balance`, so the signature
 * verified and only the money was missing. `EXTENSION-RESPONSES` was absent anyway. The
 * facilitator emits it on a payment it accepts and on nothing else, so verify cannot be used to
 * read it, however valid the signature.
 *
 * That closes this route and it no longer matters much, because the question it was built to
 * answer has been answered by the catalogue itself: this service was listed on 2026-09-27 at
 * 22:21:02, off the back of the first foreign settlement, with `hat_bazaar_block = 1` in the
 * day's scan. The declaration is read. What the header would still add is the reason behind
 * `routeTemplate` being ignored, and that costs a settlement.
 *
 * What the tool is still good for: it sends exactly what production sends, so a change to the
 * declaration can be put in front of the facilitator before it goes out, and a rejection at the
 * schema level would show up here as something other than an invalid signature.
 *
 * **And the question behind the header, answered on the catalogue itself, 2026-09-29 11:55 UTC.**
 * The absent header said nothing about whether a verify CATALOGUES; those are two different
 * things, and concluding one from the other was a jump. So it was measured instead: the
 * facilitator's live listing (`GET /discovery/resources`, 9,023 rows, paged) was read before and
 * after a verify carrying `resource: https://postyourprice.com/pay/5` and the current
 * declaration. Before: one row, `.../pay/5/0x3749efe7…`, `lastUpdated 2026-09-27T22:21:02.158Z`.
 * After: the same one row, same timestamp, no new entry.
 *
 * So the catalogue is written on a settled payment and on nothing else, and the address-free
 * route gets its own row the first time somebody pays through it. That is not something the loop
 * can cause; what it can do is make `/pay/{usd}` the route an arriving agent finds first, which
 * `/.well-known/x402`, `/openapi.json` and every template answer now do.
 */
import { buildV1Requirements, buildV1Payload } from "../src/payments/facilitator.js";
import { BAZAAR_EXTENSION } from "../src/payments/bazaar.js";
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
// Since 2026-09-29 the address-free seller, which is the URL the catalogue can key on: the one
// listing we got keyed on a payer's concrete URL despite routeTemplate. See src/payments/bazaar.ts.
const resource = "https://postyourprice.com/pay/5";
// The same body the service sends, `serverExtensions` included. A probe that differs from
// production measures the probe.
const body = JSON.stringify({
  x402Version: 1,
  paymentPayload: buildV1Payload(cfg, auth, ("0x" + "33".repeat(65)) as Hex),
  paymentRequirements: buildV1Requirements(cfg, auth, resource),
  serverExtensions: BAZAAR_EXTENSION,
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
      serverExtensions: BAZAAR_EXTENSION,
    }),
  );
}
