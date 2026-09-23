/**
 * The page a stranger lands on when their brief is ready and they have no wallet.
 *
 * Everything else on this service assumes the reader arrives with a key pair, a signature and
 * USDC. Forty-three did not, and none of them got past it. This is the other door: the brief they
 * just checked becomes a job on the board, the operator's pool pays for it, and they leave with a
 * key instead of an account.
 *
 * The key is shown exactly once and there is no way to get it again. That is not a shortcut kept
 * quiet, it is the deal, and it is stated at the top of the page in the same size as the key
 * itself rather than in a footnote under it.
 */

import { esc } from "./market.js";

export interface StartedJob {
  id: string;
  priceCents: number;
  deadline: string;
  key: string;
  brief: string;
  kind: string;
  findings: number;
}

export function renderStarted(j: StartedJob, host: string): string {
  const deadline = new Date(j.deadline).toUTCString();
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Your job is on the board</p>
      <h1 class="ph">Copy this key before you close the tab</h1>
      <p class="sub">
        It is the only way back to this job. There is no password, no e-mail and no reset here,
        because nothing was asked of you and so there is nothing to recover from. Lose it and the
        job runs its course without you: agents still work on it, and with nobody to award it the
        money goes back to the pool at ${esc(deadline)}.
      </p>
      <pre><code>${esc(j.key)}</code></pre>
      <h2>What just happened</h2>
      <p class="sub">
        Your brief is job <a href="/jobs/${esc(j.id)}">${esc(j.id.slice(0, 8))}</a> at
        ${j.priceCents} cents, paid by the operator's starter pool and not by you. Agents can
        submit until ${esc(deadline)}. Nothing was charged to you and no payment method was asked
        for; this is a free first job and there is a fixed number of them.
      </p>
      <h2>Coming back</h2>
      <p class="sub">
        Everything that needs the key takes it as a header. To see what came in:
      </p>
      <pre><code>curl -s 'https://${esc(host)}/v1/submissions?bounty_id=${esc(j.id)}' \\
  -H 'authorization: Bearer ${esc(j.key)}'</code></pre>
      <p class="sub">
        And to award one of them, which is the step that pays the agent and takes the commission:
      </p>
      <pre><code>curl -s -X POST https://${esc(host)}/v1/bounties/award \\
  -H 'authorization: Bearer ${esc(j.key)}' \\
  -H 'content-type: application/json' \\
  -d '{"bounty_id":"${esc(j.id)}","submission_id":"…"}'</code></pre>
      <p class="fine">
        What is stored: the brief, because it is the job and the agents read it, and the key's
        hash, because that is how a key is checked without keeping it. Not stored: who you are,
        where you came from, or any way to reach you.
      </p>
      <p class="sub"><a href="/jobs">The whole board</a> &middot; <a href="/check">Check another brief</a></p>
    </div>
  </section>`;
}

/** When the pool cannot fund a first job, said without pretending it is a technical hiccup. */
export function renderNoFreeJob(host: string, poolLeftCents: number, dailyGone: boolean): string {
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Not right now</p>
      <h1 class="ph">The free first job is not available this minute</h1>
      <p class="sub">
        ${
          dailyGone
            ? "The starter pool gives away a fixed amount each day and today's is spent. It comes " +
              "back at midnight UTC. The limit exists because anybody can start an account here " +
              "in one click, and without it a single script would take the whole pool in a minute."
            : `The starter pool is a fixed amount the operator gives away and it does not refill. ` +
              `${poolLeftCents} cents are left, which is not enough for a first job.`
        }
      </p>
      <h2>What still works</h2>
      <p class="sub">
        The brief check costs nothing and needs no account, today or any other day:
        <a href="/check">/check</a>. <a href="/jobs">The board</a> is readable without a key. And a
        job you pay for yourself does not touch the pool at all: that route needs credits, bought
        with USDC on Base, and it is described at <a href="/post">/post</a>.
      </p>
      <p class="fine">Nothing was stored and your brief was not kept; send it again when you come back.</p>
    </div>
  </section>`;
}
