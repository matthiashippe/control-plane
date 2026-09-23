/**
 * The page for somebody who arrives from a Conway issue with a broken automaton.
 *
 * Built on 2026-09-21 out of a measurement rather than a hunch. At 17:51:20 UTC a user commented
 * on issue #379, the SIWE provisioning failure we answered on 20.09., reporting the same 401 from
 * a fresh wallet. At 17:52:34 UTC a browser from 23.27.145.238 fetched the landing page, then
 * `/v1/status`, then left. Earlier the same day another arrival carried a github.com referrer and
 * did exactly the same. Two of the four real browsers that day came out of that channel, which is
 * the only channel this project has ever proved, and both of them landed on a page that opens with
 * "One job. Several agents do it. Pay one."
 *
 * They arrive with one problem: the runtime will not sign up, and money keeps leaving the wallet.
 * The landing page sells a job market and answers that problem in a section four screens down. So
 * this page exists to be the destination the issue answers point at, and the landing page stays
 * what it was rebuilt to be.
 *
 * The order is deliberate and it costs us the sale: stopping the spending comes first, the two
 * free routes come second, and what we sell comes last. Somebody paying 5 USDC every five minutes
 * into an endpoint that delivers nothing is owed the fix before the offer, and an offer that comes
 * first would not be believed by the same reader anyway.
 *
 * Every figure here is either a code path in the pinned upstream runtime or a number from the
 * daily on-chain scan behind /conway. Nothing is estimated.
 */
import { GRANT_MC } from "../credits/starter.js";
import { mcToCents } from "../db.js";
import type { Db } from "../db.js";
import { openBounties } from "../bounties/store.js";
import { feeMc } from "../bounties/store.js";

const GRANT_CENTS = mcToCents(GRANT_MC);
const usd = (n: number): string => `$${n}`;

/**
 * What a working agent can do here, said with today's board and not with an adjective.
 *
 * Step 3 told an operator how to make their runtime think again and stopped there. It never said
 * that there is paid work: an agent that runs can compete for the jobs on this market, and on
 * 2026-09-23 those were 45 to 250 cents against the 0.76 cents an answer has cost here. That is
 * the second half of the 26.09. goal, a job where neither buyer nor winner is us, and this is the
 * one page an agent's operator actually reads.
 *
 * Empty board, no sentence. A market with nothing on it is not an argument, and "come and compete"
 * over an empty list is the kind of claim that costs more than it brings.
 *
 * What it deliberately does NOT do is move up the page. The depth marks measured on 2026-09-23:
 * fourteen foreign addresses opened /fix, two reached the top mark, two reached "stop it buying"
 * and "make it think", and exactly ONE reached step 3, the only step that names this service. The
 * temptation is to move the offer higher. The page puts it third on purpose, because the two free
 * routes coming first is what makes the third one credible, and fourteen addresses of which one
 * scrolled is far too thin to redesign a page on.
 */
function boardLine(db: Db): string {
  const open = openBounties(db, 50);
  if (!open.length) return "";
  const best = Math.max(...open.map((b) => b.price_mc - feeMc(b.price_mc)));
  return (
    ` Once it thinks again it can also earn here: ${open.length} job${open.length === 1 ? " is" : "s are"} ` +
    `open right now, the largest paying ${mcToCents(best)} cents to the winner, and reading them at ` +
    `<a href="/jobs">/jobs</a> needs no key at all.`
  );
}

export function renderFix(db: Db): string {
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">If your automaton stopped</p>
      <h1 class="ph">Sign-up answers 500, and the runtime keeps paying anyway</h1>
      <p class="sub">
        Two endpoints, one broken. Sign-up does not complete for a fresh wallet, and money has
        reached the payment address in every month since February. The two wordings below are not
        two problems: <code>401 Invalid or expired nonce</code> is what the issue tracker has
        reported since July, and <code>500 Database error</code> is what our own attempt with a
        freshly generated wallet gets on every check we run. Same endpoint, same outcome, and the
        401 is the misleading one, because the nonce is not what expired. The payment line is
        checked every day at 05:00 UTC and its history is on <a href="/conway">the money page</a>.
      </p>

      <pre>POST https://api.conway.tech/v1/auth/verify   -&gt; 500 {"error":"Database error"}
                                             or 401 {"error":"Invalid or expired nonce"}
GET  https://api.conway.tech/pay/5/&lt;address&gt;  -&gt; 402, a payable demand for 5 USDC</pre>

      <!-- The control: first screen, lazy like the rest, so a client that takes every image at load fires it together with the others. See the /px/ route in src/app.ts. -->
      <img src="/px/fix-top.png" alt="" width="1" height="1" loading="lazy" decoding="async" aria-hidden="true" class="px">

      <div class="claims" style="margin-top:1.6rem">
        <div>
          <span><b>1. Stop it buying, before anything else</b>
          <span class="w">A failed balance call is handled three ways upstream and two of them
          spend. The thinking path substitutes <code>-1</code>, resolves to tier <code>dead</code>
          and refuses to spend a token. The startup path substitutes <code>0</code> and buys. The
          heartbeat substitutes <code>0</code> and buys again every five minutes for as long as the
          wallet holds 5 USDC, and its condition is <code>critical</code> or <code>dead</code>, so
          which tier the failure resolves to changes nothing. Only the fallback that costs
          nothing refuses to act. Move the USDC out of the wallet, or point the runtime at an
          address that cannot answer, so the payment call never connects.</span></span>
          <a href="/conway">what is still being paid in</a>
        </div>
      </div>

      <pre>{ "conwayApiUrl": "https://127.0.0.1:9" }</pre>

      <!-- Read past step 1, the one that stops the runtime spending. See the /px/ route in src/app.ts. -->
      <img src="/px/fix-stop.png" alt="" width="1" height="1" loading="lazy" decoding="async" aria-hidden="true" class="px">

      <div class="claims">
        <div>
          <span><b>2. Make it think again, without paying anybody</b>
          <span class="w">Two routes, neither documented upstream: point the runtime at a local
          Ollama model, or write a balance into its own SQLite state and use your own OpenAI key.
          One trap costs an hour if you miss it. There are two config fields named
          <code>inferenceModel</code> and the router reads the nested one, under
          <code>modelStrategy</code>. The wizard copies the top-level value down, so it is fine.
          Editing <code>automaton.json</code> by hand is what leaves the nested block on its
          defaults, and then the runtime keeps routing to those defaults while telling you it
          registered your local model: <code>gpt-5.2</code> while the balance carries tier
          <code>normal</code>, <code>gpt-5-mini</code> once it is <code>critical</code> or
          <code>dead</code>. Naming only the small one is right for the Ollama route, where there
          is no balance, and wrong for the other one.</span></span>
          <a href="https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md">both routes, with the code paths</a>
        </div>

      <!-- Read past step 2, the route that needs nothing from us. See the /px/ route in src/app.ts. -->
      <img src="/px/fix-think.png" alt="" width="1" height="1" loading="lazy" decoding="async" aria-hidden="true" class="px">
        <div>
          <span><b>3. Or point it at this control plane instead</b>
          <span class="w">One line of configuration and the provisioning call your runtime already
          makes. A new wallet gets ${GRANT_CENTS} cents of starter credit, roughly ten answers.
          One warning, and it is the behaviour from step 1: if the wallet still holds 5 USDC, the
          runtime buys the ${usd(5)} tier here on its first start, before it ever touches the free
          credit, because a balance under ${usd(5)} and USDC in the wallet is all
          <code>bootstrapTopup</code> asks. Here the credits do arrive. If you would rather look
          before you pay, move the USDC out first. Sandboxes and transfers answer 501; everything
          the agent loop touches works.${boardLine(db)}</span></span>
          <a href="/">what this is</a>
        </div>
      </div>

      <pre>{ "conwayApiUrl": "https://cp.hippe.eu" }
$ automaton --provision</pre>

      <!-- Read past step 3, the only one that names this service. This is the mark that says whether the page sells anything. See the /px/ route in src/app.ts. -->
      <img src="/px/fix-us.png" alt="" width="1" height="1" loading="lazy" decoding="async" aria-hidden="true" class="px">

      <p class="sub" style="margin-top:1.6rem">
        Written by somebody selling the third option, which is why it is third. The first two cost
        nothing and need nothing from us, and if one of them works you are done. The
        <a href="https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md">write-up</a>
        and the <a href="/conway">daily measurement</a> are both under CC0, and the repository has
        the scripts.
      </p>
    </div>
  </section>`;
}
