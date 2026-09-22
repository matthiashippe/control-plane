#!/usr/bin/env python3
"""Collects metrics on subreddits for the channel research of 20.09.2026.

Why not directly at Reddit: reddit.com answers every unauthenticated request
with HTTP 403 (robots.txt: "User-agent: * / Disallow: /"), and all public
Reddit frontends (Redlib, eddrit) sit behind Anubis, a proof-of-work guard.
Neither of those is circumvented here.

The measurement therefore goes through two open archive APIs:
  arctic-shift  https://arctic-shift.photon-reddit.com/api  (posts, comments)
  (PullPush was checked as a score source and dropped: it returns HTTP 429 throughout.)

Important for interpretation: arctic-shift ingests posts ~20 s after creation,
so the "score" stored there is always ~1 and is NOT usable as an upvote count.
Post volume and full-text search, by contrast, are complete.

Usage:  python3 reddit-scan.py out.json <subreddit> [<subreddit> ...]
"""
import json, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone

AS = "https://arctic-shift.photon-reddit.com/api"
PP = "https://api.pullpush.io/reddit"
UA = "control-plane-research/1.0 (read-only subreddit metrics)"
MIN_GAP = 5.0
_last = [0.0]


def get(url, tries=5, gap=MIN_GAP):
    for attempt in range(tries):
        wait = gap - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                _last[0] = time.time()
                d = json.loads(r.read().decode("utf-8", "replace"))
            if isinstance(d, dict) and d.get("error"):
                raise RuntimeError(d["error"])
            return d
        except Exception as e:
            _last[0] = time.time()
            err = str(e)
            # arctic-shift reports overload as "Timeout. Maybe slow down a bit";
            # the only remedy is waiting, not asking again faster.
            time.sleep(5 + 6 * attempt)
    print(f"  ! {url[:110]} -> {err}", file=sys.stderr)
    return None


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%M")


def meta(sub):
    d = get(f"{AS}/subreddits/search?subreddit={sub}")
    if not d or not d.get("data"):
        return {"gefunden": False}
    s = d["data"][0]
    m = s.get("_meta", {})
    return {
        "gefunden": True,
        "display_name": s.get("display_name"),
        "titel": s.get("title"),
        "public_description": s.get("public_description"),
        "sidebar": (s.get("description") or "")[:8000],
        "abonnenten_archiv": s.get("subscribers"),
        "abonnenten_stand": iso(s["retrieved_on"]) if s.get("retrieved_on") else None,
        "gegruendet": iso(s["created_utc"]) if s.get("created_utc") else None,
        "typ": s.get("subreddit_type"),
        "posts_gesamt": m.get("num_posts"),
        "kommentare_gesamt": m.get("num_comments"),
        "restrict_posting": s.get("restrict_posting"),
        "submit_text": s.get("submit_text"),
    }


def volume(sub, n=100):
    """Posts per day, from the time span of the last n ingested posts."""
    d = get(f"{AS}/posts/search?subreddit={sub}&limit={n}&sort=desc&fields=created_utc,title,author")
    p = (d or {}).get("data") or []
    if len(p) < 10:
        return {"stichprobe": len(p)}
    ts = sorted(x["created_utc"] for x in p)
    span_h = (ts[-1] - ts[0]) / 3600.0
    return {
        "stichprobe": len(p),
        "von": iso(ts[0]), "bis": iso(ts[-1]),
        "spanne_stunden": round(span_h, 1),
        "posts_pro_tag": round((len(ts) - 1) / span_h * 24, 1) if span_h > 0.2 else None,
    }


def automod(sub, n=25, window=("2026-06-01", "2026-09-20")):
    """AutoModerator notices: karma and account-age thresholds are stated there verbatim.

    The author+subreddit query is expensive server side and runs into
    "Timeout. Maybe slow down a bit" regularly without a time window. Hence the limit.
    """
    d = get(f"{AS}/comments/search?author=AutoModerator&subreddit={sub}"
            f"&after={window[0]}&before={window[1]}&limit={n}&sort=desc&fields=body,created_utc",
            tries=4, gap=6.0)
    out, seen = [], set()
    for c in (d or {}).get("data") or []:
        b = " ".join((c.get("body") or "").split())
        k = b[:90]
        if k in seen:
            continue
        seen.add(k)
        out.append({"datum": iso(c["created_utc"]), "text": b[:1600]})
    return out


def search(sub, term, n=25):
    d = get(f"{AS}/posts/search?subreddit={sub}&query={term}"
            f"&after=2025-01-01&before=2026-09-21&limit={n}&sort=desc"
            f"&fields=title,created_utc,author,id,selftext")
    posts = [{
        "datum": iso(x["created_utc"]), "titel": x.get("title"), "autor": x.get("author"),
        "url": f"https://www.reddit.com/r/{sub}/comments/{x['id']}/",
        "anriss": " ".join((x.get("selftext") or "").split())[:400],
    } for x in ((d or {}).get("data") or [])]
    # Full-text search in comments is expensive server side and runs into the timeout
    # on large subreddits ("Timeout. Maybe slow down a bit"), hence the short window
    # and only two attempts. The parameter is called body, not query.
    d2 = get(f"{AS}/comments/search?subreddit={sub}&body={term}"
             f"&after=2026-08-20&before=2026-09-20&limit={n}&fields=body,created_utc,author",
             tries=2, gap=3.0)
    comments = [{
        "datum": iso(x["created_utc"]), "autor": x.get("author"),
        "text": " ".join((x.get("body") or "").split())[:400],
    } for x in ((d2 or {}).get("data") or [])]
    return {"posts": posts, "kommentare": comments}


def flairs(sub, n=100):
    """Which flairs dominate: shows which post form the subreddit expects."""
    d = get(f"{AS}/posts/search?subreddit={sub}&limit={n}&sort=desc&fields=link_flair_text,url,title,id,created_utc,author")
    p = (d or {}).get("data") or []
    counts = {}
    for x in p:
        counts[x.get("link_flair_text") or "(ohne)"] = counts.get(x.get("link_flair_text") or "(ohne)", 0) + 1
    return {
        "flairs": sorted(counts.items(), key=lambda kv: -kv[1]),
        "anteil_selfpost": round(sum(1 for x in p if "reddit.com/r/" in (x.get("url") or "")) / len(p), 2) if p else None,
        "beispiele": [{"datum": iso(x["created_utc"]), "titel": x.get("title"), "autor": x.get("author"),
                       "flair": x.get("link_flair_text"),
                       "url": f"https://www.reddit.com/r/{sub}/comments/{x['id']}/"} for x in p[:12]],
    }


TERMS = ["conway", "x402", "automaton"]


def scan(sub):
    print(f"[{sub}]", file=sys.stderr, flush=True)
    r = {"subreddit": sub}
    r["meta"] = meta(sub)
    if not r["meta"].get("gefunden"):
        return r
    r["volumen"] = volume(sub)
    print(f"   volume:  {r['volumen'].get('posts_pro_tag')}/day", file=sys.stderr, flush=True)
    r["automod"] = automod(sub)
    print(f"   automod: {len(r['automod'])}", file=sys.stderr, flush=True)
    r["form"] = flairs(sub)
    print(f"   flairs:  {r['form'].get('flairs', [])[:3]}", file=sys.stderr, flush=True)
    r["treffer"] = {t: search(sub, t) for t in TERMS}
    for t, v in r["treffer"].items():
        if v["posts"] or v["kommentare"]:
            print(f"   {t}: {len(v['posts'])} posts, {len(v['kommentare'])} comments", file=sys.stderr, flush=True)
    return r


if __name__ == "__main__":
    target, subs = sys.argv[1], sys.argv[2:]
    collected = []
    for s in subs:
        collected.append(scan(s))
        with open(target, "w") as f:
            json.dump(collected, f, ensure_ascii=False, indent=1)
    print(f"written: {target}", file=sys.stderr)
