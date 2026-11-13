// What the sandbox walk (sandbox-walk.mjs, goals/sandbox/04) and the long exec walk (long-exec.mjs, goals/sandbox/05)
// share: the statuses the runtime's HTTP client retries, reading a status out of a tool error, recording every request
// the runtime's client sends through the global fetch, and redacting the sandbox id from texts.

/** The statuses the runtime's HTTP client retries and counts for its circuit breaker (`src/types.ts:613` at d8f8168). */
export const RETRIED = [429, 500, 502, 503, 504];

/** The HTTP status in a `Conway API error: … -> <status>: …` text, or null. */
export const statusOf = (text) => {
  const m = /-> ([0-9]{3}):/.exec(String(text ?? ""));
  return m ? Number(m[1]) : null;
};

/**
 * Wraps the global fetch, which the runtime's client uses (`src/conway/http-client.ts` at d8f8168). Every request
 * becomes one entry: its HTTP status, or `abort` when it was aborted (the runtime aborts every attempt after 30 s),
 * or `error` for any other failure. `take()` gives the entries since the last `reset()`; `restore()` puts the real
 * fetch back. `realFetch` is the fetch without recording.
 */
export function createFetchTap() {
  const realFetch = globalThis.fetch;
  let seen = [];
  let times = [];
  let t0 = Date.now();
  globalThis.fetch = async (input, init) => {
    const started = Date.now() - t0;
    try {
      const res = await realFetch(input, init);
      seen.push(res.status);
      times.push(started);
      return res;
    } catch (e) {
      const name = e?.name ?? "";
      seen.push(name === "AbortError" || name === "TimeoutError" || init?.signal?.aborted ? "abort" : "error");
      times.push(started);
      throw e;
    }
  };
  return {
    realFetch,
    reset() {
      seen = [];
      times = [];
      t0 = Date.now();
    },
    /** The entries since the last reset. */
    take() {
      return seen.slice();
    },
    /** When each entry since the last reset was sent, in ms after the reset. */
    times() {
      return times.slice();
    },
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

/** A function that replaces the id `getId()` gives (once known) with `{id}` in a text. */
export const redactor = (getId) => (t) => {
  const id = getId();
  return id ? String(t ?? "").split(id).join("{id}") : String(t ?? "");
};
