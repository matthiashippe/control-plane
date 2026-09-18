/**
 * Hono-App mit den Routen, die die Automaton-Runtime aufruft (docs/protocol.md).
 * Alles Unbekannte antwortet 404 mit JSON-Fehler; die Runtime behandelt das als
 * "Feature nicht verfügbar".
 */

import { Hono } from "hono";
import type { Db } from "./db.js";
import { getBalanceCents } from "./db.js";
import {
  AuthError,
  createApiKey,
  DEFAULT_SIWE_CONFIG,
  issueNonce,
  resolveApiKey,
  verifySiwe,
  type SiweConfig,
} from "./auth/siwe.js";

export const VERSION = "0.1.0";

export interface AppOptions {
  db: Db;
  siwe?: Partial<SiweConfig>;
}

type Env = { Variables: { address: `0x${string}` } };

export function createApp(opts: AppOptions) {
  const { db } = opts;
  const siweCfg: SiweConfig = { ...DEFAULT_SIWE_CONFIG, ...opts.siwe };
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof AuthError) {
      return c.json({ error: err.message }, err.status as 400 | 401);
    }
    console.error(`[app] ${c.req.method} ${c.req.path}: ${err.stack || err.message}`);
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true, version: VERSION }));

  // ─── Provisionierung ───────────────────────────────────────────

  app.post("/v1/auth/nonce", (c) => c.json({ nonce: issueNonce(db) }));

  app.post("/v1/auth/verify", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      message?: string;
      signature?: string;
      chain_type?: string;
    };
    const { accessToken } = await verifySiwe(
      db,
      { message: body.message ?? "", signature: body.signature ?? "", chainType: body.chain_type },
      siweCfg,
    );
    return c.json({ access_token: accessToken });
  });

  app.post("/v1/auth/api-keys", async (c) => {
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) throw new AuthError(401, "Bearer token required");
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const { key, keyPrefix } = createApiKey(db, auth.slice(7), body.name ?? "conway-automaton");
    return c.json({ key, key_prefix: keyPrefix });
  });

  // ─── Alles ab hier braucht einen API-Key (roh im Authorization-Header) ───

  app.use("/v1/*", async (c, next) => {
    const address = resolveApiKey(db, c.req.header("authorization"));
    if (!address) throw new AuthError(401, "Invalid API key");
    c.set("address", address);
    await next();
  });

  app.get("/v1/credits/balance", (c) =>
    c.json({ balance_cents: getBalanceCents(db, c.get("address")) }),
  );

  app.get("/v1/sandboxes", (c) => c.json({ sandboxes: [] }));
  app.all("/v1/sandboxes/*", (c) => c.json({ error: "not_implemented" }, 501));
  app.post("/v1/sandboxes", (c) => c.json({ error: "not_implemented" }, 501));

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
