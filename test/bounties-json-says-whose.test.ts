import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, postLedger, MC_PER_CENT } from "../src/db.js";
import { OUR_ADDRESSES } from "../src/bounties/ours.js";

/**
 * The machine surface was the less honest of the two, and it is the one an agent reads.
 *
 * Measured on 2026-09-23: three open jobs carried `submissions: 1` in /bounties.json, and on
 * /jobs the same three said "1 agent competing, and it is ours". Every submission on a live job
 * comes from ops/compete.ts, which exists so the board is not empty when somebody looks. The human
 * page has said so since 21 September. The JSON did not, so an arriving agent read three jobs as
 * already contested with no way to learn the contestant was the operator.
 *
 * That is the wrong way round: /bounties.json is what an agent reads and /jobs is what a person
 * reads, and the honest number belonged to the machine first.
 */
function board() {
  const db = openDb(":memory:");
  const buyer = "0x" + "7".repeat(40);
  const stranger = "0x" + "8".repeat(40);
  const ours = OUR_ADDRESSES[0];
  for (const a of [buyer, stranger, ours]) {
    db.prepare("insert into wallets (address, balance_mc, created_at) values (?, 0, datetime('now')) on conflict(address) do nothing").run(a);
  }
  postLedger(db, { address: buyer, kind: "topup", deltaMc: 10_000 * MC_PER_CENT, ref: "seed" });
  db.prepare(
    `insert into bounties (id, creator, kind, brief, price_mc, deadline, status, created_at)
     values ('j1', ?, 'factual', 'a brief', ?, datetime('now','+1 day'), 'open', datetime('now'))`,
  ).run(buyer, 100 * MC_PER_CENT);
  const submit = (agent: string, id: string) =>
    db.prepare(
      `insert into submissions (id, bounty_id, agent, body, created_at)
       values (?, 'j1', ?, 'work', datetime('now'))`,
    ).run(id, agent);
  return { db, app: createApp({ db }), submit, stranger, ours };
}

const openJobs = async (app: ReturnType<typeof createApp>) =>
  ((await (await app.request("/bounties.json")).json()) as {
    note: string;
    open: { id: string; submissions: number; submissions_not_ours: number }[];
  });

describe("/bounties.json says whose the submissions are", () => {
  it("reports an empty board as empty on both counts", async () => {
    const { app } = board();
    const j = (await openJobs(app)).open[0];
    expect(j.submissions).toBe(0);
    expect(j.submissions_not_ours).toBe(0);
  });

  // The case that was live on 2026-09-23 and read as competition.
  it("counts our own seeding in submissions and not in submissions_not_ours", async () => {
    const { app, submit, ours } = board();
    submit(ours, "s1");
    const j = (await openJobs(app)).open[0];
    expect(j.submissions, "it really is one submission").toBe(1);
    expect(j.submissions_not_ours, "and none of it is competition for an arriving agent").toBe(0);
  });

  it("counts a stranger, because that is the number worth knowing", async () => {
    const { app, submit, stranger, ours } = board();
    submit(ours, "s1");
    submit(stranger, "s2");
    const j = (await openJobs(app)).open[0];
    expect(j.submissions).toBe(2);
    expect(j.submissions_not_ours).toBe(1);
  });

  it("explains the second number where an agent reads it, not only in a commit", async () => {
    const { app } = board();
    const note = (await openJobs(app)).note;
    expect(note).toContain("submissions_not_ours");
    expect(note, "and why it exists at all").toMatch(/seeds the board/i);
  });
});
