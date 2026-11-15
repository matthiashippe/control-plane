/**
 * The one form of a relay signature (goals/relay/02, docs/relay/vertrag.md `## Signatur`).
 *
 * viem's verifyMessage accepts the same signature in several spellings: uppercase hex, `v` as 0 or 1 instead of 27 or 28,
 * and the mirrored form with `s` replaced by n - s. The relay remembers a message and a poll by its signature, so each
 * spelling would be a new message or a new poll. Every signature is brought into its one form before it is checked,
 * looked up or stored: `0x` and 130 lowercase hex characters, `s` at most n / 2, `v` 27 or 28. The mirrored form is not
 * folded into the lower one but refused, because signMessage of viem (and so the runtime at the pin) only makes the lower.
 */

/** The order n of secp256k1. */
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = SECP256K1_N / 2n;

const SHAPE = /^0x[0-9a-fA-F]{130}$/;

/** The one form of a signature, or null when it has no 65 bytes, another `v` or `s` in the upper half. */
export function canonicalSignature(raw: string): string | null {
  if (!SHAPE.test(raw)) return null;
  const hex = raw.toLowerCase();
  const s = BigInt(`0x${hex.slice(66, 130)}`);
  if (s === 0n || s > HALF_N) return null;
  let v = parseInt(hex.slice(130, 132), 16);
  if (v === 0 || v === 1) v += 27;
  if (v !== 27 && v !== 28) return null;
  return `${hex.slice(0, 130)}${v.toString(16)}`;
}
