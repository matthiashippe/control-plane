# Operational observation (L1, report-only)

`ops/status.sh` reads the state of the running control plane and prints JSON: health and remaining
certificate lifetime over HTTPS, compose state, disk, memory, restarts and the error count of the
last 24 h on the VM, figures out of the SQLite (`ops/db-report.cjs`, read-only inside the
container), the OpenRouter balance and the USDC balance of the payTo address on Base.

```
OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' ~/brain/connectors/secrets.env | cut -d= -f2) ops/status.sh
```

The script changes nothing and starts nothing. It is the data source for the ops triage loop
(`/loop 1d Run $ops-triage`), which writes the sections in `STATE.md` from it.

## Smoke test after a deploy

`ops/smoke.sh [BASE_URL]` (default `https://cp.hippe.eu`) checks from the outside whether the
service really does what it should after a deploy: `/health`, `/v1/status` with models, markup and
the automaton count, the landing page with its link to `ohne-control-plane.md` and the imprint
anchor, the 302 from `/impressum`, `/.well-known/x402` with a payment offer, `/llms.txt` with the
setup line, the security headers, the CSP hash against the inline script actually served, the body
limit (1.1 MB to `/v1/auth/verify` has to give 413) and the 401 from `/v1/credits/balance` without a
key. One line per check, a summary at the end, `exit 1` on any failure. The script writes nothing
and needs no API key.

A standard run makes **one** request against a rate-limited path (60 per minute and client,
`src/ratelimit.ts`) and counts it in the summary. The limit itself is only checked by
`--with-ratelimit`, because that test locks the caller out for the rest of the minute. `--no-proxy`
skips the three checks that hang off Caddy (headers, CSP hash, body limit); that is meant for a
local start and does not replace the run against the real endpoint.

## Thresholds that call for action

| Signal | Threshold | Action |
|---|---|---|
| `health.status` | not 200 | report immediately, read the logs, check the compose state |
| `cert_days_left` | below 20 | check the Caddy logs (ACME), verify DNS is set to DNS-only |
| `vm.restarts` | rises between two runs | read the logs of the last hour, put the cause in STATE.md |
| `vm.errors_24h` | above 0 | tell `provider_unavailable` (OpenRouter) and `settlement_failed` (PayAI) apart |
| `db.stuck_payments` | above 0 | a payment hangs in `pending`: check the nonce and the facilitator response |
| `openrouter.left` | below 5 USD | ask Matthias whether to top up; otherwise every tenant faces a 503 |
| `vm.disk_used` | above 80 % | rotate the logs (json-file max 20m x 5), check for old images |
| `db.day.margin_mc` | negative | the sale price does not cover the purchase: check markup or catalogue |
| `db.paying_without_thinking` | one entry older than 24 h | a customer paid and buys no inference. No alarm, but go and look |

### Paying without thinking

The list `db.paying_without_thinking` names every wallet with credits that has not made **a single
inference call** since its last topup, with the hours since then and whether it ever thought at all.
That is the quietest way to lose a customer: the credits sit there, the runtime maybe still polls
its balance, and nothing happens.

This exact case happened on 19.09.2026 with the first paying customer, and it was only noticed
because somebody happened to look into the ledger. The cause lay outside our code (that runtime did
not buy its turns from us, see `docs/research/`), but that does not change the fact that we have to
notice it.

Deliberately **no alarm**: a freshly topped-up automaton that happens to be asleep is normal, and an
alarm clock that rings every night gets switched off. From one entry older than 24 hours on, the
look into the Caddy logs pays off: are requests from that address still coming in at all, and with
which status code? If yes and all 200, it is on their side. If no, they are gone.

## Watchdog on the VM

`ops/watchdog.sh` runs there by cron every five minutes (`/var/log/cp-watchdog.log`) and is the only
instance that notices an outage without anybody looking. It checks `/health` from the outside (two
attempts 20 s apart, so a single hiccup does not raise an alarm) and the remaining lifetime of the
certificate. What gets reported is the **change** of state, not every run: an outage reports once,
the return reports once.

Without `CP_ALERT_WEBHOOK` it only writes to the log. With the URL set (ntfy, Slack, Discord, no
matter which) it sends one line of text there. For delivery to work, put the variable into the cron
entry:

```
*/5 * * * * CP_ALERT_WEBHOOK=https://ntfy.sh/<random-topic> /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1
```

Delivery has been armed since 19.09.2026: the crontab on `srv1336627` sets `CP_ALERT_WEBHOOK` to an
ntfy topic. **The URL is not in this repo, because the repo is public**: whoever knows the topic
reads the messages along with us and can send some of their own. It lives in
`~/brain/connectors/secrets.env` as `CP_ALERT_WEBHOOK` and in the crontab of the VM.

Checked on 19.09.2026: a simulated outage (`CP_URL` pointed at a 404 path) triggered a message with
priority `high` from the VM that was readable over ntfy.

## Backup

`ops/backup.sh` runs daily at 3:17 UTC by cron on the VM (`/var/log/cp-backup.log`), writes to
`/opt/control-plane/backups/` and keeps 14 days. If it fails, a message goes out over the same
webhook as the watchdog uses.

It uses `VACUUM INTO` from inside the running application, **not** `cp cp.db`: the database runs in
WAL mode, the `.db` file only carries the state of the last checkpoint, everything after that sits
in the `-wal` next to it. At the traffic this service has, no checkpoint runs for days. Reproduced
locally on 19.09.2026: after the schema, five wallets, ten payments and the matching ledger entries,
`cp.db` was 86 KB and held **zero rows**, the entire content sat in the 943 KB of the `-wal`. A copy
of the `.db` alone still passed `PRAGMA integrity_check` with "ok". Under more write load the
automatic checkpoint kicks in, and then the copy is not empty but at some earlier state: in the same
exercise 1141 instead of 1747 ledger rows.

The Node part has lived in `ops/backup-vacuum.cjs` since 19.09.2026 and is fed into the running
container (`docker compose exec -T cp node - < ops/backup-vacuum.cjs`, as with `db-report.cjs`). It
clears out leftovers of the last run, writes the snapshot and checks it while it still sits in the
volume: `integrity_check`, balances against ledger sums and the row counts against the source. Two
faults of the old script are gone with it:

- If `backup-tmp.db` stayed behind after a failed transfer, **every further backup** failed at
  `output file already exists`, day after day, and the log only said "backup inside the
  container failed" without the reason. The container's error output is now part of the message.
- The check "output larger than 20 KB" could not catch the fault it was written for: the schema
  alone weighs about 80 KB, so a copy void of content sits far above that. Instead `ops/backup.sh`
  compares the size of the transferred file with the one the container reported, and the container
  checks the content. If they differ, the file is discarded instead of lying in the archive as a
  torso.

The Node part hangs in `test/backup.test.ts`, the bash around it ran on 19.09.2026 against a Docker
dummy (a `docker` in PATH that imitates the two calls locally): the normal case, the container part
failing, the transfer failing, the transfer breaking off halfway. In all four cases the reason ends
up in the log, and the run after that comes through again.

## Restoring a backup

Played through completely once on 19.09.2026, because until then nobody had. It was played through
locally against a SQLite with the schema from `src/db.ts`, filled with wallets, payments in all
three states, ledger rows of all four kinds, API keys, automatons and a `-wal` that was not empty,
with a second process writing along during the backup. What came out of it is below under "The four
traps". The Docker lines themselves have **not** run on the VM, the path in between has.

**1. Pick a backup and check it before the service is touched.** The checking script only reads, the
service keeps running while it does:

```
ls -la /opt/control-plane/backups/
docker run --rm -v /opt/control-plane/backups:/bak:ro -v /opt/control-plane/repo/ops:/ops:ro \
  -e NODE_PATH=/app/node_modules --entrypoint node control-plane:latest \
  /ops/check-restore.cjs /bak/<file>.db
```

`ops/check-restore.cjs` checks `integrity_check`, `foreign_key_check`, whether every wallet matches
the sum of its ledger rows, whether every `settled` payment has its `topup` row and whether an x402
nonce carries more than one credit. It ends with `exit 1` as soon as one of those checks fails. Only
once it runs through is the outage justified.

**2. Stop the service.** From here on every caller sees a 502, the paying customer included:

```
cd /opt/control-plane/repo/deploy
docker compose -f docker-compose.prod.yml stop cp
```

**3. Move the old state aside completely, do not overwrite it.** All three files together, otherwise
the old state is devalued and the restore is irreversible:

```
docker run --rm -v deploy_cp-data:/data alpine sh -c \
  'mkdir -p /data/pre-restore && mv /data/cp.db /data/cp.db-wal /data/cp.db-shm /data/pre-restore/ 2>/dev/null; ls -la /data /data/pre-restore'
```

**4. Put the backup in:**

```
docker run --rm -v deploy_cp-data:/data -v /opt/control-plane/backups:/bak:ro alpine \
  sh -c "cp /bak/<file>.db /data/cp.db && ls -la /data"
```

Afterwards only `cp.db` and `pre-restore/` may sit in that directory. If a `cp.db-wal` or `cp.db-shm`
is still there, do not start, catch up on step 3 instead.

**5. Start and check from the outside:**

```
docker compose -f docker-compose.prod.yml start cp
docker compose -f docker-compose.prod.yml logs --tail 50 cp
docker compose -f docker-compose.prod.yml exec -T cp node - < /opt/control-plane/repo/ops/check-restore.cjs
/opt/control-plane/repo/ops/smoke.sh
```

The log holds the messages the first start on a restored file produces, and they belong read, not
skimmed: every payment that was `pending` in the backup is set to `failed` and logged individually.
It stems from a request that no longer exists, and if its authorization went through on chain,
somebody paid without getting credits. Reservations (`reserved_mc`) are set to 0 by the start.

**6. Keep an eye on the price catalogue.** The fallback catalogue lives in the `kv` table. After a
backup older than that table it is gone: measured with `CP_PROVIDER=openrouter` and a price fetch
that did not come through, the service then did not start at all ("[openrouter] price fetch failed
(...) and no catalogue is stored. Cannot start."), while the same file with an entry in `kv` came up
normally and `/v1/status` served the stored prices. If OpenRouter is reachable at startup, the entry
fills itself back in.

**7. Clean up** once the service has run cleanly for a few days: delete `pre-restore/` from the
volume.

### The four traps

**The `-wal` and `-shm` of the old database stay behind.** That is the worst and the most likely one,
because the process has no SIGTERM handler and never closes the SQLite connection: after every `stop`
there is guaranteed to be a non-empty `-wal` in the volume (measured: 54 ms from SIGTERM to process
end, after that 8 KB of `-wal` and 32 KB of `-shm`, with the single written row inside). Copy the
backup over it without removing those two, and SQLite lays the old WAL frames over the new file. The
result is not an error message but a database that looks intact on top and is broken underneath:
`wallets` and `ledger` show the old state,
`select count(*) from payments where status='settled'` returns **0 without an error**, `api_keys`
throws `database disk image is malformed`, and `integrity_check` reports
`btreeInitPage() returns error code 11`. The same file with the companion files removed is fine.
Pinned down in `test/backup.test.ts`.

**The service is still running during the restore.** At first that looks like success: right after
the copy the file reports `integrity_check: ok` and exactly the backup state, and the running process
keeps writing without a single error message. Only its next checkpoint writes its old pages over the
new file, and then it is malformed, with `settled` at 0. Whoever checks right after the copy and is
satisfied checks too early. That is why the stop comes before the copy and the check after it.

**The backup is older than the last migration.** The most harmless case, against expectation. A
backup without `wallets.reserved_mc`, without `payments.balance_after_mc` and without the `kv` table
was migrated in 0.94 seconds at startup, the columns and the table were added, the index
`ledger_topup_ref` as well, the balances stayed unchanged, `/health` and `/v1/status` answered
normally. `ops/check-restore.cjs` reports missing columns as a hint and does not reject the backup.
Two after-effects remain: the price catalogue in `kv` is empty (step 6), and if the old backup holds
an x402 nonce with two credits, `ledger_topup_ref` cannot be created. The start then carries on and
only writes it to the log, where nobody sees it. That is exactly what `check-restore.cjs` checks
for with its duplicate-credit check.

**The backup is empty and nobody notices.** A copy of the `.db` without its `-wal` has a complete
schema, a size of 86 KB and `integrity_check: ok`, but not a single row. No size threshold catches
that, and on restore every customer would stand at 0 credits. That is why `backup-vacuum.cjs` counts
the rows in the backup against the source, and why `check-restore.cjs` runs before it is put in.

### Duration and outage

Measured locally, `VACUUM INTO` from a reading process with a second process writing in parallel,
start with `CP_PROVIDER=mock` over `tsx`:

| Database | Backup | `VACUUM INTO` | Copy and clean-up | Start until `/health` 200 |
|---|---|---|---|---|
| 1.3 MB | 1.3 MB | 13 ms | 7 ms | 0.92 s |
| 11 MB | 11 MB | 82 ms | 18 ms | 0.86 s |
| 101 MB | 97 MB | 750 ms | 503 ms | 0.92 s |

So the file part of a restore stays below a second even at 100 MB. What determines the outage is not
that but the container switch around it, which cost about 16 seconds without an answer during the
deploys on 19.09.2026. On top of that comes the price fetch at container startup, which hung twice on
19.09.; with a filled `kv` it falls back on the stored catalogue. Realistically half a minute of 502
for every caller is what to plan for, and the backup check from step 1 belongs before that, not
inside it.

### What has to hold afterwards

`ops/check-restore.cjs` checks all of this and ends with `exit 1` as soon as one of them does not
hold:

- `PRAGMA integrity_check` is `ok`, `foreign_key_check` is empty.
- For every wallet `balance_mc` equals the sum of its `ledger.delta_mc`, and the totals of both sides
  match.
- Every `settled` payment has its `topup` ledger row, and no x402 nonce has two.
- The numbers from `ops/status.sh` (`db.wallets`, `db.keys`, `db.automatons`) match the last run
  before the outage, minus whatever came in after the backup.
- `ops/smoke.sh` runs through from the outside.

## Self-healing

The `autoheal` service in the compose file restarts containers the healthcheck marks as `unhealthy`.
That is needed because Docker on its own only restarts on a terminated process: on 19.09.2026 the
startup process hung silently, the container stayed "Up" and unhealthy, and the service was 502 until
somebody intervened by hand. Checked with SIGSTOP on the Node process: `unhealthy` after 90 seconds,
restarted automatically after 120 seconds.

## The figure of the 30-day test

**Goal: five paying outside operators in 30 days** (as of 19.09.2026, revised down from 50 after the
demand measurement). Below three on 19.10.2026 it gets switched off, with two weeks of notice on the
landing page.

The number in `/v1/status` counts **distinct wallets with at least one credit**, not registrations
and not automatons. Both would be gameable: an API key costs nothing, a registration does not either,
and even with a payment a single wallet could create 25 automatons and multiply the figure by
twenty-five. Whoever wants to move the number has to pay, and that is the whole point of the
measurement. Our own automaton is included in the number, so subtract one for the actual figure.
`db.keys` counts issued API keys, `db.day.topups` the payments of the last day.

## Before the article goes out

`ops/before-the-article.py`. Reads the article, pulls its figures out and holds each one against what
the service and the daily series say today. Changes nothing, sends nothing. Exit 0 means the text
matches the world; anything else names the sentences to fix and why.

The checklist it replaces was a list of commands somebody had to remember to run and numbers
somebody had to remember to compare. On a posting morning that is exactly the kind of list that
gets skipped, and those numbers are the first thing a reader checks.

It holds eight directory figures, the disclosure "zero buyers who are not me" against the real
counter, the three claims about Conway's present tense against the daily watch, whether
`check-all.sh` is green, and whether any job is open at all when readers arrive.

On its first run it caught three numbers that had drifted the same morning, because the hand scan
ran at 03:30 and the cron at 04:40.

What it cannot check, and says so: whether today is a good day to post.

## Does every class on every page have a rule

`ops/check-classes.py`, part of `ops/check-all.sh`. Reads the served HTML of all seven pages and
holds every class in it against the stylesheet that came with it.

`seite()` in `src/app.ts` builds every sub-page from the landing page's `<head>`, so /post, /terms,
/conway, /x402, /jobs and /receipts carry whatever stylesheet the landing page carries. When the
landing page was rewritten on 2026-09-21 its CSS was replaced wholesale, and that took ten classes
with it that only the sub-pages use: `.ph` is the heading on every one of them, `.narrow` their
column width, and `.stats`, `.claims`, `.card`, `.n`, `.l`, `.good`, `.bad` and `.t` carry the rest.
Six pages went out rendering against rules that no longer existed, and `ops/check-pages.sh` said
PAGES OK the whole time, because it checks a status code, one h1 and no unrendered placeholder, and
a class that resolves to nothing is none of those.

It reads the served bytes rather than the source, so a class lost in a build step counts too.

**A class having a rule is not a class being styled right.** On 2026-09-21 the restored stylesheet
kept `.stats .n` and lost `.stats`, so `/conway` showed its four figures one per row, correctly
formatted and in the wrong place, and this script said CLASSES OK. `.kicker` survived only inside
`#market .kicker { display: none }`, which is a rule, so that passed too while the kicker rendered
as ordinary body text. Rules whose selector carries an `#id` no longer count as a definition, which
closes the second case exactly; the first is not checkable without a CSS engine. Nothing here
replaces looking at the page.

The same day, `pre` and inline `code` lost their panel and their chip on the sub-pages for the same
reason, and an element check was added here to catch it. It was removed again within the hour:
`code, pre, .mono { font-family: var(--mono) }` survived the rewrite, so those elements were still
mentioned in a rule and the check passed against the broken page. Telling "mentioned" from "styled"
means knowing which properties matter for which element, which is taste, and a check that cannot
fail is worse than no check because it reads as coverage.

**Classes inside an `<svg>` are cut out before the comparison.** In there a class is as often a
name as a hook: `n0`, `a1`, `wires` and `marks` say which box is which and are never meant to be
styled, while the rules that do style the diagram reach in from outside (`.flow .w1`). Counting
them would have meant keeping an allow-list, and an allow-list is a hole in a check.

## Measuring the page at phone width

`ops/check-pages.sh` checks that every page answers 200 with one h1 and nothing unrendered. It
says nothing about layout, and layout is where a phone visitor is lost. The one visitor this site
has had from GitHub, on 2026-09-21 at 14:08 UTC, arrived on an Android phone.

There is no headless browser in this repo and adding one for a single check is not worth 180 MB of
Chromium, so this is a paste rather than a script. Run the service locally, open any page in
Chrome, and measure a real viewport from inside the page by loading it into an iframe of exactly
the width you want:

```js
const f = document.createElement('iframe');
f.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:844px;border:0;z-index:99999';
f.src = 'http://127.0.0.1:8499/?v=' + Date.now();
document.body.appendChild(f);
await new Promise(r => f.addEventListener('load', r, { once: true }));
const d = f.contentDocument, w = f.contentWindow;
({
  ueberlauf: d.documentElement.scrollWidth > w.innerWidth,
  kleineZiele: [...d.querySelectorAll('header a, main .btn')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.height < 40 || r.width < 40); })
    .map(el => el.textContent.trim()),
})
```

**Measure with real data, or you measure the empty state.** /jobs, /receipts, /x402 and /conway
render a short "nothing here yet" block against an empty database, and that block has no layout to
get wrong. Pull the night's backup and the two series off the VM and point the local instance at
them:

```
scp -i ~/.ssh/id_ed25519_automaton root@76.13.144.207:/opt/control-plane/backups/cp-*.db /tmp/mess.db
ssh -i ~/.ssh/id_ed25519_automaton root@76.13.144.207 'cat /opt/control-plane/x402/kennzahlen.ndjson' > /tmp/x402.ndjson
CP_PORT=8499 CP_DB_PATH=/tmp/mess.db CP_X402_SERIES=/tmp/x402.ndjson pnpm tsx src/index.ts
```

Doing that on 2026-09-21 found both defects of the day: /x402 scrolling the whole document
sideways because six columns of figures are 574 pixels wide, and the sub-page bar breaking its five
labels across three lines each in the 246 pixels it has.

Resizing the browser window does not work for this: the window resizes and the content viewport
stays at its old width, so the measurement reads the desktop layout while looking like a phone.
The iframe is the honest way, and it is same-origin, so everything inside it is readable.

What that found on 2026-09-21, none of which a screenshot would have shown: the bar's primary
button was a 93 by 34 tap target and the nav links 45 by 22, against the 44 pixels Apple's guidance
treats as the minimum. Both now grow below 48rem. The fix then broke something itself, and the
second measurement caught it: `.bar nav a { display: inline-flex }` sits after the rule that hides
two links at narrow widths, so it brought them back. It reads `:not(.hide-s)` now.

Measured clean afterwards at 360, 390 and 768: no horizontal overflow, no target under 44, the
narrow diagram below the breakpoint and the wide one above it.

## Are we in the directory an automaton searches in

`ops/own-x402-listing.sh`, part of `ops/check-all.sh`, printed rather than failed: absence is
today's expected state and the line itself is the finding.

An agent does not browse, it reads a facilitator's catalogue, and that catalogue is the only place
a stranger's automaton finds this service without a human recommending it. We scan both public ones
every morning for the article, 20,789 paid services on 2026-09-21, and not one row of them is ours.

**The cause is not known, and this section used to say it was.**

What it said until 2026-09-23: a facilitator catalogues a seller as a side effect of a payment,
keyed on the `resource` the seller declares; `payResource` (`src/payments/pay.ts:82-85`) builds
`/pay/{usd}/{recipient}` with the payer's wallet substituted, so every payment hands the catalogue
a different URL with a wallet address inside it, and **none** of the catalogued resources has one.
It was headed "Evidence, not inference" and it pointed at a locked path.

That last claim was false on the day it was written. The file it cites,
`docs/research/data/2026-09-21-x402-verzeichnis.csv`, contains **63** resources with a
0x-address in the path, all of them `pro-api.coingecko.com`, one row per token contract. Re-measured
against the scan of 2026-09-23, 22,493 rows: **75** such resources, 58 of them in the PayAI
directory. A wallet-shaped segment in the path does not keep a seller out of the catalogue.

Nor does the protocol version: 1,612 catalogued resources declare x402Version 1, as we do. Nor is
a templated path the entry requirement: only 190 of 6,792 PayAI rows have one.

What is measured, all of it at once:

- PayAI reports settlements for `https://cp.hippe.eu/pay/5/0xd24f37d0…` -- 1-9 total, reliability
  100, network base -- so our payments do reach its records.
- No row for either of our hosts appears anywhere in the 22,493 catalogued resources, across both
  directories.
- Therefore the stats store and the listing are not the same store, and being settled does not put
  a seller in the catalogue.
- Our own `/.well-known/x402` already describes the endpoint as `/pay/{usd}/{address}`.

Why we are absent is an open question. One confident wrong answer costs more than an open one,
because the next cycle spends its effort on the change it names, and this one named a file that is
locked without a human.

The fix lives in `src/payments/**`, which `loop-constraints.md` keeps locked without a human. This
script is the other half: the answer is in front of the cycle every run, so the day it flips is a
day somebody notices.

Checked both ways: with `CP_OWN_HOST=aidress.ai`, a host that really is catalogued, it reports the
16 rows.

## The two production probes run themselves once a day

`ops/mcp-against-production.ts` and `ops/skill-against-production.sh` walk the whole supply side
against the live service: an MCP host taking the six tools, and a Conway runtime taking the skill
file. Until 2026-09-21 they ran only behind `ops/check-all.sh --deep`, and no cycle ever passed the
flag, so the entire supply side went unverified for days at a time.

They now run from `check-all.sh` whenever their last clean run is more than a day old. The stamps
are in `.scratch/probes/`, written only on success, so a failed probe stays due. `--deep` forces a
run, `CP_PROBE_MAX_AGE` moves the window, and `CP_PROBE_STAMPS` moves the directory, which is also
how both directions were checked.

Neither probe claims a starter grant any more, so a daily run costs nothing but the minute it
takes. They stay local: both need the operator wallet, and that key does not go on the VM.

## Naming the key a check provisions

Anything of ours that provisions an API key names it **`ops-<what it checks>`**. That prefix is on
`OUR_KEY_NAMES` in `ops/db-report.cjs`, so a new probe is classified by construction instead of by
somebody remembering to edit a list in the same commit.

This is the answer to doing the same thing wrong four times on 2026-09-21: four tools of ours
arrived with a name nobody had registered, and each time a number about the market quietly became a
number about us. The last one was a throwaway script that verified the example on `/post`, named
`first-buyer-check` after what it did rather than after who ran it, and it put `foreign_buyers` on
1. That is the number the whole plan hangs on.

The names already in the database keep their old spellings, so the list keeps them too.

## When a key name nobody knows shows up

`ops/db-report.cjs` keeps two lists, and `ops/check-all.sh` prints every key name that is on
neither, with the question that goes with it.

Three times on 2026-09-21 a tool of ours arrived without its name on the list of ours, and each
time a number about the market quietly became a number about us: four check agents counted as
foreign agents, a check's submission sat on a live job, and the cold-start probe read as a
stranger for an hour. Fixing the instance three times fixes nothing.

An unknown name is one of exactly two things, and both deserve a look:

- a tool of ours that did not register its name, which is a bug, or
- somebody who is not us, which is the news this whole project is waiting for.

`conway-automaton` is the reason there is a second list. That is what the upstream runtime calls
the key it provisions, so the name belongs to anybody who points a runtime here; on this database
two addresses carry it, our own operator wallet from the acceptance run and the paying stranger.
It must never be treated as ours, and our own use of it is excluded one level up, by address.

**Anything under `ops/` that provisions a key adds its name in the same commit that creates it.**

## The whole cold start, once, before an article goes out

`CP_URL=https://cp.hippe.eu pnpm tsx ops/newcomer-probe.ts`, by hand, never by cron.

Every piece of the newcomer's path is checked on its own: the four calls that mint a key, the
starter credit, the market, the MCP route. The claim the landing page makes is the *sequence*, and
the sequence had never been run end to end by anybody starting from nothing.

Twelve steps, from a wallet that has never existed to an outcome read back:

    1 a wallet nobody has seen        7 thought once, on the starter credit
    2 a nonce                         8 the grant arrived and the call was charged
    3 signed in with Ethereum         9 posted a throwaway job to hand work in to
    4 an API key                     10 submitted
    5 balance zero                   11 read the outcome back
    6 read the open jobs, no key     12 cancelled its own job

It costs one starter grant of 15 cents from a pool of 500, plus about a cent of inference. That is
why it is not in `ops/check-all.sh` and has to be asked for. Run it before an article goes out.

It submits to a throwaway job it posts and cancels itself, never to a real one: a check that
changes the market it is checking is not a check, and since the open list publishes how many
agents are competing, a stray submission would be a number about us shown to strangers.

First full run: 2026-09-21, twelve of twelve.

## Do the pages say anything obviously wrong

`ops/check-pages.sh [base]`, part of `ops/check-all.sh` since 2026-09-21.

`ops/smoke.sh` proves the API and the security headers. What the pages actually *say* had nothing
looking at it, and twice in a row something visibly wrong went live: "1 jobs paid out", and one
line next to it "to the agents that won them". Both were caught by reading the live page, which is
not a process.

It checks what is cheap to check and embarrassing to ship: status and content type, exactly one
`h1`, a title, no unreplaced placeholder, no template that leaked as text, no `undefined`, no
`NaN`, no "1 jobs" against a named list of nouns so prose raises no false alarms. Then both
preview cards and every internal link the landing page offers.

It is not a design review and cannot be one.

On its first run it found something nobody was looking for: the three sub-pages had no `h1` at
all, their main heading was an `h2`.

## Who arrived, and what the visit became

`ops/traffic.sh [hours]`. The section **Foreign referrers, and what the visit became** is the one
the standing order asks for every cycle: whether the issue answers are a channel.

A count of clicks answers the wrong question, and until 2026-09-21 a count was all it printed. A
channel is not a click, it is somebody who arrived and then did something. Each referrer is now
shown with the distinct addresses it brought and the paths each of them touched afterwards, in
order, with `<-- went further` on any address that did more than look at the front page.

`/` alone means they looked and left. `/bounties.json` means they went for the market.
`/v1/auth/nonce` means somebody started provisioning, and that is the line worth waking up for.

Verified end to end on 2026-09-21 rather than assumed: a request carrying
`Referer: https://github.com/Conway-Research/automaton/issues/371` shows up with the issue number
intact and, after two more requests, with the path it took. The instrument the whole GTM
measurement hangs on had never been tested with a real referrer.

## Deciding a job, the way the product says a buyer should

`ops/award.ts --bounty <id>` reads, `--award <submission-id>` pays, `--none` pays nobody.

Three tools, three acts: `ops/post-bounty.ts` puts real work up, `ops/compete.ts` hands work in,
and this is the one where money moves. Reading before paying is not a convenience. Handsel sells
exactly one thing a plain inference API does not, namely that because it bills the thinking it can
hold submitted work against the brief and name every sentence the brief does not support. An
operator who awards without running that check is not using the product they are selling.

Two commands on purpose. The first costs about a cent and tells you what you are about to pay for;
the second moves the money. `--none` cancels, which returns the whole price and is the honest
answer to three submissions that are all wrong.

The brief comes from `/bounties.json`, the same text the agents were given. Taking it from anywhere
else would mean checking the work against something the agent never saw.

Writing it found a real one: `POST /v1/bounties/cancel` took `id` while `POST /v1/submissions` and
`POST /v1/bounties/award` take `bounty_id`, so the tool failed on its first run against production
with `{"error":"id_required"}`, exactly where a buyer following docs/bounties.md would. The
endpoint takes both spellings since 2026-09-21.

## Is what we say about Conway still true of Conway

`ops/upstream-claims.py`, when the pin moves and before the article goes out.

`/fix`, the article and `docs/without-control-plane.md` all rest on one asymmetry: an automaton
that cannot sign up keeps paying anyway, because one failed balance call is handled three ways and
two of them spend. That is not our measurement. It is our reading of somebody else's code, written
while reading it and then repeated across three surfaces for two days without anybody holding it
against the source again.

Six claims, checked at the pinned revision and then at `main`, with the revision read out of
`harness/runtime/Dockerfile` rather than typed:

- the thinking path substitutes `-1` when there is no cached balance
- `getSurvivalTier` maps 0 to `critical` and anything negative to `dead`
- the startup path substitutes `0` with `.catch(() => 0)`
- the heartbeat leaves the balance at `0` when the call throws
- it retries on a five minute cooldown while the wallet holds 5 USDC
- neither spending path reads `last_known_balance`

On 2026-09-21 all six held at `d8f8168` and all six held on `main`, which answers the first
objection anybody will raise: that this was an old version.

A claim that fails only on `main` is not an error in anything published. It means somebody is
fixing this upstream, which is the single most important thing that could happen to the article,
and it has to go into the piece before it goes out rather than after. `ops/conway-series.sh`
already reports that repository's last push every day; a new one is the signal to run this.

## How many newcomers can still start

`ops/check-all.sh` fails when the starter pool carries fewer than three.

`/fix`, the landing page and `/post` all tell a fresh wallet it gets 15 cents of starter credit.
That is not a statement about the code, it is a statement about a fixed pot of 500 cents that does
not refill. On 2026-09-21 the pot was 45 per cent gone and every single grant had been taken by us:
three seed agents and a cold-start probe in one day. The report printed `starter_pool_left_mc` and
nothing noticed, because a sum of millicents does not read as "four more people can start".

So the number is now in the unit the promise is made in, and three is where it fails rather than
zero: at three, one probe run can empty it before a stranger arrives, and from that moment every
page saying "15 cents" is lying to the next newcomer. The two ways out are in the failure message,
and one of them is Matthias' money, so this is a decision and not a repair.

Deliberately not a rate. Consumption comes in bursts, a probe run or a wave of seed agents, and a
per-day figure derived from that would be a trend nobody measured.

## The adversarial read

`ops/second-read.sh`, about once a week. `--dry` prints the brief and starts nothing.

On 2026-09-21 a job on the code-host went through the whole site and the article as a hostile
reader and came back with 26 findings. Twelve loop cycles of checking had found none of them, and
none of them were hard: re-run the published script on the published data, click the link the page
tells you to click, add up the five numbers in the table. What was missing was not effort, it was
the angle. That does not fix itself, so it belongs in the rhythm rather than in whoever thinks of
it.

The brief lives in `ops/second-read-brief.md` and is versioned, so two reports are comparable. The
script appends the current article and the headings of the last report, so a run spends its time on
new ground instead of rediscovering what has since been pinned.

Since the second run the brief has a fourth section that the first did not: **which of our own
checks cannot fail.** A check comparing two readings of one source is decoration, and exactly one
of those let seven wrong figures through in the article.

Weekly is about right. Daily would mostly re-find what the checks from the last one already cover,
and every finding it did produce was worth a cycle.

## Deploying

`ops/deploy.sh`, not `deploy/rollout.sh`. It runs `pnpm test`, then `pnpm e2e`, and rolls out only
if both are green. `--no-e2e "<reason>"` skips the harness and refuses to do it silently.

loop-constraints.md has made both unconditional since 19.09., and `deploy/rollout.sh` never
checked either, because `deploy/**` is not touched without a human. So the rule lived entirely in
whoever was typing. On 2026-09-22 that failed: a cycle read "1 failed | 465 passed", took it for
the output of a counter-proof it had just run, and rolled out. The failing test was the one holding
docs/bounties.md against the MCP server's own schema, and the deploy was harmless by luck rather
than by check.

A condition that is written down and enforced by nobody is a request. This is the same finding as
the checks that could not fail, one level up, at the process instead of at a number.

## Did the deploy cost a stranger an answer

`ops/deploy-window.sh [tail seconds]`, after every rollout. `loop-constraints.md` has required this
since 19.09.; what it did not require was that the window be found rather than typed.

On 2026-09-21 a cycle typed 20:25 for a deploy that happened at 18:25 UTC. The VM runs on UTC, the
operator's machine on CEST, and the two are two hours apart. The query looked at a window that had
not happened yet, found nothing in it, and the cycle wrote "nobody noticed" into the log. The
conclusion was right and the check was worthless, which is the worse of the two failures because it
reads exactly like the good case.

So the window now comes from `docker inspect deploy-cp-1 --format {{.State.StartedAt}}`, which is
the deploy to the second, and the output separates the two things the old query ran together:

- `CLEAN` means strangers were served in that window and none of them got an error.
- `MEASURED NOTHING` means there were no strangers. On a service this size that is the normal
  result, and it is not evidence about the deploy at all.
- `PARTIAL` means the log ends before the window does, which happens when it runs immediately
  after the rollout. Then the answer is an interim one and says so.

Exit 0, 1 for somebody affected, 2 when it could not run. Counter-proved in all four states: with
our own addresses removed from the filter it reports the smoke test's 23 deliberate 4xx as
`AFFECTED` and exits 1, with an unreachable host it exits 2, and with a tail long enough to run
past the end of the log it prints `PARTIAL`.

### Did anybody come back

The last section of `ops/traffic.sh`, and the only one that ignores the window and reads the whole
log. Every other section reads 24 hours, so somebody who visits on Monday and again on Friday looks
like two strangers.

Worked out by hand on 2026-09-22 and it produced the first new fact in hours: 2 of 46 foreign
addresses had been here on more than one day, and both were tools walking API paths rather than
people. `23.23.253.54` called `/v1/auth/verify`, `/v1/credits/history` and `/v1/submissions` by GET
without a key over two days; `31.77.203.199` is the scanner that appends `/v1/models` to every path
it finds. Every one of those got a usable 401 or 405 with a way forward, which is what those
answers are for.

On a service waiting for its first user, a returning visitor is the strongest signal short of a
payment. The first line of the section says how far the log goes back, because Caddy rotates it and
that answer changes without warning.

### The same, by network

The section under it, and the reason both exist. On 2026-09-22 the log held 50 foreign addresses in
41 /24 networks. One of those, `205.169.39.x`, had five addresses and thirteen requests over three
days, all carrying the same two Windows user agents. Counted by address that is five strangers who
each came once. Counted by network it is one thing that keeps coming back, and the by-address
figure of "2 returned" becomes 5.

A /24 is an assumption and not a fact: two neighbours in one can be unrelated, and on mobile or in
a cloud range they usually are. Both numbers are printed and neither replaces the other.

Building it broke the count once, quietly and in the right direction to be believed: `sort -u` with
`-k1,1 -k3,3` deduplicates by those keys and not by the whole line, so every row that differed only
in the address fell away and five addresses became two. `sort -u | sort -k1,1 -k3,3` is the version
that means what it looks like.

## Does a backup come back up

`ops/backup-probe.sh`, by hand, not by cron. `--oldest` takes the oldest backup still kept
instead of the newest.

`ops/backup.sh` checks `integrity_check` and reconciles the ledger against the balances every
night, and `test/backup.test.ts` covers the WAL handling. All of that says the file is a sound
database. None of it said the service starts on it. The deploy canary does not answer it either:
it boots the new image against a copy of the LIVE database, which is the file the running service
already holds open. The backup, the thing that would actually be reached for after a disk failure,
had never been booted until 2026-09-21.

The probe copies a backup into a temporary directory, starts a throwaway container from
`control-plane:latest` against it with no published ports, asks `/health` and `/v1/status` from
inside, and compares the balances against the ledger sum in that file. The live service is never
touched.

Run on 2026-09-21 against both ends of the retained set:

- newest, `cp-2026-09-21-0404.db`: up, 89 wallets, 1,321,579 mc, ledger sum identical;
- oldest, `cp-2026-09-19-1747.db`: up, 2 wallets, 0 bounties, ledger sum identical.

The oldest one is the interesting half. It predates the bounty market entirely, so it proves the
migrations run forward on a backup written by an older build, which is the failure a restore would
actually meet.

Ask it with node and not with curl or wget: the image carries neither. The first version of this
probe used wget, got nothing back, and reported that the service had not come up while the
service's own start line stood in the log two lines below.

## Daily watch on the repository this project answers

`ops/conway-series.sh`, daily at 4:50 UTC by cron, into `/opt/control-plane/conway/repo.ndjson`,
one line per day.

The article and the twelve issue answers rest on claims about the present tense of
Conway-Research/automaton: onboarding broken since July, the last commit touching only the README,
no maintainer answering an issue since March, PR #370 still open. Each of those stops being true
the moment somebody with write access comes back, and until 2026-09-21 nobody would have noticed.
They were checked by hand that day, for the first time since they were written down, and by hand
is not a process.

It prints what moved since the previous point and nothing else, because a series nobody reads is a
file. The fields it watches are the ones that would change the plan rather than a number in it: a
maintainer comment, a merge of #370, a new onboarding issue, an archive flag.

Five unauthenticated GitHub calls a day, against a limit of sixty an hour.

## Time series of the x402 directories

`ops/x402-series.sh`, daily at 4:40 UTC by cron. Scans both public x402 directories (Coinbase and
PayAI) and writes to `/opt/control-plane/x402`:

- `kennzahlen.ndjson`: one line per run. That is the series, it stays for good.
- `roh/YYYY-MM-DD.csv.gz`: the full scan, about 540 KB packed, kept for 60 days.

**Do not move it into the repo directory.** `deploy/rollout.sh` mirrors `/opt/control-plane/repo`
with `--delete`; anything in there would be gone after the next deploy.

The script aborts instead of writing a false point when the scan yields fewer than 1,000 lines or the
figures are implausible. Both cases report themselves over `CP_ALERT_WEBHOOK`. A gap in the series is
more honest than an invented value.

Fetching it for an analysis:

```
scp -i ~/.ssh/id_ed25519_automaton root@76.13.144.207:/opt/control-plane/x402/kennzahlen.ndjson .
```

## Time series of the money going into Conway

`ops/conway-money-series.sh`, daily at 5:00 UTC by cron. Scans forward for USDC transfers into
Conway's payTo address `0x21DD37E3E4eA6CCC0a5C98A4944702eDE6E7Be10` on Base and writes to
`/opt/control-plane/conway-money`:

- `metrics.ndjson`: one line per run. That is the series, it stays for good. Handed into the
  container as `/data/conway-money.ndjson` after every run.
- `delta.csv`: every transfer found since the base file, same five columns.

The base file `docs/research/data/2026-09-19-conway-payto-transfers.csv` holds the history up to
20 September and cost half an hour of `eth_getLogs`. The daily run never repeats it: the resume
point is the newest block in the data itself, which is about 22 chunks a day. A state file was the
obvious alternative and was rejected, because it can drift away from the rows it claims to describe
and the resulting hole is invisible.

**Why it exists.** The landing page and the article both claim that money still flows into a system
that cannot issue an API key. That claim is measurable and it will age. `ops/before-the-article.py`
now refuses to say READY when the newest transfer is more than seven days old, or when
`GET /pay/5/<address>` stops answering 402.

**The guard that matters compares against the last line of the series**, not against this run's own
starting figures. Both of those come from the same files, so a base file that had lost half its rows
would pass any before/after check and still write a line claiming the money had vanished. Verified
by halving the base file: `usdc_total fell from 62626.135927 to 29058.449455`, exit 1, series
untouched.

The scanner was checked against the existing dataset before it was trusted: blocks 43,890,000 to
43,896,000 rescanned, 28 transfers, identical line for line, including the six from issue #293.

Fetching it for an analysis:

```
scp -i ~/.ssh/id_ed25519_automaton root@76.13.144.207:/opt/control-plane/conway-money/metrics.ndjson .
```

## Do the daily jobs still run

`ops/freshness.sh`, part of `ops/check-all.sh`. Asks the VM for the age of four things and fails
when any is older than 26 hours (the daily window plus two hours of grace, so a late run is quiet
and a skipped one is not):

- `/opt/control-plane/x402/kennzahlen.ndjson`
- `/opt/control-plane/conway/repo.ndjson`
- `/opt/control-plane/conway-money/metrics.ndjson`
- the newest file in `/opt/control-plane/backups`

**Why the age and not the content.** A failing run is already loud: every scheduled script reports
over `CP_ALERT_WEBHOOK` and leaves a `.err` file behind. A run that never starts is silent, and
before this existed nothing would have said so. The series would stop, `check-all.sh` would print
the same last point in every cycle, and it would say ALL CHECKS OK next to it.

Exit codes: 0 fresh, 1 something is stale and is named with its age, 2 the VM did not answer, which
is explicitly not a statement about the service.

`CP_MAX_AGE_HOURS` moves the limit, which is also how the failing path was checked.
