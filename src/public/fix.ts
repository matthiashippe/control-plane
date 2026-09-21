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

const GRANT_CENTS = mcToCents(GRANT_MC);

export function renderFix(): string {
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">If your automaton stopped</p>
      <h1 class="ph">Sign-up answers 500, and the runtime keeps paying anyway</h1>
      <p class="sub">
        Two endpoints, one broken. Provisioning has failed for every fresh wallet since July 2026,
        and the payment endpoint has never stopped working. The first line below is what the issue
        tracker has reported since July and what we measured by hand on 21 September; the second is
        checked every day at 05:00 UTC and its history is on <a href="/conway">the money page</a>.
      </p>

      <pre>POST https://api.conway.tech/v1/auth/verify   -&gt; 500 {"error":"Database error"}
                                             or 401 {"error":"Invalid or expired nonce"}
GET  https://api.conway.tech/pay/5/&lt;address&gt;  -&gt; 402, a payable demand for 5 USDC</pre>

      <div class="claims" style="margin-top:1.6rem">
        <div>
          <span><b>1. Stop it buying, before anything else</b>
          <span class="w">A failed balance call is handled three ways upstream and two of them
          spend. The thinking path substitutes <code>-1</code>, resolves to tier <code>dead</code>
          and refuses to spend a token. The startup path substitutes <code>0</code> and buys. The
          heartbeat substitutes <code>0</code>, reads that as <code>critical</code>, and buys again
          every five minutes for as long as the wallet holds 5 USDC. Only the fallback that costs
          nothing refuses to act. Move the USDC out of the wallet, or point the runtime at an
          address that cannot answer, so the payment call never connects.</span></span>
          <a href="/conway">what is still being paid in</a>
        </div>
      </div>

      <pre>{ "conwayApiUrl": "https://127.0.0.1:9" }</pre>

      <div class="claims">
        <div>
          <span><b>2. Make it think again, without paying anybody</b>
          <span class="w">Two routes, neither documented upstream: point the runtime at a local
          Ollama model, or write a balance into its own SQLite state and use your own OpenAI key.
          One trap costs an hour if you miss it. There are two config fields named
          <code>inferenceModel</code> and the router reads the nested one, under
          <code>modelStrategy</code>. The wizard copies the top-level value down, so it is fine.
          Editing <code>automaton.json</code> by hand is what leaves the nested block on its
          defaults, and then the runtime keeps routing to <code>gpt-5-mini</code> while telling you
          it registered your local model.</span></span>
          <a href="https://github.com/matthiashippe/control-plane/blob/main/docs/without-control-plane.md">both routes, with the code paths</a>
        </div>
        <div>
          <span><b>3. Or point it at this control plane instead</b>
          <span class="w">One line of configuration and the provisioning call your runtime already
          makes. A new wallet gets ${GRANT_CENTS} cents of starter credit, roughly ten answers, so
          you can see whether it thinks before deciding anything. After that it costs money, and
          buying credits needs USDC on Base. Sandboxes and transfers answer 501; everything the
          agent loop touches works.</span></span>
          <a href="/">what this is</a>
        </div>
      </div>

      <pre>{ "conwayApiUrl": "https://cp.hippe.eu" }
$ automaton --provision</pre>

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
