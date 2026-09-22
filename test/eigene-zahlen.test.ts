/**
 * Every number on the landing page that counts us says so.
 *
 * `/terms` makes this a promise in its honesty paragraph: "Nothing on this site counts our own
 * jobs as somebody else's demand, and /v1/status publishes it as paying_wallets, with the part
 * that is not ours broken out, which is the one figure that separates a market from a
 * demonstration." An adversarial read on 2026-09-22 checked the landing page against that
 * sentence and found two places where it did not hold:
 *
 *   B8  the status line read "2 wallets have paid, 8 have spent on thinking", from `automatons`
 *       and `active`. One of those two is ours and all eight are, and neither was marked.
 *   B15 the market strip read "agents competing 3", and /terms says in the same paragraph that
 *       until a stranger arrives that number is a count of us. All three were seeded by
 *       ops/compete.ts.
 *
 * Both now render the split. What this test holds is the part that rots: the page and the
 * endpoint compute the same fact, and the first version of the fix had them doing it from two
 * queries in two files.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { OUR_ADDRESSES, wallets } from "../src/bounties/ours.js";

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db });
  return { db, app, seite: async () => (await app.request("/")).text() };
}

/** A wallet with a key, so `ourAddresses` can classify it by the name on the key. */
function wallet(db: ReturnType<typeof openDb>, keyName: string, address?: string): string {
  const wer = (address ?? privateKeyToAccount(generatePrivateKey()).address).toLowerCase();
  db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(wer, new Date().toISOString());
  const key = `cnwy_k_${Math.random().toString(16).slice(2, 10)}`.padEnd(15, "0");
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    wer, hashApiKey(key + wer), key.slice(0, 15), keyName, new Date().toISOString(),
  );
  return wer;
}

describe("the numbers that count us", () => {
  it("shows the part that is not ours, next to the total, in the status line", async () => {
    const { db, seite } = setup();
    // One wallet of ours and one stranger, both having paid; only ours has thought here.
    const unser = wallet(db, "harness-markt-poster", OUR_ADDRESSES[0]);
    const fremd = wallet(db, "conway-automaton");
    postLedger(db, { address: unser, kind: "topup", deltaMc: 500_000, ref: "t1" });
    postLedger(db, { address: fremd, kind: "topup", deltaMc: 500_000, ref: "t2" });
    postLedger(db, { address: unser, kind: "inference", deltaMc: -100, ref: "i1" });

    const html = await seite();
    expect(html, "two paid, one of them a stranger").toContain("2 paid, 1 from outside");
    expect(html, "one has thought here, and it is ours").toContain("1 thought here, 0 from outside");
    expect(html, "the placeholder has to be replaced").not.toContain("<!--WALLETS-->");
  });

  it("says nobody rather than printing a zero with a label", async () => {
    const { seite } = setup();
    const html = await seite();
    expect(html).toContain("nobody has paid yet");
    expect(html).toContain("nobody has thought here yet");
  });

  it("renders exactly what /v1/status publishes, from the same call", async () => {
    const { db, app, seite } = setup();
    const unser = wallet(db, "harness-markt-applicant", OUR_ADDRESSES[1]);
    const fremd = wallet(db, "conway-automaton");
    for (const a of [unser, fremd]) postLedger(db, { address: a, kind: "topup", deltaMc: 500_000, ref: `t-${a}` });
    postLedger(db, { address: fremd, kind: "inference", deltaMc: -100, ref: "i-fremd" });

    const status = (await (await app.request("/v1/status")).json()) as {
      paying_wallets: { total: number; not_ours: number };
      thinking_wallets: { total: number; not_ours: number };
    };
    const html = await seite();

    // The page and the endpoint are two renderings of one fact. They drifted before, in the same
    // direction both times, because two files each ran their own query.
    expect(status.paying_wallets).toEqual(wallets(db, "topup"));
    expect(status.thinking_wallets).toEqual(wallets(db, "inference"));
    expect(html).toContain(`${status.paying_wallets.total} paid, ${status.paying_wallets.not_ours} from outside`);
    expect(html).toContain(
      `${status.thinking_wallets.total} thought here, ${status.thinking_wallets.not_ours} from outside`,
    );
  });

  it("marks our own agents in the market strip instead of counting them as competition", async () => {
    const { db, app } = setup();
    // A job of ours, entered by an agent of ours: the state the market was actually in.
    const kaeufer = wallet(db, "harness-markt-poster", OUR_ADDRESSES[0]);
    postLedger(db, { address: kaeufer, kind: "topup", deltaMc: 500_000, ref: "t" });
    const key = "cnwy_k_" + "3b".repeat(16);
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      kaeufer, hashApiKey(key), key.slice(0, 15), "harness-markt-poster", new Date().toISOString(),
    );
    const res = await app.request("/v1/bounties", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({
        brief: "FACT SHEET on one page. 90 words maximum. Hand in the sheet and nothing else.",
        kind: "factual",
        price_cents: 150,
        deadline: new Date(Date.now() + 3600e3).toISOString(),
      }),
    });
    const { id } = (await res.json()) as { id: string };
    const agent = wallet(db, "compete", OUR_ADDRESSES[1]);
    db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "sub-1", id, agent, "the work", new Date().toISOString(),
    );

    const html = await (await app.request("/")).text();
    expect(html, "one agent competes and it is ours").toContain("1<small>0 from outside</small>");
  });
});
