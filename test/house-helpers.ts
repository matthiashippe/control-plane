// Shared setup of test/house-job.test.ts and test/house-award.test.ts (goals/kunden/11): an in-memory service with the
// mock provider and accounts that call it with their own key, the way the automaton runtime does.
import { randomBytes } from "node:crypto";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger, type Db } from "../src/db.js";
import { MockProvider, MOCK_MODEL } from "../src/inference/mock.js";
import { Catalog } from "../src/inference/proxy.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { claimStarter, GRANT_MC } from "../src/credits/starter.js";

export const validReport = (path = "/v1/sandboxes", status = 404) =>
  JSON.stringify({ runtime: "d8f8168", calls: [{ method: "POST", path, status }] });

export function houseWorld() {
  const db: Db = openDb(":memory:");
  const app = createApp({ db, catalog: new Catalog([new MockProvider()]) });
  const account = (opts: { keyName?: string; address?: string; spentStarter?: boolean } = {}) => {
    const address = (opts.address ?? privateKeyToAccount(generatePrivateKey()).address).toLowerCase();
    const key = `cnwy_k_${randomBytes(16).toString("hex")}`;
    db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address, hashApiKey(key), key.slice(0, 15), opts.keyName ?? "conway-automaton", new Date().toISOString(),
    );
    if (opts.spentStarter !== false) {
      // Like customer 1: the starter credit taken long ago and spent, balance zero, no second grant.
      claimStarter(db, address);
      postLedger(db, { address, kind: "inference", deltaMc: -GRANT_MC, ref: `spent-starter-${address}` });
    }
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: key },
        body: JSON.stringify(body),
      });
    const get = (path: string) => app.request(path, { headers: { authorization: key } });
    const balance = () =>
      (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
    const rows = (kind: string) =>
      (db.prepare("SELECT count(*) AS n FROM ledger WHERE address = ? AND kind = ?").get(address, kind) as { n: number }).n;
    const chat = () =>
      post("/v1/chat/completions", {
        model: MOCK_MODEL.id,
        messages: [{ role: "user", content: "One useful turn." }],
        max_tokens: 64,
        stream: false,
      });
    const submit = (bountyId: string, body: string) => post("/v1/submissions", { bounty_id: bountyId, body });
    return { address, post, get, balance, rows, chat, submit };
  };
  const count = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  const ledgerRows = () => count("SELECT count(*) AS n FROM ledger");
  const submissionRows = () => count("SELECT count(*) AS n FROM submissions");
  return { db, app, account, count, ledgerRows, submissionRows };
}
