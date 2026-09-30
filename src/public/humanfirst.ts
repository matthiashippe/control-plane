/**
 * The first screen of `/` for a person, in German, above everything written for agents (HAN-92).
 *
 * On 2026-09-30 the owner opened postyourprice.com and did not find the product the company had
 * built that night: the first screen said "One job, several agents, pay one" over a curl line, and
 * the catalogue was one link in the middle of the English text. Every organic visitor lands on `/`,
 * not on `/katalog`, so whoever shares the address was sharing a page for agent operators.
 *
 * The copy is the one from HAN-89 and says nothing `/katalog` does not already say: the headline
 * names the three offers, "drei fertige Fassungen" and "bis zu dreimal" are in every offer's
 * `delivers`, "mit KI geschrieben" is in DELIVERY_SENTENCE, the rework line and the test-mode line
 * are the catalogue's own constants, and the price is computed from OFFERS rather than typed.
 * test/landing-human.test.ts holds each of those against the catalogue, so a catalogue that
 * changes and a first screen that does not will fail there, not on a customer.
 *
 * Shown to every browser, not only to `de`: the catalogue is German only, and a first screen that
 * hides it from an English Accept-Language would hide the owner's product from the owner's phone
 * when it happens to be set to English.
 */
import { OFFERS, REWORK_LINE, TEST_MODE_LINE, euro, type Offer } from "./catalog.js";

/** Where the agent path starts. The hero section carries this id in index.html. */
export const AGENT_ANCHOR = "fuer-agenten";

export const HUMAN_HEADLINE =
  "Wir schreiben für Sie eine Rede zum Fest, ein Anschreiben zur Bewerbung oder einen Text über Ihr Angebot.";

export const HUMAN_SUB =
  "Sie bekommen drei fertige Fassungen, mit KI geschrieben, und können bis zu dreimal sagen, was anders werden soll.";

export const AGENT_LINE = "Sie betreiben einen Agenten? Hier entlang.";

/**
 * `buy` as in renderCatalog: absent while the card path is off, and then no test-mode line either,
 * and the three choices lead to the catalogue instead of to an order page that would send the
 * visitor back.
 *
 * HAN-93: until 2026-09-30 this was a text block (headline, a paragraph, "Ab 17 €" as a line, one
 * button) sitting above an English hero whose headline was larger than it. The first screen now
 * shows what can be bought and what each costs, as the catalogue's cards, so the thing a person
 * came for is the largest thing on it and the choice is the one action.
 */
export function renderHumanFirst(buy?: { testMode: boolean }, offers: readonly Offer[] = OFFERS): string {
  const from = euro(Math.min(...offers.map((o) => o.priceCents)));
  const choices = offers
    .map(
      (o) => `
      <a class="card pick" href="${buy ? `/katalog/bestellen?angebot=${o.id}" rel="nofollow` : "/katalog"}">
        <span class="card-head"><span class="pick-name">${o.name}</span><span class="price">${euro(o.priceCents)}</span></span>
        <span class="price-note">${o.fuer}</span>
        <span class="go">${buy ? "Bestellen" : "Im Katalog ansehen"}</span>
      </a>`,
    )
    .join("");
  return `
<section class="human" lang="de">
  <div class="wrap">
    <h2 class="human-h">${HUMAN_HEADLINE}</h2>
    <p class="sub">${HUMAN_SUB} ${REWORK_LINE} <span class="nowrap">Ab ${from}.</span></p>
    <div class="grid-cards three">${choices}
    </div>${buy?.testMode ? `
    <p class="banner"><b>${TEST_MODE_LINE}</b> Sie können alles ausprobieren.</p>` : ""}
    <p class="human-cta"><a href="/katalog">Zum Katalog</a>, dort steht, was Sie genau bekommen.</p>
    <p class="human-agents"><a href="#${AGENT_ANCHOR}">${AGENT_LINE}</a></p>
  </div>
</section>`;
}
