/**
 * The preview cards a shared link unfurls into, and what each one says to somebody who cannot see it.
 *
 * One entry per image in src/public. Until move goal 04 every page carried the alt text from index.html, so /x402 and
 * /conway described the move card ("Set conwayApiUrl to ...") under a picture of the x402 market measurement. A page names
 * its card, and the alt text comes from here with it, so the two cannot drift apart again.
 *
 * `og.png` keeps the text of src/public/index.html character for character: the landing page is served from that file,
 * and test/og-cards.test.ts holds both against each other. A new card needs its image, an entry here and a page that
 * passes its name to page(); app.ts refuses a card without an entry.
 */
export interface OgCard {
  /** og:image:alt, plain text; escaped where it goes into the page. */
  readonly alt: string;
}

export const OG_CARDS = {
  "og.png": {
    alt: "automatonhost.com: Conway not answering? Your automaton runs here. Set conwayApiUrl to https://automatonhost.com.",
  },
  "og-x402.png": {
    alt:
      "automatonhost.com/x402: How big the paid-API market for agents actually is. Both public x402 directories, " +
      "scanned every day, raw data under CC0.",
  },
} as const satisfies Record<string, OgCard>;

export type OgCardName = keyof typeof OG_CARDS;

export function isOgCardName(name: string): name is OgCardName {
  return Object.prototype.hasOwnProperty.call(OG_CARDS, name);
}
