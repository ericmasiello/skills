# Load docs/agents directly (ericmasiello wrapper skills)

Shared step for any `*-ericmasiello` wrapper around an upstream skill that reads `docs/agents/*.md` (or the root domain docs) before doing its real work. Referenced by [to-tickets-ericmasiello](../to-tickets-ericmasiello/SKILL.md) and any future sibling (`triage-ericmasiello`, `to-spec-ericmasiello`, `wayfinder-ericmasiello`, `code-review-ericmasiello`, `domain-modeling-ericmasiello`).

## Why this exists

`setup-ericmasiello-skills`'s sidecar mode (ADR 0006) redirects `docs/agents/`, `docs/adr/`, and the root context doc to local-only symlinks for restricted repos, and deliberately skips writing the `## Agent skills` block into `AGENTS.md`/`CLAUDE.md` — the only place that normally tells an agent those files exist. The upstream skills (`to-tickets`, `triage`, `to-spec`, `wayfinder`, `code-review`, `domain-modeling`) only ever say the tracker/label context "should have been provided to you... run `/setup-matt-pocock-skills`" — none of them read `docs/agents/*.md` themselves. In a sidecar repo, nothing provides that pointer, so the upstream skill falls back to asking the user instead of reading real, resolvable files.

## What to do

Before deferring to the upstream skill, read whichever of these exist directly from the filesystem — regardless of whether `AGENTS.md`/`CLAUDE.md` mentions them:

- `docs/agents/issue-tracker.md`
- `docs/agents/triage-labels.md` (only when the upstream skill cares about triage labels)
- `docs/agents/domain.md`, `CONTEXT.md` or `CONTEXT-MAP.md`, `docs/adr/` (only for a wrapper around a domain-docs-reading skill)

Symlink or real file, doesn't matter — just attempt the read.

If none of the relevant files exist, behave exactly as the upstream skill specifies for "not provided" (tell the user to run `/setup-matt-pocock-skills`, or `/setup-ericmasiello-skills` if sidecar mode might apply here).

Then proceed to the upstream skill's own process, unmodified, treating whatever this step found as the answer to "the issue tracker and triage label vocabulary should have been provided to you."
