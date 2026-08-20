#!/usr/bin/env bash
#
# Idempotent installer: symlinks this repo's .agents/ and opencode/ content
# into the locations opencode (and other tools) look for.
#
# Assumes this repo is already checked out wherever it's going to live.
# This script does NOT move a live checkout into place — see
# docs/adr/0002-*.md for why.
#
# Safe to re-run. Existing correct symlinks are left alone; anything else
# in the way is reported and skipped rather than clobbered.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
    echo "SKIP:    $dest already exists and is not a symlink — move it aside and re-run"
    return
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
echo "Done. Any SKIP lines above need manual attention before re-running."
echo "Note: opencode.json references \${STITCH_API_KEY} via {env:STITCH_API_KEY} —"
echo "make sure that's exported in your shell profile (see docs/adr/0004-*.md)."
