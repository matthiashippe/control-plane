/**
 * goals/konto/13, points 1 and 2: POST /h/{code}/payout checks the revoke against the permission the account replaces, then waits
 * for the chain to check the new signature. When the row changes in that wait (a payout run ended the waiting retire, or another
 * setup of the account finished), the revoke no longer belongs to the permission finishPayout would retire: nothing is stored,
 * the handoff burns and the answer is 410. Unchanged, the revoke stays with the permission it was signed for.
 *
 * The row changes through a hook of the verifyClient before its first eth_call, the one call of the signature check.
 */
import { describe, expect, it } from "vitest";
import { createPublicClient, custom, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { permissionJson } from "../src/konto/account.js";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import { readPayout } from "../src/konto/payout.js";
import { account, json, moneySetup, payoutPermission, stateOf, toPasskey, type MoneySetup } from "./money-helpers.js";

/** moneySetup whose verifyClient runs `hook.before` once, right before the first eth_call, then answers as the wallet chain. */
function racedSetup() {
  const hook: { before: (() => void) | null } = { before: null };
  const inner: { client: PublicClient | null } = { client: null };
  const verifyClient = createPublicClient({
    chain: baseSepolia,
    transport: custom(
      {
        async request(args: { method: string; params?: unknown[] }) {
          if (args.method === "eth_call" && hook.before) {
            const before = hook.before;
            hook.before = null;
            before();
          }
          return inner.client!.request(args as never);
        },
      },
      { retryCount: 0 },
    ),
  }) as unknown as PublicClient;
  const s = moneySetup({ konto: { verifyClient } });
  inner.client = s.verify.client;
  return { s, hook };
}

const fullRow = (s: MoneySetup, address: string) => s.db.prepare("SELECT * FROM konto_payouts WHERE address = ?").get(address.toLowerCase());
const pendingBank = (s: MoneySetup, code: string) => s.db.prepare("SELECT code FROM payout_handoffs WHERE code = ?").get(code);

/**
 * An account with two payout setups: the first permission P1 waits as `retire_*` with the revoke of the second handoff, the
 * second P2 is the permission. Then a third handoff whose page shows the revoke of P1, and its body signed for exactly that.
 */
async function twoSetupsAndAThird(s: MoneySetup) {
  const a = await account(s);
  const first = await toPasskey(s, a);
  expect((await json(s, `/h/${first.h.code}/payout`, await payoutPermission(a.owner, a.address, first.spender))).status).toBe(200);
  const p1 = readPayout(s.db, a.address)!.permission!;
  const second = await toPasskey(s, a);
  expect((await json(s, `/h/${second.h.code}/payout`, await payoutPermission(a.owner, a.address, second.spender, { salt: 100n }))).status).toBe(200);
  const afterSecond = readPayout(s.db, a.address)!;
  expect(afterSecond.retire_permission).toBe(p1);
  expect(afterSecond.retire_revoke).not.toBeNull();
  const p2 = afterSecond.permission!;
  const third = await toPasskey(s, a);
  const body = (await payoutPermission(a.owner, a.address, third.spender, { salt: 101n })) as { revoke?: { nonce: string; signature: Hex } };
  expect(body.revoke).toBeDefined();
  return { a, p1, p2, third, body };
}

describe("the revoke ends only the permission the person replaces", () => {
  it("refuses the setup when a payout run ends the waiting retire while the signature is checked", async () => {
    const { s, hook } = racedSetup();
    const { a, p2, third, body } = await twoSetupsAndAThird(s);
    const sent = s.node.sent.length;
    let left: unknown = null;
    hook.before = () => {
      // As sendPayout does once the retire went through: retire_forwarder, retire_permission and retire_revoke back to NULL.
      s.db.prepare("UPDATE konto_payouts SET retire_forwarder = NULL, retire_permission = NULL, retire_revoke = NULL WHERE address = ?").run(a.address);
      left = fullRow(s, a.address);
    };
    const res = await json(s, `/h/${third.h.code}/payout`, body);
    expect(hook.before).toBeNull();
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: "handoff_closed" });
    expect(fullRow(s, a.address)).toEqual(left);
    const row = readPayout(s.db, a.address)!;
    expect(row.permission).toBe(p2);
    expect([row.retire_forwarder, row.retire_permission, row.retire_revoke]).toEqual([null, null, null]);
    expect(stateOf(s, third.h.code)).toBe("burned");
    expect(pendingBank(s, third.h.code)).toEqual({ code: third.h.code });
    expect(s.node.sent).toHaveLength(sent);
  });

  it("refuses the first setup when another setup of the account finishes while the signature is checked", async () => {
    const { s, hook } = racedSetup();
    const a = await account(s);
    const first = await toPasskey(s, a);
    const body = (await payoutPermission(a.owner, a.address, first.spender)) as { revoke?: unknown };
    expect(body.revoke).toBeUndefined();
    const sent = s.node.sent.length;
    const other = {
      account: a.address,
      spender: privateKeyToAccount(generatePrivateKey()).address.toLowerCase() as Hex,
      token: SEPOLIA_USDC as Hex,
      allowance: 2n ** 160n - 1n,
      period: 2_592_000,
      start: 0,
      end: 2 ** 48 - 1,
      salt: 55n,
      extraData: "0x" as Hex,
    };
    let left: unknown = null;
    hook.before = () => {
      // As finishPayout of a second handoff of the same account writes its permission into the row.
      s.db.prepare("UPDATE konto_payouts SET forwarder = ?, permission = ?, signature = ? WHERE address = ?").run(other.spender, permissionJson(other), "0x01", a.address);
      left = fullRow(s, a.address);
    };
    const res = await json(s, `/h/${first.h.code}/payout`, body);
    expect(hook.before).toBeNull();
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: "handoff_closed" });
    expect(fullRow(s, a.address)).toEqual(left);
    const row = readPayout(s.db, a.address)!;
    expect(row.permission).toBe(permissionJson(other));
    expect([row.retire_forwarder, row.retire_permission, row.retire_revoke]).toEqual([null, null, null]);
    expect(stateOf(s, first.h.code)).toBe("burned");
    expect(pendingBank(s, first.h.code)).toEqual({ code: first.h.code });
    expect(s.node.sent).toHaveLength(sent);
  });

  it("keeps the revoke the person signed with the permission it was signed for when nothing changed", async () => {
    const { s, hook } = racedSetup();
    const { a, p1, third, body } = await twoSetupsAndAThird(s);
    let checked = false;
    hook.before = () => {
      checked = true;
    };
    const res = await json(s, `/h/${third.h.code}/payout`, body);
    expect(checked).toBe(true);
    expect(res.status).toBe(200);
    const row = readPayout(s.db, a.address)!;
    expect(row.retire_permission).toBe(p1);
    expect(JSON.parse(row.retire_revoke!)).toEqual(body.revoke);
    expect(stateOf(s, third.h.code)).toBe("done");
    expect(pendingBank(s, third.h.code)).toBeUndefined();
  });
});
