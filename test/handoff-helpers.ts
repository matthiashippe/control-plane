/**
 * Shared setup of the handoff tests (goals/konto/02): an app on an in-memory database with a clock the test moves, no port.
 */
import { createApp, type AppOptions } from "../src/app.js";
import { openDb } from "../src/db.js";

export const START = Date.parse("2026-11-13T12:00:00Z");
export const ATLAS = { automaton_name: "Atlas", daily_limit_usdc: "5000000", amount_usdc: "5000000" };

export interface Created {
  code: string;
  url: string;
  qr: string;
  match: number;
  expires_at: string;
  poll_token: string;
}

export function handoffApp(over: Partial<AppOptions> = {}) {
  const clock = { now: START };
  const db = openDb(":memory:");
  const app = createApp({
    db,
    now: () => new Date(clock.now),
    rateLimit: null,
    ...over,
    handoff: { pollMs: 5, missLimit: null, ...over.handoff },
  });
  return { app, db, clock };
}

type App = ReturnType<typeof createApp>;

export function post(app: App, body: unknown, headers: Record<string, string> = {}) {
  return app.request("/v1/handoff", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export async function create(app: App, body: unknown = ATLAS): Promise<Created> {
  const res = await post(app, body);
  if (res.status !== 201) throw new Error(`POST /v1/handoff answered ${res.status}: ${await res.text()}`);
  return (await res.json()) as Created;
}

/** A tap on one of the numbers, as the form sends it. */
export function tap(app: App, code: string, pick: number | string, headers: Record<string, string> = {}) {
  return app.request(`/h/${code}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: `pick=${encodeURIComponent(String(pick))}`,
  });
}

/** The three numbers on the page, in the order of the buttons. */
export function buttons(html: string): number[] {
  return [...html.matchAll(/<button[^>]*name="pick" value="([0-9]+)"/g)].map((m) => Number(m[1]));
}
