/**
 * The world of the hosted automaton tests (goals/sandbox/08): the rebuilt sandboxd of test/sandbox-world.ts with a fake
 * `run` that also answers the three commands src/automaton/service.ts sends into a sandbox: `automaton-start` (ok, or a
 * failure when `startFails` is set), the status command (turns and wallet address from a per-container log) and `tail` of
 * the log. `logOf(sandboxId)` sets what the log of the runtime in that sandbox holds.
 */
import { LOG_COMMAND, START_COMMAND, STATUS_COMMAND, TURN_PATTERN } from "../src/automaton/service.js";
import { sandboxWorld, type WorldOptions } from "./sandbox-world.js";

export const RUNTIME_WALLET = "0x00000000000000000000000000000000000a11ce";
// The basic regular expression grep reads is the same in JavaScript here.
const TURN_RE = new RegExp(TURN_PATTERN);

export async function automatonWorld(opts: WorldOptions & { startFails?: boolean } = {}) {
  const logs = new Map<string, string>();
  const started = new Set<string>();
  const w = await sandboxWorld({
    ...opts,
    respond: async (cmd, args, input) => {
      const own = await opts.respond?.(cmd, args, input);
      if (own) return own;
      if (cmd !== "docker" || args[0] !== "exec" || !args.includes("-lc")) return undefined;
      const name = args[1];
      const command = args[args.length - 1];
      if (command === START_COMMAND) {
        if (opts.startFails) return { code: 1, stdout: "AUTOMATON_START FAIL setup\n" };
        started.add(name);
        return { code: 0, stdout: "AUTOMATON_START ok\n" };
      }
      if (command === STATUS_COMMAND) {
        const log = logs.get(name) ?? "";
        const turns = log.split("\n").filter((l) => TURN_RE.test(l)).length;
        return { code: 0, stdout: `turns=${turns}\nwallet=${started.has(name) ? RUNTIME_WALLET : ""}\n` };
      }
      if (command === LOG_COMMAND) return { code: 0, stdout: logs.get(name) ?? "" };
      return undefined;
    },
  });
  const logOf = (sandboxId: string, text: string) => logs.set(`sbx-${sandboxId}`, text);
  /** What the control plane uploaded into a sandbox as the setup file. */
  const setupOf = (sandboxId: string) => {
    const raw = w.files.get(`sbx-${sandboxId}:/root/.automaton-setup.json`);
    return raw === undefined ? undefined : (JSON.parse(raw) as Record<string, any>);
  };
  return { ...w, logOf, setupOf, started };
}
