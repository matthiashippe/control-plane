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
  /ops/restore-pruefen.cjs /bak/<file>.db
```

`ops/restore-pruefen.cjs` checks `integrity_check`, `foreign_key_check`, whether every wallet matches
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
docker compose -f docker-compose.prod.yml exec -T cp node - < /opt/control-plane/repo/ops/restore-pruefen.cjs
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
normally. `ops/restore-pruefen.cjs` reports missing columns as a hint and does not reject the backup.
Two after-effects remain: the price catalogue in `kv` is empty (step 6), and if the old backup holds
an x402 nonce with two credits, `ledger_topup_ref` cannot be created. The start then carries on and
only writes it to the log, where nobody sees it. That is exactly what `restore-pruefen.cjs` checks
for with its duplicate-credit check.

**The backup is empty and nobody notices.** A copy of the `.db` without its `-wal` has a complete
schema, a size of 86 KB and `integrity_check: ok`, but not a single row. No size threshold catches
that, and on restore every customer would stand at 0 credits. That is why `backup-vacuum.cjs` counts
the rows in the backup against the source, and why `restore-pruefen.cjs` runs before it is put in.

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

`ops/restore-pruefen.cjs` checks all of this and ends with `exit 1` as soon as one of them does not
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

## Does a backup come back up

`ops/sicherung-probe.sh`, by hand, not by cron. `--oldest` takes the oldest backup still kept
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

`ops/conway-zeitreihe.sh`, daily at 4:50 UTC by cron, into `/opt/control-plane/conway/repo.ndjson`,
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

`ops/x402-zeitreihe.sh`, daily at 4:40 UTC by cron. Scans both public x402 directories (Coinbase and
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
