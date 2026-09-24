import { describe, expect, it, vi } from "vitest";
import { FacilitatorSettler } from "../src/payments/facilitator.js";

/**
 * The header that says whether the catalogue took us, and which nobody read.
 *
 * coinbase/x402, docs/extensions/bazaar.mdx: a facilitator may answer a payment carrying the
 * bazaar extension with `EXTENSION-RESPONSES`, base64 JSON whose `bazaar` key holds `status` of
 * `success`, `processing` or `rejected`, and on a rejection a `rejectedReason` in plain words.
 *
 * Between 20.09. and 24.09.2026 this service settled through PayAI between one and nine times,
 * stayed out of the catalogue, and threw that sentence away on every single call, because `post`
 * returned the parsed body and dropped the headers. Four cycles were spent guessing at the
 * catalogue from the outside instead of reading the answer it had already given.
 */
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64");

const AUTH = {
  from: ("0x" + "11".repeat(20)) as `0x${string}`,
  to: ("0x" + "22".repeat(20)) as `0x${string}`,
  value: 5_000_000n,
  validAfter: 0n,
  validBefore: 9_999_999_999n,
  nonce: ("0x" + "33".repeat(32)) as `0x${string}`,
};

function settlerWith(headers: Record<string, string>, body: unknown) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers }));
  return new FacilitatorSettler({
    url: "https://facilitator.invalid",
    network: "base",
    payTo: ("0x" + "22".repeat(20)) as `0x${string}`,
    usdcAddress: ("0x" + "44".repeat(20)) as `0x${string}`,
    maxTimeoutSeconds: 300,
    fetch: fetchImpl as never,
  });
}

describe("what the facilitator says about the catalogue entry", () => {
  it("reads a rejection and names the reason", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const s = settlerWith(
      { "EXTENSION-RESPONSES": b64({ bazaar: { status: "rejected", rejectedReason: "info failed schema validation" } }) },
      { success: true, transaction: "0x" + "ab".repeat(32) },
    );
    await s.settle(AUTH, ("0x" + "cd".repeat(65)) as `0x${string}`, "/pay");
    expect(log.mock.calls.flat().join(" ")).toMatch(/bazaar -> rejected: info failed schema validation/);
    log.mockRestore();
  });

  it("reads a success", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const s = settlerWith(
      { "extension-responses": b64({ bazaar: { status: "success" } }) },
      { success: true, transaction: "0x" + "ab".repeat(32) },
    );
    await s.settle(AUTH, ("0x" + "cd".repeat(65)) as `0x${string}`, "/pay");
    expect(log.mock.calls.flat().join(" ")).toMatch(/bazaar -> success/);
    log.mockRestore();
  });

  it("says nothing when the header is absent, rather than inventing a status", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const s = settlerWith({}, { success: true, transaction: "0x" + "ab".repeat(32) });
    await s.settle(AUTH, ("0x" + "cd".repeat(65)) as `0x${string}`, "/pay");
    expect(log.mock.calls.flat().join(" ")).not.toMatch(/bazaar ->/);
    log.mockRestore();
  });

  // A payment that went through went through, whatever a directory thinks of it.
  it("never fails a call over an unreadable header", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const s = settlerWith({ "EXTENSION-RESPONSES": "not base64 json at all" }, {
      success: true,
      transaction: "0x" + "ab".repeat(32),
    });
    const res = await s.settle(AUTH, ("0x" + "cd".repeat(65)) as `0x${string}`, "/pay");
    expect(res).toBeDefined();
    expect(log.mock.calls.flat().join(" ")).toMatch(/not readable/);
    log.mockRestore();
  });
});
