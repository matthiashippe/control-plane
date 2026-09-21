/**
 * The documented way to a key has to stay the real way to a key.
 *
 * `docs/api-key.md` exists because of one measured moment: on 2026-09-20 at 22:30 UTC a stranger
 * fetched `/bounties.json` with curl, read two open jobs, and left. Everything past that list
 * needs a key, and the only door we had written down was "install the Conway runtime and run
 * automaton --provision". The door without a runtime was always open, nobody had drawn it.
 *
 * A page like that is worth exactly as much as its accuracy, and it is dangerous below that: it
 * sends people to sign against `conway.tech` rather than this host, which is right today and
 * impossible to guess, so a reader has no way to tell a correct instruction from a stale one.
 * The first draft already got two things wrong (the key field is `key`, not `apiKey`, and a
 * `Bearer` prefix is accepted), both caught by running it rather than reading it.
 *
 * So the page is pinned here: the constants against the server's own configuration, the field
 * names against a real provisioning, and the links against the two places a stranger stands.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { DEFAULT_SIWE_CONFIG } from "../src/auth/siwe.js";

const DOC = readFileSync(new URL("../docs/api-key.md", import.meta.url), "utf-8");
const DOC_URL = "https://github.com/matthiashippe/control-plane/blob/main/docs/api-key.md";

describe("docs/api-key.md", () => {
  it("names the domain and chain the server actually demands", () => {
    expect(DOC).toContain(`\`${DEFAULT_SIWE_CONFIG.domain}\``);
    expect(DOC).toContain(String(DEFAULT_SIWE_CONFIG.chainId));
    // The whole point of the page. If the server ever stops expecting the protocol's domain, the
    // sentence explaining why it is not this host becomes a lie that costs a reader an afternoon.
    expect(DEFAULT_SIWE_CONFIG.domain).toBe("conway.tech");
    expect(DOC).toContain("not `cp.hippe.eu`");
  });

  it("states the nonce lifetime the server enforces", () => {
    const minutes = DEFAULT_SIWE_CONFIG.nonceTtlMs / 60_000;
    expect(minutes).toBe(10);
    expect(DOC).toContain("ten minutes");
  });

  it("walks a fresh address through the four documented calls and hands back the documented field", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const account = privateKeyToAccount(generatePrivateKey());

    const { nonce } = (await (await app.request("/v1/auth/nonce", { method: "POST" })).json()) as { nonce: string };
    // Exactly the fields the page prints, including the two it calls optional.
    const message = createSiweMessage({
      domain: "conway.tech",
      address: account.address,
      statement: "Sign in to Conway",
      uri: "https://conway.tech",
      version: "1",
      chainId: 8453,
      nonce,
    });
    const signature = await account.signMessage({ message });

    const verified = await app.request("/v1/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(verified.status).toBe(200);
    const token = (await verified.json()) as Record<string, unknown>;
    expect(Object.keys(token), "the page prints access_token").toContain("access_token");

    const minted = await app.request("/v1/auth/api-keys", {
      method: "POST",
      headers: { authorization: `Bearer ${token.access_token as string}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "my-agent" }),
    });
    expect(minted.status).toBe(200);
    const body = (await minted.json()) as { key?: string; key_prefix?: string };
    // The first draft of the page said `apiKey` and its script would have printed undefined.
    expect(Object.keys(body)).toEqual(expect.arrayContaining(["key", "key_prefix"]));
    expect(body.key).toMatch(/^cnwy_k_/);
    expect(DOC).toContain('{"key":"cnwy_k_…","key_prefix"');

    // And the key opens the door it is documented to open, bare and with a Bearer prefix.
    for (const header of [body.key!, `Bearer ${body.key!}`]) {
      const res = await app.request("/v1/credits/balance", { headers: { authorization: header } });
      expect(res.status, `Authorization: ${header.slice(0, 12)}…`).toBe(200);
    }
  });

  it("is reachable from the two places somebody stands when they need a key", async () => {
    const app = createApp({ db: openDb(":memory:") });

    const bounties = (await (await app.request("/bounties.json")).json()) as { note: string };
    expect(bounties.note, "the open job list is where the one real stranger stopped").toContain(DOC_URL);

    const llms = await (await app.request("/llms.txt")).text();
    expect(llms).toContain(DOC_URL);

    const status = (await (await app.request("/v1/status")).json()) as Record<string, unknown>;
    expect(JSON.stringify(status)).toContain(DOC_URL);
  });
});
