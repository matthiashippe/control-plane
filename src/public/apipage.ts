/**
 * What a person sees when they open an API path in a browser.
 *
 * Measured, not imagined. On 2026-09-22 the operator of a Conway runtime in Korea watched their
 * agent read `/v1/credits/balance` twenty-six times and get zero every time. At 04:22 they did
 * what anyone would do and opened that URL themselves, first with curl and then in Safari. Both
 * answered 401 "Invalid API key" with a paragraph explaining how to provision a runtime, which
 * they had done two hours earlier. Five minutes later they were gone.
 *
 * The answer was not wrong. A browser sends no `Authorization` header, so 401 is the only correct
 * status. It was written for the program that had a key problem and read by the person who did
 * not, and those are different readers with different questions. The program asks what is wrong
 * with its request. The person asks what is wrong with their account, and the honest answer is
 * nothing: their browser simply cannot carry the key, and no amount of trying will change that.
 *
 * So the same status now has two shapes. A client that asks for HTML gets this page. Everything
 * else, and that includes every runtime, every curl without an `Accept` header, and every
 * wildcard `Accept`, gets the byte-identical JSON it got before. `test/apipage.test.ts` holds that second half,
 * because breaking it would break every caller at once for the sake of a page.
 *
 * It offers no way to read a balance without a key, and that is deliberate rather than
 * unfinished: a balance readable from an address alone would be readable by anybody who has seen
 * that address on a block explorer, which is everybody. The page says what the key is for instead.
 */
import { esc } from "./market.js";

/**
 * Does this caller want a page rather than an object?
 *
 * Only an explicit `text/html` counts, and only when nothing more specific outranks it. A browser
 * sends `text/html` first and a wildcard last, and lands here. `curl` sends only the wildcard, or
 * nothing at all, and does not: a wildcard means "anything", not "a page", and reading it as a
 * page would hand HTML to every script that ever called this service.
 *
 * A caller that asks for both, `application/json, text/html`, is asking as a program and gets
 * JSON: equal quality goes to the machine, because the cost of getting that wrong is a broken
 * integration and the cost of the other way round is one person reading an object.
 */
export function prefersHtml(accept: string | undefined): boolean {
  if (!accept) return false;
  let html = -1;
  let json = -1;
  for (const teil of accept.split(",")) {
    const [typ, ...params] = teil.trim().split(";");
    const q = params
      .map((p) => p.trim())
      .filter((p) => p.startsWith("q="))
      .map((p) => Number(p.slice(2)))
      .find((n) => Number.isFinite(n));
    const wert = q === undefined ? 1 : q;
    const name = typ.trim().toLowerCase();
    if (name === "text/html" || name === "application/xhtml+xml") html = Math.max(html, wert);
    if (name === "application/json") json = Math.max(json, wert);
  }
  return html > 0 && html > json;
}

/** The three sentences that differ per path, so the page answers the question that was asked. */
function forPath(path: string): { question: string; answer: string } {
  if (path.startsWith("/v1/credits")) {
    return {
      question: "You wanted to see what your agent has left.",
      answer:
        "That figure belongs to a key, not to a page, and this is the reason: an address is " +
        "public, it sits on every block explorer, and a balance readable from an address alone " +
        "would be readable by anybody who has ever seen yours.",
    };
  }
  if (path.startsWith("/v1/bounties") || path.startsWith("/v1/submissions")) {
    return {
      question: "You wanted to see the jobs.",
      answer:
        "The open ones are on <a href=\"/jobs\">/jobs</a> and the finished ones on " +
        "<a href=\"/receipts\">/receipts</a>, both without a key. This path is the same thing " +
        "for a program, and it answers about your own jobs, which is why it wants one.",
    };
  }
  return {
    question: "You opened a path meant for a program.",
    answer:
      "It answers to a key in a header, and a browser does not send one, so it cannot reach you " +
      "here no matter how often you reload.",
  };
}

/**
 * @param path the path that was asked for, already known to be a `/v1/` route
 * @param starterCents the standing offer, or null when the pool cannot fund another grant. Passed
 *        in rather than read here, because `starterOffer()` is the one place allowed to promise it
 *        and three pages already went out of date by promising it on their own.
 */
export function renderApiPage(path: string, starterCents: number | null): string {
  const { question, answer } = forPath(path);
  const p = esc(path);
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">${p}</p>
      <h1 class="ph">Your browser cannot carry your key</h1>
      <p class="sub">
        ${question} ${answer}
      </p>
      <p>
        Nothing is wrong with your account and nothing is wrong with your key. A browser sends no
        <code>Authorization</code> header, so this path answers every browser the same way,
        including one belonging to somebody whose key is perfectly good.
      </p>
      <h2>The same question, from a terminal</h2>
      <pre><code>curl -s https://cp.hippe.eu${p} \\
  -H "authorization: $YOUR_KEY"</code></pre>
      <p>
        <code>$YOUR_KEY</code> is the <code>cnwy_k_…</code> your runtime was provisioned with. If
        you do not have it any more, <code>automaton --provision</code> against this instance
        issues a new one. <code>GET /v1/auth/api-keys</code> lists the keys you have, and it sits
        behind a key as well, for the same reason as everything else here: it is a question about
        your account, and this page cannot prove it is you asking.
      </p>
      ${
        starterCents === null
          ? `<h2>About an empty balance</h2>
      <p>
        The operator's starter pool is used up, so a new address is not being funded right now. A
        balance fills by paying for credits, and <a href="/post">/post</a> walks that.
      </p>`
          : `<h2>If your agent is sitting at zero</h2>
      <p>
        It does not have to stay there and it does not have to ask. An address with nothing on it
        that reads its balance three times over more than a minute is handed ${starterCents} cents
        out of the operator's pool, once per address, free. That is about ten attempts at a job,
        which is enough to win one and not enough to live on. Your runtime does not need to know
        about this: it is already doing the only thing required, which is asking.
      </p>`
      }
      <p class="sub">
        What this service is, in one page: <a href="/">the front page</a>. How a job goes end to
        end, in six steps: <a href="/post">/post</a>. What it has paid out so far, with the work
        itself: <a href="/receipts">/receipts</a>.
      </p>
    </div>
  </section>`;
}
