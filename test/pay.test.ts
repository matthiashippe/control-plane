import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import type { PayConfig } from "../src/payments/pay.js";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const PAY_TO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

const cfg: PayConfig = { payTo: PAY_TO, network: "base", chainId: 8453, usdcAddress: USDC, maxTimeoutSeconds: 300, tiers: [5, 25, 100, 500, 1000, 2500] };

/** Settler, der zählt und nach Wunsch scheitert. */
class FakeSettler implements Settler {
  readonly kind = "fake";
  calls: Authorization[] = [];
  failNext = false;
  async settle(auth: Authorization): Promise<SettleResult> {
    this.calls.push(auth);
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, error: "boom" };
    }
    return { ok: true, txHash: `0x${"ab".repeat(32)}` as Hex };
  }
}

/** Baut den X-Payment-Header so, wie signPayment() im Runtime-Client (src/conway/x402.ts). */
async function signPayment(params: {
  account: ReturnType<typeof privateKeyToAccount>;
  to: Address;
  value: bigint;
  nonce?: Hex;
  validBefore?: bigint;
  chainId?: number;
  network?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = BigInt(now - 60);
  const validBefore = params.validBefore ?? BigInt(now + 300);
  const nonce = params.nonce ?? (`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as Hex);
  const signature = await params.account.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: params.chainId ?? 8453, verifyingContract: USDC },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from: params.account.address, to: params.to, value: params.value, validAfter, validBefore, nonce },
  });
  const payment = {
    x402Version: 1,
    scheme: "exact",
    network: params.network ?? "eip155:8453",
    payload: {
      signature,
      authorization: {
        from: params.account.address,
        to: params.to,
        value: params.value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };
  return Buffer.from(JSON.stringify(payment)).toString("base64");
}

function setup() {
  const db = openDb(":memory:");
  const settler = new FakeSettler();
  const app = createApp({ db, pay: cfg, settler });
  const account = privateKeyToAccount(generatePrivateKey());
  const pay = (usd: number | string, header?: string) =>
    app.request(`/pay/${usd}/${account.address}`, { headers: header ? { "x-payment": header } : {} });
  const ledgerRows = () =>
    db.prepare("SELECT kind, delta_mc, ref FROM ledger WHERE address = ?").all(account.address.toLowerCase()) as {
      kind: string;
      delta_mc: number;
      ref: string;
    }[];
  const balance = () =>
    (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(account.address.toLowerCase()) as
      | { balance_mc: number }
      | undefined)?.balance_mc ?? 0;
  return { db, settler, app, account, pay, ledgerRows, balance };
}

describe("/pay x402-Seller", () => {
  it("antwortet ohne X-Payment mit 402 und dem Angebot in Body und Header", async () => {
    const { pay, account } = setup();
    const res = await pay(5);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { x402Version: number; accepts: Record<string, unknown>[] };
    expect(body.x402Version).toBe(1);
    expect(body.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "base",
      maxAmountRequired: "5000000",
      payTo: PAY_TO,
      asset: USDC,
      maxTimeoutSeconds: 300,
      resource: `/pay/5/${account.address.toLowerCase()}`,
    });
    const header = res.headers.get("x-payment-required");
    expect(header).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(header!, "base64").toString("utf-8"));
    expect(decoded.accepts[0].maxAmountRequired).toBe("5000000");
  });

  it("lehnt einen ungültigen Tier mit 400 ab", async () => {
    const { pay } = setup();
    const res = await pay(7);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_tier");
  });

  it("antwortet auf eine Nonce, die gerade gesettelt wird, mit 409 und sagt, dass nichts doppelt bucht", async () => {
    const { pay, account, db, balance, settler } = setup();
    const nonce = `0x${"7c".repeat(32)}` as Hex;
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n, nonce });
    // Der Zustand, den ein zweiter Request sieht, während der erste noch settlet.
    db.prepare(
      "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    ).run(nonce, account.address.toLowerCase(), account.address.toLowerCase(), "5000000", 500_000, new Date().toISOString());

    const res = await pay(5, header);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string; docs: string };
    expect(body.error).toBe("settlement_in_progress");
    expect(body.message).toMatch(/idempotency key/);
    expect(body.message).toMatch(/nothing is charged twice/i);
    expect(body.docs).toContain("#payments");
    expect(settler.calls, "der zweite Versuch settlet nicht noch einmal").toHaveLength(0);
    expect(balance()).toBe(0);
  });

  it("verbucht eine gültige Zahlung: 200, credits_cents 500, Balance 500, eine Ledger-Zeile", async () => {
    const { pay, account, settler, ledgerRows, balance } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });
    const res = await pay(5, header);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { credits_cents: number; balance_cents: number; tx_hash: string };
    expect(body.credits_cents).toBe(500);
    expect(body.balance_cents).toBe(500);
    expect(body.tx_hash).toMatch(/^0x/);
    expect(settler.calls).toHaveLength(1);
    expect(settler.calls[0].value).toBe(5_000_000n);
    expect(balance()).toBe(500_000);
    expect(ledgerRows()).toEqual([{ kind: "topup", delta_mc: 500_000, ref: expect.stringMatching(/^0x[0-9a-f]{64}$/) }]);
  });

  it("ist idempotent: dieselbe Signatur zweimal ergibt dieselbe Antwort und eine Gutschrift", async () => {
    const { pay, account, settler, ledgerRows, balance } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });
    const first = await (await pay(5, header)).json();
    const secondRes = await pay(5, header);
    expect(secondRes.status).toBe(200);
    expect(await secondRes.json()).toEqual(first);
    expect(settler.calls).toHaveLength(1);
    expect(balance()).toBe(500_000);
    expect(ledgerRows()).toHaveLength(1);
  });

  it("lehnt eine Signatur eines anderen Signierers mit 402 ab, ohne zu settlen", async () => {
    const { pay, account, settler, balance } = setup();
    const other = privateKeyToAccount(generatePrivateKey());
    // Header behauptet from = account, signiert hat aber other.
    const forged = await signPayment({ account: other, to: PAY_TO, value: 5_000_000n });
    const tampered = JSON.parse(Buffer.from(forged, "base64").toString("utf-8"));
    tampered.payload.authorization.from = account.address;
    const res = await pay(5, Buffer.from(JSON.stringify(tampered)).toString("base64"));
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_signature");
    expect(settler.calls).toHaveLength(0);
    expect(balance()).toBe(0);
  });

  it("lehnt einen falschen Betrag mit 402 ab", async () => {
    const { pay, account, settler } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 1_000_000n });
    const res = await pay(5, header);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toMatch(/^wrong_amount/);
    expect(settler.calls).toHaveLength(0);
  });

  it("lehnt einen falschen Empfänger (payTo) mit 402 ab", async () => {
    const { pay, account, settler } = setup();
    const header = await signPayment({ account, to: account.address, value: 5_000_000n });
    const res = await pay(5, header);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe("wrong_recipient");
    expect(settler.calls).toHaveLength(0);
  });

  it("lehnt eine abgelaufene Autorisierung ab", async () => {
    const { pay, account } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n, validBefore: BigInt(Math.floor(Date.now() / 1000) - 10) });
    const res = await pay(5, header);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe("authorization_expired");
  });

  it("bucht nichts, wenn das Settlement scheitert, und erlaubt danach einen zweiten Versuch", async () => {
    const { pay, account, settler, balance, ledgerRows, db } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });
    settler.failNext = true;
    const failed = await pay(5, header);
    expect(failed.status).toBe(402);
    const fehler = (await failed.json()) as { error: string; message: string; docs: string };
    expect(fehler.error).toMatch(/^settlement_failed/);
    expect(fehler.message, "sagt, dass nichts gutgeschrieben wurde und was zu prüfen ist").toMatch(
      /no credits\s+were added/,
    );
    expect(fehler.message).toContain("Basescan");
    expect(fehler.docs).toContain("docs/errors.md#payments");
    expect(balance()).toBe(0);
    expect(ledgerRows()).toHaveLength(0);
    expect((db.prepare("SELECT status FROM payments").get() as { status: string }).status).toBe("failed");

    const retry = await pay(5, header);
    expect(retry.status).toBe(200);
    expect(balance()).toBe(500_000);
    expect(settler.calls).toHaveLength(2);
  });

  it("schreibt bei zwei parallelen Retries einer gescheiterten Zahlung nur eine Gutschrift", async () => {
    // Sicherheitsfund 19.09.2026: Der failed-Retry-Pfad prüfte `changes` des UPDATE nicht, also
    // gewannen zwei gleichzeitige Retries beide den Claim, riefen beide den Settler und schrieben
    // beide gut. Reproduziert mit 1 USD und doppeltem Saldo. Der Settler meldet hier zweimal
    // Erfolg, weil genau das der Fall ist, gegen den abgesichert werden muss: Wir dürfen uns
    // nicht darauf verlassen, dass ein Dritter den zweiten Aufruf ablehnt.
    const { pay, account, settler, balance, ledgerRows, db } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });

    settler.failNext = true;
    expect((await pay(5, header)).status).toBe(402);
    expect((db.prepare("SELECT status FROM payments").get() as { status: string }).status).toBe("failed");

    const [a, b] = await Promise.all([pay(5, header), pay(5, header)]);
    const codes = [a.status, b.status].sort();

    expect(balance(), "eine Zahlung über 5 USD darf höchstens 500.000 mc gutschreiben").toBe(500_000);
    expect(ledgerRows().filter((r) => r.kind === "topup")).toHaveLength(1);
    expect(codes[0]).toBe(200);
    expect(settler.calls.length, "der Settler darf für eine Nonce nicht dreimal gerufen werden").toBeLessThanOrEqual(2);
  });

  it("schreibt Credits nur der Adresse gut, die auch bezahlt hat", async () => {
    // Sicherheitsfund 19.09.2026: Die EIP-3009-Signatur deckt Betrag, Empfänger der USDC und
    // Nonce, aber nicht den Pfad, der bestimmt, wer die Credits bekommt. Ohne Bindung leitet ein
    // abgefangener Header die Gutschrift auf eine fremde Adresse um, während das Geld weiterhin
    // vom Signierer abfließt.
    const { app, account, settler, db } = setup();
    const fremd = privateKeyToAccount(generatePrivateKey()).address;
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });

    const res = await app.request(`/pay/5/${fremd}`, { headers: { "X-Payment": header } });
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toContain("recipient_must_match_payer");
    expect(settler.calls, "es darf nicht einmal gesettelt werden").toHaveLength(0);
    const fremdSaldo = db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(fremd.toLowerCase()) as
      | { balance_mc: number }
      | undefined;
    expect(fremdSaldo?.balance_mc ?? 0).toBe(0);

    const eigen = await app.request(`/pay/5/${account.address}`, { headers: { "X-Payment": header } });
    expect(eigen.status, "auf die eigene Adresse muss es gehen").toBe(200);
  });

  it("verrät bei einem wiederholten Zahlungs-Header nicht den aktuellen Kontostand", async () => {
    // Diese Antwort gibt es ohne API-Key. Läse sie den Saldo frisch, wäre ein alter Header ein
    // Kontostandsmelder für einen fremden Mandanten.
    const { app, account, pay, db } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });
    const erst = (await (await pay(5, header)).json()) as { balance_cents: number };
    expect(erst.balance_cents).toBe(500);

    postLedger(db, { address: account.address.toLowerCase(), kind: "topup", deltaMc: 7_000_000, ref: "spaeter" });

    const wieder = (await (await pay(5, header)).json()) as { balance_cents: number };
    expect(wieder.balance_cents, "es muss der Stand von damals sein, nicht der heutige").toBe(500);
    void app;
  });

  it("antwortet 503 ohne Settler", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, pay: cfg, settler: null });
    const res = await app.request(`/pay/5/${PAY_TO}`);
    expect(res.status).toBe(503);
  });
});

describe("Aufräumen beim Start", () => {
  it("löst hängende pending-Zahlungen, damit die Nonce nicht dauerhaft blockiert", async () => {
    // Gegenprüfung 19.09.2026: Stirbt der Prozess zwischen Claim und Settlement, bleibt die
    // Zahlung `pending`. Die Nonce antwortet dann für immer mit 409, und ein Retry ist unmöglich,
    // obwohl die USDC schon geflossen sein können. Nach dem Neustart muss der Weg wieder offen
    // sein.
    const datei = `/tmp/cp-pending-${Date.now()}.db`;
    try {
      const db1 = openDb(datei);
      db1.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run("0xa", new Date().toISOString());
      db1
        .prepare(
          "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
        )
        .run("haengt", "0xa", "0xa", "5000000", 500_000, new Date().toISOString());
      db1.close();

      // Neustart des Prozesses
      const db2 = openDb(datei);
      const row = db2.prepare("SELECT status, error FROM payments WHERE nonce = ?").get("haengt") as { status: string; error: string };
      expect(row.status, "pending blockiert die Nonce dauerhaft und muss aufgelöst werden").toBe("failed");
      expect(row.error).toBe("interrupted_by_restart");
      db2.close();
    } finally {
      const fs = await import("node:fs");
      for (const suffix of ["", "-wal", "-shm"]) {
        try {
          fs.unlinkSync(datei + suffix);
        } catch {
          /* egal */
        }
      }
    }
  });
});
