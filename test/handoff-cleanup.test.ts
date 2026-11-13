/**
 * The hourly cleanup removes handoffs (goals/konto/02, Punkt 11): `POST /v1/handoff` writes without a key on a stranger's word,
 * so every row goes a day after it was created, whatever its state, and a younger one stays.
 */
import { describe, expect, it } from "vitest";
import { cleanupExpired } from "../src/db.js";
import { START, buttons, create, handoffApp, tap } from "./handoff-helpers.js";

const HOUR = 60 * 60 * 1000;

describe("cleanupExpired and handoffs", () => {
  it("removes handoffs created more than 24 hours ago in every state, and their page answers 404", async () => {
    const { app, db, clock } = handoffApp();
    const pending = await create(app);
    const done = await create(app);
    const burned = await create(app);
    const expired = await create(app);

    expect((await tap(app, done.code, done.match)).status).toBe(200);
    const page = await (await app.request(`/h/${burned.code}`)).text();
    const wrong = buttons(page).find((n) => n !== burned.match);
    expect(wrong).toBeDefined();
    await tap(app, burned.code, wrong!);
    clock.now = START + 601_000;
    await app.request(`/h/${expired.code}`);

    const states = (db.prepare("SELECT code, state FROM handoffs").all() as { code: string; state: string }[]).reduce<
      Record<string, string>
    >((m, r) => ({ ...m, [r.code]: r.state }), {});
    expect(states).toEqual({
      [pending.code]: "pending",
      [done.code]: "done",
      [burned.code]: "burned",
      [expired.code]: "expired",
    });

    clock.now = START + 24 * HOUR + 60_000;
    const removed = cleanupExpired(db, clock.now);

    expect(removed.handoffs).toBe(4);
    expect((db.prepare("SELECT count(*) AS n FROM handoffs").get() as { n: number }).n).toBe(0);
    for (const h of [pending, done, burned, expired]) {
      expect((await app.request(`/h/${h.code}`)).status, h.code).toBe(404);
    }
  });

  it("keeps a handoff created 23 hours ago", async () => {
    const { app, db, clock } = handoffApp();
    const young = await create(app);

    clock.now = START + 23 * HOUR;
    const removed = cleanupExpired(db, clock.now);

    expect(removed.handoffs).toBe(0);
    expect(db.prepare("SELECT code FROM handoffs").all()).toEqual([{ code: young.code }]);
    expect((await app.request(`/h/${young.code}`)).status).not.toBe(404);
  });
});
