/**
 * How far the token estimate is off, measured against the provider's own tokenizer.
 *
 * Backlog B1, opened by the adversarial audit on 2026-09-21. `estimateTokens` in
 * `src/inference/provider.ts` counts four characters per token. The reservation before a call is
 * built on it, and when the provider reports more prompt tokens than were reserved, the charge is
 * capped at the balance and the rest is written off as `uncollected_mc`. The audit pinned a call
 * worth four times the balance that went through anyway.
 *
 * The fix is not a bigger factor picked by feel. Reserving too much is its own harm: an agent with
 * fifteen cents would stop being able to make calls it could pay for, and fifteen cents is exactly
 * what every new agent here starts with. So this measures first, against real prompts and the real
 * tokenizer, and prints the shape of the error rather than a single number.
 *
 *   CP_URL=https://cp.hippe.eu pnpm tsx ops/token-schaetzung-messen.ts --key /path/to/keyfile
 *
 * Costs a few cents of the caller's own credit: every shape is one real call with max_tokens 16.
 */
import { readFileSync } from "node:fs";
import { estimateTokens } from "../src/inference/provider.js";
import type { ChatMessage, ToolDef } from "../src/inference/provider.js";

const BASE = (process.env.CP_URL || "https://cp.hippe.eu").replace(/\/$/, "");
const MODEL = process.env.CP_MODEL || "gpt-5-mini";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  throw new Error(`missing --${name}`);
}

const TOOLS: ToolDef[] = ["check_credits", "system_synopsis", "list_models", "view_soul", "sleep", "exec"].map((name) => ({
  type: "function",
  function: { name, description: `Tool ${name} as the runtime declares it.`, parameters: { type: "object", properties: {} } },
}));

/** The shapes that actually occur here, not synthetic strings. */
const SHAPES: { name: string; messages: ChatMessage[]; tools?: ToolDef[] }[] = [
  {
    name: "plain English prose",
    messages: [{ role: "user", content: "Write one sentence about why a market needs buyers before it needs sellers, and keep it short." }],
  },
  {
    name: "German prose",
    messages: [{ role: "user", content: "Schreibe einen Satz darueber, warum ein Marktplatz zuerst Kaeufer braucht und erst danach Verkaeufer, und halte ihn kurz." }],
  },
  {
    name: "a real brief from this market",
    messages: [{
      role: "user",
      content:
        "FACT SHEET for a short explanation of the fabrication check, aimed at developers.\n\n" +
        "Handsel bills the inference, so it can check submitted work against the brief it was written for. " +
        "POST /v1/check takes a briefing and a submission and answers with every claim in the submission that " +
        "the briefing does not support. Each finding carries the exact sentence it came from, and every quote " +
        "is verified against the submission before it is returned.\n\nWrite the explanation. 90 words maximum.",
    }],
  },
  {
    name: "JSON and code",
    messages: [{
      role: "user",
      content: JSON.stringify({ bounty_id: "9e41c013-1258-405d-9e11-1a1535d47ef3", price_cents: 150, award_cents: 135,
        deadline: "2026-09-27T21:02:17.879Z", brief: "Write a fact sheet.", submissions: 0, kind: "factual" }, null, 2) +
        "\n\nfunction feeMc(priceMc) { return Math.floor(priceMc * FEE_PERCENT / 100); }\n\nSummarise in one line.",
    }],
  },
  {
    name: "a runtime turn, system prompt plus six tools",
    messages: [
      { role: "system", content: "You are an autonomous automaton that pays for its own inference. Keep every turn short: call at most one tool, then answer in one sentence." },
      { role: "user", content: "Turn 1. Decide whether to compete for an open bounty." },
    ],
    tools: TOOLS,
  },
];

async function main(): Promise<void> {
  const key = readFileSync(arg("key"), "utf-8").trim();
  console.log(`Token estimate against the provider's tokenizer, ${BASE}, model ${MODEL}\n`);
  console.log("shape                                      estimated   actual   ratio");

  const ratios: number[] = [];
  for (const shape of SHAPES) {
    const estimated = estimateTokens(shape.messages, shape.tools);
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: key, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: shape.messages, ...(shape.tools ? { tools: shape.tools } : {}), max_tokens: 16 }),
    });
    const body = (await res.json()) as { usage?: { prompt_tokens?: number }; error?: string; message?: string };
    if (!res.ok || !body.usage?.prompt_tokens) {
      console.log(`${shape.name.padEnd(42)} FAILED ${res.status} ${body.error ?? ""} ${(body.message ?? "").slice(0, 80)}`);
      continue;
    }
    const actual = body.usage.prompt_tokens;
    const ratio = actual / estimated;
    ratios.push(ratio);
    console.log(`${shape.name.padEnd(42)} ${String(estimated).padStart(9)} ${String(actual).padStart(8)} ${ratio.toFixed(2).padStart(7)}`);
  }

  if (!ratios.length) return;
  const worst = Math.max(...ratios);
  const best = Math.min(...ratios);
  console.log(`\nactual / estimated: worst ${worst.toFixed(2)}, best ${best.toFixed(2)}`);
  console.log(
    worst <= 1
      ? "The estimate is never below the truth in these shapes, so the reservation covers the call."
      : `The estimate is short by up to ${((worst - 1) * 100).toFixed(0)} percent, and that gap is what ` +
        "min(actual, balance) writes off when a wallet is nearly empty.",
  );
}

main().catch((e) => {
  console.error("MEASUREMENT FAILED:", (e as Error).message);
  process.exit(1);
});
