#!/usr/bin/env bash
#
# Idempotent installer: symlinks this repo's .agents/ and opencode/ content
# into the locations opencode (and other tools) look for.
#
# Assumes this repo is already checked out wherever it's going to live.
# This script does NOT move a live checkout into place — see
# docs/adr/0002-*.md for why.
#
# Safe to re-run. Existing correct symlinks are left alone; a file or
# directory already sitting at the destination is backed up (moved aside
# with a timestamped suffix, never deleted) before the symlink is created —
# see docs/adr/0005-*.md for why.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Move an existing file/dir aside so link() can put a symlink in its place.
# Never overwrites a prior backup: appends -1, -2, ... on collision.
backup_dest() {
  local dest="$1"
  local timestamp backup suffix=""
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

  local n=0
  while true; do
    backup="${dest}.bak.${timestamp}${suffix}"
    [[ -e "$backup" ]] || break
    n=$((n + 1))
    suffix="-$n"
  done

  mv "$dest" "$backup"
  echo "backed up: $dest -> $backup"
}

link() {
  local src="$1" dest="$2"

  if [[ ! -e "$src" ]]; then
    echo "SKIP:    $src does not exist — nothing to link for $dest"
    return
  fi

  if [[ -L "$dest" ]]; then
    if [[ "$(readlink "$dest")" == "$src" ]]; then
      echo "ok:      $dest"
      return
    fi
    echo "SKIP:    $dest is a symlink to something else ($(readlink "$dest"))"
    return
  fi

  if [[ -e "$dest" ]]; then
    backup_dest "$dest"
  fi

  mkdir -p "$(dirname "$dest")"
  ln -s "$src" "$dest"
  echo "linked:  $dest -> $src"
}

link "$REPO_DIR/.agents"                        "$HOME/.agents"
link "$REPO_DIR/opencode/agents"                "$HOME/.config/opencode/agents"
link "$REPO_DIR/opencode/commands"              "$HOME/.config/opencode/commands"
link "$REPO_DIR/opencode/opencode.json"         "$HOME/.config/opencode/opencode.json"
link "$REPO_DIR/opencode/oh-my-openagent.json"  "$HOME/.config/opencode/oh-my-openagent.json"

echo
echo "Done. Any 'backed up' line above moved a pre-existing file/dir aside —"
echo "review it and delete once you've confirmed nothing was lost."
echo "Any SKIP lines above need manual attention before re-running."
echo "Note: opencode.json references \${STITCH_API_KEY} via {env:STITCH_API_KEY} —"
echo "make sure that's exported in your shell profile (see docs/adr/0004-*.md)."
