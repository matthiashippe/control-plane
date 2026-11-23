# The script of the video "one line moves an automaton" (goals/reichweite/03, decision 2).
# ops/video-record.sh runs it in a sandbox of our own account on automatonhost.com, with the unmodified runtime at the
# pin d8f8168 under /opt/automaton (image sandboxd-base:2), and writes docs/video/umzug.transcript.json.
# ops/video-render.mjs turns transcript and captions into the video; no network there.
#
#   setup <command>          runs before the recording, not shown, output not kept
#   caption <scene> <text>   a caption of 1.5 s at the start of its scene (scene 4: the closing card)
#   run <scene> <command>    shown with the prompt "$ ", run, every output line recorded
#   until <regex>            ends the run before it at the first line that matches (at most 180 s)
#
# The wallet file ~/.automaton/wallet.json (the wallet of our own account) and /root/.rec/setup.json (the input of the
# headless setup of harness/runtime/setup-headless.mjs, conwayApiUrl https://api.conway.tech, no API key) are uploaded by
# ops/video-record.sh before the first setup line. The program automaton is a shell around the unmodified dist: the
# provisioning call at the pin reads its URL from CONWAY_API_URL only, so the shell takes it from conwayApiUrl in
# automaton.json, the one line this video changes.
setup chmod 0700 ~/.automaton && chmod 0600 ~/.automaton/wallet.json
setup printf '%s\n' '#!/bin/sh' 'cd /opt/automaton || exit 1' 'CONWAY_API_URL="$(node -p "require(process.env.HOME + \"/.automaton/automaton.json\").conwayApiUrl")" exec node dist/index.js "$@"' > /usr/local/bin/automaton && chmod 0755 /usr/local/bin/automaton
setup node /opt/automaton-setup/setup-headless.mjs /root/.rec/setup.json > /dev/null 2>&1 && rm -f /root/.rec/setup.json

caption 1 Before: api.conway.tech fails.
run 1 grep conwayApiUrl ~/.automaton/automaton.json
run 1 automaton --provision

caption 2 Change one line.
run 2 sed -i 's#https://api.conway.tech#https://automatonhost.com#' ~/.automaton/automaton.json
run 2 grep conwayApiUrl ~/.automaton/automaton.json

caption 3 After: it runs on automatonhost.com.
run 3 automaton --provision
run 3 grep apiKey ~/.automaton/config.json
run 3 automaton --run
until Turn [^:]+: [0-9]+ tools

caption 4 automatonhost.com/fix
caption 4 Top up by card, PayPal or Apple Pay.
