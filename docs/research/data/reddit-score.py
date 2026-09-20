#!/usr/bin/env python3
"""Holt die aktuelle Upvote-Zahl einzelner Reddit-Posts.

Warum ueber embed.reddit.com: www.reddit.com und old.reddit.com antworten auf
jeden unauthentifizierten Abruf mit HTTP 403. embed.reddit.com ist der fuer
Einbettung durch Dritte vorgesehene Host, liefert serverseitig gerendertes HTML
und darin die Zahl als <faceplate-number number="...">...upvotes.

Aufruf:  python3 reddit-score.py <sub>/<post-id> [...]   oder  --stdin (je Zeile)
Ausgabe: TSV  sub  id  upvotes  titel
"""
import re, sys, time, urllib.request, html as H

UA = "Mozilla/5.0 (X11; Linux x86_64) control-plane-research/1.0"
NUM = re.compile(r'<faceplate-number[^>]*number="(\d+)"[^>]*>\s*</faceplate-number>\s*(?:<[^>]+>\s*)*upvotes', re.I)
NUM2 = re.compile(r'<faceplate-number[^>]*number="(\d+)"')
TITLE = re.compile(r'<h1[^>]*>(.*?)</h1>', re.S)
# Ohne <h1> steht der Titel im Kopf als "Posted by <autor> \u00b7 <titel>".
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
            return ("geloescht", None)
        m = NUM.search(body) or NUM2.search(body)
        ti = TITLE.search(body)
        if ti:
            titel = ti.group(1)
        else:
            po = POSTED.search(body)
            titel = po.group(2) if po else None
        return (int(m.group(1)) if m else None,
                H.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', titel))).strip() if titel else None)
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
