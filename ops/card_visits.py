"""The counting of ops/card-visits.sh (kunden 15). Reads only, prints sums only.

    python3 -B ops/card_visits.py window <since> <until>              exit 0 when both are strict ISO UTC
                                                                      and since < until, else 1
    python3 -B ops/card_visits.py count <log> <own> <since> <until>   the three kinds of output lines

<log> is a Caddy JSON access log, read with read_log from ops/conway_arrivals.py (path without the query).
<own> is the list ops/conway-arrivals.sh wrote with conway_own_list, one address per line, read with
own_addresses from the same module. A request counts when since <= ts < until.

CARD VISITS: every GET or HEAD on a path that starts with /card/ (/cards, /card.json and a bare /card do
not). From our own addresses it is <o>; of the foreign ones it is a bot when the User-Agent contains
bot, crawl, spider or fetch in any case, or is empty, and a person otherwise.

MAINTAINED 402: every POST on /v1/chat/completions with status 402 from a foreign address whose
User-Agent starts with automaton-maintained/. The version is the token after the slash up to the first
whitespace. A version line is printed only for a version that was seen, in natural order (digit runs
compare as numbers, so 0.2.10 comes after 0.2.2). The User-Agent is written by the client, so a token
that is not a plain version (empty, too long, odd characters, or anything that reads like an address
or a wallet) is printed as `other` instead of verbatim and sorts last; its requests stay in the total.

Exit 2 when the log or the own list cannot be read or the own list is empty; exit 1 on a time that is
not strict ISO UTC. No address, wallet or query ever reaches stdout; diagnostics go to stderr.
"""
import datetime
import os
import re
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import conway_arrivals as ca  # noqa: E402

ISO = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")
BOT = re.compile(r"bot|crawl|spider|fetch", re.I)
CARD_PREFIX = "/card/"
CARD_METHODS = ("GET", "HEAD")
CHAT_PATH = "/v1/chat/completions"
MAINTAINED = "automaton-maintained/"
VERSION = re.compile(r"[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}")
LEAKY = re.compile(r"([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}|address=", re.I)
OTHER = "other"


def fail(msg, code=2):
    print(f"card-visits: {msg}", file=sys.stderr)
    raise SystemExit(code)


def parse_time(arg, name):
    if not ISO.fullmatch(arg):
        fail(f"--{name} is no strict ISO time in UTC like 2026-11-19T14:30:00Z", 1)
    try:
        return datetime.datetime.strptime(arg, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc).timestamp()
    except ValueError:
        fail(f"--{name} is no valid date and time", 1)


def window(since_arg, until_arg):
    since, until = parse_time(since_arg, "since"), parse_time(until_arg, "until")
    if since >= until:
        fail("--since must be before --until", 1)
    return since, until


def is_card(method, path):
    return method in CARD_METHODS and path.startswith(CARD_PREFIX)


def is_bot(agent):
    return not agent.strip() or bool(BOT.search(agent))


def version_of(agent):
    """The version token of an automaton-maintained/ User-Agent, or `other` when it is no plain version."""
    token = re.match(r"\S*", agent[len(MAINTAINED):]).group(0)
    if not VERSION.fullmatch(token) or LEAKY.search(token):
        return OTHER
    return token


def natural(v):
    """Sort key: `other` last, digit runs as numbers, the rest as text."""
    parts = tuple((0, int(p), "") if p.isdigit() else (1, 0, p) for p in re.findall(r"\d+|\D+", v))
    return (v == OTHER, parts)


def count(log_file, own_file, since_arg, until_arg):
    since, until = window(since_arg, until_arg)
    try:
        own = ca.own_addresses(own_file)
    except ca.Unreadable as e:
        fail(f"{e}, so nothing is counted.")
    try:
        rows, broken = ca.read_log(log_file)
    except ca.Unreadable:
        fail("the access log is not readable. This says nothing about traffic.")

    people = bots = mine = 0
    versions = {}
    in_window = 0
    for r in rows:
        if not (since <= r.ts < until):
            continue
        in_window += 1
        foreign = bool(r.ip) and r.ip not in own
        if is_card(r.method, r.path):
            if not foreign:
                mine += 1
            elif is_bot(r.agent):
                bots += 1
            else:
                people += 1
        if (foreign and r.method == "POST" and r.path == CHAT_PATH and r.status == 402
                and r.agent.startswith(MAINTAINED)):
            v = version_of(r.agent)
            versions[v] = versions.get(v, 0) + 1

    print(f"card-visits: {in_window} log line(s) in the window, {len(rows)} read, {broken} not access lines", file=sys.stderr)
    print(f"CARD VISITS since {since_arg} until {until_arg}: {people} by people, {bots} by bots, {mine} from own addresses")
    print(f"MAINTAINED 402 since {since_arg} until {until_arg}: {sum(versions.values())} answers 402 on "
          f"{CHAT_PATH} to automaton-maintained runtimes")
    for v in sorted(versions, key=natural):
        print(f"MAINTAINED 402 VERSION {MAINTAINED}{v}: {versions[v]}")


def main(argv):
    if len(argv) == 3 and argv[0] == "window":
        window(argv[1], argv[2])
        return 0
    if len(argv) == 5 and argv[0] == "count":
        count(*argv[1:])
        return 0
    fail("usage: card_visits.py window <since> <until> | count <log> <own> <since> <until>", 1)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
