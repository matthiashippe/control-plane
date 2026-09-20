/**
 * The bounty market against a running instance, without money.
 *
 * The unit tests drive the app in the same process. What they do not prove: that the same rules
 * hold on the deployed build, behind Caddy, over real HTTP, with a key that provisioning really
 * handed out. That is exactly where an outside customer failed on 19.09., whose runtime never
 * formed a thought: locally everything ran.
 *
 * What gets checked is the way up to the till and the till itself. This run gets no further,
 * because posting a bounty costs credits, and credits only come into being through a payment on
 * chain; loop-constraints.md forbids that. The market's most important property can be shown
 * anyway, namely that nothing comes into being without cover.
 *
 *   CP_URL=https://cp.hippe.eu pnpm tsx harness/e2e/markt.ts
 *
 * Creates two throwaway keys in the target database. That costs nothing and is intended.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

const BASE = (process.env.CP_URL || "https://cp.hippe.eu").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";

let failures = 0;
function ok(what: string) {
  console.log(`OK      ${what}`);
}
function failed(what: string, seen: unknown) {
  failures++;
  console.log(`FAILED  ${what}\n        seen: ${JSON.stringify(seen).slice(0, 300)}`);
}

async function provision(name: string): Promise<{ key: string; address: string }> {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonceRes = await fetch(`${BASE}/v1/auth/nonce`, { method: "POST" });
  if (!nonceRes.ok) throw new Error(`nonce: ${nonceRes.status}`);
  const { nonce } = (await nonceRes.json()) as { nonce: string };
  const message = createSiweMessage({
    domain: DOMAIN,
    address: account.address,
    statement: "Sign in to Conway",
    uri: `https://${DOMAIN}`,
    version: "1",
    chainId: 8453,
    nonce,
  });
  const signature = await account.signMessage({ message });
  const verifyRes = await fetch(`${BASE}/v1/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  const verify = (await verifyRes.json()) as Record<string, unknown>;
  if (!verifyRes.ok) throw new Error(`verify: ${verifyRes.status} ${JSON.stringify(verify)}`);
  const token = (verify.access_token ?? verify.accessToken) as string;
  const keyRes = await fetch(`${BASE}/v1/auth/api-keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `harness-markt-${name}` }),
  });
  const keyBody = (await keyRes.json()) as Record<string, unknown>;
  if (!keyRes.ok) throw new Error(`api-keys: ${keyRes.status} ${JSON.stringify(keyBody)}`);
  const key = (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string;
  return { key, address: account.address.toLowerCase() };
}

async function call(path: string, key: string | null, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: key } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* text stays text */
  }
  return { status: res.status, body: body as Record<string, unknown> };
}

async function main(): Promise<number> {
  console.log(`bounty market against ${BASE}\n`);

  const poster = await provision("poster");
  const applicant = await provision("applicant");
  ok(`two wallets provisioned (${poster.address.slice(0, 10)}…, ${applicant.address.slice(0, 10)}…)`);

  const without = await call("/v1/bounties", null);
  without.status === 401 ? ok("/v1/bounties without a key: 401") : failed("/v1/bounties without a key should give 401", without);

  const list = await call("/v1/bounties", poster.key);
  Array.isArray(list.body.bounties)
    ? ok(`/v1/bounties with a key: ${(list.body.bounties as unknown[]).length} open`)
    : failed("/v1/bounties should return a list", list);

  const deadline = new Date(Date.now() + 3_600_000).toISOString();
  const bounty = { brief: "Harness run, never gets posted.", kind: "factual", price_cents: 200, deadline };

  // The core of it: without cover no bounty comes into being. A market that gets this wrong
  // promises money that does not exist.
  const withoutCover = await call("/v1/bounties", poster.key, { method: "POST", body: JSON.stringify(bounty) });
  withoutCover.status === 402 && withoutCover.body.error === "insufficient_balance"
    ? ok("bounty without credits: 402 insufficient_balance, no bounty comes into being")
    : failed("a bounty without credits has to give 402 insufficient_balance", withoutCover);

  const cases: [string, Record<string, unknown>, string][] = [
    ["empty brief", { ...bounty, brief: "   " }, "brief_required"],
    ["price zero", { ...bounty, price_cents: 0 }, "price_out_of_range"],
    ["price too high", { ...bounty, price_cents: 200_000 }, "price_out_of_range"],
    ["deadline in the past", { ...bounty, deadline: new Date(Date.now() - 1000).toISOString() }, "deadline_too_soon"],
    ["deadline too far out", { ...bounty, deadline: new Date(Date.now() + 40 * 864e5).toISOString() }, "deadline_too_far"],
  ];
  for (const [name, body, code] of cases) {
    const res = await call("/v1/bounties", poster.key, { method: "POST", body: JSON.stringify(body) });
    res.status === 400 && res.body.error === code
      ? ok(`${name}: 400 ${code}`)
      : failed(`${name} should give 400 ${code}`, res);
  }

  const unknownBounty = await call("/v1/submissions", applicant.key, {
    method: "POST",
    body: JSON.stringify({ bounty_id: "does-not-exist", body: "x" }),
  });
  unknownBounty.status === 404 ? ok("submission on an unknown bounty: 404") : failed("an unknown bounty should give 404", unknownBounty);

  const award = await call("/v1/bounties/award", poster.key, {
    method: "POST",
    body: JSON.stringify({ bounty_id: "does-not-exist", submission_id: "neither-does-this" }),
  });
  award.status === 404 ? ok("award on an unknown bounty: 404") : failed("an unknown award should give 404", award);

  const withId = await fetch(`${BASE}/v1/bounties/some-id`, { method: "POST" });
  withId.status === 404
    ? ok("a path with an id appended stays 404, so it is not open without a key")
    : failed("a path with an id must not be reachable", { status: withId.status });

  console.log(`\n${failures === 0 ? "MARKT OK" : `MARKT FAIL: ${failures} failures`}`);
  return failures === 0 ? 0 : 1;
}

main().then((c) => process.exit(c), (e) => {
  console.error("MARKT FAIL:", (e as Error).message);
  process.exit(2);
});
