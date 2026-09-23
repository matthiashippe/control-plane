import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { DEFAULT_SIWE_CONFIG } from "../src/auth/siwe.js";

/**
 * The one step in the way in that was written for a human.
 *
 * An agent that arrives through /bounties.json or /llms.txt can read everything else out of JSON:
 * the open jobs, the prices, the fee, the deadlines, the starter credit, the topup tiers. To
 * compete it has to sign a SIWE message, and the domain in that message is `conway.tech` and not
 * this host. llms.txt calls that "the one detail nobody guesses" and then points at a markdown
 * file on GitHub, which is prose. That was the break in the chain.
 *
 * The values are published from siweCfg, the same object verifySiwe compares against. These tests
 * exist to keep those two the same thing: a constant repeated in two files is how a published
 * value and an enforced value drift apart, and the failure would be silent and total, because an
 * agent following the published value would be refused by the enforced one.
 */
describe("the nonce says what has to be signed with it", () => {
  const nonce = async () => {
    const res = await createApp({ db: openDb(":memory:") }).request("/v1/auth/nonce", { method: "POST" });
    return (await res.json()) as Record<string, unknown>;
  };

  it("still carries the nonce, because the runtime reads that and nothing else", async () => {
    expect(typeof (await nonce()).nonce).toBe("string");
  });

  it("publishes exactly the domain the verifier enforces", async () => {
    const body = await nonce();
    expect(body.domain).toBe(DEFAULT_SIWE_CONFIG.domain);
    expect(body.domain, "the detail nobody guesses is the point of this").toBe("conway.tech");
  });

  it("publishes exactly the chain the verifier enforces", async () => {
    const body = await nonce();
    expect(body.chain_id).toBe(DEFAULT_SIWE_CONFIG.chainId);
  });

  // A nonce with no lifetime is a nonce an agent cannot schedule around, and this one expires.
  it("says how long it is good for", async () => {
    expect(await nonce().then((b) => b.expires_in_seconds)).toBe(
      Math.round(DEFAULT_SIWE_CONFIG.nonceTtlMs / 1000),
    );
  });

  it("names the next call, so the chain does not stop here", async () => {
    const body = await nonce();
    expect(String(body.next)).toContain("/v1/auth/verify");
    expect(String(body.next), "and the step after that, which is where the key comes from").toContain(
      "/v1/auth/api-keys",
    );
  });

  // Statement and uri are NOT checked by verifySiwe. Publishing them as requirements would invent
  // one, and an agent that failed to match an invented requirement would have no way to find out.
  it("claims nothing about fields the verifier does not check", async () => {
    const body = await nonce();
    expect(body).not.toHaveProperty("statement");
    expect(body).not.toHaveProperty("uri");
  });
});
