/**
 * goals/konto/05, points 10 and 11: the client of Bridge (src/konto/bridge.ts). Paths, fields and headers as docs/konto/euro.md
 * records them, `fetch` from outside, the key only from the file in CP_BRIDGE_KEY_FILE and never in an error.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRIDGE_URL_DEFAULT, BridgeError, bridgeFromEnv, createBridge, parseIban, type FetchLike } from "../src/konto/bridge.js";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function recorder(answer: (c: Call) => { status: number; json: unknown }) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const c = { url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : undefined };
    calls.push(c);
    const a = answer(c);
    return { status: a.status, ok: a.status >= 200 && a.status < 300, json: async () => a.json };
  };
  return { calls, fetch };
}

const KEY = "fake-bridge";

describe("the Bridge client", () => {
  it("sends Api-Key on every request and an Idempotency-Key on POST only, to the default base URL", async () => {
    const r = recorder((c) =>
      c.url.endsWith("/v0/kyc_links")
        ? { status: 200, json: { id: "kyc_1", customer_id: "cus_1", kyc_link: "https://bridge.example/k", kyc_status: "not_started" } }
        : { status: 200, json: { id: "kyc_1", customer_id: "cus_1", kyc_link: "https://bridge.example/k", kyc_status: "approved" } },
    );
    const bridge = createBridge({ apiKey: KEY, fetch: r.fetch });
    const link = await bridge.createKycLink({ email: "payout-0123456789abcdef@postyourprice.com", idempotencyKey: "kyc-link-a" });
    expect(link).toEqual({ id: "kyc_1", customerId: "cus_1", kycLink: "https://bridge.example/k", kycStatus: "not_started" });
    expect((await bridge.getKycLink("kyc_1")).kycStatus).toBe("approved");
    expect(r.calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST ${BRIDGE_URL_DEFAULT}/v0/kyc_links`, `GET ${BRIDGE_URL_DEFAULT}/v0/kyc_links/kyc_1`]);
    expect(BRIDGE_URL_DEFAULT).toBe("https://api.bridge.xyz");
    expect(r.calls[0].headers).toMatchObject({ "Api-Key": KEY, "Idempotency-Key": "kyc-link-a" });
    expect(r.calls[0].body).toMatchObject({ email: "payout-0123456789abcdef@postyourprice.com", type: "individual" });
    expect(r.calls[1].headers["Api-Key"]).toBe(KEY);
    expect("Idempotency-Key" in r.calls[1].headers).toBe(false);
  });

  it("creates the external account for an IBAN and the payout address for base, usdc, sepa and eur", async () => {
    const r = recorder((c) =>
      c.url.endsWith("/external_accounts")
        ? { status: 201, json: { id: "ext_1", iban: { last_4: "3000" } } }
        : { status: 201, json: { id: "liq_1", address: "0x00000000000000000000000000000000000000aa", state: "active" } },
    );
    const bridge = createBridge({ baseUrl: "https://bridge.test/", apiKey: KEY, fetch: r.fetch });
    const iban = parseIban("DE89 3704 0044 0532 0130 00")!;
    const ext = await bridge.createExternalAccount("cus_1", { iban: iban.iban, country: iban.country, ownerName: "Erika Mustermann", idempotencyKey: "ext-a" });
    expect(ext).toEqual({ id: "ext_1", last4: "3000" });
    expect(r.calls[0].url).toBe("https://bridge.test/v0/customers/cus_1/external_accounts");
    expect(r.calls[0].body).toMatchObject({
      currency: "eur",
      account_type: "iban",
      account_owner_name: "Erika Mustermann",
      iban: { account_number: "DE89370400440532013000", country: "DEU" },
    });
    const liq = await bridge.createLiquidationAddress("cus_1", { externalAccountId: "ext_1", idempotencyKey: "liq-a" });
    expect(liq).toEqual({ id: "liq_1", address: "0x00000000000000000000000000000000000000aa", state: "active" });
    expect(r.calls[1].url).toBe("https://bridge.test/v0/customers/cus_1/liquidation_addresses");
    expect(r.calls[1].body).toEqual({ chain: "base", currency: "usdc", external_account_id: "ext_1", destination_payment_rail: "sepa", destination_currency: "eur" });
    expect(r.calls[1].headers["Idempotency-Key"]).toBe("liq-a");
  });

  it("reads customer and drains", async () => {
    const r = recorder((c) =>
      c.url.endsWith("/drains")
        ? { status: 200, json: { data: [{ id: "drain_1", amount: "10.0", currency: "usdc", state: "payment_processed", deposit_tx_hash: "0xabc" }] } }
        : { status: 200, json: { id: "cus_1", status: "active", endorsements: [{ name: "sepa", status: "approved" }] } },
    );
    const bridge = createBridge({ apiKey: KEY, fetch: r.fetch });
    expect(await bridge.getCustomer("cus_1")).toEqual({ id: "cus_1", status: "active", endorsements: [{ name: "sepa", status: "approved" }] });
    expect(await bridge.drains("cus_1", "liq_1")).toEqual([{ id: "drain_1", amount: "10.0", currency: "usdc", state: "payment_processed", depositTxHash: "0xabc" }]);
    expect(r.calls[1].url).toBe(`${BRIDGE_URL_DEFAULT}/v0/customers/cus_1/liquidation_addresses/liq_1/drains`);
    expect(r.calls.every((c) => c.method === "GET" && !("Idempotency-Key" in c.headers))).toBe(true);
  });

  it("throws BridgeError with path and status for an answer that is not ok, a broken one or no answer, never with the key", async () => {
    for (const fetch of [
      recorder(() => ({ status: 401, json: { code: "unauthorized" } })).fetch,
      recorder(() => ({ status: 200, json: { nothing: true } })).fetch,
      (async () => { throw new Error(`connect failed ${KEY}`); }) as FetchLike,
    ]) {
      const err = await createBridge({ apiKey: KEY, fetch }).getKycLink("kyc_1").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeError);
      expect(String(err)).toContain("/v0/kyc_links/kyc_1");
      expect(String(err)).not.toContain(KEY);
    }
  });

  it("reads the key from CP_BRIDGE_KEY_FILE and is off without it", async () => {
    const r = recorder(() => ({ status: 200, json: { id: "cus_1", status: "active" } }));
    expect(bridgeFromEnv({}, r.fetch)).toBeNull();
    const dir = mkdtempSync(path.join(os.tmpdir(), "bridge-key-"));
    const file = path.join(dir, "k");
    writeFileSync(file, `${KEY}\n`, { mode: 0o600 });
    const bridge = bridgeFromEnv({ CP_BRIDGE_KEY_FILE: file, CP_BRIDGE_URL: "https://bridge.test" }, r.fetch)!;
    await bridge.getCustomer("cus_1");
    expect(r.calls[0]).toMatchObject({ url: "https://bridge.test/v0/customers/cus_1", headers: { "Api-Key": KEY } });
    const missing = (() => { try { bridgeFromEnv({ CP_BRIDGE_KEY_FILE: path.join(dir, "none") }, r.fetch); return null; } catch (e) { return e as Error; } })();
    expect(String(missing)).toMatch(/CP_BRIDGE_KEY_FILE cannot be read/);
  });

  it("accepts an IBAN only with mod 97 equal to 1 and from a SEPA country, and keeps its last four characters", () => {
    expect(parseIban("DE89 3704 0044 0532 0130 00")).toEqual({ iban: "DE89370400440532013000", country: "DEU", last4: "3000" });
    expect(parseIban("de89370400440532013000")?.iban).toBe("DE89370400440532013000");
    // Changed copies of the example IBAN, built here so that no other IBAN stands in the repo: a wrong last digit, a wrong check
    // number, and a country outside SEPA.
    const example = "DE89 3704 0044 0532 0130 00";
    for (const bad of [example.slice(0, -1) + "1", "DE88" + example.slice(4), "DE89", "", "US" + example.slice(2), 42, null]) {
      expect(parseIban(bad)).toBeNull();
    }
  });
});
