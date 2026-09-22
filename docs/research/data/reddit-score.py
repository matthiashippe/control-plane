#!/usr/bin/env python3
"""Fetches the current upvote count of individual Reddit posts.

Why through embed.reddit.com: www.reddit.com and old.reddit.com answer every
unauthenticated request with HTTP 403. embed.reddit.com is the host intended for
embedding by third parties, it serves server-side rendered HTML and in it the
number as <faceplate-number number="...">...upvotes.

Call:   python3 reddit-score.py <sub>/<post-id> [...]   or  --stdin (one per line)
Output: TSV  sub  id  upvotes  title
"""
import re, sys, time, urllib.request, html as H

UA = "Mozilla/5.0 (X11; Linux x86_64) control-plane-research/1.0"
NUM = re.compile(r'<faceplate-number[^>]*number="(\d+)"[^>]*>\s*</faceplate-number>\s*(?:<[^>]+>\s*)*upvotes', re.I)
NUM2 = re.compile(r'<faceplate-number[^>]*number="(\d+)"')
TITLE = re.compile(r'<h1[^>]*>(.*?)</h1>', re.S)
# Without an <h1> the title sits in the header as "Posted by <author> \u00b7 <title>".
POSTED = re.compile(r'Posted by\s*(?:<[^>]+>\s*)*([\w\-]+)\s*(?:<[^>]+>\s*)*\u00b7\s*(?:<[^>]+>\s*)*(.*?)(?:<div|<faceplate|upvote)', re.S)


def score(sub, pid, tries=3):
    url = f"https://embed.reddit.com/r/{sub}/comments/{pid}/?embed=true&theme=light"
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            s = urllib.request.urlopen(req, timeout=45).read().decode("utf-8", "replace")
        except Exception as e:
            time.sleep(4 + 5 * t)
            continue
        body = re.sub(r'<style[^>]*>.*?</style>', '', s, flags=re.S)
        if "This post has been deleted" in body or "post has been removed" in body:
            return ("deleted", None)
        m = NUM.search(body) or NUM2.search(body)
        ti = TITLE.search(body)
        if ti:
            title = ti.group(1)
        else:
            po = POSTED.search(body)
            title = po.group(2) if po else None
        return (int(m.group(1)) if m else None,
                H.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', title))).strip() if title else None)
    return (None, None)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--stdin":
        args = [l.strip() for l in sys.stdin if l.strip()]
    for a in args:
        sub, pid = a.split("/")[-2], a.split("/")[-1]
        n, t = score(sub, pid)
        print(f"{sub}\t{pid}\t{n if n is not None else '-'}\t{t or ''}")
        sys.stdout.flush()
        time.sleep(2)
