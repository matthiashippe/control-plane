/**
 * The three paths of the social relay (goals/relay/01, contract in docs/relay/vertrag.md):
 *
 * - `POST /v1/messages`: a message signed in the runtime's format (`Conway:send:{to}:{keccak256(content)}:{signed_at}`), or
 *   with an API key and no signature, then marked as from an unverified sender.
 * - `POST /v1/messages/poll`: the recipient's messages, signed in the poll format (`Conway:poll:{address}:{timestamp}`) in the
 *   headers X-Wallet-Address, X-Signature and X-Timestamp, or with an API key.
 * - `GET /v1/messages/count`: how many of them are unread, signed the same way.
 *
 * Registered before the `/v1/*` auth middleware of src/app.ts, because the signed way needs no API key. No answer here is a
 * 404 or a 5xx: the runtime's HTTP client retries those and counts them for its circuit breaker.
 */
import type { Context, Env, Hono } from "hono";
import { keccak256, toBytes, verifyMessage, type Hex } from "viem";
import type { Db } from "../db.js";
import {
  POLL_LIMIT_DEFAULT,
  RELAY_LIMITS,
  UNVERIFIED_MARK,
  acceptMessage,
  isEvmAddress,
  isRecipient,
  pollMessages,
  unreadCount,
  type RelayReply,
} from "./store.js";

export interface RelayDeps {
  db: Db;
  clock: () => Date;
  /** The account of an API key in the Authorization header, or null (resolveApiKey of src/auth/siwe.ts). */
  resolveKey: (header: string | undefined) => string | null;
}

const DOCS = "https://github.com/matthiashippe/control-plane/blob/main/docs/errors.md#relay";

const fail = (status: RelayReply["status"], error: string, message: string): RelayReply => ({
  status,
  body: { error, message, docs: DOCS },
});

const NO_AUTH = fail(
  401,
  "signature_or_api_key_required",
  "Sign the request the way the automaton runtime does (docs/relay/vertrag.md) or send the API key of this control plane " +
    "in the Authorization header. This request carries neither, or the key is not one of this control plane.",
);

const SOLANA = (who: string) =>
  fail(
    400,
    "evm_address_required",
    `The ${who} is not a lowercase EVM address. This relay checks EVM signatures only, so a Solana identity cannot use it yet.`,
  );

/** Whether `signed_at` lies within the window: at most 300000 ms old and at most 60 s ahead. */
function inWindow(stamp: string, now: Date): boolean {
  const t = Date.parse(stamp);
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  return age <= RELAY_LIMITS.replayWindowMs && age >= -RELAY_LIMITS.futureSkewMs;
}

async function signedBy(address: string, message: string, signature: string): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) return false;
  try {
    return await verifyMessage({ address: address as Hex, message, signature: signature as Hex });
  } catch {
    return false;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** The account a poll or count speaks for: the signed address in the headers, or the API key's account. */
async function reader(c: Context, deps: RelayDeps): Promise<{ address: string } | RelayReply> {
  const sig = c.req.header("x-signature");
  const wallet = c.req.header("x-wallet-address");
  const stamp = c.req.header("x-timestamp");
  if (sig || wallet || stamp) {
    if (!sig || !wallet || !stamp) {
      return fail(401, "invalid_signature", "X-Wallet-Address, X-Signature and X-Timestamp belong together; one of them is missing.");
    }
    const address = wallet.toLowerCase();
    if (!isEvmAddress(address)) return SOLANA("address in X-Wallet-Address");
    if (!inWindow(stamp, deps.clock())) {
      return fail(401, "signature_expired", "X-Timestamp is older than 300000 ms or more than 60 s ahead. Sign again with the current time.");
    }
    if (!(await signedBy(address, `Conway:poll:${address}:${stamp}`, sig))) {
      return fail(401, "invalid_signature", "X-Signature is not a signature of Conway:poll:{address}:{timestamp} by X-Wallet-Address.");
    }
    return { address };
  }
  const account = deps.resolveKey(c.req.header("authorization"));
  return account ? { address: account.toLowerCase() } : NO_AUTH;
}

/** The send: a signed message, or one with an API key that gets the mark. */
async function send(c: Context, deps: RelayDeps): Promise<RelayReply> {
  const raw = await c.req.text().catch(() => "");
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "invalid_body", "The body is not a JSON object with to and content.");
  }
  const to = str(body.to)?.toLowerCase() ?? null;
  const content = str(body.content);
  const replyTo = str(body.reply_to);
  if (to === null || content === null) return fail(400, "invalid_body", "to and content are required, both as strings.");
  if (content.length > RELAY_LIMITS.maxContentLength) {
    return fail(413, "message_too_large", `content has ${content.length} characters, at most ${RELAY_LIMITS.maxContentLength} are accepted.`);
  }
  if (raw.length > RELAY_LIMITS.maxTotalSize) {
    return fail(413, "message_too_large", `The message has ${raw.length} characters, at most ${RELAY_LIMITS.maxTotalSize} are accepted.`);
  }
  if (!isRecipient(to)) return SOLANA("recipient in to");
  const now = deps.clock();

  const signature = str(body.signature);
  if (signature !== null || body.from !== undefined || body.signed_at !== undefined) {
    const from = str(body.from)?.toLowerCase() ?? null;
    const signedAt = str(body.signed_at);
    if (from === null || signedAt === null || signature === null) {
      return fail(401, "invalid_signature", "A signed message carries from, signed_at and signature; one of them is missing.");
    }
    if (!isEvmAddress(from)) return SOLANA("sender in from");
    const canonical = `Conway:send:${to}:${keccak256(toBytes(content))}:${signedAt}`;
    if (!(await signedBy(from, canonical, signature))) {
      return fail(
        401,
        "invalid_signature",
        "signature is not a signature of Conway:send:{to}:{keccak256(content)}:{signed_at} by the address in from.",
      );
    }
    // A repeat of an accepted signature is the same message, whenever it comes; only a new one has to be fresh.
    const known = deps.db.prepare("SELECT id FROM relay_messages WHERE signature = ?").get(signature) as { id: string } | undefined;
    if (known) return { status: 201, body: { id: known.id } };
    if (!inWindow(signedAt, now)) {
      return fail(401, "signature_expired", "signed_at is older than 300000 ms or more than 60 s ahead. Sign the message again.");
    }
    return acceptMessage(deps.db, { sender: from, recipient: to, content, signedAt, signature, replyTo, now });
  }

  const account = deps.resolveKey(c.req.header("authorization"));
  if (!account) return NO_AUTH;
  return acceptMessage(deps.db, {
    sender: account.toLowerCase(),
    recipient: to,
    content: `${UNVERIFIED_MARK} ${content}`,
    signedAt: now.toISOString(),
    signature: null,
    replyTo,
    now,
  });
}

export function registerRelay<E extends Env>(app: Hono<E>, deps: RelayDeps): void {
  const reply = (c: Context, r: RelayReply) => c.json(r.body, r.status);
  const only = (c: Context, method: "GET" | "POST"): Response | null => {
    const asked = c.req.method === "HEAD" ? "GET" : c.req.method;
    if (asked === method) return null;
    c.header("Allow", method === "GET" ? "GET, HEAD" : method);
    return c.json(
      { error: "method_not_allowed", message: `${c.req.path} accepts ${method}, not ${c.req.method}.`, allow: [method], docs: DOCS },
      405,
    );
  };

  app.all("/v1/messages", async (c) => only(c, "POST") ?? reply(c, await send(c, deps)));

  app.all("/v1/messages/poll", async (c) => {
    const wrong = only(c, "POST");
    if (wrong) return wrong;
    const who = await reader(c, deps);
    if (!("address" in who)) return reply(c, who);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown> | null;
    const cursor = body && typeof body.cursor === "string" ? body.cursor : null;
    const limit = body && typeof body.limit === "number" ? body.limit : POLL_LIMIT_DEFAULT;
    return reply(c, pollMessages(deps.db, who.address, cursor, limit, deps.clock()));
  });

  app.all("/v1/messages/count", async (c) => {
    const wrong = only(c, "GET");
    if (wrong) return wrong;
    const who = await reader(c, deps);
    if (!("address" in who)) return reply(c, who);
    return reply(c, { status: 200, body: { unread: unreadCount(deps.db, who.address) } });
  });
}
