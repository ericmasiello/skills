---
name: setup-ericmasiello-skills
description: "Personal wrapper around setup-matt-pocock-skills. Adds one extra question up front — is this repo's root file or docs/ restricted (CODEOWNERS-gated, shared with coworkers who don't use these skills)? — and if so, redirects setup-matt-pocock-skills' output to a sidecar tracked in this repo instead of the target repo, via local-only symlinks. Otherwise defers to setup-matt-pocock-skills unchanged. Run this instead of /setup-matt-pocock-skills."
disable-model-invocation: true
---

# Setup (ericmasiello wrapper)

`setup-matt-pocock-skills` assumes it can freely edit `AGENTS.md`/`CLAUDE.md` and create `docs/agents/`, `CONTEXT.md`, `docs/adr/` inside the repo it's run in. Some repos don't allow that — shared, CODEOWNERS-gated monorepos where coworkers don't use these skills and wouldn't want personal tooling config landing in their tree, even as an untracked file.

This skill doesn't reimplement `setup-matt-pocock-skills` — it's a decorator, in the same spirit as `grill-with-docs` (which is just "call `grilling`, then `domain-modeling`"). `setup-matt-pocock-skills` is synced from `mattpocock/skills` (see `.agents/.skill-lock.json`) and gets overwritten by `npx skills update`; editing it directly would silently lose that update path. This wrapper stays self-authored and untouched by that sync, and defers to the upstream skill's own logic for everything except where the files physically go.

## Process

### 1. Ask: sidecar or default?

Check first whether a sidecar record already exists for this repo (see step 2c's `project.json`). If it does, reuse its `restricted` flag silently — don't ask again.

Otherwise, ask exactly one question before anything else:

> Is this repo's root file (`AGENTS.md`/`CLAUDE.md`) or `docs/` restricted — CODEOWNERS-gated, shared with coworkers who don't use these skills, or otherwise off-limits to edit, even locally?

- **No** (recommended default for personal/solo repos) → skip straight to step 3.
- **Yes** (work repos like a shared monorepo) → continue to step 2.

### 2. Sidecar setup (only when restricted)

a. **Derive `<key>`.** Run `git remote get-url origin`. If it succeeds, normalize it: strip a trailing `.git`, strip the protocol (`https://`, `git@`), then replace `/`, `:`, and `@` with `-`. Example: `git@gitlab.com:vistaprint-org/design-technology/studio/studio.git` → `gitlab.com-vistaprint-org-design-technology-studio-studio`. If there's no remote, fall back to a dash-slug of the absolute path from `git rev-parse --show-toplevel` (replace `/` with `-`, drop the leading dash).

b. **Resolve this repo's real location.** Run `realpath ~/.agents` — never hardcode `~/Sites/ericmasiello-skills`, since the symlink target can move (see ADR 0002).

c. **Create the sidecar if it doesn't exist**, at `<resolved-.agents>/_config/projects/<key>/`:
   - `agents/` (empty directory)
   - `adr/` (empty directory)
   - `CONTEXT.md` (empty file)
   - `project.json`:
     ```json
     {
       "key": "<key>",
       "remote": "<normalized remote, or null>",
       "lastInvokedFrom": "<absolute path this skill was run from>",
       "restricted": true,
       "createdAt": "<ISO 8601 now>",
       "updatedAt": "<ISO 8601 now>"
     }
     ```
   If it already exists, just update `lastInvokedFrom` and `updatedAt`. This field is a breadcrumb, not a config value anything reads — a repo can have several worktrees at once (main checkout plus any number of `.worktrees/*` or OpenChamber-managed ones), so it only ever records wherever this skill last happened to run, not "the" worktree.

d. **Create the symlinks in the target repo, and register them as local-only.** Run `relink.sh` (in this skill's own directory) against the target checkout:
   ```
   ./relink.sh <target-checkout-path>
   ```
   It derives `<key>` the same way as step 2a, creates `docs/agents` → `<sidecar>/agents`, `docs/adr` → `<sidecar>/adr`, and the root context doc (`CONTEXT.md` or `CONTEXT-MAP.md`, whichever the sidecar has) → its sidecar counterpart, then appends the matching paths to `.git/info/exclude` (never `.gitignore` — this must never touch a tracked file) if not already present. It's idempotent: existing correct symlinks and exclude entries are left alone; if a destination already exists as a *real* file/directory with content, it stops and reports the conflict instead of overwriting.

   **Every new worktree or clone of an already-set-up repo needs its own run of this script** — the symlinks are local, untracked filesystem state that doesn't propagate the way `.git/info/exclude` does (that lives in the shared common `.git` dir, so it only needs setting once per repo). Re-run `relink.sh <path>` against any new worktree before expecting `docs/agents`, `docs/adr`, or the root context doc to resolve there.

f. Tell the user exactly what was created and where, and that none of it is tracked, committed, or visible to `git status`, teammates, or CODEOWNERS review.

### 3. Defer to setup-matt-pocock-skills

Read `.agents/skills/setup-matt-pocock-skills/SKILL.md` and follow its process (Explore → Present findings and ask → Confirm and edit → Write → Done) exactly as written, with exactly one exception:

**Skip its step 4 instruction to write the `## Agent skills` block into `AGENTS.md`/`CLAUDE.md`, entirely, when step 1 above answered "yes."** That block only ever summarizes and points at `docs/agents/*.md` — no consuming skill reads it (only `setup-matt-pocock-skills` itself writes it); it exists purely for a human or fresh agent session skimming the repo root. Skipping it costs nothing functional.

Every other write in its step 4 — `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, `docs/agents/triage-labels.md` — proceeds completely unmodified. Because of the step 2d symlinks, those writes land in the sidecar transparently. The `CONTEXT.md`/`docs/adr/` symlinks exist for the skills that write there later (`domain-modeling` and friends, not `setup-matt-pocock-skills` itself), and every downstream skill (`code-review`, `domain-modeling`, `to-spec`, `to-tickets`, `triage`, `wayfinder`) keeps reading the same relative paths it always has, with zero changes to any of them.

When step 1 answered "no," step 3 is just: run `setup-matt-pocock-skills` unmodified, in full.
