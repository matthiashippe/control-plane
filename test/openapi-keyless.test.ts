import "./yield-between-tests";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

/**
 * The 429 of the keyless door, described the way the door answers it.
 *
 * Three caps answer 429 on this path: the keys everybody shares today (`daily_limit`), the own cap of
 * a declared crawler (`crawler_daily_limit`) and the limiter per address in front of every path that
 * works without a key (`rate_limited`). An agent that reads only the document has to learn from it
 * which one hit it, so the schema lists exactly these codes and each body of a real 429 fits it.
 */
type LimitSchema = {
  type?: string;
  minimum?: number;
  description?: string;
  enum?: string[];
  properties?: Record<string, LimitSchema>;
  required?: string[];
};

const CRAWLER_AGENT = "ExampleBot/1.0 (+https://example.com/bot)";

async function limitSchema(app: ReturnType<typeof createApp>): Promise<LimitSchema> {
  const res = await app.request("/openapi.json");
  expect(res.status).toBe(200);
  const doc = (await res.json()) as {
    paths: Record<string, { post: { responses: Record<string, { content?: Record<string, { schema: LimitSchema }> }> } }>;
  };
  const schema = doc.paths["/v1/auth/keyless"].post.responses["429"].content?.["application/json"]?.schema;
  expect(schema).toBeDefined();
  return schema as LimitSchema;
}

async function mint(app: ReturnType<typeof createApp>, userAgent: string, address: string) {
  return app.request("/v1/auth/keyless", {
    method: "POST",
    headers: { "user-agent": userAgent, "x-forwarded-for": address },
  });
}

beforeEach(() => {
  delete process.env.CP_AGENT_MINTS_PER_DAY;
  delete process.env.CP_CRAWLER_MINTS_PER_DAY;
});

describe("the 429 of POST /v1/auth/keyless in /openapi.json", () => {
  it("the 429 schema of POST /v1/auth/keyless lists exactly the codes the door answers with", async () => {
    process.env.CP_AGENT_MINTS_PER_DAY = "1";
    process.env.CP_CRAWLER_MINTS_PER_DAY = "1";
    const capped = setup();
    const bodies: Record<string, unknown>[] = [];

    expect((await mint(capped, "node", "192.0.2.60")).status).toBe(201);
    const everybody = await mint(capped, "node", "192.0.2.61");
    expect(everybody.status).toBe(429);
    bodies.push((await everybody.json()) as Record<string, unknown>);

    expect((await mint(capped, CRAWLER_AGENT, "192.0.2.62")).status).toBe(201);
    const crawler = await mint(capped, CRAWLER_AGENT, "192.0.2.63");
    expect(crawler.status).toBe(429);
    bodies.push((await crawler.json()) as Record<string, unknown>);

    const limited = createApp({ db: openDb(":memory:"), rateLimit: { limit: 1, windowMs: 60_000 } });
    expect((await mint(limited, "node", "192.0.2.64")).status).toBe(201);
    const perAddress = await mint(limited, "node", "192.0.2.64");
    expect(perAddress.status).toBe(429);
    bodies.push((await perAddress.json()) as Record<string, unknown>);

    const schema = await limitSchema(capped);
    const codes = bodies.map((body) => body.error as string).sort();
    expect(new Set(codes).size).toBe(3);
    expect([...(schema.properties?.error?.enum ?? [])].sort()).toEqual(codes);

    const properties = Object.keys(schema.properties ?? {});
    for (const body of bodies) {
      for (const field of schema.required ?? []) expect(body, `${body.error} lacks ${field}`).toHaveProperty(field);
      for (const field of Object.keys(body)) expect(properties, `${body.error} sends ${field}`).toContain(field);
    }
  });

  it("the 429 schema of POST /v1/auth/keyless says what each code means", async () => {
    const schema = await limitSchema(setup());
    const error = schema.properties?.error;
    expect(error?.enum?.length ?? 0).toBeGreaterThan(0);
    for (const code of error?.enum ?? []) expect(error?.description, code).toContain(code);
    expect(error?.description).toContain("midnight UTC");

    const retry = schema.properties?.retry_after_seconds;
    expect(retry?.type).toBe("integer");
    expect(retry?.minimum).toBe(0);
  });
});
