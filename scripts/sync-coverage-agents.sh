#!/usr/bin/env bash
#
# TEMPORARY WORKAROUND — delete this script once vconfig can install agents
# (not just skills) from vistaprint-org/ai-engineering/skills.
#
# vconfig already installs that repo's test-* skills, but has no equivalent
# yet for its coverage-auditor/executor/reviewer agents. Until it does, this
# script copies those 3 AGENT.md files from a local checkout of
# vistaprint-org/ai-engineering/skills into opencode/agents/ here — the same
# location these agents lived in before
# https://github.com/ericmasiello/skills/pull/26 removed them, so setup.sh's
# existing whole-directory symlink of opencode/agents/ picks them straight
# back up. Not wired into setup.sh itself: that script has to stay runnable
# in CI (scripts/verify-setup-symlinks.sh), which has no vistaprint-skills
# checkout to point at.
#
# Re-run any time the upstream MR moves — see the transform this applies at
# fc04375 ("Sync test quality skills + coverage agents with
# vistaprint-org/ai-engineering/skills!19") for why it exists: this repo
# keeps its own opencode frontmatter (quoted Title-Case `name`) instead of
# the source's raw AGENT.md field, so existing
# task(subagent_type="Coverage Auditor", ...) call sites keep resolving, and
# it points the shared-policy reference at this repo's real skill path.
#
# Usage: scripts/sync-coverage-agents.sh [path-to-vistaprint-skills-checkout]
#   Defaults to ~/Sites/vistaprint-skills.

set -euo pipefail

SRC_REPO="${1:-$HOME/Sites/vistaprint-skills}"
SRC_DIR="$SRC_REPO/.agents"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$REPO_DIR/opencode/agents"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "error: $SRC_DIR not found — pass the path to your vistaprint-skills checkout as \$1" >&2
  exit 1
fi

sync_agent() {
  local agent="$1" title="$2"
  local src="$SRC_DIR/$agent/AGENT.md"
  local dest="$DEST_DIR/$agent.md"

  if [[ ! -f "$src" ]]; then
    echo "SKIP:   $src does not exist"
    return
  fi

  sed -E \
    -e "s/^name: ${agent}\$/name: '${title}'/" \
    -e "s#\`\\.skills/test-quality-policy\\.md\`#\`.agents/skills/test-quality-policy.md\`#g" \
    "$src" > "$dest"

  echo "synced: $dest <- $src"
}

sync_agent coverage-auditor "Coverage Auditor"
sync_agent coverage-executor "Coverage Executor"
sync_agent coverage-reviewer "Coverage Reviewer"

echo
echo "Done. Review with 'git diff opencode/agents/' before committing."
