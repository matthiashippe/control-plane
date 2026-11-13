#!/usr/bin/env node
// The rebuilt sandboxd of the harness (goals/sandbox/04): the real `createSandboxd` of ops/sandbox/sandboxd.mjs with
// the Docker stand-in of harness-run.mjs. The signature check stays the real one: the keys are every `*.pub` in
// SANDBOXD_KEYS_DIR, read again on every request, and in the harness that directory is the volume cp-data (read
// only), where cp writes sandbox-client.pub on its first start. Listens inside the compose network only (no `ports:`).
//
// Environment: SANDBOXD_API_PORT (8730), SANDBOXD_HOST (0.0.0.0), SANDBOXD_KEYS_DIR (/cp-data),
// SANDBOXD_STATE (/var/lib/sandboxd/state.json), SANDBOXD_DOCKER_STATE (/var/lib/sandboxd/docker.json),
// SANDBOXD_MNT (/var/lib/sandboxd/mnt), SANDBOXD_DISKS (/var/lib/sandboxd/disks).

import fs from "node:fs";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { createFileState, createSandboxd, loadConfig, loadKeys, memoryState } from "../../ops/sandbox/sandboxd.mjs";
import { createHarnessRun } from "./harness-run.mjs";

export { createSandboxd };

/**
 * Starts the stand-in on host:port (port 0 picks a free one) and gives { url, d, docker, close }.
 * Without stateFile the sandboxd state stays in memory.
 */
export async function startHarnessSandboxd({
  host = "0.0.0.0",
  port = 8730,
  keysDir,
  stateFile = null,
  dockerStateFile = null,
  mntDir = "/var/lib/sandboxd/mnt",
  disksDir = "/var/lib/sandboxd/disks",
  log = (l) => console.log(l),
} = {}) {
  if (!keysDir) throw new Error("keysDir is required");
  fs.mkdirSync(mntDir, { recursive: true });
  const harness = createHarnessRun({ stateFile: dockerStateFile });
  const config = { ...loadConfig({}), host, apiPort: port, keysDir, mntDir, disksDir };
  const d = createSandboxd({
    run: harness.run,
    keys: () => loadKeys(keysDir, log),
    state: stateFile ? createFileState(stateFile) : memoryState(),
    config,
    log,
  });
  await d.reconcile();
  const server = http.createServer(d.handleApi);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const bound = server.address().port;
  const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${bound}`;
  const close = () =>
    new Promise((r) => {
      server.closeAllConnections?.();
      server.close(() => r());
    });
  return { url, port: bound, d, docker: harness.docker, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const parsed = Number.parseInt(env.SANDBOXD_API_PORT ?? "", 10);
  const port = Number.isInteger(parsed) && parsed >= 0 ? parsed : 8730; // 0 picks a free port
  startHarnessSandboxd({
    host: env.SANDBOXD_HOST || "0.0.0.0",
    port,
    keysDir: env.SANDBOXD_KEYS_DIR || "/cp-data",
    stateFile: env.SANDBOXD_STATE || "/var/lib/sandboxd/state.json",
    dockerStateFile: env.SANDBOXD_DOCKER_STATE || "/var/lib/sandboxd/docker.json",
    mntDir: env.SANDBOXD_MNT || "/var/lib/sandboxd/mnt",
    disksDir: env.SANDBOXD_DISKS || "/var/lib/sandboxd/disks",
  }).then(
    (s) => {
      console.log(`sandboxd (harness): api on ${env.SANDBOXD_HOST || "0.0.0.0"}:${s.port}, keys in ${env.SANDBOXD_KEYS_DIR || "/cp-data"}`);
      const stop = () => s.close().then(() => process.exit(0));
      process.on("SIGTERM", stop);
      process.on("SIGINT", stop);
    },
    (e) => {
      console.error(`sandboxd (harness): failed to start: ${e?.stack ?? e}`);
      process.exit(1);
    },
  );
}
