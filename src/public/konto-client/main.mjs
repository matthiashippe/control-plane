// The script of /h/{code} (goals/konto/03 to 05). Wires the one button of the state the page shows:
//
// - `konto-passkey` (konto 03): one tap runs flow.mjs, creates the account and sends the result to POST /h/{code}/konto. With
//   data-mode="limit" (konto 04) the passkey the account already has signs the new limit for POST /h/{code}/limit, with
//   data-mode="payout" (konto 05) the second permission for POST /h/{code}/payout.
// - `konto-retry` (konto 05, point 7): after a 503 signature_check_unavailable the page kept what it sent in sessionStorage and
//   came to /h/{code}/retry; the tap sends the very same body to the same route again, without a second passkey or signup.
// - `money-card` (konto 05): the passkey of the account opens the card payment of MoonPay for its smart wallet.
// - `money-verify` (konto 05): opens the identity check of Bridge in a new tab.
//
// Once the server said done, the page shows the page of the code again (the state `approved` of konto 02). On any failure the
// page sends the reason to POST /h/{code}/failed as a form, which closes the code and shows why.
//
// wirePage takes everything from the browser as one argument, so test/konto-signature-retry.test.ts runs it against a stand-in
// page; in the browser it runs on load.
import { KontoError, retrySigned, runDeposit, runKonto, runLimit, runPayout, submitSigned } from "./flow.mjs";

export function wirePage(env) {
  const { document, location, storage } = env;
  const go = (code, rest = "") => `/h/${encodeURIComponent(code)}${rest}`;

  function fail(code, reason) {
    const form = document.createElement("form");
    form.method = "post";
    form.action = go(code, "/failed");
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "reason";
    input.value = reason;
    form.append(input);
    document.body.append(form);
    form.submit();
  }

  /** Where the page goes after an answer of the server to a signed body. */
  function follow(code, outcome) {
    if (outcome === "done") location.replace(go(code));
    else if (outcome === "retry") location.assign(go(code, "/retry"));
    else fail(code, outcome === "refused" ? "refused" : "unreachable");
  }

  /** One tap per button: a second tap while the first runs does nothing. */
  function onTap(button, run) {
    if (!button) return;
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      const code = button.dataset.code || "";
      try {
        await run(button.dataset, code);
      } catch (err) {
        // URL and status only (KontoError), so a support question can name the step that failed; never a key or a signature.
        env.console.error(`konto step failed: ${err && err.message ? err.message : "unknown"}`);
        fail(code, err instanceof KontoError ? err.reason : "unreachable");
      }
    });
  }

  onTap(document.getElementById("konto-passkey"), async (d, code) => {
    const page = { proxyId: d.proxy || "", limit: d.limit || "", chainId: Number(d.chain), spender: d.spender || "", token: d.token || "" };
    const existing = { ...page, account: d.account || "", owner: d.owner || "", org: d.org || "" };
    const route = d.mode === "limit" ? "limit" : d.mode === "payout" ? "payout" : "konto";
    const { body } = route === "limit" ? await runLimit(env, existing) : route === "payout" ? await runPayout(env, existing) : await runKonto(env, page);
    follow(code, await submitSigned(env, code, route, body));
  });

  onTap(document.getElementById("konto-retry"), async (d, code) => {
    const outcome = await retrySigned(env, code);
    // Nothing kept in this tab: back to the page of the code, which shows the passkey step again.
    if (outcome === "missing") location.replace(go(code));
    else if (outcome === "retry") document.getElementById("konto-retry").disabled = false;
    else follow(code, outcome);
  });

  onTap(document.getElementById("money-card"), async (d, code) => {
    await runDeposit(env, { code, amount: d.amount || "", address: d.address || "", chainId: Number(d.chain), org: d.org || "", owner: d.owner || "" });
  });

  const verify = document.getElementById("money-verify");
  if (verify) {
    verify.addEventListener("click", () => {
      const href = verify.dataset.href || "";
      if (/^https:\/\//.test(href)) env.open(href, "_blank", "noopener,noreferrer");
    });
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  wirePage({
    document,
    location: window.location,
    storage: window.sessionStorage,
    console: window.console,
    create: (options) => navigator.credentials.create(options),
    get: (options) => navigator.credentials.get(options),
    fetch: (url, init) => window.fetch(url, init),
    subtle: window.crypto.subtle,
    random: (n) => window.crypto.getRandomValues(new Uint8Array(n)),
    now: () => Date.now(),
    rpId: window.location.hostname,
    open: (url, target, features) => (target ? window.open(url, target, features) : window.location.assign(url)),
  });
}
