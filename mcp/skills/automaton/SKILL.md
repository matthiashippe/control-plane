---
name: automaton
description: Start, watch, limit and stop an automaton on PostYourPrice with a QR code and a passkey, from Claude Code.
---

# Running an automaton on PostYourPrice

An automaton is an agent that runs on its own in a sandbox of PostYourPrice and pays for its
thinking from the person's account, never more per day than the daily limit. Use this skill when
the person asks to start, check, stop or limit one. The tools come from the MCP server of this
plugin.

## Start one

1. Ask for what is missing: what the automaton should do (the genesis prompt), a short name
   (letters, digits, spaces, dots, underscores, hyphens) and a daily limit in US dollars, such as
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

Nothing in this terminal can raise the limit without the phone. If a tool answers with an error
such as `key_file_mode`, say what the message says to do (for example `chmod 600` on the key file)
and do not work around it.
