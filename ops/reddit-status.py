#!/usr/bin/env python3
"""
The state of our Reddit posts, seen from the outside.

    python3 ops/reddit-status.py [account]

Reddit is closed to unauthenticated requests (403 on everything, the .json endpoints included). Two
routes remain, both from the channel research of 20.09.2026:

  arctic-shift   the public archive. Gives text, author and timestamp, but reads about 20 seconds
                 after creation; a later removal is not visible there.
  embed.reddit   the host for embeds. Gives the current vote count and shows whether a post is
                 still served at all.

Together they answer the question an author cannot answer themselves: a filtered comment looks
entirely normal to the person who wrote it.
"""
import datetime
import json
import sys
import urllib.error
import urllib.request

ACCOUNT = sys.argv[1] if len(sys.argv) > 1 else "matthiasmusic10"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"

# Threads we have written something under. Add new ones here.
THREADS = [
    ("1w7wz82", "r/AI_Agents: If your agent can pay for things automatically, it can also get scammed"),
    ("1wk1qfk", "r/AI_Agents: How do you handle service discovery for agents that need to pay for APIs"),
]

# Our own posts, not just comments under other people's. Here a comment by a third party counts as
# a reply to us, not only a direct reply to one of our comments.
OWN_POSTS = [
    ("1wli6lq", "r/ethdev: An agent that made 603 payments in 41 hours got address-poisoned"),
]


def fetch(url: str, raw: bool = False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            content = r.read().decode("utf-8", "replace")
            return content if raw else json.loads(content)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
        return None if raw else {"__error": str(e)}


def live(permalink: str) -> str:
    page = fetch(permalink.replace("www.reddit.com", "embed.reddit.com"), raw=True)
    if not page:
        return "could not be fetched"
    if "[removed]" in page or "[deleted]" in page:
        return "REMOVED OR DELETED"
    marker = 'faceplate-number number="'
    if marker in page:
        rest = page.split(marker, 1)[1]
        return f"visible, {rest.split(chr(34), 1)[0]} vote(s)"
    return "visible, vote count not found"


def main() -> None:
    unanswered = 0
    for tid, title in THREADS:
        print(f"-- {title}")
        data = fetch(f"https://arctic-shift.photon-reddit.com/api/comments/search?link_id={tid}&limit=100")
        if "__error" in data:
            print(f"   archive unreachable: {data['__error']}\n")
            continue
        everything = data.get("data", [])
        ours = [c for c in everything if c.get("author") == ACCOUNT]
        replies_to_us = [c for c in everything if c.get("author") != ACCOUNT and any(
            c.get("parent_id", "").endswith(e.get("id", "")) for e in ours)]
        print(f"   comments in the thread: {len(everything)}, of those ours: {len(ours)}")
        if not ours:
            print("   (nothing from us here yet)\n")
            continue
        for c in ours:
            t = datetime.datetime.fromtimestamp(c["created_utc"], datetime.timezone.utc)
            gone = c.get("removed_by_category") or c.get("banned_by")
            state = f"REMOVED ({gone})" if gone else "fine"
            permalink = "https://www.reddit.com" + c.get("permalink", "")
            print(f"   written {t:%Y-%m-%d %H:%M} UTC, in the archive {state}")
            print(f"   LIVE: {live(permalink)}")
            print(f"   {permalink}")
        if replies_to_us:
            unanswered += len(replies_to_us)
            print(f"   ! {len(replies_to_us)} REPLY/REPLIES TO OUR COMMENT:")
            for a in replies_to_us:
                print(f"     {a.get('author')}: {a.get('body', '')[:160]}")
        print()
    for pid, title in OWN_POSTS:
        print(f"-- {title}")
        permalink = f"https://www.reddit.com/r/ethdev/comments/{pid}/"
        data = fetch(f"https://arctic-shift.photon-reddit.com/api/posts/ids?ids={pid}")
        if isinstance(data, dict) and "__error" not in data:
            entries = data.get("data", [])
            if entries:
                p = entries[0]
                t = datetime.datetime.fromtimestamp(p["created_utc"], datetime.timezone.utc)
                gone = p.get("removed_by_category") or p.get("banned_by")
                permalink = "https://www.reddit.com" + p.get("permalink", "")
                print(f"   written {t:%Y-%m-%d %H:%M} UTC, in the archive {'REMOVED (' + str(gone) + ')' if gone else 'fine'}")
        print(f"   LIVE: {live(permalink)}")
        # Replies to the post itself.
        comments = fetch(f"https://arctic-shift.photon-reddit.com/api/comments/search?link_id={pid}&limit=100")
        if isinstance(comments, dict) and "__error" not in comments:
            others = [c for c in comments.get("data", []) if c.get("author") != ACCOUNT]
            print(f"   replies: {len(others)}")
            for a in others:
                unanswered += 1
                print(f"     ! {a.get('author')}: {a.get('body', '')[:200]}")
        print(f"   {permalink}")
        print()

    if unanswered:
        print(f"{unanswered} unanswered reply/replies. A question left standing costs more than no answer.")


if __name__ == "__main__":
    main()
