/**
 * The social relay of the runtime (goals/relay/01, contract in docs/relay/vertrag.md).
 *
 * Messages between automatons: a signed send, a signed poll and a signed count, the three calls of
 * `createSocialClient` in src/social/client.ts of the runtime at the pin d8f8168, plus the same three
 * with an API key for accounts without a wallet. Everything here is synchronous SQLite; the
 * signature checks are async and run in src/relay/routes.ts before any of this is called.
 *
 * Money: a message to an address the sender has had no contact with costs FIRST_CONTACT_MC, booked
 * as one ledger row of kind `relay` in the same transaction as the balance and the message. A reply
 * and every further message within a contact is free. The same signature twice is the same message:
 * the runtime's HTTP client repeats a POST after a 5xx or a timeout with the same body, so the
 * second one must get the first one's id and must not book again.
 */

import { randomBytes } from "node:crypto";
import { getAvailableMc, postLedger, type Db } from "../db.js";

/** `Preis Erstkontakt` in docs/relay/vertrag.md: 1000 mc, one cent. */
export const FIRST_CONTACT_MC = 1000;

/** The mark at the start of `content` of every message sent with an API key (`Kennzeichen` in the contract). */
export const UNVERIFIED_MARK = "[unverified sender, sent with an API key]";

/** MESSAGE_LIMITS of src/social/signing.ts at the pin. */
export const RELAY_LIMITS = {
  maxContentLength: 64_000,
  maxTotalSize: 128_000,
  replayWindowMs: 300_000,
  futureSkewMs: 60_000,
  maxPerHour: 100,
  /** Characters of `content` one sender may store in 24 hours (`## Grenzen` in the contract); not in MESSAGE_LIMITS. */
  maxStoredCharsPerDay: 4_000_000,
  /** Days a message is kept; cleanupExpired in src/db.ts deletes older ones, the contact stays. */
  retentionDays: 30,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export const POLL_LIMIT_DEFAULT = 50;
export const POLL_LIMIT_MAX = 100;

const EVM = /^0x[0-9a-f]{40}$/;
const KEYLESS = /^key:[0-9a-f]{40}$/;

/** A lowercase EVM address. */
export function isEvmAddress(s: string): boolean {
  return EVM.test(s);
}

/** Who may receive: an EVM address or the handle of an account without a wallet (`key:` and 40 hex). */
export function isRecipient(s: string): boolean {
  return EVM.test(s) || KEYLESS.test(s);
}

/** A reply in the shape the routes hand to Hono. */
export interface RelayReply {
  status: 200 | 201 | 400 | 401 | 402 | 405 | 413 | 429;
  body: Record<string, unknown>;
}

export interface StoredMessage {
  seq: number;
  id: string;
  sender: string;
  recipient: string;
  content: string;
  signed_at: string;
  reply_to: string | null;
  nonce: string;
  verified: number;
  created_at: string;
}

/** The message as `poll` hands it out: the fields the runtime's client reads, plus `verified`. */
export function view(m: StoredMessage): Record<string, unknown> {
  return {
    id: m.id,
    from: m.sender,
    to: m.recipient,
    content: m.content,
    signedAt: m.signed_at,
    createdAt: m.created_at,
    replyTo: m.reply_to,
    nonce: m.nonce,
    verified: m.verified === 1,
  };
}

/** The two ends of a contact in a fixed order, so a to b and b to a are the same row of relay_contacts. */
const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/**
 * Whether a message was ever accepted between the two, in either direction. Kept in relay_contacts, not read from
 * relay_messages, because messages go after 30 days and the reply has to stay free.
 */
export function inContact(db: Db, a: string, b: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM relay_contacts WHERE a = ? AND b = ?").get(...pair(a, b)));
}

export interface SendInput {
  sender: string;
  recipient: string;
  /** What the recipient reads; for an API key send the mark is already in front. */
  content: string;
  signedAt: string;
  /** The signature for a signed send, null for an API key send. */
  signature: string | null;
  replyTo: string | null;
  now: Date;
}

const DOCS = "https://github.com/matthiashippe/control-plane/blob/main/docs/errors.md#relay";

/**
 * Accepts one message: the same signature again gives the stored message's id, otherwise the hourly
 * limit, the price of a first contact and the message itself, all in one transaction.
 */
export function acceptMessage(db: Db, input: SendInput): RelayReply {
  const run = db.transaction((): RelayReply => {
    if (input.signature) {
      const known = db.prepare("SELECT id FROM relay_messages WHERE signature = ?").get(input.signature) as
        | { id: string }
        | undefined;
      if (known) return { status: 201, body: { id: known.id } };
    }
    const nowMs = input.now.getTime();
    const sent = (
      db
        .prepare("SELECT count(*) AS n FROM relay_messages WHERE sender = ? AND created_ms > ?")
        .get(input.sender, nowMs - 3_600_000) as { n: number }
    ).n;
    if (sent >= RELAY_LIMITS.maxPerHour) {
      return {
        status: 429,
        body: {
          error: "rate_limited",
          message:
            `A sender may send ${RELAY_LIMITS.maxPerHour} messages per hour, and this one has sent ${sent} in the last ` +
            "hour. Nothing was sent and nothing was charged; send again later.",
          docs: DOCS,
        },
      };
    }
    const stored = (
      db
        .prepare("SELECT coalesce(sum(content_chars), 0) AS n FROM relay_messages WHERE sender = ? AND created_ms > ?")
        .get(input.sender, nowMs - DAY_MS) as { n: number }
    ).n;
    if (stored + input.content.length > RELAY_LIMITS.maxStoredCharsPerDay) {
      return {
        status: 413,
        body: {
          error: "relay_quota_exceeded",
          message:
            `A sender may store ${RELAY_LIMITS.maxStoredCharsPerDay} characters of content in 24 hours, this one has ` +
            `stored ${stored} and this message has ${input.content.length}. Nothing was sent and nothing was charged; ` +
            "send again later or send less.",
          docs: DOCS,
        },
      };
    }
    const id = `msg_${randomBytes(12).toString("hex")}`;
    const price = inContact(db, input.sender, input.recipient) ? 0 : FIRST_CONTACT_MC;
    if (price > 0) {
      const available = getAvailableMc(db, input.sender);
      if (available < price) return insufficient(available);
      try {
        postLedger(db, {
          address: input.sender,
          kind: "relay",
          deltaMc: -price,
          ref: `relay:${id}`,
          meta: { first_contact: true },
        });
      } catch (e) {
        if (e instanceof Error && e.message === "insufficient_balance") return insufficient(getAvailableMc(db, input.sender));
        throw e;
      }
    }
    db.prepare(
      "INSERT INTO relay_messages (id, sender, recipient, content, content_chars, signed_at, signature, reply_to, nonce, verified, charged_mc, created_at, created_ms) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      input.sender,
      input.recipient,
      input.content,
      input.content.length,
      input.signedAt,
      input.signature,
      input.replyTo,
      randomBytes(16).toString("hex"),
      input.signature ? 1 : 0,
      price,
      input.now.toISOString(),
      nowMs,
    );
    db.prepare("INSERT OR IGNORE INTO relay_contacts (a, b, created_ms) VALUES (?, ?, ?)").run(
      ...pair(input.sender, input.recipient),
      nowMs,
    );
    return { status: 201, body: { id } };
  });
  return run();
}

function insufficient(availableMc: number): RelayReply {
  return {
    status: 402,
    body: {
      error: "INSUFFICIENT_CREDITS",
      message:
        `A first message to an address this sender has had no contact with costs ${FIRST_CONTACT_MC} mc (1 cent), and ` +
        `this sender has ${availableMc} mc available. Nothing was sent and nothing was charged. Buy credits through ` +
        "/pay (GET /.well-known/x402 lists the tiers) and send again; a reply to a message you received is free.",
      details: { required_cents: Math.ceil(FIRST_CONTACT_MC / 1000), current_balance_cents: Math.floor(availableMc / 1000) },
      docs: DOCS,
    },
  };
}

/**
 * The recipient's messages after `cursor` (or, without one, the unread ones), oldest first, at most
 * `limit`; what it hands out counts as read. `next_cursor` is the number of the last one handed out,
 * or the cursor that came in when there was nothing new.
 *
 * `repeatKey` is the X-Signature of a signed poll. The runtime's client repeats a poll after a timeout
 * or a 5xx with the same headers; when the first answer never arrived, the repeat must get the same
 * messages, or those already marked read are lost. So the answer to a signed poll is remembered by
 * signature, cursor and limit, and a repeat gets the same messages and the same `next_cursor`. A poll
 * with an API key has no such key; the runtime's client always signs.
 */
export function pollMessages(
  db: Db,
  recipient: string,
  cursor: string | null,
  limit: number,
  now: Date,
  repeatKey: string | null = null,
): RelayReply {
  const n = Math.min(Math.max(1, Math.floor(limit) || POLL_LIMIT_DEFAULT), POLL_LIMIT_MAX);
  const after = cursor !== null && /^[0-9]{1,15}$/.test(cursor) ? Number(cursor) : null;
  const key = repeatKey === null ? null : `${repeatKey}\n${after ?? ""}\n${n}`;
  const run = db.transaction((): RelayReply => {
    if (key !== null) {
      const seen = db.prepare("SELECT seqs, next_cursor FROM relay_polls WHERE key = ? AND recipient = ?").get(key, recipient) as
        | { seqs: string; next_cursor: string | null }
        | undefined;
      if (seen) {
        const seqs = JSON.parse(seen.seqs) as number[];
        const rows = (
          seqs.length
            ? db
                .prepare(`SELECT * FROM relay_messages WHERE recipient = ? AND seq IN (${seqs.map(() => "?").join(",")}) ORDER BY seq`)
                .all(recipient, ...seqs)
            : []
        ) as StoredMessage[];
        return { status: 200, body: { messages: rows.map(view), next_cursor: seen.next_cursor } };
      }
    }
    const rows = (
      after === null
        ? db
            .prepare("SELECT * FROM relay_messages WHERE recipient = ? AND read_at IS NULL ORDER BY seq LIMIT ?")
            .all(recipient, n)
        : db.prepare("SELECT * FROM relay_messages WHERE recipient = ? AND seq > ? ORDER BY seq LIMIT ?").all(recipient, after, n)
    ) as StoredMessage[];
    if (rows.length) {
      db.prepare(
        `UPDATE relay_messages SET read_at = ? WHERE read_at IS NULL AND seq IN (${rows.map(() => "?").join(",")})`,
      ).run(now.toISOString(), ...rows.map((r) => r.seq));
    }
    const last = rows.length ? String(rows[rows.length - 1].seq) : after === null ? null : String(after);
    if (key !== null) {
      db.prepare("INSERT INTO relay_polls (key, recipient, seqs, next_cursor, created_ms) VALUES (?, ?, ?, ?, ?)").run(
        key,
        recipient,
        JSON.stringify(rows.map((r) => r.seq)),
        last,
        now.getTime(),
      );
    }
    return { status: 200, body: { messages: rows.map(view), next_cursor: last } };
  });
  return run();
}

/** How many of the recipient's messages no poll has handed out yet. */
export function unreadCount(db: Db, recipient: string): number {
  return (
    db.prepare("SELECT count(*) AS n FROM relay_messages WHERE recipient = ? AND read_at IS NULL").get(recipient) as {
      n: number;
    }
  ).n;
}
