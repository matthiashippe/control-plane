/**
 * Error answers that tell a human what happened and what they can do.
 *
 * Rules that are kept here and against which every new message is measured:
 *
 * - The `error` field stays as it is. The upstream runtime decides by status code and not by our
 *   body, but it stuffs the whole body into `err.message` (`src/conway/client.ts:73` of revision
 *   d8f8168) and looks for the marker `INSUFFICIENT_CREDITS` in it (`src/conway/topup.ts:97`,
 *   `src/agent/tools.ts:1655`, `src/agent/loop.ts:247`). So things are only added, never replaced,
 *   and no message that does not really mean a lack of credit takes that marker in its mouth.
 * - `message` is one to three sentences: what happened, why it is meant to be that way, and the
 *   next step. No stack trace, no file path, no hint about other tenants.
 * - `docs` points at the matching section of `docs/errors.md`.
 *
 * English, because the readers are other operators and their agents: the same language as
 * `/llms.txt`, `/.well-known/x402` and the existing messages.
 */

const DOCS_BASE = "https://github.com/matthiashippe/control-plane/blob/main/docs/errors.md";

/** URL of a section in the error documentation. */
export function docs(anchor: string): string {
  return `${DOCS_BASE}#${anchor}`;
}

/** Anchors in `docs/errors.md`. As constants, so typos show up at build time. */
export const DOC = {
  authentication: docs("authentication"),
  inference: docs("inference"),
  models: docs("model_not_found"),
  payments: docs("payments"),
  rateLimits: docs("rate_limited"),
  registration: docs("registration"),
  sandboxes: docs("sandboxes"),
  service: docs("service-errors"),
  transfers: docs("credit_transfers"),
} as const;
