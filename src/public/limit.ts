/**
 * The step limit of the phone page /h/{code} (goals/konto/04): an account raises its daily limit. Built 1:1 after the approved
 * SOLL pictures docs/soll/limit-<state>-<width>.png and their sources docs/soll/src/limit-<state>.html.
 *
 * Two states: `approve` is the choice of the number as in konto 02, with today's and the new daily limit instead of the first
 * payment; `passkey` says what the tap does (the new limit, and for whom) and has the one button that confirms it with the passkey
 * the account was created with. Cancel and failure show the state `fehlgeschlagen` of konto 03 (src/public/konto.ts) unchanged.
 * The frame and the blocks are those of konto 02 and 03 (phonePage, OWN_STYLE, KONTO_STYLE); this page adds none. Each heading is a
 * bare h1 element: the goal changes the first one to prove that the comparison with the picture notices.
 */
import { esc } from "./market.js";
import { phonePage, usd } from "./handoff.js";
import { KEY_ICON, KONTO_STYLE } from "./konto.js";

export type LimitPage =
  | { state: "approve"; automatonName: string; previousLimitUsdc: bigint; dailyLimitUsdc: bigint; choices: number[] }
  | {
      state: "passkey";
      code: string;
      automatonName: string;
      previousLimitUsdc: bigint;
      dailyLimitUsdc: bigint;
      chainId: number;
      spender: string;
      token: string;
      /** The account whose limit goes up, and what the script needs to sign for it with the existing passkey. */
      account: string;
      owner: string;
      organizationId: string;
    };

const TITLE = "Raise the daily limit | PostYourPrice";

function body(page: LimitPage): string {
  const name = esc(page.automatonName);
  if (page.state === "approve") {
    const buttons = page.choices
      .map((n) => `      <button class="btn" type="submit" name="pick" value="${n}">${n}</button>`)
      .join("\n");
    return `<section class="hero">
  <div class="wrap narrow" data-soll="approve">
    <p class="eyebrow">Raise the daily limit</p>
    <h1>Allow ${name} to spend up to ${usd(page.dailyLimitUsdc)} a day?</h1>
    <div class="stats grant">
      <div><span class="n">${usd(page.previousLimitUsdc)}</span><span class="l">Daily limit today</span></div>
      <div><span class="n">${usd(page.dailyLimitUsdc)}</span><span class="l">New daily limit for ${name}</span></div>
    </div>
    <p class="sub">Tap the number shown in your terminal.</p>
    <form method="post" class="choices">
${buttons}
    </form>
    <p class="fine">Did not start this yourself? Close this page and the limit stays at ${usd(page.previousLimitUsdc)}. The code works once, for 10 minutes.</p>
  </div>
</section>
`;
  }
  // What the script of the page needs to ask for exactly this permission with the passkey of the account; none of it is secret.
  const data = [
    `data-mode="limit"`,
    `data-code="${esc(page.code)}"`,
    `data-limit="${String(page.dailyLimitUsdc)}"`,
    `data-chain="${page.chainId}"`,
    `data-spender="${esc(page.spender)}"`,
    `data-token="${esc(page.token)}"`,
    `data-account="${esc(page.account)}"`,
    `data-owner="${esc(page.owner)}"`,
    `data-org="${esc(page.organizationId)}"`,
  ].join(" ");
  return `<section class="hero">
  <div class="wrap narrow" data-soll="limit">
    <div class="hero-text balanced">
      <p class="eyebrow">Last step</p>
      <h1>Raise the daily limit for ${name}</h1>
      <p class="sub">PostYourPrice can charge up to ${usd(page.dailyLimitUsdc)} a day, only for ${name}.</p>
      <div class="grant">
        <ul class="feats">
          <li>The limit of ${usd(page.previousLimitUsdc)} a day ends when you confirm.</li>
          <li>You confirm with the passkey you already have.</li>
        </ul>
      </div>
      <div class="cta wide">
        <button class="btn btn-1" type="button" id="konto-passkey" ${data}>${KEY_ICON}Confirm with passkey</button>
      </div>
      <p class="fine">Close this page and the limit stays at ${usd(page.previousLimitUsdc)}. The code works once, for 10 minutes.</p>
      <noscript><p class="fine">This step needs a browser with JavaScript switched on.</p></noscript>
      <script type="module" src="/h/konto.js"></script>
    </div>
  </div>
</section>
`;
}

/** The whole document. `indexStyle` is the <style> block of src/public/index.html. */
export function renderLimitPage(page: LimitPage, indexStyle: string): string {
  return phonePage(TITLE, body(page), indexStyle, page.state === "passkey" ? KONTO_STYLE : "");
}
