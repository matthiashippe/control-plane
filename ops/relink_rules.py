"""The rules that move our comments in Conway-Research/automaton from the old addresses to automatonhost.com.

Pure functions, standard library only, no network (goals/reichweite/02, decisions 2 and 3). The tool with GitHub access is
ops/relink-comments.py; this file only says what a body becomes.

    relink(body, slug)      every old link in `body` replaced, every other character left as it was
    page_for_title(title)   the error page that fits an issue title, or None for the home page
    SLUGS                   the slugs of ERROR_PAGES, read from src/public/error-pages.ts, so there is no second list

An old link is a match of `(https?://)?(www\\.)?(postyourprice\\.com|cp\\.hippe\\.eu)(/<path>)?`, case does not matter. The path
stops at whitespace, `)`, `]`, `>`, `"`, `'` and a backtick, and `.`, `,`, `;`, `:`, `!`, `?` at its end belong to the sentence,
not to the link. The host must not be glued to a longer name (`api.postyourprice.com`, a mail address at `cp.hippe.eu`, `postyourprice.community`).

  - in prose without a path or with the path `/`: `https://automatonhost.com/errors/<slug>`, with `slug` None the home page
  - in prose with a path: `https://automatonhost.com<path>`
  - in code (between lines of three backticks, or inside a pair of single backticks): `https://automatonhost.com<path>`, without
    a path `https://automatonhost.com`, because there stands the line `"conwayApiUrl": ...` or a call of the API, and an error
    page in that line would break the runtime.
"""
from __future__ import annotations

import pathlib
import re

NEW = "https://automatonhost.com"
ROOT = pathlib.Path(__file__).resolve().parent.parent
ERROR_PAGES_SOURCE = ROOT / "src" / "public" / "error-pages.ts"

OLD_LINK = re.compile(
    r"(?<![\w@.-])(?:https?://)?(?:www\.)?(?:postyourprice\.com|cp\.hippe\.eu)(?![\w-]|\.[A-Za-z0-9])(?P<path>/[^\s)\]>\"'`]*)?",
    re.IGNORECASE,
)
TRAILING = ".,;:!?"
FENCE = re.compile(r"^[ \t]*```")
INLINE_CODE = re.compile(r"`[^`\n]+`")


def _slugs(source: str) -> tuple[str, ...]:
    """The slugs of ERROR_PAGES in their order, the way ops/error-pages-arrivals.mjs reads them."""
    return tuple(m.group(1) for m in re.finditer(r"\bslug:\s*\"([a-z0-9-]+)\"", source))


SLUGS = _slugs(ERROR_PAGES_SOURCE.read_text(encoding="utf-8"))

# Decision 3: the page whose pattern has its first match furthest to the front of the title wins.
PAGES = (
    (re.compile(r"nonce|\b401\b", re.IGNORECASE), "invalid-or-expired-nonce"),
    (re.compile(r"database error|\b500\b", re.IGNORECASE), "verify-500-database-error"),
    (re.compile(r"credit|top-?ups?\b", re.IGNORECASE), "credits-never-granted"),
)
_missing = [slug for _, slug in PAGES if slug not in SLUGS]
if _missing:
    raise RuntimeError(f"not in ERROR_PAGES of {ERROR_PAGES_SOURCE}: {', '.join(_missing)}")


def page_for_title(title: str) -> str | None:
    """The slug of the error page for an issue title, or None when no pattern matches (the home page)."""
    best: tuple[int, int, str] | None = None
    for rank, (pattern, slug) in enumerate(PAGES):
        m = pattern.search(title)
        if m and (best is None or (m.start(), rank) < best[:2]):
            best = (m.start(), rank, slug)
    return best[2] if best else None


def _code_spans(body: str) -> list[tuple[int, int]]:
    """Where `body` is code: fenced blocks from a line of three backticks to the next, and pairs of single backticks."""
    spans: list[tuple[int, int]] = []
    prose: list[tuple[int, int]] = []
    pos, start, fenced = 0, 0, None
    for line in body.splitlines(keepends=True):
        if FENCE.match(line):
            if fenced is None:
                if pos > start:
                    prose.append((start, pos))
                fenced = pos
            else:
                spans.append((fenced, pos + len(line)))
                fenced = None
                start = pos + len(line)
        pos += len(line)
    if fenced is not None:
        spans.append((fenced, len(body)))
    elif len(body) > start:
        prose.append((start, len(body)))
    for a, b in prose:
        spans.extend((a + m.start(), a + m.end()) for m in INLINE_CODE.finditer(body[a:b]))
    return spans


def _replacements(body: str, slug: str | None) -> list[tuple[int, int, str, str]]:
    if slug is not None and slug not in SLUGS:
        raise ValueError(f"{slug} is not a slug of ERROR_PAGES")
    code = _code_spans(body)
    out = []
    for m in OLD_LINK.finditer(body):
        start, end = m.start(), m.end()
        path = m.group("path") or ""
        while path and path[-1] in TRAILING:
            path = path[:-1]
            end -= 1
        in_code = any(a <= start < b for a, b in code)
        if in_code:
            new = NEW + path
        elif path in ("", "/"):
            new = f"{NEW}/errors/{slug}" if slug else NEW
        else:
            new = NEW + path
        out.append((start, end, body[start:end], new))
    return out


def relink(body: str, slug: str | None) -> str:
    """`body` with every old link replaced by decision 2; every character outside the old links stays as it was."""
    parts, pos = [], 0
    for start, end, _, new in _replacements(body, slug):
        parts.append(body[pos:start])
        parts.append(new)
        pos = end
    parts.append(body[pos:])
    return "".join(parts)


def changes(body: str, slug: str | None) -> list[tuple[str, str]]:
    """Every old link of `body` with what `relink` puts in its place, in the order they stand."""
    return [(old, new) for _, _, old, new in _replacements(body, slug)]
