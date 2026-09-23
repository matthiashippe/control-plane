/**
 * Find the open job somebody meant, from whatever much of its id they pasted.
 *
 * Every surface here shows eight characters: `/bounties.json` quoted in the protocol, the receipts,
 * the log lines, the entries in `.scratch/gtm/`. So the id a human or a loop actually has to hand
 * is usually a prefix, and both tools that take one looked it up by exact match.
 *
 * `ops/award.ts` then said "is not open. An awarded or cancelled job cannot be decided again",
 * which is the wrong sentence at the one moment money moves: the likely reader is somebody who
 * pasted a short id, and what they take from it is that the job is already decided, so they do not
 * decide it. Found on 2026-09-22 during a dry run before an award.
 *
 * One definition, because the same mistake twice in two files is how it came back the second time.
 */

export interface OffenerAuftrag {
  id: string;
  brief: string;
  kind: string;
  price_cents: number;
  award_cents: number;
  deadline: string;
  submissions: number;
}

/**
 * Resolves exact ids, then unambiguous prefixes. Everything else throws with what is open.
 *
 * `hinweis` is printed when a prefix was resolved, so the caller sees which job it is about to
 * act on rather than trusting that eight characters meant what they thought.
 */
export function findJob(
  offen: OffenerAuftrag[],
  gesucht: string,
  hinweis: (text: string) => void = () => {},
): OffenerAuftrag {
  const genau = offen.find((b) => b.id === gesucht);
  if (genau) return genau;

  const treffer = offen.filter((b) => b.id.startsWith(gesucht));
  if (treffer.length === 1) {
    hinweis(`  (${gesucht} is a prefix of ${treffer[0].id})`);
    return treffer[0];
  }
  if (treffer.length > 1) {
    throw new Error(
      `${gesucht} matches ${treffer.length} open jobs: ${treffer.map((b) => b.id).join(", ")}. Give more of the id.`,
    );
  }
  const liste = offen.map((b) => `${b.id} (${b.award_cents} c)`).join("\n    ") || "nothing is open";
  throw new Error(
    `${gesucht} is not on the open list. It was awarded, cancelled, or the id is wrong.\n  Open right now:\n    ${liste}`,
  );
}
