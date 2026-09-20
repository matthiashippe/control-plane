/**
 * One real call over OpenRouter: key, catalogue, mapping and usage.cost. Costs below 0.01 USD.
 *   OPENROUTER_API_KEY=... pnpm e2e:openrouter
 */
import { OpenRouterProvider } from "../../src/inference/openrouter.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("OPENROUTER FAIL: OPENROUTER_API_KEY missing from the environment");
  process.exit(2);
}
const provider = new OpenRouterProvider({ apiKey, models: ["openai/gpt-5.2", "openai/gpt-5-mini"], priceRefreshMs: 0 });
await provider.init();
const specs = provider.models();
const mini = specs.find((s) => s.id === "openai/gpt-5-mini");
if (!mini || mini.inputPerMillion <= 0) {
  console.error("OPENROUTER FAIL: prices missing", specs);
  process.exit(1);
}
const res = await provider.chat({
  model: "openai/gpt-5-mini",
  messages: [{ role: "user", content: "Reply with exactly: OK" }],
  // gpt-5-mini thinks before answering; reasoning tokens count towards completion_tokens.
  maxTokens: 256,
  apiKeyId: "smoke",
});
const text = res.choices[0].message.content ?? "";
const cost = res.usage.cost_usd;
if (typeof cost !== "number" || cost <= 0 || cost > 0.01) {
  console.error(`OPENROUTER FAIL: usage.cost_usd=${cost}`);
  process.exit(1);
}
if (!/ok/i.test(text)) {
  console.error(`OPENROUTER FAIL: unexpected reply: ${JSON.stringify(text)} finish_reason=${res.choices[0].finish_reason} usage=${JSON.stringify(res.usage)}`);
  process.exit(1);
}
console.log(
  `OPENROUTER OK model=openai/gpt-5-mini cost_usd=${cost} prompt_tokens=${res.usage.prompt_tokens} completion_tokens=${res.usage.completion_tokens} ` +
    `price_in=${mini.inputPerMillion} price_out=${mini.outputPerMillion} reply=${JSON.stringify(text.trim())}`,
);
