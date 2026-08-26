#!/usr/bin/env bash
# Idempotently (re)create the setup-ericmasiello-skills sidecar symlinks
# (docs/agents, docs/adr, and the root context doc) in a target git
# checkout or worktree. Safe to rerun — existing correct symlinks are
# left alone; anything else at the destination stops the script rather
# than getting overwritten.
#
# Why this exists: symlinks are local, untracked filesystem state — they
# don't propagate to new worktrees or clones the way .git/info/exclude
# entries do (those live in the shared common .git dir). Run this once
# per new worktree/checkout of a repo that already has a sidecar.
#
# Usage: relink.sh [target-checkout-path]
#   target-checkout-path defaults to the current directory.

set -euo pipefail

target_input="${1:-.}"
if ! target=$(cd "$target_input" && git rev-parse --show-toplevel 2>/dev/null); then
  echo "error: '$target_input' is not inside a git checkout" >&2
  exit 1
fi

# Derive <key> the same way setup-ericmasiello-skills step 2a does: normalize
# the origin remote, or fall back to a path slug if there's no remote.
remote="$(git -C "$target" remote get-url origin 2>/dev/null || true)"
if [[ -n "$remote" ]]; then
  key="${remote%.git}"
  key="${key#https://}"
  key="${key#git@}"
  key="${key//[:@\/]/-}"
else
  key="${target#/}"
  key="${key//\//-}"
fi

agents_dir="$(realpath ~/.agents)"
sidecar="$agents_dir/_config/projects/$key"

if [[ ! -d "$sidecar" ]]; then
  echo "error: no sidecar found at $sidecar" >&2
  echo "run /setup-ericmasiello-skills against this repo first." >&2
  exit 1
fi

link() {
  local dest="$1" src="$2"
  if [[ -L "$dest" ]]; then
    if [[ "$(readlink "$dest")" == "$src" ]]; then
      echo "ok      $dest -> $src (already linked)"
      return
    fi
    echo "error: $dest is a symlink to a different target ($(readlink "$dest")); refusing to overwrite" >&2
    exit 1
  fi
  if [[ -e "$dest" ]]; then
    echo "error: $dest already exists as a real file/dir with content; refusing to overwrite" >&2
    exit 1
  fi
  ln -s "$src" "$dest"
  echo "linked  $dest -> $src"
}

mkdir -p "$target/docs"
[[ -d "$sidecar/agents" ]] && link "$target/docs/agents" "$sidecar/agents"
[[ -d "$sidecar/adr" ]] && link "$target/docs/adr" "$sidecar/adr"

# Domain docs are either single-context (CONTEXT.md) or multi-context
# (CONTEXT-MAP.md) — link whichever the sidecar actually has.
if [[ -f "$sidecar/CONTEXT-MAP.md" ]]; then
  link "$target/CONTEXT-MAP.md" "$sidecar/CONTEXT-MAP.md"
elif [[ -f "$sidecar/CONTEXT.md" ]]; then
  link "$target/CONTEXT.md" "$sidecar/CONTEXT.md"
fi

# .git/info/exclude lives in the *common* git dir, so this is shared across
# all worktrees of the repo already — but re-asserting it here is cheap and
# keeps this script the single source of truth for what's excluded.
exclude_file="$(git -C "$target" rev-parse --git-common-dir)/info/exclude"
[[ "$exclude_file" != /* ]] && exclude_file="$target/$exclude_file"
mkdir -p "$(dirname "$exclude_file")"
touch "$exclude_file"

for path in /docs/agents /docs/adr /CONTEXT-MAP.md /CONTEXT.md; do
  case "$path" in
    /CONTEXT-MAP.md) [[ -f "$sidecar/CONTEXT-MAP.md" ]] || continue ;;
    /CONTEXT.md) [[ -f "$sidecar/CONTEXT.md" ]] || continue ;;
  esac
  grep -qxF "$path" "$exclude_file" 2>/dev/null && continue
  echo "$path" >> "$exclude_file"
  echo "excluded $path in $exclude_file"
done

echo "done. sidecar: $sidecar"
