/**
 * The daily limit of an account (goals/konto/04, docs/konto/terminal.md "Tageslimit").
 *
 * The limit a person signed on the phone is the allowance of the spend permission. With the API key alone an account can only go
 * lower: `POST /v1/konto/limit` stores a cap (`konto_accounts.cap_usdc`) that topUpIfLow keeps on top of the rest of the period.
 * Going higher needs the phone: a handoff with `step: "limit"` brings a new permission signed with the same passkey, which
 * replaces the old one before the next spend() (src/konto/topup.ts). A prompt injection in the terminal holds the API key at
 * most, so it can lower the limit and never raise it.
 *
 * One decision with a fixed name, because the counter-test of the goal replaces exactly it and expects the tests to fail:
 * - isLowering: may this limit be set with the API key alone?
 */
import type { Context, Env, Hono } from "hono";
import type { Db } from "../db.js";
import { permissionFromJson, permissionJson } from "./account.js";
import type { SpendPermission } from "./permission.js";
import type { Hex } from "viem";

const CONTRACT = "https://github.com/matthiashippe/control-plane/blob/dev/docs/konto/terminal.md";

/**
 * True when `wanted` is not above the limit the person signed on the phone. Then the API key may set it; anything above needs a
 * new permission signed on the phone.
 */
export function isLowering(wanted: bigint, signed: bigint): boolean {
  return wanted <= signed;
}

export interface AccountLimit {
  account: string;
  /** The limit signed on the phone: the newest permission, also one that waits to replace the current one. */
  signed: bigint;
  /** A lower limit set with the API key; null when none is set. */
  cap: bigint | null;
  /** What may be spent per day: the lower of the two. */
  effective: bigint;
}

interface LimitRow {
  permission: string;
  next_permission: string | null;
  cap_usdc: string | null;
}

/** The limit of an account, or null when the address has no account of konto 03. */
export function readAccountLimit(db: Db, address: string): AccountLimit | null {
  const account = address.toLowerCase();
  const row = db.prepare("SELECT permission, next_permission, cap_usdc FROM konto_accounts WHERE address = ?").get(account) as LimitRow | undefined;
  if (!row) return null;
  const signed = permissionFromJson(row.next_permission ?? row.permission).allowance;
  const cap = row.cap_usdc === null ? null : BigInt(row.cap_usdc);
  return { account, signed, cap, effective: cap !== null && cap < signed ? cap : signed };
}

/** The daily limit topUpIfLow may use for `permission`: its allowance, or the cap when that is lower. */
export function spendableLimit(permission: SpendPermission, cap: bigint | null): bigint {
  return cap !== null && cap < permission.allowance ? cap : permission.allowance;
}

/**
 * Ends a limit handoff `done` in one transaction: the new permission waits on the account until the next top-up approves it and
 * revokes the old one, and the cap goes, because the person just chose the new limit. Returns false when the handoff was no
 * longer matched; then nothing was written.
 */
export function finishLimit(db: Db, input: { code: string; account: string; permission: SpendPermission; signature: Hex; nowMs: number }): boolean {
  return db.transaction((): boolean => {
    const row = db.prepare("SELECT state FROM handoffs WHERE code = ?").get(input.code) as { state: string } | undefined;
    if (row?.state !== "matched") return false;
    const changed = db
      .prepare("UPDATE konto_accounts SET next_permission = ?, next_signature = ?, cap_usdc = NULL WHERE address = ?")
      .run(permissionJson(input.permission), input.signature, input.account.toLowerCase()).changes;
    if (changed !== 1) return false;
    db.prepare("UPDATE handoffs SET state = 'done', updated_at = ? WHERE code = ? AND state = 'matched'").run(input.nowMs, input.code);
    return true;
  })();
}

/** A positive whole number of atomic USDC in whole cents, as a string; anything else is null (the rule of POST /v1/handoff). */
function parseLimit(v: unknown): bigint | null {
  if (typeof v !== "string" || !/^[0-9]{1,18}$/.test(v)) return null;
  const n = BigInt(v);
  return n > 0n && n % 10_000n === 0n ? n : null;
}

const view = (l: AccountLimit) => ({ account: l.account, daily_limit_usdc: String(l.effective), signed_limit_usdc: String(l.signed) });

/**
 * `GET /v1/konto/limit` and `POST /v1/konto/limit`, behind the auth middleware of src/app.ts, which sets `address` from the API
 * key. `on` says whether the account of konto 03 is switched on (CP_KONTO_CHAIN_ID); without it both answer 503.
 */
export function registerKontoLimit<E extends Env>(app: Hono<E>, deps: { db: Db; on: () => boolean }): void {
  const { db } = deps;
  const off = (c: Context) =>
    c.json({ error: "konto_unavailable", message: "Accounts are not switched on here, so there is no daily limit to change.", docs: CONTRACT }, 503);
  const noAccount = (c: Context) =>
    c.json(
      { error: "no_account", message: "This API key belongs to no account with a daily limit. Create one with POST /v1/handoff and step konto.", docs: CONTRACT },
      404,
    );
  const address = (c: Context) => String((c as unknown as { get: (k: string) => unknown }).get("address") ?? "");

  app.get("/v1/konto/limit", (c) => {
    c.header("Cache-Control", "no-store");
    if (!deps.on()) return off(c);
    const limit = readAccountLimit(db, address(c));
    return limit ? c.json(view(limit), 200) : noAccount(c);
  });

  app.post("/v1/konto/limit", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!deps.on()) return off(c);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const wanted = parseLimit(body?.daily_limit_usdc);
    if (wanted === null) {
      return c.json(
        {
          error: "invalid_limit",
          message: 'Send JSON with daily_limit_usdc, a positive whole number of atomic USDC (6 decimals) in whole cents, as a string: {"daily_limit_usdc":"2000000"}.',
          docs: CONTRACT,
        },
        400,
      );
    }
    const limit = readAccountLimit(db, address(c));
    if (!limit) return noAccount(c);
    if (!isLowering(wanted, limit.signed)) {
      return c.json(
        {
          error: "limit_raise_needs_phone",
          message:
            `A daily limit above ${String(limit.signed)} atomic USDC needs your phone: send POST /v1/handoff with step "limit" and ` +
            "confirm it there with your passkey. Nothing was changed.",
          signed_limit_usdc: String(limit.signed),
          docs: CONTRACT,
        },
        403,
      );
    }
    db.prepare("UPDATE konto_accounts SET cap_usdc = ? WHERE address = ?").run(String(wanted), limit.account);
    return c.json(view(readAccountLimit(db, limit.account)!), 200);
  });
}

/** The permission waiting to replace the current one, with its signature; null when there is none. */
export function nextPermission(row: { next_permission: string | null; next_signature: string | null }): { permission: SpendPermission; signature: Hex } | null {
  if (!row.next_permission || !row.next_signature) return null;
  return { permission: permissionFromJson(row.next_permission), signature: row.next_signature as Hex };
}
