/**
 * GET /healthz/image of sandboxd against a fake `run`: no Docker, no network beyond 127.0.0.1 on port 0.
 *
 * ops/watchdog.sh asks this route on every run, so a base image that the prune cron removed (or is about to remove because the
 * pin is gone) raises an alarm before the first new sandbox fails with 501. The rule is the one of pin_fact in
 * ops/sandbox/setup.sh: the image must exist, and the pin must be a never started container of exactly this image ID without
 * the label sandboxd=1.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSandboxd, imageHealth, loadConfig, memoryState } from "../ops/sandbox/sandboxd.mjs";

const IMAGE = "sandboxd-base:1";
const IMAGE_ID = "sha256:" + "a".repeat(64);
const OLD_IMAGE_ID = "sha256:" + "b".repeat(64);
const PIN = "sandboxd-base-pin";

type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };
type Docker = { imageId?: string | null; pin?: string | null; hang?: boolean };

const servers: http.Server[] = [];

afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise((r) => s.close(() => r(undefined)));
});

async function setup(docker: Docker) {
  const calls: string[][] = [];
  const run = async (cmd: string, args: string[]): Promise<RunResult> => {
    calls.push([cmd, ...args]);
    const fail = { code: 1, stdout: "", stderr: "Error: No such object", timedOut: false };
    if (cmd !== "docker") return fail;
    if (docker.hang) return { code: null, stdout: "", stderr: "", timedOut: true };
    if (args[0] === "image" && args[1] === "inspect" && args.at(-1) === IMAGE) {
      return docker.imageId ? { code: 0, stdout: `${docker.imageId}\n`, stderr: "", timedOut: false } : fail;
    }
    if (args[0] === "container" && args[1] === "inspect" && args.at(-1) === PIN) {
      return docker.pin != null ? { code: 0, stdout: `${docker.pin}\n`, stderr: "", timedOut: false } : fail;
    }
    return fail;
  };
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const d = createSandboxd({
    run,
    keys: [publicKey],
    state: memoryState(),
    config: { image: IMAGE, domain: "example.dev", disksDir: "/d", mntDir: "/m" },
    log: () => {},
  });
  const s = http.createServer(d.handleApi);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const port = (s.address() as AddressInfo).port;
  const get = async (target: string) => {
    const r = await fetch(`http://127.0.0.1:${port}${target}`);
    return { status: r.status, text: await r.text() };
  };
  return { get, calls };
}

describe("imageHealth follows pin_fact of ops/sandbox/setup.sh", () => {
  it("is missing without the image, ok only for a created pin of the same image ID without the label, else unpinned", () => {
    expect(imageHealth({ imageId: null, pin: null })).toBe("missing");
    expect(imageHealth({ imageId: null, pin: { image: IMAGE_ID, status: "created", label: "" } })).toBe("missing");
    expect(imageHealth({ imageId: IMAGE_ID, pin: { image: IMAGE_ID, status: "created", label: "" } })).toBe("ok");
    expect(imageHealth({ imageId: IMAGE_ID, pin: null })).toBe("unpinned");
    expect(imageHealth({ imageId: IMAGE_ID, pin: { image: OLD_IMAGE_ID, status: "created", label: "" } })).toBe("unpinned");
    expect(imageHealth({ imageId: IMAGE_ID, pin: { image: IMAGE_ID, status: "exited", label: "" } })).toBe("unpinned");
    expect(imageHealth({ imageId: IMAGE_ID, pin: { image: IMAGE_ID, status: "running", label: "" } })).toBe("unpinned");
    expect(imageHealth({ imageId: IMAGE_ID, pin: { image: IMAGE_ID, status: "created", label: "1" } })).toBe("unpinned");
  });
});

describe("sandboxd answers GET /healthz/image without a signature", () => {
  it("/healthz stays exactly ok", async () => {
    const s = await setup({ imageId: null, pin: null });
    const h = await s.get("/healthz");
    expect(h).toEqual({ status: 200, text: "ok" });
    expect(s.calls).toEqual([]);
  });

  it("answers 200 image ok for a created pin of the current image ID and asks Docker like pin_fact", async () => {
    const s = await setup({ imageId: IMAGE_ID, pin: `${IMAGE_ID} created ` });
    expect(await s.get("/healthz/image")).toEqual({ status: 200, text: "image ok" });
    expect(s.calls).toContainEqual(["docker", "image", "inspect", "--format", "{{.Id}}", IMAGE]);
    expect(s.calls).toContainEqual([
      "docker", "container", "inspect", "--format", '{{.Image}} {{.State.Status}} {{index .Config.Labels "sandboxd"}}', PIN,
    ]);
  });

  it("answers 503 image missing without the image", async () => {
    const s = await setup({ imageId: null, pin: `${IMAGE_ID} created ` });
    expect(await s.get("/healthz/image")).toEqual({ status: 503, text: "image missing" });
  });

  it("answers 503 image missing when Docker does not answer in time", async () => {
    const s = await setup({ hang: true });
    expect(await s.get("/healthz/image")).toEqual({ status: 503, text: "image missing" });
  });

  it("answers 503 image unpinned without a pin", async () => {
    const s = await setup({ imageId: IMAGE_ID, pin: null });
    expect(await s.get("/healthz/image")).toEqual({ status: 503, text: "image unpinned" });
  });

  it("answers 503 image unpinned for a pin of an older image ID", async () => {
    const s = await setup({ imageId: IMAGE_ID, pin: `${OLD_IMAGE_ID} created ` });
    expect(await s.get("/healthz/image")).toEqual({ status: 503, text: "image unpinned" });
  });

  it("answers 503 image unpinned for a pin that was started once", async () => {
    const s = await setup({ imageId: IMAGE_ID, pin: `${IMAGE_ID} exited ` });
    expect(await s.get("/healthz/image")).toEqual({ status: 503, text: "image unpinned" });
  });

  it("answers 503 image unpinned for a pin with the label sandboxd=1", async () => {
    const s = await setup({ imageId: IMAGE_ID, pin: `${IMAGE_ID} created 1` });
    expect(await s.get("/healthz/image")).toEqual({ status: 503, text: "image unpinned" });
  });

  it("any other path still needs a signature", async () => {
    const s = await setup({ imageId: IMAGE_ID, pin: `${IMAGE_ID} created ` });
    expect((await s.get("/healthz/image/x")).status).toBe(401);
  });
});

describe("the default pin name is the one ops/sandbox/setup.sh creates", () => {
  it("SANDBOXD_PIN defaults to PIN= of setup.sh and can be set", () => {
    const setupSh = fs.readFileSync(path.join(__dirname, "..", "ops", "sandbox", "setup.sh"), "utf8");
    const pin = /^PIN=(\S+)$/m.exec(setupSh)?.[1];
    expect(pin).toBe(PIN);
    expect(loadConfig({}).pin).toBe(pin);
    expect(loadConfig({ SANDBOXD_PIN: "other-pin" }).pin).toBe("other-pin");
  });
});
