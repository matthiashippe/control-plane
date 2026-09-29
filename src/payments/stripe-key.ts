/**
 * What a Stripe key says about the money behind it, read from its prefix alone.
 *
 * Only `sk_live_` and `rk_live_` move real money. Everything else, including a restricted test key
 * `rk_test_` and anything malformed, counts as test. HAN-17 (2026-09-29) found the naive version:
 * `startsWith("sk_test_") ? "stripe_test" : "stripe"` turns `rk_test_` into `stripe`, and test money
 * would then count as revenue from a person in `human_revenue_30d_cents`.
 */

export function isStripeLiveKey(key: string): boolean {
  return /^(sk|rk)_live_/.test(key);
}

export function isStripeTestKey(key: string): boolean {
  return /^(sk|rk)_test_/.test(key);
}

/** The provider name every row carries, so each row says itself whether real money moved. */
export function stripeProviderName(key: string): "stripe" | "stripe_test" {
  return isStripeLiveKey(key) ? "stripe" : "stripe_test";
}
