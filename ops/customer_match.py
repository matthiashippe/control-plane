"""Which access log addresses belong to a customer, once, for ops/customer-decline.sh and ops/customer-work.sh.

A customer is a foreign wallet with `inference` ledger rows. Each of its rows is matched to the access
log line on the inference path (POST /v1/chat/completions or POST /v1/check, path without query) with
status 200 from a foreign address whose ts lies nearest to the row, at most MATCH_S away; every address
matched that way belongs to the customer. Our own addresses are never a candidate.

Moved here from ops/customer-decline.sh (kunden 08) so the second tool uses the same rule instead of a
copy. No function here prints an address.
"""

INFERENCE = {("POST", "/v1/chat/completions"), ("POST", "/v1/check")}
MATCH_S = 5.0


def inference_lines(log, own):
    """Lines on the inference path from foreign addresses; ours never enter, not even as a candidate."""
    return [r for r in log if r.ip and r.ip not in own and (r.method, r.path) in INFERENCE]


def ok_lines(foreign):
    return [r for r in foreign if r.status == 200]


def match_rows(times, lines):
    """The addresses matched to the row times, and how many rows found no line within MATCH_S."""
    mine, unmatched = set(), 0
    for t in times:
        best = None
        for line in lines:
            d = abs(line.ts - t)
            if d <= MATCH_S and (best is None or d < best[0]):
                best = (d, line.ip)
        if best is None:
            unmatched += 1
        else:
            mine.add(best[1])
    return mine, unmatched
