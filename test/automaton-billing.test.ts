/**
 * What a hosted automaton costs (goals/sandbox/08, point 5): exactly the sandbox steps (ledger rows of kind sandbox with ref
 * sandbox:<id>:<step>) and its inference, both on the account the sandbox belongs to; at an empty balance its sandbox stops
 * with stop_reason credit; a delete leaves no reservation (hold_mc 0) and revokes its key (revoked_at).
 */
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MockProvider, MOCK_MODEL } from "../src/inference/mock.js";
import { Catalog } from "../src/inference/proxy.js";
import { closeWorlds, STEP } from "./sandbox-world.js";
import { automatonWorld } from "./automaton-world.js";

afterEach(closeWorlds);

const PROMPT = "Answer one question a day.";

async function setup(balanceMc = 100_000) {
  const w = await automatonWorld();
  const acct = w.account(balanceMc);
  const res = await acct.call("POST", "/v1/automatons", { name: "billed", genesis_prompt: PROMPT });
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  const id = res.json.id as string;
  const sandboxId = res.json.sandbox_id as string;
  const key = w.setupOf(sandboxId)!.conwayApiKey as string;
  const ledger = () =>
    w.db.prepare("SELECT kind, ref, delta_mc FROM ledger WHERE address = ? ORDER BY id").all(acct.address) as {
      kind: string;
      ref: string;
      delta_mc: number;
    }[];
  const consistent = () => {
    const sum = (w.db.prepare("SELECT coalesce(sum(delta_mc), 0) AS s FROM ledger WHERE address = ?").get(acct.address) as { s: number }).s;
    return sum === w.balance(acct.address);
  };
  return { w, acct, id, sandboxId, key, ledger, consistent };
}

describe("billing of a hosted automaton", () => {
  it("books exactly the sandbox steps on the account of the sandbox, with the reservation of a sandbox", async () => {
    const { w, acct, sandboxId, ledger, consistent } = await setup();
    expect(w.row(sandboxId)).toMatchObject({ status: "running", hold_mc: 1000, address: acct.address });
    w.clock.t += 2 * STEP + 60_000;
    await w.service.tick();
    await w.service.tick();
    const rows = ledger().filter((r) => r.kind === "sandbox");
    expect(rows).toEqual([
      { kind: "sandbox", ref: `sandbox:${sandboxId}:0`, delta_mc: -100 },
      { kind: "sandbox", ref: `sandbox:${sandboxId}:1`, delta_mc: -100 },
    ]);
    expect(consistent()).toBe(true);
  });

  it("books its inference with the key automaton:<id> on the same account", async () => {
    const { w, acct, key, ledger, consistent } = await setup();
    const app = createApp({ db: w.db, catalog: new Catalog([new MockProvider()]), rateLimit: null });
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({ model: MOCK_MODEL.id, messages: [{ role: "user", content: "hello" }] }),
    });
    expect(res.status).toBe(200);
    await res.text();
    const inference = ledger().filter((r) => r.kind === "inference");
    expect(inference).toHaveLength(1);
    expect(inference[0].delta_mc).toBeLessThan(0);
    const other = w.db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = 'inference' AND address <> ?").get(acct.address) as { n: number };
    expect(other.n).toBe(0);
    expect(consistent()).toBe(true);
  });

  it("stops at an empty balance with stop_reason credit and gives the reservation back", async () => {
    const { w, acct, id, sandboxId, consistent } = await setup(1250);
    // 1250 mc: the reservation of 1000 mc passes, after two steps of 100 mc the balance holds 1050, ... until under 100.
    for (let i = 0; i < 14; i++) {
      w.clock.t += STEP;
      await w.service.tick();
    }
    expect(w.row(sandboxId)).toMatchObject({ status: "stopped", stop_reason: "credit", hold_mc: 0 });
    expect(w.d.sandboxes()[sandboxId].status).toBe("stopped");
    expect(w.balance(acct.address)).toBeLessThan(100);
    expect(w.balance(acct.address)).toBeGreaterThanOrEqual(0);
    const s = await acct.call("GET", `/v1/automatons/${id}`);
    expect(s.json).toMatchObject({ status: "stopped", reason: "credit" });
    // Started again without credit: 402 with details, nothing started.
    const again = await acct.call("POST", `/v1/automatons/${id}/start`);
    expect(again.status).toBe(402);
    expect(again.json.details).toBeTruthy();
    expect(w.d.sandboxes()[sandboxId].status).toBe("stopped");
    expect(consistent()).toBe(true);
  });

  it("leaves no reservation and no live key after delete", async () => {
    const { w, acct, id, sandboxId, ledger, consistent } = await setup();
    w.clock.t += STEP / 2;
    const del = await acct.call("DELETE", `/v1/automatons/${id}`);
    expect(del.status).toBe(200);
    expect(w.row(sandboxId)).toMatchObject({ status: "deleted", hold_mc: 0 });
    const held = w.db.prepare("SELECT coalesce(sum(hold_mc), 0) AS n FROM sandboxes WHERE address = ?").get(acct.address) as { n: number };
    expect(held.n).toBe(0);
    const key = w.db.prepare("SELECT revoked_at FROM api_keys WHERE name = ?").get(`automaton:${id}`) as { revoked_at: string | null };
    expect(key.revoked_at).not.toBeNull();
    // The half step that ran is one started step, booked once.
    expect(ledger().filter((r) => r.kind === "sandbox")).toEqual([{ kind: "sandbox", ref: `sandbox:${sandboxId}:0`, delta_mc: -100 }]);
    await w.service.tick();
    expect(ledger().filter((r) => r.kind === "sandbox")).toHaveLength(1);
    expect(consistent()).toBe(true);
  });

  it("answers 402 with details and starts nothing when the account cannot hold the reservation", async () => {
    const w = await automatonWorld();
    const acct = w.account(500);
    const res = await acct.call("POST", "/v1/automatons", { name: "poor", genesis_prompt: PROMPT });
    expect(res.status).toBe(402);
    expect(res.json.error).toBe("INSUFFICIENT_CREDITS");
    expect(res.json.details).toMatchObject({ required_cents: 1 });
    expect(Object.keys(w.d.sandboxes())).toHaveLength(0);
    expect(w.db.prepare("SELECT count(*) AS n FROM api_keys WHERE name LIKE 'automaton:%'").get()).toEqual({ n: 0 });
  });
});
