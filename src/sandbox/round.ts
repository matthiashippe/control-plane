/**
 * The billing round of the service (src/index.ts): first the sandbox tick, then the sweep of hosted automatons
 * (goals/hosting/01). Nothing runs before `firstDelayMs`: the rollout canary runs this image for a few seconds against a
 * copy of the database in the same volume, with the same key, and must not bill, stop or delete anything. After that one
 * round every `intervalMs`. The sweep starts only once the tick has settled, also after a failed tick.
 */
export interface BillingRoundOptions {
  tick: () => Promise<unknown>;
  /** Absent when there is no automaton service. */
  sweep: (() => Promise<unknown>) | undefined;
  firstDelayMs: number;
  intervalMs: number;
  log: (line: string) => void;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function startBillingRound(opts: BillingRoundOptions): { stop: () => void } {
  let interval: ReturnType<typeof setInterval> | undefined;
  const round = () =>
    void opts
      .tick()
      .catch((err) => opts.log(`[sandbox] tick failed: ${message(err)}`))
      .then(() => opts.sweep?.())
      .catch((err) => opts.log(`[automaton] sweep failed: ${message(err)}`));
  const first = setTimeout(() => {
    round();
    interval = setInterval(round, opts.intervalMs);
    interval.unref?.();
  }, opts.firstDelayMs);
  first.unref?.();
  return {
    stop: () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    },
  };
}
