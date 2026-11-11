#!/usr/bin/env bash
# Install p3-stack skills for T3 Code.
#
#   ./install.sh                       link skills into ~/.agents/skills
#   ./install.sh --project /path/repo  link skills into that repo's .agents/skills
#   ./install.sh --force               also replace links that point at another checkout or skill pack
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${HOME}/.agents/skills"
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      TARGET="${2:?usage: ./install.sh --project /path/to/repo}/.agents/skills"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    *)
      printf 'unknown option %s\nusage: ./install.sh [--project /path/to/repo] [--force]\n' "$1" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$TARGET"
installed=0
skipped=0
pruned=0

# True when the link points into this checkout's skills/.
is_ours() {
  [[ "$(readlink "$1")" == "$ROOT"/skills/* ]]
}

# Drop links into this repo whose skill no longer exists, such as the old p3-mode.
for link in "$TARGET"/*; do
  if [[ -L "$link" && ! -e "$link" ]] && is_ours "$link"; then
    rm "$link"
    pruned=$((pruned + 1))
  fi
done

for skill in "$ROOT"/skills/*/; do
  name="$(basename "$skill")"
  if [[ -L "$TARGET/$name" ]]; then
    # pstack has plain names such as how, why, and tdd, so a link here may belong to another skill pack.
    if is_ours "$TARGET/$name" || [[ "$FORCE" -eq 1 ]]; then
      rm "$TARGET/$name"
    else
      printf 'skip %s (links to %s, use --force to replace it)\n' "$name" "$(readlink "$TARGET/$name")"
      skipped=$((skipped + 1))
      continue
    fi
  elif [[ -e "$TARGET/$name" ]]; then
    printf 'skip %s (exists and is not a symlink)\n' "$name"
    skipped=$((skipped + 1))
    continue
  fi
  ln -s "${skill%/}" "$TARGET/$name"
  installed=$((installed + 1))
done

printf 'linked %d skills into %s' "$installed" "$TARGET"
if [[ "$pruned" -gt 0 ]]; then
  printf ', removed %d stale links' "$pruned"
fi
if [[ "$skipped" -gt 0 ]]; then
  printf ' (%d skipped)' "$skipped"
fi
printf '\n'
if [[ "$skipped" -gt 0 ]]; then
  printf 'pstack is incomplete until every skill is linked. Skills call each other by name.\n'
fi
