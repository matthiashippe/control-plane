/**
 * The account step of the phone page /h/{code} (goals/konto/03), built 1:1 after the approved SOLL pictures
 * docs/soll/konto-<state>-<width>.png and their sources docs/soll/src/konto-<state>.html.
 *
 * Two states: `passkey` says what the account allows (the daily limit, and for whom) and has the one button that creates the
 * passkey; `fehlgeschlagen` says that no account was created and sends the person back to the terminal. The frame (head, bar,
 * footer, the blocks of konto 02) is phonePage() of src/public/handoff.ts; this page adds two blocks (docs/soll/README.md,
 * "Konto /h/{code}"). The heading is a bare h1 element: the goal changes the first one to prove that the comparison with the
 * picture notices.
 */
import { esc } from "./market.js";
import { phonePage, usd } from "./handoff.js";

export type KontoPage =
  | { state: "passkey"; code: string; automatonName: string; dailyLimitUsdc: bigint; chainId: number; spender: string; token: string }
  | { state: "fehlgeschlagen"; reason: FailReason };

/** Why no account was created. The SOLL picture shows `cancelled`. */
export type FailReason = "cancelled" | "unreachable" | "refused";

export const FAIL_REASONS: Record<FailReason, string> = {
  cancelled: "The passkey was cancelled on this phone.",
  unreachable: "We could not reach the service that creates your account.",
  refused: "The account did not match what you approved, so the code was closed.",
};

const TITLES = {
  passkey: "Create your account | PostYourPrice",
  fehlgeschlagen: "No account created | PostYourPrice",
} as const;

/** The two blocks of the account step, as in the SOLL sources. */
const KONTO_STYLE = `
<style>
/* The passkey step (goals/konto/03): one button across the column, as tall as a thumb wants it. */
.wide .btn { width: 100%; height: 56px; justify-content: center; font-size: var(--t-lead); font-weight: 600; cursor: pointer; }
.wide .btn svg { flex: none; }
/* Headings of the account step break into two even lines instead of leaving one word alone on the second. */
.balanced h1 { text-wrap: balance; }
</style>`;

const KEY_ICON =
  `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8 20 3M16.5 6.5l2.5 2.5M14 9l2 2"/></svg>`;

function body(page: KontoPage): string {
  if (page.state === "passkey") {
    const name = esc(page.automatonName);
    // What the script of the page needs to ask for exactly this permission; none of it is secret.
    const data = [
      `data-code="${esc(page.code)}"`,
      `data-limit="${String(page.dailyLimitUsdc)}"`,
      `data-chain="${page.chainId}"`,
      `data-spender="${esc(page.spender)}"`,
      `data-token="${esc(page.token)}"`,
    ].join(" ");
    return `<section class="hero">
  <div class="wrap narrow" data-soll="passkey">
    <div class="hero-text balanced">
      <p class="eyebrow">Last step</p>
      <h1>Create your account with a passkey</h1>
      <p class="sub">PostYourPrice can charge up to ${usd(page.dailyLimitUsdc)} a day, only for ${name}.</p>
      <div class="grant">
        <ul class="feats">
          <li>Only you can open the account, with your face or fingerprint.</li>
          <li>PostYourPrice never sees your passkey and cannot open the account.</li>
        </ul>
      </div>
      <div class="cta wide">
        <button class="btn btn-1" type="button" id="konto-passkey" ${data}>${KEY_ICON}Create passkey</button>
      </div>
      <p class="fine">Close this page and nothing is charged. The code works once, for 10 minutes.</p>
      <noscript><p class="fine">This step needs a browser with JavaScript switched on.</p></noscript>
    </div>
  </div>
</section>
`;
  }
  return `<section class="hero">
  <div class="wrap narrow">
    <div class="hero-text balanced">
      <p class="eyebrow">No account created</p>
      <h1>Your account was not created.</h1>
      <p class="sub">${FAIL_REASONS[page.reason]}</p>
      <p class="fine">Nothing was charged. Start again in your terminal to get a new code.</p>
    </div>
  </div>
</section>
`;
}

/** The whole document. `indexStyle` is the <style> block of src/public/index.html. */
export function renderKontoPage(page: KontoPage, indexStyle: string): string {
  return phonePage(TITLES[page.state], body(page), indexStyle, KONTO_STYLE);
}
