/**
 * A remainder that pays for a shorter answer gets one instead of a 402 (abrechnung 08).
 *
 * The runtime at the pin asks for 4096 tokens on every turn and stops after a 402. Before this goal
 * the service reserved the estimated prompt plus the full `max_tokens` and refused when that did not
 * fit, so a wallet whose credit covered the prompt and a few hundred tokens of answer stood still
 * with money left. Now the call goes out with `max_tokens` cut to what the credit carries, as long
 * as that is at least MIN_SHORTENED_TOKENS, and the 402 below that names the number it would carry.
 *
 * The model here costs 13 mc per answer token, so one token is a step the balance can tell apart
 * and the two cases at the edge lie exactly one token apart.
 */
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { openDb, postLedger } from "../src/db.js";
import { MockProvider } from "../src/inference/mock.js";
import { Catalog, costMc, handleChat, MIN_SHORTENED_TOKENS } from "../src/inference/proxy.js";
import { estimateTokens, type ChatRequest, type ChatResponse, type ModelSpec } from "../src/inference/provider.js";

const PRICED: ModelSpec = {
  id: "priced-1",
  provider: "mock",
  inputPerMillion: 10,
  outputPerMillion: 100,
  contextWindow: 128_000,
};

type Sent = ChatRequest & { maxTokens: number; apiKeyId: string };

/** The mock, with a price per token large enough to see one token, and a record of what it was sent. */
class PricedProvider extends MockProvider {
  sent: Sent[] = [];
  /** Reservation and balance of the caller at the moment the provider is asked. */
  seen: Array<{ reservedMc: number; balanceMc: number }> = [];
  constructor(private readonly db: ReturnType<typeof openDb>) {
    super();
  }
  models(): ModelSpec[] {
    return [PRICED];
  }
  async chat(req: Sent): Promise<ChatResponse> {
    this.sent.push({ ...req });
    const row = this.db
      .prepare("SELECT reserved_mc, balance_mc FROM wallets WHERE address = ?")
      .get(req.apiKeyId) as { reserved_mc: number; balance_mc: number };
    this.seen.push({ reservedMc: row.reserved_mc, balanceMc: row.balance_mc });
    return super.chat(req);
  }
}

const MESSAGES = [
  { role: "system" as const, content: "You are an automaton. Keep going while you have credit." },
  { role: "user" as const, content: "What is the next step?" },
];
const PROMPT = estimateTokens(MESSAGES);
const mcFor = (completion: number) => costMc(PRICED, { prompt_tokens: PROMPT, completion_tokens: completion });

function setup() {
  const db = openDb(":memory:");
  const provider = new PricedProvider(db);
  const catalog = new Catalog([provider]);
  /**
   * A wallet holding exactly `balanceMc`. Booked as its starter grant, so the call cannot draw a
   * second one and the balance in the test is the balance the service sees.
   */
  const wallet = (balanceMc: number) => {
    const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
    postLedger(db, { address, kind: "grant", deltaMc: balanceMc, ref: `starter:${address}` });
    return address;
  };
  const state = (address: string) =>
    db.prepare("SELECT reserved_mc, balance_mc FROM wallets WHERE address = ?").get(address) as {
      reserved_mc: number;
      balance_mc: number;
    };
  const inferenceRows = (address: string) =>
    (db.prepare("SELECT count(*) AS n FROM ledger WHERE address = ? AND kind = 'inference'").get(address) as { n: number }).n;
  return { db, provider, catalog, wallet, state, inferenceRows };
}

describe("inference with a remainder (abrechnung 08)", () => {
  it("shortens max_tokens when the balance covers the prompt and 256 tokens", async () => {
    const { db, provider, catalog, wallet, state, inferenceRows } = setup();
    expect(MIN_SHORTENED_TOKENS).toBe(256);
    expect(mcFor(256) - mcFor(255), "one token has to be a visible step").toBeGreaterThan(1);

    const address = wallet(mcFor(256));
    const res = await handleChat(db, catalog, address, { model: "priced-1", messages: MESSAGES, max_completion_tokens: 4096 });
    expect(res.status).toBe(200);
    expect(res.headers?.["X-Max-Tokens-Shortened"]).toBe("256");
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].maxTokens).toBe(256);
    expect(provider.sent[0].max_completion_tokens).toBe(256);
    expect(provider.seen[0].reservedMc).toBe(mcFor(256));
    expect((res.body as ChatResponse).choices[0].finish_reason).toBeTypeOf("string");
    // Charged after `usage` of the answer that arrived, and the reservation is gone again.
    expect(inferenceRows(address)).toBe(1);
    expect(state(address).reserved_mc).toBe(0);
    expect(state(address).balance_mc).toBeGreaterThanOrEqual(0);
    expect(state(address).balance_mc).toBeLessThan(mcFor(256));

    // The other parameter style: the field the request used carries the cut value.
    const other = wallet(mcFor(300));
    const res2 = await handleChat(db, catalog, other, { model: "priced-1", messages: MESSAGES, max_tokens: 4096 });
    expect(res2.status).toBe(200);
    expect(res2.headers?.["X-Max-Tokens-Shortened"]).toBe("300");
    expect(provider.sent[1].maxTokens).toBe(300);
    expect(provider.sent[1].max_tokens).toBe(300);
    expect(provider.sent[1].max_completion_tokens).toBeUndefined();
  });

  it("answers 402 with affordable_max_tokens just below 256 tokens", async () => {
    const { db, provider, catalog, wallet, state, inferenceRows } = setup();
    const balance = mcFor(256) - 1;
    const address = wallet(balance);
    const res = await handleChat(db, catalog, address, { model: "priced-1", messages: MESSAGES, max_completion_tokens: 4096 });
    expect(res.status).toBe(402);
    const body = res.body as { error: string; message: string; details: Record<string, unknown> };
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
    expect(body.message).toContain("Insufficient credits: need ");
    expect(body.details.affordable_max_tokens).toBe(255);
    // The two fields upstream reads still describe the full request.
    expect(body.details.required_cents).toBe(Math.ceil(mcFor(4096) / 1000));
    expect(body.details.current_balance_cents).toBe(Math.floor(balance / 1000));
    expect(body.details.topup_url).toBeTypeOf("string");
    expect(res.headers).toBeUndefined();
    expect(provider.sent).toHaveLength(0);
    expect(state(address)).toEqual({ reserved_mc: 0, balance_mc: balance });
    expect(inferenceRows(address)).toBe(0);

    // The 402 without a way to buy more carries the field as well.
    const closed = wallet(balance);
    const res2 = await handleChat(
      db,
      catalog,
      closed,
      { model: "priced-1", messages: MESSAGES, max_completion_tokens: 4096 },
      { topupsClosed: true },
    );
    expect(res2.status).toBe(402);
    expect((res2.body as { details: Record<string, unknown> }).details.affordable_max_tokens).toBe(255);
    expect(state(closed)).toEqual({ reserved_mc: 0, balance_mc: balance });

    // Not even the prompt covered: the field says 0, never a negative number.
    const empty = wallet(1);
    const res3 = await handleChat(db, catalog, empty, { model: "priced-1", messages: MESSAGES, max_completion_tokens: 4096 });
    expect(res3.status).toBe(402);
    expect((res3.body as { details: Record<string, unknown> }).details.affordable_max_tokens).toBe(0);
    expect(provider.sent).toHaveLength(0);
  });

  it("keeps the full request when the balance covers it", async () => {
    const { db, provider, catalog, wallet, state } = setup();
    const address = wallet(mcFor(4096));
    const res = await handleChat(db, catalog, address, { model: "priced-1", messages: MESSAGES, max_completion_tokens: 4096 });
    expect(res.status).toBe(200);
    expect(res.headers).toBeUndefined();
    expect(provider.sent[0].maxTokens).toBe(4096);
    expect(provider.sent[0].max_completion_tokens).toBe(4096);
    expect(provider.seen[0].reservedMc).toBe(mcFor(4096));
    expect(state(address).reserved_mc).toBe(0);
  });

  it("never reserves more than the balance", async () => {
    const { db, provider, catalog, wallet, state } = setup();
    // Every balance in mc from just below the edge to well above it, so rounding cannot hide in a gap.
    for (let balance = mcFor(250); balance <= mcFor(270); balance++) {
      const address = wallet(balance);
      const before = provider.seen.length;
      const res = await handleChat(db, catalog, address, { model: "priced-1", messages: MESSAGES, max_completion_tokens: 4096 });
      if (res.status === 200) {
        const seen = provider.seen[before];
        expect(seen.reservedMc, `balance ${balance}`).toBeLessThanOrEqual(seen.balanceMc);
        expect(seen.reservedMc, `balance ${balance}`).toBe(mcFor(provider.sent[before].maxTokens));
        // The longest answer the balance pays for, not one token less.
        expect(mcFor(provider.sent[before].maxTokens + 1), `balance ${balance}`).toBeGreaterThan(balance);
      } else {
        expect(res.status, `balance ${balance}`).toBe(402);
        expect(balance, `balance ${balance}`).toBeLessThan(mcFor(MIN_SHORTENED_TOKENS));
        expect(provider.seen.length).toBe(before);
      }
      expect(state(address).reserved_mc, `balance ${balance}`).toBe(0);
      expect(state(address).balance_mc, `balance ${balance}`).toBeGreaterThanOrEqual(0);
    }
    // Both sides of the edge were walked.
    expect(provider.seen.length).toBeGreaterThan(0);
    expect(provider.seen.length).toBeLessThan(mcFor(270) - mcFor(250) + 1);
  });
});
