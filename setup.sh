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
#
# ~/.agents and ~/.agents/skills are real directories, not whole-directory
# symlinks — every entry inside each is symlinked individually. This lets
# vendor CLIs (e.g. `twg skills install`) write their own new, untracked
# entries directly into ~/.agents/skills/ without ever landing inside this
# repo's git working tree — see docs/adr/0009-*.md for why.
#
# CI (.github/workflows/verify-symlinks.yml, via scripts/verify-setup-symlinks.sh)
# runs this script against a scratch HOME and fails the build if the symlinks
# it produces don't match .agents/'s actual contents — keep that in mind if
# you change the linking logic below.

shopt -s dotglob nullglob

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

# Ensure dest is a real directory (backing up and replacing a leftover
# whole-directory symlink from before docs/adr/0009-*.md if one is found),
# then symlink every entry of src into it individually via link(). Pass a
# name in $3 to skip linking that one entry as a whole (used for skills/,
# which link_dir_contents is called on separately, one level deeper).
link_dir_contents() {
  local src="$1" dest="$2" skip="${3:-}"

  if [[ ! -d "$src" ]]; then
    echo "SKIP:    $src does not exist — nothing to link into $dest"
    return
  fi

  if [[ -L "$dest" ]]; then
    backup_dest "$dest"
  fi

  mkdir -p "$dest"

  local entry name
  for entry in "$src"/*; do
    name="$(basename "$entry")"
    [[ -n "$skip" && "$name" == "$skip" ]] && continue
    link "$entry" "$dest/$name"
  done
}

link_dir_contents "$REPO_DIR/.agents" "$HOME/.agents" skills
link_dir_contents "$REPO_DIR/.agents/skills" "$HOME/.agents/skills"

link "$REPO_DIR/opencode/agents"                "$HOME/.config/opencode/agents"
link "$REPO_DIR/opencode/commands"              "$HOME/.config/opencode/commands"
link "$REPO_DIR/opencode/opencode.json"         "$HOME/.config/opencode/opencode.json"
link "$REPO_DIR/opencode/oh-my-openagent.json"  "$HOME/.config/opencode/oh-my-openagent.json"

# Warn (don't fail) if a CLI some skill/config depends on isn't installed.
# See README.md's Prerequisites table for what needs each one and how to install it.
check_cli() {
  local bin="$1"
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "MISSING: $bin not found on PATH — see README.md's Prerequisites section for setup instructions."
  fi
}

echo
check_cli gh
check_cli td
check_cli acli
check_cli playwright-cli

echo
echo "Done. Any 'backed up' line above moved a pre-existing file/dir aside —"
echo "review it and delete once you've confirmed nothing was lost."
echo "Any SKIP lines above need manual attention before re-running."
echo "Note: opencode.json references \${STITCH_API_KEY} via {env:STITCH_API_KEY} —"
echo "make sure that's exported in your shell profile (see docs/adr/0004-*.md)."
