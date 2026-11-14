#!/usr/bin/env bash
#
# Packages one skill from .agents/skills/ as a .zip for claude.ai
# (Settings → Capabilities → Skills → Upload skill). Claude Code and OpenCode
# don't need this: setup.sh symlinks every skill for them.
#
# The zip includes the skill's gitignored *.local.json files (for example
# skylight-homework's family.local.json), because claude.ai can't read this
# machine's disk. So the zip may hold personal data: upload it, then delete it.
# It is never written inside the repo.
#
# Usage: scripts/package-claude-skill.sh <skill-name>
#   writes ~/Downloads/<skill-name>.zip (re-run and re-upload after edits)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
name="${1:?usage: scripts/package-claude-skill.sh <skill-name>}"
src="$REPO_DIR/.agents/skills/$name"
out="$HOME/Downloads/$name.zip"

[[ -f "$src/SKILL.md" ]] || { echo "package: no $src/SKILL.md" >&2; exit 1; }

# A committed *.local.json.example means the skill reads the real file at run
# time; without it the uploaded skill would fail, so refuse up front.
for example in "$src"/*.local.json.example; do
  [[ -e "$example" ]] || continue
  [[ -f "${example%.example}" ]] || {
    echo "package: create ${example%.example} from $(basename "$example") first" >&2
    exit 1
  }
done

rm -f "$out"
# claude.ai expects the skill folder at the root of the zip.
(cd "$REPO_DIR/.agents/skills" && zip -qr "$out" "$name" \
  -x "$name/*.example" "$name/node_modules/*" "$name/.DS_Store" "$name/**/.DS_Store")
echo "package: wrote $out"
unzip -l "$out" | sed -n '4,$p' | sed '$d' | sed '$d'
