#!/usr/bin/env bash
#
# Verifies that setup.sh produces exactly the symlinks docs/adr/0009-*.md
# says it should: ~/.agents and ~/.agents/skills as real directories, with
# every top-level .agents/ entry and every .agents/skills/<name> skill
# individually symlinked back into the repo. Run by CI
# (.github/workflows/verify-symlinks.yml) on every PR so setup.sh's linking
# logic can't silently drift from what's actually in the repo.
#
# Runs setup.sh against a scratch HOME — never touches the real ~/.agents.
#
# Usage: scripts/verify-setup-symlinks.sh
# Exit 0 = matches. Exit 1 = drift found, details printed to stdout.

set -euo pipefail
shopt -s dotglob nullglob

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH_HOME="$(mktemp -d)"
trap 'rm -rf "$SCRATCH_HOME"' EXIT

fail=0
error() {
  echo "FAIL: $1"
  fail=1
}

echo "Running setup.sh against scratch HOME=$SCRATCH_HOME"
if ! HOME="$SCRATCH_HOME" bash "$REPO_DIR/setup.sh" >"$SCRATCH_HOME/setup-output.log" 2>&1; then
  echo "setup.sh exited non-zero:"
  cat "$SCRATCH_HOME/setup-output.log"
  exit 1
fi

check_symlink() {
  local dest="$1" expected_src="$2"
  if [[ ! -L "$dest" ]]; then
    error "$dest is not a symlink (expected -> $expected_src)"
    return
  fi
  local actual
  actual="$(readlink "$dest")"
  if [[ "$actual" != "$expected_src" ]]; then
    error "$dest -> $actual (expected -> $expected_src)"
  fi
}

check_real_dir() {
  local dest="$1"
  if [[ -L "$dest" ]]; then
    error "$dest is a symlink — expected a real directory (vendor tools must be able to write new, untracked entries into it without touching the repo)"
  elif [[ ! -d "$dest" ]]; then
    error "$dest does not exist"
  fi
}

AGENTS_DEST="$SCRATCH_HOME/.agents"
check_real_dir "$AGENTS_DEST"
check_real_dir "$AGENTS_DEST/skills"

for entry in "$REPO_DIR/.agents"/*; do
  name="$(basename "$entry")"
  [[ "$name" == "skills" ]] && continue
  check_symlink "$AGENTS_DEST/$name" "$entry"
done

expected_skills=()
for entry in "$REPO_DIR/.agents/skills"/*; do
  name="$(basename "$entry")"
  expected_skills+=("$name")
  check_symlink "$AGENTS_DEST/skills/$name" "$entry"
done

for entry in "$AGENTS_DEST/skills"/*; do
  name="$(basename "$entry")"
  found=0
  for s in "${expected_skills[@]}"; do
    [[ "$s" == "$name" ]] && found=1
  done
  [[ "$found" == 1 ]] || error "setup.sh produced an entry not present in the repo: $AGENTS_DEST/skills/$name"
done

check_symlink "$SCRATCH_HOME/.config/opencode/agents"              "$REPO_DIR/opencode/agents"
check_symlink "$SCRATCH_HOME/.config/opencode/commands"            "$REPO_DIR/opencode/commands"
check_symlink "$SCRATCH_HOME/.config/opencode/opencode.json"       "$REPO_DIR/opencode/opencode.json"
check_symlink "$SCRATCH_HOME/.config/opencode/oh-my-openagent.json" "$REPO_DIR/opencode/oh-my-openagent.json"

# Guard against the exact mistake docs/adr/0009-*.md was written after: no
# file matching .gitignore's vendor-skill patterns should ever be tracked.
vendor_patterns="$(awk '/vendor-installed/{f=1;next} f && NF{print} f && !NF{exit}' "$REPO_DIR/.gitignore")"
while IFS= read -r pattern; do
  [[ -z "$pattern" ]] && continue
  glob="${pattern#.agents/skills/}"
  glob="${glob%/}"
  matches="$(git -C "$REPO_DIR" ls-files ".agents/skills" | grep -E "^\.agents/skills/${glob}(/|$)" || true)"
  if [[ -n "$matches" ]]; then
    error "git tracks files matching vendor-ignore pattern '$pattern':"
    echo "$matches" | sed 's/^/         /'
  fi
done <<<"$vendor_patterns"

if [[ "$fail" == 1 ]]; then
  echo
  echo "Symlink layout has drifted from what setup.sh / .gitignore expect."
  echo "See docs/adr/0009-*.md."
  exit 1
fi

echo "OK: symlink layout matches expectations for ${#expected_skills[@]} skills + top-level .agents/ entries."
