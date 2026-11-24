/**
 * The way to the card checkout and its breaker (goals/wache/01).
 *
 * Digistore24 gives every buyer of an English product 60 days to get the money back, and the credit is usually spent by then.
 * A refund takes back only what is left; the rest is `shortfall_mc` in `card_orders` and costs us. This file holds the one
 * calculation that caps that cost:
 *
 * - the breaker is on while the shortfall of refunded or charged back live orders, whose row changed within the last
 *   CARD_BREAKER_WINDOW_DAYS days, reaches CARD_BREAKER_SHORTFALL_MC; it opens again by itself once old refunds fall out of the window;
 * - a wallet that had a refund of a live order never gets to the checkout again, with or without shortfall.
 *
 * Every way to the checkout is meant to go through `GET /card/<package>` of this service (`cardLink`), and only this file builds the
 * link to the checkout itself (`checkoutUrl`), so that the breaker can close it. Money is integers throughout.
 */
import type { Db } from "../db.js";
import { siteOrigin } from "../public/site.js";
import { CARD_PACKAGES, type CardPackage } from "./digistore.js";

/** 50 USD in millicents (100000 mc are 1 USD). */
export const CARD_BREAKER_SHORTFALL_MC = 5_000_000;
/** The refund window Digistore24 grants on English products. */
export const CARD_BREAKER_WINDOW_DAYS = 60;

const DAY_MS = 86_400_000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export interface CardBreaker {
  /** Live orders refunded or charged back within the window. */
  refunds60d: number;
  /** Their summed shortfall in millicents. */
  shortfallMc: number;
  /** True while the checkout is closed for everybody. */
  on: boolean;
}

export function isAddress(address: string | null | undefined): address is string {
  return typeof address === "string" && ADDRESS.test(address);
}

/** The breaker at `now`: only live orders with status `reversed` whose `updated_at` lies at most the window before `now`. */
export function cardBreaker(db: Db, now: Date): CardBreaker {
  const since = new Date(now.getTime() - CARD_BREAKER_WINDOW_DAYS * DAY_MS).toISOString();
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(shortfall_mc), 0) AS mc FROM card_orders " +
        "WHERE mode = 'live' AND status = 'reversed' AND updated_at >= ?",
    )
    .get(since) as { n: number; mc: number };
  const shortfallMc = Math.trunc(row.mc);
  return { refunds60d: row.n, shortfallMc, on: shortfallMc >= CARD_BREAKER_SHORTFALL_MC };
}

/** True when a live order of this wallet was ever refunded or charged back, without a window and also without shortfall. */
export function walletRefunded(db: Db, address: string): boolean {
  if (!isAddress(address)) return false;
  const row = db
    .prepare("SELECT 1 AS hit FROM card_orders WHERE address = ? AND mode = 'live' AND status = 'reversed' LIMIT 1")
    .get(address.toLowerCase()) as { hit: number } | undefined;
  return row !== undefined;
}

/** The key of a package in the path of `/card/<package>`: its gross price in whole EUR (5, 20, 50). */
export function packageKey(pkg: CardPackage): string {
  return String(Math.floor(pkg.grossEurCents / 100));
}

export function packageByKey(key: string): CardPackage | null {
  return CARD_PACKAGES.find((p) => packageKey(p) === key) ?? null;
}

/** The checkout of Digistore24 itself. Only `/card/<package>` sends anybody there. */
export function checkoutUrl(pkg: CardPackage, address: string): string | null {
  if (!isAddress(address) || !/^[1-9][0-9]*$/.test(pkg.productId)) return null;
  return `https://www.checkout-ds24.com/product/${pkg.productId}/?custom=${address.toLowerCase()}`;
}

/** The link every page and answer hands out: the redirect of this service, never the checkout itself. */
export function cardLink(pkg: CardPackage, address: string): string | null {
  if (!isAddress(address)) return null;
  return `${siteOrigin()}/card/${packageKey(pkg)}?address=${address.toLowerCase()}`;
}

/** `card_url` for a 402: the link of the 5 EUR package, or null while the breaker is on. */
export function cardUrlFor(db: Db, address: string, now: Date): string | null {
  if (cardBreaker(db, now).on) return null;
  const pkg = packageByKey("5");
  return pkg ? cardLink(pkg, address) : null;
}

const CARD_BLOCK = /<!--CARD-->[\s\S]*?<!--\/CARD-->/g;
const CARD_MARKS = /<!--\/?CARD-->/g;
// The text of the first screen that promises the card (goals/werbung/01) has its own pair of marks, so the
// block `#card` is the only one between `<!--CARD-->` and `<!--/CARD-->`.
const PAYTEXT_BLOCK = /<!--PAYTEXT-->[\s\S]*?<!--\/PAYTEXT-->/g;
const PAYTEXT_MARKS = /<!--\/?PAYTEXT-->/g;

/**
 * Drops everything between `<!--CARD-->` and `<!--/CARD-->` and everything between `<!--PAYTEXT-->` and `<!--/PAYTEXT-->`
 * with the marks while the breaker is on, otherwise only the marks.
 */
export function stripCardWay(html: string, on: boolean): string {
  const marks = (h: string): string => h.replace(CARD_MARKS, "").replace(PAYTEXT_MARKS, "");
  return on ? marks(html.replace(CARD_BLOCK, "").replace(PAYTEXT_BLOCK, "")) : marks(html);
}

/** The way over USDC that the paused page names, the same link as `topup_url` of the 402. */
export function usdcTopupUrl(address: string): string {
  return `${siteOrigin()}/pay/5/${address.toLowerCase()}`;
}

export type CardRedirect =
  | { kind: "unknown_package" }
  | { kind: "ask_address"; pkg: CardPackage }
  | { kind: "checkout"; url: string }
  | { kind: "paused"; topupUrl: string };

/**
 * What `GET /card/<package>?address=<wallet>` answers. Breaker on and a wallet with a refund give the same `paused`, so that nobody
 * learns which of the two holds.
 */
export function cardRedirect(db: Db, key: string, address: string | null | undefined, now: Date): CardRedirect {
  const pkg = packageByKey(key);
  if (!pkg) return { kind: "unknown_package" };
  if (!isAddress(address)) return { kind: "ask_address", pkg };
  if (cardBreaker(db, now).on || walletRefunded(db, address)) return { kind: "paused", topupUrl: usdcTopupUrl(address) };
  const url = checkoutUrl(pkg, address);
  return url ? { kind: "checkout", url } : { kind: "unknown_package" };
}

/** The number of card orders held by the IPN (goals/wache/03): paid while the checkout was closed, nothing credited. */
export function heldCardOrders(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM card_orders WHERE status = 'held'").get() as { n: number };
  return row.n;
}
