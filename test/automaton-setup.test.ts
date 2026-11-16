/**
 * What the control plane writes into the sandbox of a hosted automaton (goals/sandbox/08, point 4): conwayApiUrl and
 * socialRelayUrl on us, creatorAddress and payTo on the account of the customer (the smart wallet of konto_accounts, the
 * SIWE address, or the zero address 0x0000000000000000000000000000000000000000 for a keyless account), the genesisPrompt
 * unchanged, the heartbeat check_for_updates off, and a key of the account named automaton:<id>.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mintKeylessIdentity } from "../src/auth/keyless.js";
import { resolveApiKey } from "../src/auth/siwe.js";
import { ensureWallet, postLedger } from "../src/db.js";
import { closeWorlds } from "./sandbox-world.js";
import { automatonWorld } from "./automaton-world.js";

afterEach(closeWorlds);
const before = process.env.CP_PUBLIC_URL;
beforeAll(() => {
  process.env.CP_PUBLIC_URL = "https://postyourprice.com";
});
afterAll(() => {
  if (before === undefined) delete process.env.CP_PUBLIC_URL;
  else process.env.CP_PUBLIC_URL = before;
});

const ZERO = "0x0000000000000000000000000000000000000000";
// Leading and trailing space, a line break, quotes and a character outside ASCII: nothing of it may change on the way.
const PROMPT = '  Sell one "small" thing a day.\nKeep notes in ~/notes.md, über alles.  ';

describe("the setup file in the sandbox", () => {
  it("points conwayApiUrl and socialRelayUrl at us, keeps the genesisPrompt and turns check_for_updates off", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const res = await acct.call("POST", "/v1/automatons", { name: "seller", genesis_prompt: PROMPT });
    expect(res.status).toBe(201);
    const setup = w.setupOf(res.json.sandbox_id)!;
    expect(setup.conwayApiUrl).toBe("https://postyourprice.com");
    expect(setup.socialRelayUrl).toBe("https://postyourprice.com");
    expect(setup.genesisPrompt).toBe(PROMPT);
    expect(setup.name).toBe("seller");
    expect(setup.disableHeartbeats).toEqual(["check_for_updates"]);
    expect(setup.disableHeartbeats).not.toContain("check_social_inbox");
  });

  it("puts creatorAddress and payTo on the SIWE address of the account", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const res = await acct.call("POST", "/v1/automatons", { name: "seller", genesis_prompt: PROMPT });
    const setup = w.setupOf(res.json.sandbox_id)!;
    expect(setup.creatorAddress).toBe(acct.address);
    expect(setup.payTo).toBe(acct.address);
    expect(setup.creatorMessage).toContain(`payTo to ${acct.address}`);
    expect(setup.creatorMessage).toMatch(/own wallet never takes money/);
  });

  it("puts creatorAddress and payTo on the smart wallet of a konto account in konto_accounts", async () => {
    const w = await automatonWorld();
    const smart = "0x5ca1ab1e000000000000000000000000000000aa";
    ensureWallet(w.db, smart);
    w.db
      .prepare("INSERT INTO konto_accounts (address, chain_id, permission, signature, created_at) VALUES (?, 84532, '{}', '0x', ?)")
      .run(smart, new Date(w.clock.t).toISOString());
    postLedger(w.db, { address: smart, kind: "topup", deltaMc: 100_000, ref: "seed-konto" });
    const key = `cnwy_k_${"cd".repeat(16)}`;
    const { hashApiKey } = await import("../src/auth/siwe.js");
    w.db
      .prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, 'konto', ?)")
      .run(smart, hashApiKey(key), key.slice(0, 15), new Date(w.clock.t).toISOString());
    const res = await w.app.request("/v1/automatons", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({ name: "konto-one", genesis_prompt: PROMPT }),
    });
    expect(res.status).toBe(201);
    const setup = w.setupOf(((await res.json()) as any).sandbox_id)!;
    expect(setup.creatorAddress).toBe(smart);
    expect(setup.payTo).toBe(smart);
  });

  it("gives a keyless account the zero address and says it takes no payments yet", async () => {
    const w = await automatonWorld();
    const { address, key } = mintKeylessIdentity(w.db, "browser", w.clock.t);
    postLedger(w.db, { address, kind: "topup", deltaMc: 100_000, ref: "seed-keyless" });
    const res = await w.app.request("/v1/automatons", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({ name: "keyless-one", genesis_prompt: PROMPT }),
    });
    expect(res.status).toBe(201);
    const setup = w.setupOf(((await res.json()) as any).sandbox_id)!;
    expect(setup.creatorAddress).toBe(ZERO);
    expect(setup.payTo).toBe(ZERO);
    expect(setup.creatorMessage).toMatch(/do not take payments/);
  });

  it("carries a key of the same account named automaton:<id>, and only its hash stays here", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const res = await acct.call("POST", "/v1/automatons", { name: "seller", genesis_prompt: PROMPT });
    const setup = w.setupOf(res.json.sandbox_id)!;
    expect(setup.conwayApiKey).toMatch(/^cnwy_k_[0-9a-f]{32}$/);
    expect(setup.conwayApiKey).not.toBe(acct.key);
    expect(resolveApiKey(w.db, setup.conwayApiKey)).toBe(acct.address);
    const row = w.db.prepare("SELECT name, key_hash FROM api_keys WHERE name = ?").get(`automaton:${res.json.id}`) as any;
    expect(row.key_hash).toMatch(/^[0-9a-f]{64}$/);
    const dump = JSON.stringify(w.db.prepare("SELECT * FROM hosted_automatons").all());
    expect(dump).not.toContain(setup.conwayApiKey);
  });

  it("is uploaded first and then started with automaton-start, which deletes it", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const res = await acct.call("POST", "/v1/automatons", { name: "seller", genesis_prompt: PROMPT });
    const execs = w.calls.filter((c) => c.cmd === "docker" && c.args[0] === "exec").map((c) => c.args[c.args.length - 1]);
    expect(execs[0]).toBe("/root/.automaton-setup.json");
    expect(execs[1]).toBe("AUTOMATON_HOME=/root automaton-start /root/.automaton-setup.json");
    expect(res.json.status).toBe("starting");
  });

  it("no code of the automaton reads the key of the runtime wallet", () => {
    const dir = path.resolve("src/automaton");
    for (const f of fs.readdirSync(dir)) {
      expect(fs.readFileSync(path.join(dir, f), "utf8"), f).not.toMatch(/wallet\.json/);
    }
  });
});
