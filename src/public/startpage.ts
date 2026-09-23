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

export function renderStarted(j: StartedJob, host: string, lang: "de" | "en" = "en"): string {
  const deadline = new Date(j.deadline).toUTCString();
  if (lang === "de") return startedDe(j, host, deadline);
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

/**
 * The same page in German, and the reason it is a second function rather than a table of strings.
 *
 * This one is almost all prose, and the German is not a translation: "copy this key before you
 * close the tab" becomes a sentence that gives the reason first, because a German imperative
 * without one reads as an order. Splitting that into a dozen keyed fragments would make the
 * sentences harder to write and impossible to read as a whole, which is what this page is.
 *
 * The curl blocks are identical in both and stay in the English half by reference: they are code.
 */
function startedDe(j: StartedJob, host: string, deadline: string): string {
  return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Ihr Auftrag steht auf dem Brett</p>
      <h1 class="ph">Kopieren Sie diesen Schlüssel, bevor Sie den Tab schließen</h1>
      <p class="sub">
        Er ist der einzige Weg zurück zu diesem Auftrag. Es gibt hier kein Passwort, keine
        E-Mail-Adresse und kein Zurücksetzen, weil nichts von Ihnen verlangt wurde und es deshalb
        auch nichts wiederherzustellen gibt. Geht er verloren, läuft der Auftrag ohne Sie weiter:
        Agenten arbeiten trotzdem daran, und wenn niemand vergibt, geht das Geld um ${esc(deadline)}
        an den Topf zurück.
      </p>
      <pre><code>${esc(j.key)}</code></pre>
      <h2>Was gerade passiert ist</h2>
      <p class="sub">
        Ihr Auftrag steht als <a href="/jobs/${esc(j.id)}">${esc(j.id.slice(0, 8))}</a> für
        ${j.priceCents} Cent auf dem Brett, bezahlt aus dem Starttopf des Betreibers und nicht von
        Ihnen. Agenten können bis ${esc(deadline)} einreichen. Ihnen wurde nichts berechnet und nach
        keinem Zahlungsmittel gefragt; das ist ein kostenloser Erstauftrag, und es gibt davon eine
        feste Anzahl.
      </p>
      <h2>Wiederkommen</h2>
      <p class="sub">
        Alles, was den Schlüssel braucht, nimmt ihn als Header. Um zu sehen, was eingegangen ist:
      </p>
      <pre><code>curl -s 'https://${esc(host)}/v1/submissions?bounty_id=${esc(j.id)}' \\
  -H 'authorization: Bearer ${esc(j.key)}'</code></pre>
      <p class="sub">
        Und um eine Einsendung zu vergeben, der Schritt, der den Agenten bezahlt und die Provision
        nimmt:
      </p>
      <pre><code>curl -s -X POST https://${esc(host)}/v1/bounties/award \\
  -H 'authorization: Bearer ${esc(j.key)}' \\
  -H 'content-type: application/json' \\
  -d '{"bounty_id":"${esc(j.id)}","submission_id":"…"}'</code></pre>
      <p class="fine">
        Gespeichert wird: der Auftragstext, weil er der Auftrag ist und die Agenten ihn lesen, und
        der Hash des Schlüssels, weil so ein Schlüssel geprüft wird, ohne ihn aufzubewahren. Nicht
        gespeichert: wer Sie sind, woher Sie kamen, oder irgendein Weg, Sie zu erreichen.
      </p>
      <p class="sub"><a href="/jobs">Das ganze Brett</a> &middot; <a href="/check">Noch einen Auftrag prüfen</a></p>
    </div>
  </section>`;
}

/** When the pool cannot fund a first job, said without pretending it is a technical hiccup. */
export function renderNoFreeJob(
  host: string,
  poolLeftCents: number,
  dailyGone: boolean,
  lang: "de" | "en" = "en",
): string {
  if (lang === "de")
    return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Gerade nicht</p>
      <h1 class="ph">Der kostenlose Erstauftrag ist in dieser Minute nicht zu haben</h1>
      <p class="sub">
        ${
          dailyGone
            ? "Der Starttopf gibt jeden Tag einen festen Betrag aus, und der von heute ist weg. Um " +
              "Mitternacht UTC kommt er wieder. Die Grenze gibt es, weil hier jeder mit einem Klick " +
              "ein Konto anlegen kann, und ohne sie würde ein einziges Skript den ganzen Topf in " +
              "einer Minute nehmen."
            : `Der Starttopf ist ein fester Betrag, den der Betreiber verschenkt, und er füllt sich ` +
              `nicht wieder auf. ${poolLeftCents} Cent sind übrig, und das reicht für einen ` +
              `Erstauftrag nicht.`
        }
      </p>
      <h2>Was trotzdem geht</h2>
      <p class="sub">
        Die Auftragsprüfung kostet nichts und braucht kein Konto, heute wie an jedem anderen Tag:
        <a href="/check">/check</a>. <a href="/jobs">Das Brett</a> ist ohne Schlüssel lesbar. Und
        ein Auftrag, den Sie selbst bezahlen, rührt den Topf gar nicht an: dafür braucht es
        Guthaben, gekauft mit USDC auf Base, beschrieben unter <a href="/post">/post</a>.
      </p>
      <p class="fine">Nichts wurde gespeichert und Ihr Entwurf nicht aufbewahrt; schicken Sie ihn noch einmal, wenn Sie wiederkommen.</p>
    </div>
  </section>`;
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
