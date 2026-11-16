/**
 * Exposed ports of a sandbox (goals/sandbox/07, Done point 6), against a rebuilt sandboxd (test/sandbox-world.ts).
 *
 * `POST /v1/sandboxes/{id}/ports/expose` and `DELETE /v1/sandboxes/{id}/ports/{port}` go signed to sandboxd and answer
 * with `port` and `public_url` (docs/sandbox/vertrag.md). The runtime at d8f8168 reads `result.port` and
 * `result.public_url || result.publicUrl || result.url` and tells its model `Port <port> exposed at: <url>`
 * (`src/conway/client.ts:235`, `src/agent/tools.ts:228`). A sandbox of another owner is a 404 that never reaches
 * sandboxd. A public_url under postyourprice.com, the zone every paid request goes through, is never passed on: the
 * answer is the 501 of a broken sandboxd. An exposed port costs nothing extra (docs/sandbox/plan.md, Preis): no ledger
 * row, no change of the balance.
 */
import { afterEach, describe, expect, it } from "vitest";
import { getAvailableMc } from "../src/db.js";
import { WORLD_DOMAIN, closeWorlds, sandboxWorld, type WorldOptions } from "./sandbox-world.js";

afterEach(closeWorlds);

// The runtime's own reading of the expose answer, from src/conway/client.ts at d8f8168.
const readExpose = (result: any) => ({ port: result.port, publicUrl: result.public_url || result.publicUrl || result.url });

async function started(opts: WorldOptions = {}) {
  const w = await sandboxWorld(opts);
  const a = w.account();
  const res = await a.call("POST", "/v1/sandboxes", { memory_mb: 512 });
  expect(res.status).toBe(201);
  return { w, a, id: res.json.id as string };
}

const ledgerCount = (w: Awaited<ReturnType<typeof sandboxWorld>>) =>
  (w.db.prepare("SELECT count(*) AS n FROM ledger").get() as { n: number }).n;

describe("POST /v1/sandboxes/{id}/ports/expose", () => {
  it("passes the port on to sandboxd and answers port and public_url under its domain", async () => {
    expect(WORLD_DOMAIN).toBe("example.dev");
    const { w, a, id } = await started();
    const res = await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 });
    expect(res.status).toBe(200);
    expect(res.json.port).toBe(8080);
    expect(res.json.public_url).toBe(`https://sbx-${id}-8080.example.dev`);
    expect(readExpose(res.json)).toEqual({ port: 8080, publicUrl: `https://sbx-${id}-8080.example.dev` });
    expect(w.hits).toContain(`POST /v1/sandboxes/${id}/ports/expose`);
    expect(w.d.sandboxes()[id].ports).toEqual([8080]);
  });

  it("tells the model in plain words under which address its service is reachable", async () => {
    const { a, id } = await started();
    const res = await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 3000 });
    expect(res.status).toBe(200);
    expect(res.json.message).toContain(`https://sbx-${id}-3000.example.dev`);
    expect(res.json.message).toMatch(/reachable/i);
    expect(res.json.message).toContain("port 3000");
  });

  it("refuses a port that is not a number from 1 to 65535 with 400 and does not call sandboxd", async () => {
    const { w, a, id } = await started();
    for (const port of [0, 70000, "8080", 80.5]) {
      const before = w.hits.length;
      const res = await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port });
      expect(res.status, `port ${String(port)}`).toBe(400);
      expect(res.json.error).toBe("invalid_request");
      expect(w.hits.length).toBe(before);
    }
  });
});

describe("DELETE /v1/sandboxes/{id}/ports/{port}", () => {
  it("is passed on to sandboxd and succeeds; the port is closed there", async () => {
    const { w, a, id } = await started();
    expect((await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 })).status).toBe(200);
    const res = await a.call("DELETE", `/v1/sandboxes/${id}/ports/8080`);
    expect(res.status).toBe(200);
    expect(res.json.port).toBe(8080);
    expect(w.hits).toContain(`DELETE /v1/sandboxes/${id}/ports/8080`);
    expect(w.d.sandboxes()[id].ports).toEqual([]);
    // The next call of the same client is answered as usual.
    expect((await a.call("GET", "/v1/sandboxes")).status).toBe(200);
  });
});

describe("a sandbox of another owner", () => {
  it("answers 404 on expose and on DELETE and never reaches sandboxd", async () => {
    const { w, id } = await started();
    const other = w.account();
    const before = [...w.hits];
    const expose = await other.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 });
    const remove = await other.call("DELETE", `/v1/sandboxes/${id}/ports/8080`);
    for (const res of [expose, remove]) {
      expect(res.status).toBe(404);
      expect(res.json.error).toBe("sandbox_not_found");
      expect(res.json).not.toHaveProperty("public_url");
    }
    expect(w.hits).toEqual(before);
    expect(w.d.sandboxes()[id].ports).toEqual([]);
  });
});

describe("a public_url under postyourprice.com", () => {
  // An older sandboxd still builds its URLs under the zone of the payment; the control plane never passes them on.
  const zoneUrls = (id: string) => [
    `https://sbx-${id}-8080.postyourprice.com`,
    `https://sbx-${id}-8080.sbx.postyourprice.com`,
    `https://sbx-${id}-8080.PostYourPrice.COM`,
    `https://sbx-${id}-8080.postyourprice.com.`,
    `https://sbx-${id}-8080.postyourprice.com:443/`,
    "https://postyourprice.com",
  ];

  it("answers 501 sandbox_server_unreachable, as for a broken sandboxd, and no URL leaks", async () => {
    let planted = "";
    const { w, a, id } = await started({
      answer: (method, path) => (method === "POST" && path.endsWith("/ports/expose") ? { status: 200, body: { port: 8080, public_url: planted } } : undefined),
    });
    for (const url of zoneUrls(id)) {
      planted = url;
      const before = w.hits.length;
      const res = await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 });
      expect(w.hits.length, url).toBe(before + 1);
      expect(res.status, url).toBe(501);
      expect(res.json.error).toBe("sandbox_server_unreachable");
      expect(res.json).not.toHaveProperty("public_url");
      expect(JSON.stringify(res.json).toLowerCase()).not.toContain("postyourprice.com");
    }
  });

  it("passes on a URL of another domain whose name merely ends in the same letters", async () => {
    const { a, id } = await started({
      answer: (method, path) =>
        method === "POST" && path.endsWith("/ports/expose") ? { status: 200, body: { port: 8080, public_url: `https://sbx-${id}-8080.notpostyourprice.com` } } : undefined,
    });
    const res = await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 });
    expect(res.status).toBe(200);
    expect(res.json.public_url).toBe(`https://sbx-${id}-8080.notpostyourprice.com`);
  });

  it("answers 501 when sandboxd gives no usable public_url at all", async () => {
    for (const body of [{ port: 8080 }, { port: 8080, public_url: "not a url" }, { port: 8080, public_url: "ftp://sbx-a-8080.example.dev" }]) {
      const { a, id } = await started({
        answer: (method, path) => (method === "POST" && path.endsWith("/ports/expose") ? { status: 200, body } : undefined),
      });
      const res = await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 });
      expect(res.status, JSON.stringify(body)).toBe(501);
      expect(res.json.error).toBe("sandbox_server_unreachable");
    }
  });

  it("answers 501 sandbox_server_unreachable when sandboxd fails on expose or DELETE", async () => {
    const { a, id } = await started({
      answer: (method, path) => (path.includes("/ports") ? { status: 502, body: { error: "bad gateway" } } : undefined),
    });
    expect((await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 })).json.error).toBe("sandbox_server_unreachable");
    const del = await a.call("DELETE", `/v1/sandboxes/${id}/ports/8080`);
    expect(del.status).toBe(501);
    expect(del.json.error).toBe("sandbox_server_unreachable");
  });
});

describe("price of an exposed port", () => {
  it("adds no ledger row and does not change the balance when a port is exposed and removed", async () => {
    const { w, a, id } = await started();
    const rows = ledgerCount(w);
    const balance = w.balance(a.address);
    const available = getAvailableMc(w.db, a.address);
    expect((await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 })).status).toBe(200);
    expect((await a.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 9090 })).status).toBe(200);
    expect((await a.call("DELETE", `/v1/sandboxes/${id}/ports/8080`)).status).toBe(200);
    expect(ledgerCount(w)).toBe(rows);
    expect(w.sandboxRows(a.address)).toEqual([]);
    expect(w.balance(a.address)).toBe(balance);
    expect(getAvailableMc(w.db, a.address)).toBe(available);
  });
});
