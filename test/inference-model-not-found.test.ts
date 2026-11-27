import { afterEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { openDb } from "../src/db.js";
import { DOC } from "../src/errors.js";
import { MockProvider } from "../src/inference/mock.js";
import { Catalog, handleChat } from "../src/inference/proxy.js";

/**
 * On 2026-11-21 the one outside customer with a sandbox got five 404 model_not_found answers, and
 * nobody could say afterwards which model its runtime had asked for: the service wrote no line for
 * them (goals/fehler/15). These tests pin the line that names the model, and that it names nothing
 * about the caller.
 */

function setup() {
  const db = openDb(":memory:");
  const catalog = new Catalog([new MockProvider()], { "gpt-5.2": "mock-1" });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  return { db, catalog, address, logs };
}

/** The 404 exactly as it was before the log line existed. */
function expected404(model: string) {
  return {
    error: "model_not_found",
    model,
    message:
      `This instance does not serve a model called "${model}". Available: mock-1, gpt-5.2. ` +
      "GET /v1/models has the full catalogue with prices; the IDs the runtime asks for are " +
      "mapped to real models by the operator, so the list differs between instances.",
    docs: DOC.models,
  };
}

const notFoundLines = (logs: string[]) => logs.filter((l) => l.includes("model_not_found"));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("model_not_found log line", () => {
  it("logs the requested model on model_not_found without the address", async () => {
    const { db, catalog, address, logs } = setup();
    const secret = "the customer's private prompt";
    const res = await handleChat(db, catalog, address, {
      model: "gpt-5.3",
      messages: [{ role: "user", content: secret }],
    });

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).toBe(JSON.stringify(expected404("gpt-5.3")));

    const lines = notFoundLines(logs);
    expect(lines).toEqual([`[inference] model_not_found model=gpt-5.3 known=${catalog.modelIds().length}`]);
    expect(catalog.modelIds().length).toBe(2);
    for (const line of logs) {
      expect(line.toLowerCase()).not.toContain(address);
      expect(line.toLowerCase()).not.toContain(address.slice(2));
      expect(line).not.toContain(secret);
    }
  });

  it("logs model=<invalid> for a model with a line break", async () => {
    const { db, catalog, address, logs } = setup();
    const model = "gpt-5.3\n[inference] charged 999 mc";
    const res = await handleChat(db, catalog, address, { model, messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).toBe(JSON.stringify(expected404(model)));

    expect(notFoundLines(logs)).toEqual([`[inference] model_not_found model=<invalid> known=2`]);
    for (const line of logs) {
      expect(line).not.toContain("\n");
      expect(line).not.toContain("charged 999");
    }
  });

  it("cuts a long model id to 120 characters in the line", async () => {
    const { db, catalog, address, logs } = setup();
    const model = "openai/" + "x".repeat(300);
    const res = await handleChat(db, catalog, address, { model, messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).toBe(JSON.stringify(expected404(model)));
    expect(notFoundLines(logs)).toEqual([`[inference] model_not_found model=${model.slice(0, 120)} known=2`]);
  });

  it("logs model=<invalid> when the line break sits past the cut", async () => {
    const { db, catalog, address, logs } = setup();
    const model = "x".repeat(130) + "\nforged";
    const res = await handleChat(db, catalog, address, { model, messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(404);
    expect(notFoundLines(logs)).toEqual([`[inference] model_not_found model=<invalid> known=2`]);
  });

  it("writes no model_not_found line for a model the catalogue serves", async () => {
    const { db, catalog, address, logs } = setup();
    await handleChat(db, catalog, address, { model: "gpt-5.2", messages: [{ role: "user", content: "hi" }] });
    expect(notFoundLines(logs)).toEqual([]);
  });
});
