/**
 * goals/kunden/17: the 402 to an older maintained runtime names the command that installs the release, and every
 * other 402 stays byte for byte. Against createApp and handleChat with an in-memory database and the mock provider,
 * CP_PUBLIC_URL set to the canonical host. No network, no port.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { claimStarter } from "../src/credits/starter.js";
import { MockProvider, MOCK_MODEL } from "../src/inference/mock.js";
import { Catalog, handleChat } from "../src/inference/proxy.js";
import {
  isOlderMaintained,
  MAINTAINED_RELEASE,
  MAINTAINED_START_COMMAND,
  MAINTAINED_UPDATE_COMMAND,
} from "../src/inference/maintained.js";

const HOST = "https://automatonhost.com";
const GUIDE = new URL("../docs/paket/anleitung.md", import.meta.url);
const SENTENCE = "Update this automaton so it shows this itself, then restart it with automaton --run: ";
const savedUrl = process.env.CP_PUBLIC_URL;

beforeEach(() => {
  process.env.CP_PUBLIC_URL = HOST;
});
afterEach(() => {
  if (savedUrl === undefined) delete process.env.CP_PUBLIC_URL;
  else process.env.CP_PUBLIC_URL = savedUrl;
});

type Body402 = { error: string; message: string; message_for_operator?: string; details: Record<string, unknown> };

/** An account at 0 with the starter pool used up, so every call is answered with the 402 of open intake. */
function emptyAccount() {
  const db = openDb(":memory:");
  // Until a grant is refused (pool or daily limit), so the call below cannot take one and bounces, as test/werbung.test.ts does it.
  for (;;) {
    try {
      claimStarter(db, privateKeyToAccount(generatePrivateKey()).address.toLowerCase());
    } catch {
      break;
    }
  }
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "cd".repeat(16);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, now);
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address,
    hashApiKey(key),
    key.slice(0, 15),
    "test",
    now,
  );
  const catalog = new Catalog([new MockProvider()]);
  const app = createApp({ db, catalog });
  const body = { model: MOCK_MODEL.id, messages: [{ role: "user", content: "hi" }], max_tokens: 512 };
  /** The raw text of the answer, so a comparison is byte for byte and not only by value. */
  const chat = async (userAgent?: string): Promise<string> => {
    const headers: Record<string, string> = { "content-type": "application/json", authorization: key };
    if (userAgent !== undefined) headers["user-agent"] = userAgent;
    const res = await app.request("/v1/chat/completions", { method: "POST", headers, body: JSON.stringify(body) });
    expect(res.status).toBe(402);
    return res.text();
  };
  return { db, catalog, address, body, chat };
}

/** The lines of the code block under `## Installieren` of the guide, in order. */
function installBlock(): string[] {
  const guide = readFileSync(GUIDE, "utf8");
  const start = guide.indexOf("## Installieren");
  expect(start, "the section ## Installieren").toBeGreaterThan(0);
  const section = guide.slice(start, guide.indexOf("\n## ", start + 1));
  const block = section.match(/```bash\n([\s\S]*?)\n```/);
  expect(block, "a bash block under ## Installieren").not.toBeNull();
  return block![1].split("\n").map((l) => l.trim()).filter((l) => l !== "");
}

/** The guide without the section that lists the commits of the fork, which names older versions on purpose. */
function guideOutsideCommitList(): string {
  const guide = readFileSync(GUIDE, "utf8");
  const start = guide.indexOf("## Was das Paket gegenüber Upstream ändert");
  expect(start, "the section with the list of commits").toBeGreaterThan(0);
  const end = guide.indexOf("\n## ", start + 1);
  expect(end, "a section after the list of commits").toBeGreaterThan(start);
  return guide.slice(0, start) + guide.slice(end);
}

describe("402 to an older maintained runtime (goals/kunden/17)", () => {
  it("names the update command in the 402 for an older maintained runtime", async () => {
    const { chat } = emptyAccount();
    const before = JSON.parse(await chat()) as Body402;
    expect(before.details.update_command).toBeUndefined();

    for (const version of ["0.2.2-maintained.1", "0.2.2-maintained.2", "0.2.2-maintained.0"]) {
      const body = JSON.parse(await chat(`automaton-maintained/${version}`)) as Body402;
      expect(body.details.update_command, version).toBe(MAINTAINED_UPDATE_COMMAND);
      expect(body.message_for_operator, version).toBe(`${before.message_for_operator} ${SENTENCE}${MAINTAINED_UPDATE_COMMAND}`);
      expect(body.message_for_operator).toContain(`${HOST}/card/5?address=`);
      expect(body.message_for_operator).not.toMatch(/\n|[\u2013\u2014]/);
      // Everything else stays: message, required_cents, current_balance_cents, card_url, topup_url and the rest.
      const rest = structuredClone(body);
      delete rest.details.update_command;
      rest.message_for_operator = before.message_for_operator;
      expect(rest, version).toEqual(before);
      expect(body.message).toBe(before.message);
    }
    expect(MAINTAINED_UPDATE_COMMAND).toBe(`npm install -g github:matthiashippe/automaton#${MAINTAINED_RELEASE}`);
  });

  it("keeps the 402 unchanged for the current maintained runtime", async () => {
    const { chat } = emptyAccount();
    const before = await chat();
    for (const version of [MAINTAINED_RELEASE.slice(1), `0.2.2-maintained.${Number(MAINTAINED_RELEASE.split(".").pop()) + 1}`, "0.2.2-maintained.10"]) {
      expect(await chat(`automaton-maintained/${version}`), version).toBe(before);
    }
    expect(await chat(`automaton-maintained/${MAINTAINED_RELEASE.slice(1)} (linux)`)).toBe(before);
    expect(before).not.toContain("update_command");
    expect(before).not.toContain(SENTENCE);
  });

  it("keeps the 402 unchanged for an upstream runtime", async () => {
    const { chat } = emptyAccount();
    const before = await chat();
    const others = [
      "",
      "node",
      "conway-automaton/0.2.2",
      "automaton/0.2.2",
      "Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0",
      "automaton-maintained/",
      "automaton-maintained/garbage",
      "automaton-maintained/0.2.2-maintained.1x",
      "automaton-maintained/0.2.3-maintained.1",
      "automaton-maintained/v0.2.2-maintained.1",
      "x automaton-maintained/0.2.2-maintained.1",
    ];
    for (const ua of others) {
      expect(isOlderMaintained(ua), ua).toBe(false);
      expect(await chat(ua), ua).toBe(before);
    }
    expect(isOlderMaintained(undefined)).toBe(false);
    expect(isOlderMaintained(null)).toBe(false);
  });

  it("names the restart before the update command", async () => {
    // The guide installs with the update command and then starts with the line after it; npm install -g only swaps
    // the files, so the running runtime keeps its old version until it is started again.
    const lines = installBlock();
    const at = lines.indexOf(MAINTAINED_UPDATE_COMMAND);
    expect(at, "the update command in the install block").toBeGreaterThanOrEqual(0);
    const start = lines[at + 1];
    expect(start).toBe("automaton --run");
    expect(MAINTAINED_START_COMMAND).toBe(start);

    const { chat } = emptyAccount();
    const before = JSON.parse(await chat()) as Body402;
    const body = JSON.parse(await chat("automaton-maintained/0.2.2-maintained.1")) as Body402;
    const sentence = `Update this automaton so it shows this itself, then restart it with ${start}: ${MAINTAINED_UPDATE_COMMAND}`;
    expect(body.message_for_operator).toBe(`${before.message_for_operator} ${sentence}`);
    const text = body.message_for_operator!;
    expect(text.indexOf(`restart it with ${start}`)).toBeGreaterThan(0);
    expect(text.indexOf(`restart it with ${start}`)).toBeLessThan(text.lastIndexOf(MAINTAINED_UPDATE_COMMAND));
    // The command closes the line, so the agent can pass it on without a trailing mark.
    expect(text.endsWith(`: ${MAINTAINED_UPDATE_COMMAND}`)).toBe(true);
    expect(body.details.update_command).toBe(MAINTAINED_UPDATE_COMMAND);
  });

  it("keeps the 402 unchanged while topups are closed", async () => {
    const { db, catalog, address, body } = emptyAccount();
    const closed = await handleChat(db, catalog, address, body, { topupsClosed: true });
    const older = await handleChat(db, catalog, address, body, {
      topupsClosed: true,
      userAgent: "automaton-maintained/0.2.2-maintained.1",
    });
    expect(closed.status).toBe(402);
    expect(JSON.stringify(older.body)).toBe(JSON.stringify(closed.body));
    expect(JSON.stringify(older.body)).not.toContain("update_command");
  });

  it("keeps MAINTAINED_RELEASE equal to the Release line of the guide", () => {
    const guide = readFileSync(GUIDE, "utf8");
    const release = guide.match(/^Release: (\S+)$/m);
    expect(release, "a line Release: in docs/paket/anleitung.md").not.toBeNull();
    expect(MAINTAINED_RELEASE).toBe(release![1]);
    const install = guide.slice(guide.indexOf("## Installieren"), guide.indexOf("\n## ", guide.indexOf("## Installieren") + 1));
    const commands = install.split("\n").filter((l) => l.startsWith("npm install -g "));
    expect(commands).toEqual([MAINTAINED_UPDATE_COMMAND]);
  });

  it("names only the released version in the guide", () => {
    const outside = guideOutsideCommitList();
    const named = outside.match(/0\.2\.2-maintained\.[0-9]+/g) ?? [];
    // Release line, install command, the output of `automaton --version` and the release page.
    expect(named.length).toBeGreaterThanOrEqual(4);
    expect([...new Set(named)]).toEqual([MAINTAINED_RELEASE.slice(1)]);
    expect(outside).toContain(`\`automaton --version\` gibt \`automaton-maintained ${MAINTAINED_RELEASE.slice(1)}\` aus.`);
    expect(outside).toContain(`https://github.com/matthiashippe/automaton/releases/tag/${MAINTAINED_RELEASE}\n`);
  });
});
