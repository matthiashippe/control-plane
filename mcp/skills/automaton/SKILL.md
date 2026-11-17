---
name: automaton
description: Start, watch, limit and stop an automaton on automatonhost.com with a QR code and a passkey, and move money in by card and out to your bank account, from Claude Code.
---

# Running an automaton on automatonhost.com

An automaton is an agent that runs on its own in a sandbox on automatonhost.com and pays for its
thinking from the person's account, never more per day than the daily limit. Use this skill when
the person asks to start, check, stop or limit one. The tools come from the MCP server of this
plugin.

## Start one

1. Ask for what is missing: what the automaton should do (the genesis prompt), a short name
   (1 to 32 letters, digits, spaces, underscores or hyphens, starting with a letter or digit) and a daily limit in US dollars, such as
   "5.00". Pass the limit as a string with at most two decimals.
2. Call `start_automaton` with `genesis_prompt`, `name` and `daily_limit_usd`.
3. If the answer has `qr`, the person has no account on this machine yet. Show `qr` unchanged in a
   code block, character for character, without reflowing or trimming lines, because the phone
   camera reads it. Below it show `url` (for a phone that cannot scan) and `match`, and say: scan
   the QR code, pick the number `match` on the phone and confirm with a passkey. The code holds
   for ten minutes.
4. Then call `automaton_status` every few seconds until `status` is `running` or `failed`. On the
   way it reports `waiting_for_phone`, `matched` (the right number was picked, the passkey comes
   next) and `starting`. Tell the person each change in one short line.
5. On `failed`, say the `message` in plain words. If the reason is `burned` (a wrong number was
   picked) or `expired` (the code ran out), offer to call `start_automaton` again, which makes a
   new code.

With an account already on this machine, `start_automaton` starts at once and there is no QR code.
The API key is kept in a file on this machine and never appears in any answer; never ask the
person for it and never print it.

## Watch and stop

- `automaton_status` shows the state, the reason and the number of turns. Without `id` it means
  the automaton started here, else the newest of the account.
- `automaton_logs` shows its last lines. Summarise them; quote only what matters.
- `stop_automaton` stops it. Stopped time costs nothing.

## The daily limit

Call `set_daily_limit` with `daily_limit_usd` as a string, such as "2.50".

- Lowering holds at once, without the phone.
- Raising above what the person confirmed on the phone needs the phone again: the answer carries
  `qr`, `url` and `match`. Show them exactly as for a start, and the person confirms with the
  passkey they already have. Until then the old limit holds. Call `automaton_status` and read
  `daily_limit_change` to see when the new limit holds.

## Money in and out

Money can only go to the person's own bank account. No tool takes a destination, and the person
never has to give one here: the bank account is entered once on the phone.

- `deposit` with `amount_usd` as a string, such as "20.00", puts money in by card. The answer
  carries `qr`, `url` and `match`: show them exactly as for a start. The person scans the code,
  picks the number and pays by card on the phone. `automaton_status` shows `deposit` and, once
  the money has arrived, the new `balance_usd`.
- `payout` with `amount_usd` as a string, such as "10.00", or with `all: true` sends money to the
  person's bank account. The first time it brings a QR code: show `qr`, `url` and `match` as for a
  start and tell the person to scan it, pick the number, confirm their identity once with Bridge,
  enter their IBAN and confirm with the passkey. The money is sent right after; read `payout` in
  `automaton_status` to see it. Every payout after that pays at once, without the phone, and
  answers with the amount and the bank account ending in its last four digits.
- `set_payout_rule` with `keep_usd` and `weekday` (monday to sunday) pays out once a week on its
  own: everything above `keep_usd` goes to the bank account, when that is at least $1.00.
  `off: true` removes the rule.
- `automaton_status` shows `balance_usd` and `payout_rule` (`keep_usd` and `weekday`, or
  "no payout rule").

Amounts are strings with at most two decimals. A number, "5.001" or "-1" is refused with
`invalid_arguments` before anything is sent.

Nothing in this terminal can raise the limit without the phone. If a tool answers with an error
such as `key_file_mode`, say what the message says to do (for example `chmod 600` on the key file)
and do not work around it.
