#!/usr/bin/env bash
# Install p3-stack skills for T3 Code.
#
# Each provider reads skills from its own folder, so the skills are linked into both:
#   ~/.agents/skills   Codex and Pi
#   ~/.claude/skills   Claude Code (or $CLAUDE_CONFIG_DIR/skills)
#
#   ./install.sh                       link skills for every project
#   ./install.sh --project /path/repo  link skills into that repo's .agents/skills and .claude/skills
#   ./install.sh --force               also replace links that point at another checkout or skill pack
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT=""
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT="${2:?usage: ./install.sh --project /path/to/repo}"
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

if [[ -n "$PROJECT" ]]; then
  TARGETS=("$PROJECT/.agents/skills" "$PROJECT/.claude/skills")
else
  TARGETS=("$HOME/.agents/skills")
  CLAUDE_HOME="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
  # Only when Claude Code is set up on this machine, so the script does not create its config folder.
  if [[ -d "$CLAUDE_HOME" ]]; then
    TARGETS+=("$CLAUDE_HOME/skills")
  else
    printf 'no %s, so Claude Code is skipped\n' "$CLAUDE_HOME"
  fi
fi

total_skipped=0

# True when the link points into this checkout's skills/.
is_ours() {
  [[ "$(readlink "$1")" == "$ROOT"/skills/* ]]
}

link_into() {
  local target="$1" installed=0 skipped=0 pruned=0 link skill name
  mkdir -p "$target"

  # Drop links into this repo whose skill no longer exists, such as the old p3-mode.
  for link in "$target"/*; do
    if [[ -L "$link" && ! -e "$link" ]] && is_ours "$link"; then
      rm "$link"
      pruned=$((pruned + 1))
    fi
  done

  for skill in "$ROOT"/skills/*/; do
    name="$(basename "$skill")"
    if [[ -L "$target/$name" ]]; then
      # pstack has plain names such as how, why, and tdd, so a link here may belong to another skill pack.
      if is_ours "$target/$name" || [[ "$FORCE" -eq 1 ]]; then
        rm "$target/$name"
      else
        printf 'skip %s (links to %s, use --force to replace it)\n' "$target/$name" "$(readlink "$target/$name")"
        skipped=$((skipped + 1))
        continue
      fi
    elif [[ -e "$target/$name" ]]; then
      printf 'skip %s (exists and is not a symlink)\n' "$target/$name"
      skipped=$((skipped + 1))
      continue
    fi
    ln -s "${skill%/}" "$target/$name"
    installed=$((installed + 1))
  done

  printf 'linked %d skills into %s' "$installed" "$target"
  if [[ "$pruned" -gt 0 ]]; then
    printf ', removed %d stale links' "$pruned"
  fi
  if [[ "$skipped" -gt 0 ]]; then
    printf ' (%d skipped)' "$skipped"
  fi
  printf '\n'
  total_skipped=$((total_skipped + skipped))
}

for target in "${TARGETS[@]}"; do
  link_into "$target"
done

if [[ "$total_skipped" -gt 0 ]]; then
  printf 'pstack is incomplete until every skill is linked. Skills call each other by name.\n'
fi
printf 'In T3 Code, restart the agent session or start a new thread, then type $ or / to find the skills.\n'
