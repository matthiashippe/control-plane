/**
 * The bar and footer of a page, in German, for pages a customer reads.
 *
 * HAN-11 (2026-09-29) found that page() wraps every page in an English frame: "Post a job",
 * "Paid out", "Measured and published by". On a German catalogue that is the first and the last
 * thing a buyer reads, and it names things a buyer has nothing to do with. So this frame links
 * only what such a reader needs, and says the same facts as the English footer, no more.
 *
 * The catalogue, its order and thanks pages and /datenschutz use it. The other pages keep their frame, because their readers are operators
 * and agents, and changing them was not asked for.
 */
export function germanFrame(bodyHtml: string, statusScript: string): string {
  return `</head>
<body>
<header class="bar"><div class="wrap">
  <a class="brand" href="/">
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="currentColor" opacity=".12"/><circle cx="16" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="7" y="21" width="18" height="3.5" rx="1.75" fill="currentColor"/></svg>
    PostYourPrice
  </a>
  <nav>
    <a href="/katalog">Katalog</a>
  </nav>
</div></header>
<main>${bodyHtml}</main>
<footer><div class="wrap">
  Betrieben von Matthias Hippe, San-Francisco-Straße 1, 20457 Hamburg.
  <a href="/terms#impressum">Impressum</a>, <a href="/datenschutz">Datenschutz</a>.
</div></footer>
${statusScript}
</body>
</html>`;
}
