/**
 * Start des Control Plane.
 *
 * Env:
 *   CP_PORT       Port, Default 8402
 *   CP_HOST       Bind-Adresse, Default 127.0.0.1 (im Container 0.0.0.0)
 *   CP_DB_PATH    SQLite-Datei, Default ./data/control-plane.db
 *   CP_TLS_CERT   PEM-Zertifikat; zusammen mit CP_TLS_KEY wird HTTPS gesprochen.
 *   CP_TLS_KEY    PEM-Key
 *   CP_SIWE_DOMAIN  Default "conway.tech" (der Runtime-Client sendet genau das)
 */

import fs from "node:fs";
import path from "node:path";
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { createApp, VERSION } from "./app.js";
import { openDb } from "./db.js";

const port = Number(process.env.CP_PORT || 8402);
const host = process.env.CP_HOST || "127.0.0.1";
const dbPath = process.env.CP_DB_PATH || path.resolve("data", "control-plane.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = openDb(dbPath);
const app = createApp({
  db,
  siwe: process.env.CP_SIWE_DOMAIN ? { domain: process.env.CP_SIWE_DOMAIN } : undefined,
});

const tlsCert = process.env.CP_TLS_CERT;
const tlsKey = process.env.CP_TLS_KEY;
const tls = tlsCert && tlsKey ? { cert: fs.readFileSync(tlsCert), key: fs.readFileSync(tlsKey) } : null;

serve(
  {
    fetch: app.fetch,
    port,
    hostname: host,
    ...(tls ? { createServer: createHttpsServer, serverOptions: tls } : {}),
  },
  (info) => {
    console.log(
      `[control-plane] v${VERSION} ${tls ? "https" : "http"}://${info.address}:${info.port} db=${dbPath}`,
    );
  },
);
