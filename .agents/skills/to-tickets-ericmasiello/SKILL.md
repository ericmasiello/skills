---
name: to-tickets-ericmasiello
description: "Personal wrapper around to-tickets. Reads docs/agents/issue-tracker.md and triage-labels.md directly from the filesystem first, since setup-ericmasiello-skills' sidecar mode (for restricted repos) never writes the AGENTS.md pointer to-tickets expects. Otherwise defers to to-tickets unchanged. Run this instead of /to-tickets."
disable-model-invocation: true
---

# To Tickets (ericmasiello wrapper)

`to-tickets` assumes the issue tracker and triage label vocabulary "should have been provided to you" already — via the `## Agent skills` block that `setup-matt-pocock-skills` writes into `AGENTS.md`/`CLAUDE.md`. `setup-ericmasiello-skills`'s sidecar mode (for CODEOWNERS-gated repos where that block can't be written) deliberately skips writing it, so in a sidecar repo nothing ever points an agent at the sidecar's `docs/agents/issue-tracker.md` — even though it resolves fine as a symlink and holds real tracker config.

This skill doesn't reimplement `to-tickets` — it's a decorator, in the same spirit as `setup-ericmasiello-skills` wrapping `setup-matt-pocock-skills`. `to-tickets` is synced from `mattpocock/skills` (see `.agents/.skill-lock.json`) and gets overwritten by `npx skills update`; editing it directly would silently lose that update path. This wrapper stays self-authored and untouched by that sync, and defers to the upstream skill's own logic for everything except where the tracker context comes from.

## Process

### 1. Load tracker context directly

Follow [`../_ericmasiello-shared/LOAD-DOCS-AGENTS.md`](../_ericmasiello-shared/LOAD-DOCS-AGENTS.md): read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` directly from the filesystem if they exist, regardless of whether `AGENTS.md`/`CLAUDE.md` mentions them.

### 2. Defer to to-tickets

Read `.agents/skills/to-tickets/SKILL.md` and follow its process (Gather context → Explore the codebase → Draft vertical slices → Quiz the user → Publish) exactly as written, unmodified — treating whatever step 1 found as the tracker/label context it says "should have been provided to you."
