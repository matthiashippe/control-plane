import "./yield-between-tests";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

/**
 * `/openapi.json` has to describe the keyless door the way it answers.
 *
 * An agent that reads only the document learns from it which fields a keyless key comes with, that
 * `keys_left_today` counts the places left of its cap, and which cap applies to it: the one everybody
 * shares or the smaller own cap of a declared crawler. Both numbers come from the running
 * configuration, so the description follows `CP_AGENT_MINTS_PER_DAY` and `CP_CRAWLER_MINTS_PER_DAY`.
 */
type JsonSchema = {
  type?: string;
  minimum?: number;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

const setup = () => createApp({ db: openDb(":memory:") });

async function keylessOperation(app: ReturnType<typeof createApp>) {
  const res = await app.request("/openapi.json");
  expect(res.status).toBe(200);
  const doc = (await res.json()) as { paths: Record<string, { post: Record<string, unknown> }> };
  return doc.paths["/v1/auth/keyless"].post as {
    description: string;
    responses: Record<string, { content?: Record<string, { schema: JsonSchema }> }>;
  };
}

afterEach(() => {
  delete process.env.CP_AGENT_MINTS_PER_DAY;
  delete process.env.CP_CRAWLER_MINTS_PER_DAY;
});

describe("POST /v1/auth/keyless in /openapi.json", () => {
  it("the 201 schema of POST /v1/auth/keyless names exactly the fields of a real answer", async () => {
    const app = setup();
    const operation = await keylessOperation(app);
    const schema = operation.responses["201"].content?.["application/json"]?.schema;
    expect(schema).toBeDefined();
    const properties = schema?.properties ?? {};

    const res = await app.request("/v1/auth/keyless", {
      method: "POST",
      headers: { "user-agent": "node", "x-forwarded-for": "192.0.2.50" },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;

    const bodyKeys = Object.keys(body).sort();
    expect(bodyKeys.length).toBeGreaterThan(0);
    expect(Object.keys(properties).sort()).toEqual(bodyKeys);
    expect([...(schema?.required ?? [])].sort()).toEqual(bodyKeys);

    for (const [field, value] of Object.entries(body)) {
      const fieldSchema = properties[field];
      if (fieldSchema.type === "integer") {
        expect(Number.isInteger(value), field).toBe(true);
        expect(value as number, field).toBeGreaterThanOrEqual(fieldSchema.minimum ?? 0);
      } else {
        expect(fieldSchema.type, field).toBe("string");
        expect(typeof value, field).toBe("string");
      }
    }

    const left = properties.keys_left_today;
    expect(left.type).toBe("integer");
    expect(left.minimum).toBe(0);
    expect(left.description).toContain("midnight UTC");
  });

  it("the description of POST /v1/auth/keyless names the cap for everybody and the crawler cap", async () => {
    const { description } = await keylessOperation(setup());
    expect(description).toContain("everybody shares 200 keys a day");
    expect(description).toContain("declared crawler");
    expect(description).toContain("own cap of 5 a day");
    expect(description).toContain("midnight UTC");
    expect(description).not.toContain("across the instance");
  });

  it("the description of POST /v1/auth/keyless follows the caps set by the environment", async () => {
    process.env.CP_AGENT_MINTS_PER_DAY = "7";
    process.env.CP_CRAWLER_MINTS_PER_DAY = "2";
    const { description } = await keylessOperation(setup());
    expect(description).toContain("everybody shares 7 keys a day");
    expect(description).toContain("own cap of 2 a day");
  });
});
