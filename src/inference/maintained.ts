/**
 * The released version of the maintained runtime `automaton-maintained` (goals/kunden/17).
 *
 * An installation of it never updates itself, so one that is older than this release never writes the card line of
 * goals/kunden/15 into its terminal. The 402 of such a runtime names the command that installs this release, and only
 * of such a runtime: the current one, a newer one and every other client get the 402 exactly as before.
 *
 * One source for the version: `MAINTAINED_RELEASE` is the tag of the line `Release:` in `docs/paket/anleitung.md`,
 * and test/inference-maintained-update.test.ts turns `check` red when the two differ.
 */
export const MAINTAINED_RELEASE = "v0.2.2-maintained.5";

/** The command from the block under `## Installieren` of `docs/paket/anleitung.md`, word for word. */
export const MAINTAINED_UPDATE_COMMAND = `npm install -g github:matthiashippe/automaton#${MAINTAINED_RELEASE}`;

/**
 * The start command from the line after the update command in the same block. `npm install -g` only swaps the files,
 * so the running runtime keeps its old version until it is started again with this command.
 */
export const MAINTAINED_START_COMMAND = "automaton --run";

const PREFIX = "automaton-maintained/";
const VERSION = /^0\.2\.2-maintained\.([0-9]{1,9})$/;

function maintainedNumber(version: string): number | null {
  const m = VERSION.exec(version);
  return m ? Number(m[1]) : null;
}

const RELEASED = maintainedNumber(MAINTAINED_RELEASE.slice(1));

/**
 * True only for `User-Agent: automaton-maintained/0.2.2-maintained.<n>` with `<n>` below the number of
 * `MAINTAINED_RELEASE`. The version is the token after the slash up to the first whitespace, as ops/card-visits.sh
 * reads it. Any other header (newer, equal, foreign, unreadable, missing) is false. The header is only compared here,
 * never logged and never stored.
 */
export function isOlderMaintained(userAgent: string | null | undefined): boolean {
  if (RELEASED === null || typeof userAgent !== "string" || !userAgent.startsWith(PREFIX)) return false;
  const n = maintainedNumber(userAgent.slice(PREFIX.length).split(/\s/, 1)[0]);
  return n !== null && n < RELEASED;
}
