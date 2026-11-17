/**
 * What the control plane knows of the runtime inside a hosted automaton's sandbox, shared by src/automaton/service.ts and
 * src/automaton/sweep.ts without an import cycle between the two.
 */

/** A turn of the runtime in its log (src/agent/loop.ts at d8f8168), the same pattern harness/e2e/full.sh counts. */
export const TURN_PATTERN = "Turn [0-9A-Za-z_-]*: [0-9]* tools";
/** Held, not in the background: up to EXEC_HOLD_MAX_MS of src/sandbox/service.ts a command is answered with its result. */
export const START_TIMEOUT_MS = 90_000;
/** The mark `automaton-start` sets once the runtime is set up (docs/sandbox/automaton.md). */
export const AUTOSTART_MARK = "/root/.automaton/autostart";
