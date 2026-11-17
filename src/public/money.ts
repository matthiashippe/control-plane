/**
 * Money on the phone page /h/{code} (goals/konto/05): the card payment into an account and the setup of the payout to the person's
 * bank account, after the SOLL sources docs/soll/src/money-<state>.html.
 *
 * Seven states. `deposit-approve` and `payout-approve` are the choice of the number as in konto 02 (block `approve`), saying what
 * happens. `deposit-card` (block `card`) names amount and card and has the one button the script of the page opens the card
 * payment with. `payout-verify` (block `verify`) sends the person to Bridge to confirm their identity once, `payout-bank` (block
 * `bank`) asks for IBAN and account holder, `payout-passkey` (block `payout`) has the one button that signs with the existing
 * passkey. Bank and passkey step count three steps, or two when Bridge had checked the person before and the identity step was
 * left out (`steps`). `retry` (block `retry`) comes after a signature that could not be checked and sends the same one again. Cancel and
 * failure show the state `failed` of konto 03 unchanged.
 *
 * The frame is phonePage() of src/public/handoff.ts with the blocks of konto 02 and 03; this page adds the field of the bank step.
 * Each heading is a bare h1 element: the goal changes the first one to prove that the comparison with the picture notices.
 */
import { esc } from "./market.js";
import { phonePage, usd } from "./handoff.js";
import { KEY_ICON, KONTO_STYLE } from "./konto.js";

export type MoneyPage =
  | { state: "deposit-approve"; automatonName: string; amountUsdc: bigint; choices: number[] }
  | {
      state: "deposit-card";
      code: string;
      automatonName: string;
      amountUsdc: bigint;
      /** The smart wallet of the account of the API key that asked; set by the server, never by the page or the terminal. */
      address: string;
      chainId: number;
      organizationId: string;
      owner: string;
    }
  | { state: "payout-approve"; automatonName: string; choices: number[] }
  | { state: "payout-verify"; code: string; automatonName: string; kycLink: string }
  | {
      state: "payout-bank";
      code: string;
      automatonName: string;
      error?: string | null;
      /** 2 when Bridge had checked the person before this code, so the identity step was left out; else 3. */
      steps?: 2 | 3;
    }
  | {
      state: "payout-passkey";
      code: string;
      automatonName: string;
      bankLast4: string;
      chainId: number;
      /** forwarderAddress(account, destination): the only spender the page asks the passkey to sign. */
      spender: string;
      token: string;
      account: string;
      owner: string;
      organizationId: string;
      /** As in payout-bank. */
      steps?: 2 | 3;
    }
  | { state: "retry"; code: string; automatonName: string };

export type MoneyState = MoneyPage["state"];

const TITLES: Record<MoneyState, string> = {
  "deposit-approve": "Add money | PostYourPrice",
  "deposit-card": "Pay by card | PostYourPrice",
  "payout-approve": "Send money to your bank | PostYourPrice",
  "payout-verify": "Confirm your identity | PostYourPrice",
  "payout-bank": "Your bank account | PostYourPrice",
  "payout-passkey": "Allow payouts | PostYourPrice",
  retry: "Tap again | PostYourPrice",
};

/** The field of the bank step, as in the SOLL source of payout-bank. */
export const MONEY_STYLE = `
<style>
/* The bank step (goals/konto/05): a labelled text field as wide and tall as the button below it. */
.field { display: block; margin-top: var(--s-4); }
.field label { display: block; margin-bottom: var(--s-2); font: 500 var(--t-label)/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
.field input { box-sizing: border-box; width: 100%; height: 52px; padding-inline: var(--s-4); border: 1px solid var(--line-2); border-radius: var(--r-ctl);
               background: var(--panel); color: var(--fg); font: 500 var(--t-lead)/1 var(--mono); }
.field input::placeholder { color: var(--dim); }
.field input:focus { outline: none; border-color: var(--accent); }
</style>`;

const svg = (paths: string) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const CARD_ICON = svg(`<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>`);
const ID_ICON = svg(
  `<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><circle cx="8.5" cy="11" r="2.5"/><path d="M5 16.5c.8-1.6 2-2.4 3.5-2.4s2.7.8 3.5 2.4M14.5 9.5h4M14.5 13h4"/>`,
);
const BANK_ICON = svg(`<path d="M3 9.5 12 4l9 5.5M4.5 20h15M6 10.5v7M10 10.5v7M14 10.5v7M18 10.5v7"/>`);
const AGAIN_ICON = svg(`<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>`);
const SCRIPT = `      <noscript><p class="fine">This step needs a browser with JavaScript switched on.</p></noscript>
      <script type="module" src="/h/konto.js"></script>`;

const choices = (numbers: number[]) =>
  numbers.map((n) => `      <button class="btn" type="submit" name="pick" value="${n}">${n}</button>`).join("\n");

/** One block of the passkey kind: eyebrow, heading, one line, two points, one wide button, the fine print. */
function step(block: string, eyebrow: string, heading: string, sub: string, points: [string, string], button: string, fine: string, tail = ""): string {
  return `<section class="hero">
  <div class="wrap narrow" data-soll="${block}">
    <div class="hero-text balanced">
      <p class="eyebrow">${eyebrow}</p>
      <h1>${heading}</h1>
      <p class="sub">${sub}</p>
      <div class="grant">
        <ul class="feats">
          <li>${points[0]}</li>
          <li>${points[1]}</li>
        </ul>
      </div>
      <div class="cta wide">
        ${button}
      </div>
      <p class="fine">${fine}</p>
${tail}    </div>
  </div>
</section>
`;
}

function body(page: MoneyPage): string {
  const name = esc(page.automatonName);
  switch (page.state) {
    case "deposit-approve":
      return `<section class="hero">
  <div class="wrap narrow" data-soll="approve">
    <p class="eyebrow">Add money</p>
    <h1>Add ${usd(page.amountUsdc)} to ${name}?</h1>
    <div class="stats grant">
      <div><span class="n">${usd(page.amountUsdc)}</span><span class="l">Added to ${name}</span></div>
      <div><span class="n">Card</span><span class="l">How you pay, on the next step</span></div>
    </div>
    <p class="sub">Tap the number shown in your terminal.</p>
    <form method="post" class="choices">
${choices(page.choices)}
    </form>
    <p class="fine">Did not start this yourself? Close this page and nothing is charged. The code works once, for 10 minutes.</p>
  </div>
</section>
`;
    case "payout-approve":
      return `<section class="hero">
  <div class="wrap narrow" data-soll="approve">
    <p class="eyebrow">Send money to your bank</p>
    <h1>Send money from ${name} to your bank account?</h1>
    <div class="stats grant">
      <div><span class="n">Your bank</span><span class="l">The only place money from ${name} can go</span></div>
      <div><span class="n">Once</span><span class="l">After this, a payout needs no phone</span></div>
    </div>
    <p class="sub">Tap the number shown in your terminal.</p>
    <form method="post" class="choices">
${choices(page.choices)}
    </form>
    <p class="fine">Did not start this yourself? Close this page and nothing is sent. The code works once, for 10 minutes.</p>
  </div>
</section>
`;
    case "deposit-card": {
      // What the script of the page needs to open the card payment for exactly this account; none of it is secret.
      const data = [
        `data-code="${esc(page.code)}"`,
        `data-amount="${String(page.amountUsdc)}"`,
        `data-address="${esc(page.address)}"`,
        `data-chain="${page.chainId}"`,
        `data-org="${esc(page.organizationId)}"`,
        `data-owner="${esc(page.owner)}"`,
      ].join(" ");
      return step(
        "card",
        "Last step",
        `Pay ${usd(page.amountUsdc)} by card`,
        `The money goes to ${name} and shows in your terminal.`,
        ["You pay with your card on the next page.", "PostYourPrice never sees your card number."],
        `<button class="btn btn-1" type="button" id="money-card" ${data}>${CARD_ICON}Pay ${usd(page.amountUsdc)} by card</button>`,
        "Close this page and nothing is charged. The code works once, for 10 minutes.",
        `${SCRIPT}\n`,
      );
    }
    case "payout-verify": {
      // The link of Bridge sits in a data attribute, not in href: the page names no other address in a place a browser loads
      // from, and the script of the page opens it in a new tab on the tap.
      const link = /^https:\/\/[^\s"<>]+$/.test(page.kycLink) ? esc(page.kycLink) : "";
      return step(
        "verify",
        "Step 1 of 3",
        "Confirm your identity once",
        `Bridge sends money from ${name} to your bank account and checks your identity once before the first payout.`,
        ["Have your ID card or passport ready.", "You do this only once, not for every payout."],
        `<button class="btn btn-1" type="button" id="money-verify" data-code="${esc(page.code)}" data-href="${link}">${ID_ICON}Confirm identity with Bridge</button>`,
        "Close this page and nothing is sent. Come back to this page when Bridge is done.",
        `${SCRIPT}\n`,
      );
    }
    case "payout-bank": {
      const error = page.error ? `      <p class="fine" role="alert">${esc(page.error)}</p>\n` : "";
      return `<section class="hero">
  <div class="wrap narrow" data-soll="bank">
    <div class="hero-text balanced">
      <p class="eyebrow">${page.steps === 2 ? "Step 1 of 2" : "Step 2 of 3"}</p>
      <h1>Where should money from ${name} go?</h1>
      <p class="sub">Money from ${name} can go only to this bank account.</p>
${error}      <form method="post" action="/h/${esc(page.code)}/payout-bank">
        <div class="field">
          <label for="money-iban">IBAN</label>
          <input id="money-iban" name="iban" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DE89 3704 0044 0532 0130 00" required>
        </div>
        <div class="field">
          <label for="money-owner">Account holder</label>
          <input id="money-owner" name="owner_name" type="text" autocomplete="name" placeholder="Name on the account" required>
        </div>
        <div class="cta wide">
          <button class="btn btn-1" type="submit">${BANK_ICON}Use this bank account</button>
        </div>
      </form>
      <p class="fine">Close this page and nothing is sent. The code works once, for 10 minutes.</p>
    </div>
  </div>
</section>
`;
    }
    case "payout-passkey": {
      // What the script of the page needs to ask the existing passkey for exactly this permission; none of it is secret.
      const data = [
        `data-mode="payout"`,
        `data-code="${esc(page.code)}"`,
        `data-chain="${page.chainId}"`,
        `data-spender="${esc(page.spender)}"`,
        `data-token="${esc(page.token)}"`,
        `data-account="${esc(page.account)}"`,
        `data-owner="${esc(page.owner)}"`,
        `data-org="${esc(page.organizationId)}"`,
      ].join(" ");
      return step(
        "payout",
        page.steps === 2 ? "Step 2 of 2" : "Last step",
        "Allow payouts to your bank account",
        `PostYourPrice can send money from ${name} only to your bank account ending ${esc(page.bankLast4)}.`,
        [`Payouts from ${name} cannot go to any other account.`, "You confirm with the passkey you already have."],
        `<button class="btn btn-1" type="button" id="konto-passkey" ${data}>${KEY_ICON}Confirm with passkey</button>`,
        "Close this page and nothing is sent. The code works once, for 10 minutes.",
        `${SCRIPT}\n`,
      );
    }
    case "retry":
      return step(
        "retry",
        "Almost done",
        "Tap again to finish",
        `Your passkey worked, but we could not confirm it for ${name} just now.`,
        ["You do not need your passkey again.", "Nothing has changed yet."],
        `<button class="btn btn-1" type="button" id="konto-retry" data-code="${esc(page.code)}">${AGAIN_ICON}Tap again</button>`,
        "Close this page and nothing changes. The code works once, for 10 minutes.",
        `${SCRIPT}\n`,
      );
  }
}

/** The whole document. `indexStyle` is the <style> block of src/public/index.html. */
export function renderMoneyPage(page: MoneyPage, indexStyle: string): string {
  return phonePage(TITLES[page.state], body(page), indexStyle, KONTO_STYLE + (page.state === "payout-bank" ? MONEY_STYLE : ""));
}
