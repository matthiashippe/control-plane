/**
 * The whole cold start, once, against production, with nothing but a private key.
 *
 * Every piece of this is checked on its own: the four calls that mint a key (`docs/api-key.md`),
 * the starter credit, the market, the MCP route. The claim the landing page actually makes is the
 * sequence, and the sequence had never been run end to end by anybody who started with nothing.
 *
 * What it costs: one starter grant, 15 cents from a pool of 500, plus about a cent of real
 * inference. That is why it is not in `ops/check-all.sh` and has to be asked for by hand. Run it
 * before an article goes out, not every cycle.
 *
 * It submits to a throwaway job it posts and cancels itself, never to a real one. A check that
 * changes the market it is checking is not a check, and since 2026-09-21 the open list publishes
 * how many agents are competing, so a stray submission would also be a number about us shown to
 * strangers.
 *
 *   CP_URL=https://cp.hippe.eu pnpm tsx ops/neuling-probe.ts
 *
 * **Its key name is on the list in `ops/db-report.cjs`, and that is not optional.** The first run
 * on 2026-09-21 was not, and `foreign agents` read 1 for an hour when the truth was 0. That is the
 * number the entire plan is measured against. Anything under ops/ that provisions a key adds its
 * name to `OUR_KEY_NAMES` in the same commit that creates it, or it turns the scoreboard into a
 * mirror.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { readFileSync } from "node:fs";

const BASE = (process.env.CP_URL || "https://cp.hippe.eu").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";
let schritt = 0;
let fehler = 0;
const ok = (was: string, wert = "") => console.log(`  ${String(++schritt).padStart(2)}. ok    ${was}${wert ? `  ${wert}` : ""}`);
const bad = (was: string, wert: unknown) => {
  fehler++;
  console.log(`  ${String(++schritt).padStart(2)}. FAIL  ${was}\n        ${JSON.stringify(wert).slice(0, 220)}`);
};

async function json(pfad: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${pfad}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main(): Promise<number> {
  console.log(`The whole cold start against ${BASE}, starting from nothing.\n`);

  // 1. A wallet nobody has ever seen, and a key in four calls. No runtime, no chain transaction.
  const account = privateKeyToAccount(generatePrivateKey());
  ok("a wallet that has never existed before", account.address);

  const { body: nonce } = await json("/v1/auth/nonce", { method: "POST" });
  nonce.nonce ? ok("asked for a nonce") : bad("no nonce", nonce);
  const message = createSiweMessage({
    domain: DOMAIN, address: account.address, statement: "Sign in to Conway",
    uri: `https://${DOMAIN}`, version: "1", chainId: 8453, nonce: nonce.nonce,
  });
  const signature = await account.signMessage({ message });
  const { body: verified } = await json("/v1/auth/verify", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  verified.access_token ? ok("signed in with Ethereum, no chain transaction") : bad("no access token", verified);
  const { body: minted } = await json("/v1/auth/api-keys", {
    method: "POST",
    headers: { authorization: `Bearer ${verified.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "cold-start-probe" }),
  });
  const key = minted.key as string;
  key?.startsWith("cnwy_k_") ? ok("got an API key", key.slice(0, 14) + "…") : bad("no key", minted);

  // 2. Nothing in the balance. This is the state every new agent is in.
  const { body: leer } = await json("/v1/credits/balance", { headers: { authorization: key } });
  leer.balance_cents === 0 ? ok("balance is zero, as a newcomer's is") : bad("expected an empty balance", leer);

  // 3. The market, without a key at all.
  const { body: offen } = await json("/bounties.json");
  Array.isArray(offen.open) ? ok("read the open jobs without a key", `${offen.open.length} open`) : bad("no open list", offen);

  // 4. Think, with no money. The starter credit is taken here, by the first call that cannot pay.
  const { status: denkStatus, body: gedacht } = await json("/v1/chat/completions", {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "In one sentence: why does a market need buyers before sellers?" }],
      max_tokens: 60,
    }),
  });
  denkStatus === 200 ? ok("thought once, paid for by the starter credit") : bad("the first thought was refused", gedacht);
  const { body: danach } = await json("/v1/credits/balance", { headers: { authorization: key } });
  danach.balance_cents > 0 && danach.balance_cents < 15
    ? ok("the grant arrived and the call was charged", `${danach.balance_cents} c left`)
    : bad("balance after thinking looks wrong", danach);

  // 5. Its own job to hand work in to. Never a real one: a check must not change the market.
  const wallet = process.env.OPERATOR_WALLET || "harness/state/mainnet-wallet.json";
  const priv = (JSON.parse(readFileSync(wallet, "utf-8")) as { privateKey: `0x${string}` }).privateKey;
  const buyer = privateKeyToAccount(priv);
  const { body: bn } = await json("/v1/auth/nonce", { method: "POST" });
  const bmsg = createSiweMessage({
    domain: DOMAIN, address: buyer.address, statement: "Sign in to Conway",
    uri: `https://${DOMAIN}`, version: "1", chainId: 8453, nonce: bn.nonce,
  });
  const { body: bv } = await json("/v1/auth/verify", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: bmsg, signature: await buyer.signMessage({ message: bmsg }) }),
  });
  const { body: bk } = await json("/v1/auth/api-keys", {
    method: "POST",
    headers: { authorization: `Bearer ${bv.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "cleanup" }),
  });
  const buyerKey = bk.key as string;
  const { body: job } = await json("/v1/bounties", {
    method: "POST",
    headers: { authorization: buyerKey, "content-type": "application/json" },
    body: JSON.stringify({
      brief: "Throwaway job for the cold-start probe. Cancelled as soon as the probe is done.",
      kind: "factual", price_cents: 1,
      deadline: new Date(Date.now() + 3600e3).toISOString(),
    }),
  });
  job.id ? ok("posted a throwaway job to hand work in to", job.id) : bad("could not post the throwaway job", job);

  try {
    // 6. Compete.
    const { status: einStatus, body: eingereicht } = await json("/v1/submissions", {
      method: "POST",
      headers: { authorization: key, "content-type": "application/json" },
      body: JSON.stringify({ bounty_id: job.id, body: "Cold-start probe: work handed in by an agent that started with nothing." }),
    });
    einStatus === 201 ? ok("submitted") : bad("submission refused", eingereicht);

    // 7. And learn what became of it, which is what keeps an agent competing.
    const { body: meine } = await json("/v1/submissions/mine", { headers: { authorization: key } });
    const zeile = (meine.submissions ?? []).find((s: any) => s.bounty_id === job.id);
    zeile?.outcome === "pending"
      ? ok("read the outcome back", `pending, ${zeile.price_cents_if_won} c if it wins`)
      : bad("no outcome for the submission", meine.submissions);
  } finally {
    const { status } = await json("/v1/bounties/cancel", {
      method: "POST",
      headers: { authorization: buyerKey, "content-type": "application/json" },
      body: JSON.stringify({ id: job.id }),
    });
    status === 200 ? ok("cancelled its own job, the market is as it was") : bad("could not cancel the throwaway job", { status });
  }

  console.log(`\n${fehler === 0 ? "COLD START OK" : `COLD START FAILED: ${fehler}`}`);
  console.log("Cost: one starter grant of 15 c and about a cent of inference.");
  return fehler === 0 ? 0 : 1;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error("COLD START FAILED:", (e as Error).message);
  process.exit(1);
});
