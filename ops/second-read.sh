#!/usr/bin/env bash
# The adversarial read, as a thing that comes back rather than a thing somebody thought of once.
#
# On 2026-09-21 a job on the code-host went through the whole site and the article as a hostile
# reader and came back with 26 findings. Twelve loop cycles of checking had found none of them,
# and none of them were hard: re-run the published script on the published data, click the link
# the page tells you to click, add up the five numbers in the table. What was missing was not
# effort, it was the angle. That is not a state that fixes itself, so it belongs in the rhythm.
#
#   ops/second-read.sh            starts the job and prints its id
#   ops/second-read.sh --dry      prints the brief and starts nothing
#
# Weekly is about right. Daily would mostly re-find what the checks from the last one already
# cover, and every finding it did produce was worth a cycle.
#
# It changes nothing and sends nothing: the brief says so and the job has no reason to push.
set -euo pipefail
cd "$(dirname "$0")/.."

ARTICLE=".scratch/gtm/hn-post.txt"
REPORTS=".scratch/gtm/gegenlese"
TEMPLATE="ops/second-read-brief.md"

[[ -f "$TEMPLATE" ]] || { echo "FAILED: $TEMPLATE is missing." >&2; exit 2; }

# What the last run already found, so this one spends its time on new ground rather than
# rediscovering what has since been fixed and pinned.
previous=""
if compgen -G "$REPORTS/gegenlese-*.md" > /dev/null; then
  latest=$(ls -t "$REPORTS"/gegenlese-*.md | head -1)
  previous=$(printf '\n\nWAS DER LETZTE LAUF SCHON GEFUNDEN HAT (%s)\nDiese Befunde sind abgearbeitet und durch Pruefungen abgedeckt. Melde sie nicht noch einmal,\nausser du findest sie wieder offen. Such neues Gelaende.\n\n%s\n' \
    "$(basename "$latest")" "$(grep -E '^### B' "$latest" || echo '(keine Ueberschriften gefunden)')")
fi

article=""
if [[ -f "$ARTICLE" ]]; then
  article=$(printf '\n\nDER ARTIKEL IM WORTLAUT\n=======================\n%s\n' \
    "$(sed -n '/FELD "text": alles ab hier bis zum Ende kopieren/,$p' "$ARTICLE" | sed '1,2d')")
else
  article=$'\n\nDer Artikel liegt nicht vor. Pruefe die Seiten und das Repo.'
fi

brief="$(cat "$TEMPLATE")$previous$article"

if [[ "${1:-}" == "--dry" ]]; then
  printf '%s\n' "$brief"
  echo
  echo "--- $(printf '%s' "$brief" | wc -c | tr -d ' ') characters, nothing started ---"
  exit 0
fi

tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
printf '%s' "$brief" > "$tmp"
scp -q "$tmp" code-host:/tmp/gegenlese-auftrag.txt
ssh -o BatchMode=yes code-host \
  'job start control-plane --model opus --workspace worktree --base main -- "$(cat /tmp/gegenlese-auftrag.txt)"'

echo
echo "Collect it with: ssh code-host 'job report <id>', then put the report in $REPORTS/"
