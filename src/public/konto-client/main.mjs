// The script of /h/{code} in the state `passkey` (goals/konto/03): one tap on the button runs flow.mjs, sends the result to
// POST /h/{code}/konto and, once the server said done, shows the page of the code again (the state `approved` of konto 02). On
// any failure the page sends the reason to POST /h/{code}/fehlgeschlagen as a form, which closes the code and shows why.
import { KontoError, runKonto } from "./flow.mjs";

const button = document.getElementById("konto-passkey");

function fail(code, reason) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = `/h/${encodeURIComponent(code)}/fehlgeschlagen`;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "reason";
  input.value = reason;
  form.append(input);
  document.body.append(form);
  form.submit();
}

if (button) {
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    const d = button.dataset;
    const code = d.code || "";
    try {
      const { body } = await runKonto(
        {
          create: (options) => navigator.credentials.create(options),
          fetch: (url, init) => window.fetch(url, init),
          subtle: window.crypto.subtle,
          random: (n) => window.crypto.getRandomValues(new Uint8Array(n)),
          now: () => Date.now(),
          rpId: window.location.hostname,
        },
        { proxyId: d.proxy || "", limit: d.limit || "", chainId: Number(d.chain), spender: d.spender || "", token: d.token || "" },
      );
      const res = await window.fetch(`/h/${encodeURIComponent(code)}/konto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        window.location.replace(`/h/${encodeURIComponent(code)}`);
        return;
      }
      fail(code, res.status === 400 ? "refused" : "unreachable");
    } catch (err) {
      // URL and status only (KontoError), so a support question can name the step that failed; never a key or a signature.
      console.error(`konto step failed: ${err && err.message ? err.message : "unknown"}`);
      fail(code, err instanceof KontoError ? err.reason : "unreachable");
    }
  });
}
