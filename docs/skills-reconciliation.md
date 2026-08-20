# Skills reconciliation: work-computer skills → this repo

Tracking decisions made while reconciling `/Users/ericmasiello/Downloads/skills_from_work_computer` (legacy work-computer skills: self-authored, older Matt Pocock installs, and forks) against this repo (source of truth). See `CONTEXT.md` for the category vocabulary (Legacy / Needs-review / Work-context / External-only).

Source session: `/grill-with-docs` interview, in progress.

## Resolved

| Work-computer skill | Category | Successor in this repo | Decision | Rationale |
|---|---|---|---|---|
| `grill-me` | Legacy | `grill-me` | Delete | This repo's version is a thin wrapper calling `grilling`; work-computer version is the pre-extraction standalone copy. |
| `handoff` | Legacy | `handoff` | Delete | This repo's version adds redaction guidance and OS-temp-dir save location; otherwise identical. |
| `find-skills` | Legacy | `find-skills` | Delete | This repo's version adds `--owner` filter and `npx skills check`; otherwise identical (both from `vercel-labs/skills`). |
| `tdd` (+ `deep-modules.md`, `interface-design.md`, `refactoring.md`, `tests.md`, `mocking.md`) | Legacy | `tdd` + `codebase-design` + `code-review` | Delete | `mocking.md`/`tests.md` are byte-identical or a strict subset; `deep-modules.md`/`interface-design.md` content is reproduced verbatim (with a full glossary added) in `codebase-design`; `refactoring.md` guidance is now deliberately handled by `code-review`'s smell baseline instead of inside the TDD loop. |
| `to-prd` | Legacy | `to-spec` | Delete | Same template; `to-spec` evolved the vocabulary (PRD → spec, `needs-triage` → `ready-for-agent` direct, deep-modules → seams). |
| `to-issues` | Legacy | `to-tickets` | Delete, no port | `to-tickets` is the only tracker-to-issues skill going forward; HITL/AFK slice typing intentionally not revived. |
| `ubiquitous-language` | Legacy | `domain-modeling` | Delete, no port | Succeeded by `mattpocock/skills`' `domain-modeling`; "example dialogue" and "flagged ambiguities" not worth folding in. |
| `write-a-skill` | Legacy | `writing-for-agents` | Delete, no port | Confirmed via upstream commit `47bde84` (2026-06-17): Pocock explicitly replaced `write-a-skill` with `writing-great-skills`, which was later renamed (breaking, no alias) to `writing-for-agents` — already on disk here. Full lineage: `write-a-skill` → `writing-great-skills` → `writing-for-agents`. |
| `prd-to-plan` | Legacy | `to-tickets` | Delete, no port | Byte-for-byte the deleted Pocock skill (commit `a77fa6e7`, Apr 2026). Its PRD→phased-plan capability was later absorbed into a short-lived `to-plan` skill, then merged with `to-issues` into `to-tickets` (commit `386d4ff7`, same commit that produced `to-spec`). |
| `request-refactor-plan` | Legacy | `to-spec` + `improve-codebase-architecture` | Delete, no port | Byte-for-byte the deleted Pocock skill, explicitly retired per its own changeset: "→ `/to-spec` and `/improve-codebase-architecture`." |
| `code-comments` | Unique, no successor | — | Keep, port as-is | Still part of the workflow. |
| `_resolve-mr-feedback` | Legacy | `address-pr-feedback` | Delete | Not Studio-specific — pure generic PR-feedback triage, superseded by this repo's version which adds real gh/glab fetch, inline reply/resolve, a resumable state file, and push+SHA close-out. |
| `atlassian` → **rename to `vista-atlassian`** | Work-context | `atlassian-mcp` (different tool, not a true successor) | Keep, no conflict | Hardcoded to `vistaprint.atlassian.net` via `acli` + the `io.vista/atlassian-rovo-mcp` MCP server — genuinely work-specific, not generic as first assumed. Renamed on port to make the Vistaprint coupling explicit in the name itself (avoids implying it's the generic option). Coexists with `atlassian-mcp` (generic MCP fallback) under a distinct name; low-priority follow-up to confirm the two don't both fire on the same trigger phrases. |
| `_eric-triage` | External-only | — | Leave on work computer | Wraps a specific triage-cache binary/app that only exists there; invoke the skill from that repo instead of porting. |
| `_studio-migrate-to-jira`, `_studio-review-test-coverage`, `_studio-worktree-zed`, `studio-integration-testing`, `_studio-ship-work`, `_shared` (Studio GitLab label reference) | Work-context | — | Keep in this repo, port as-is | See ADR 0001. Unambiguously custom — no overlap with any generic skill here (bespoke GitLab/Jira migration logic, Studio coverage-path conventions, hardcoded worktree/Zed paths, `DesignEngine`-specific testing, DEX-preview/architecture-diagram reviewer guidance). |
| `_studio-do-work` | Legacy | `implement` | Delete, no port | Same shape (plan → TDD → validate → commit → review) as this repo's `implement`, which delegates to `/tdd` and `/code-review`. Studio's only value-add (hardcoding `pnpm typecheck`/`lint`/`test` run together) wasn't worth a separate skill. |
| `_studio-rebase` | Needs-review → resolved | `resolving-merge-conflicts` | Keep, slim on port | Conflict-resolution philosophy (step 4) duplicates `resolving-merge-conflicts` almost exactly — replace that section with a pointer to it. Keep the fetch/rebase-initiation mechanics and the repo-specific finishing steps (`pnpm i`, `prettier --write .`), which `resolving-merge-conflicts` doesn't cover. |
| `_studio-prd-to-issues`, `_studio-to-issues` | Legacy | `to-tickets` | Delete, no port | Same lineage as the already-deleted `to-issues` (same HITL/AFK, same vertical-slice template) — `to-tickets` (configured for this GitLab project + workstream labels) replaces both. HITL/AFK stays dropped, consistent with the earlier `to-issues` decision. |
| `_studio-write-a-prd` | Legacy | `to-spec` | Delete, no port | Near word-for-word the old Pocock `write-a-prd`/`to-prd` template, already superseded here by `to-spec`. The one addition (workstream-label selection step) wasn't worth keeping as a separate skill either. |
| `studio-architecture-review` → **rename to `studio-improve-codebase-architecture`** | Work-context (specialization, not a duplicate) | `improve-codebase-architecture` | Keep, rewrite on port | Genuine monorepo-scaling specialization (package discovery by `apps/*/`/`libs/*/*`/`core/*/` convention, batched 3-4-at-a-time sub-agent exploration for memory safety, dedicated `studio-arch-explorer` subagent type, cross-package-coupling as the top-ranked signal) — not a duplicate of the single-agent generic version. **Rewrite plan**: drop the restated Glossary section (already covered by `codebase-design`, which the generic skill already delegates to); keep the package-discovery convention, batching discipline, and `studio-arch-explorer` firing pattern unchanged; replace the HTML-report/ADR-conflict/grilling-loop sections with pointers to `improve-codebase-architecture`'s versions instead of restating them. Renamed so the wrapper relationship is legible without a `_` prefix (this was one of the few Studio skills `skill-to-command` never wrapped). |
| 19 `test-*` skills (characterization-testing suite) | Unique, no successor | `tdd` (different discipline, not a true successor) | Keep as-is | Complements `tdd` rather than competing with it (legacy-code characterization vs. new-feature TDD). Port unchanged. |
| `_thermo-nuclear-review`, `thermo-nuclear-code-quality-review` | Unique, no successor | — | Keep, port as-is | Two distinct review personas (security/correctness vs. maintainability/structure), no employer coupling. |
| `_diataxis` | Unique, no successor | — | Keep, port as-is | Still in use. |
| `_skylight-homework`, `todoist-cli` | Unique, personal-life | — | Keep, port as-is | Confirmed still relevant — this machine's `opencode.json` already has a (disabled) `skylight` MCP server configured. |
| `skill-to-command` | Unique, no successor | — | Keep, port as-is | Self-contained, generic, no ties to any specific skill (mechanical rename + write-one-command-file procedure). **Note**: this is why many work-computer skills are `_`-prefixed — each was wrapped by a pinned-model command in `~/.config/opencode/commands/` (its own doc's examples: `review-thermo` → `_thermo-nuclear-review`, `studio-do-work` → `_studio-do-work`, `diataxis-audit` → `_diataxis`). That commands folder wasn't included in the work-computer export and doesn't exist on this machine, so any `_`-prefixed skill we keep loses its wrapper on port — re-run `skill-to-command` per kept `_`-skill afterward to regenerate it (old model pins are stale anyway). |

| `_weekly-review` | External-only | — | Exclude from this repo | Belongs in a dedicated repo on the work computer, not reconciled here — same disposition as `_eric-triage`. |

## Open / pending

None. Frontier fully resolved as of this session.

## Porting (this session)

All "Keep" rows above have been ported into `skills/`. Final directory names (where they differ from the work-computer name):

| Work-computer name | Final directory |
|---|---|
| `atlassian` | `vista-atlassian` |
| `_studio-migrate-to-jira` | `studio-migrate-to-jira` |
| `_studio-review-test-coverage` | `studio-review-test-coverage` |
| `_studio-worktree-zed` | `studio-worktree-zed` |
| `_studio-ship-work` | `studio-ship-work` |
| `_shared` | `_studio-shared` |
| `_studio-rebase` | `studio-rebase` |
| `studio-architecture-review` | `studio-improve-codebase-architecture` |
| `_thermo-nuclear-review` | `thermo-nuclear-review` |
| `_diataxis` | `diataxis` |
| `_skylight-homework` | `skylight-homework` |

All other kept items (`code-comments`, `studio-integration-testing`, `thermo-nuclear-code-quality-review`, `todoist-cli`, `skill-to-command`, 18 `test-*` skills — the doc above says 19, but only 18 exist on the work computer) ported unchanged, no rename.

The underscore prefix is dropped from every ported skill's directory and frontmatter `name` (was originally kept for the work-computer's `skill-to-command` wrapper convention, which this machine doesn't use). Colon-namespaced frontmatter names (`_studio:migrate-to-jira`, `_studio:worktree-zed`, `_studio:rebase`, `_studio:ship-work`) switched to dashes — OpenCode's skill `name` field must match `^[a-z0-9]+(-[a-z0-9]+)*$` and match the directory name.

`_studio-migrate-to-jira`'s vendored `scripts/node_modules/` was not ported; `node_modules` added to `.gitignore` — the skill's own workflow already runs `npm install` before use.

`studio-architecture-review`'s port dropped `LANGUAGE.md`, `DEEPENING.md`, and `INTERFACE-DESIGN.md` (verbatim duplicates of `codebase-design`'s own files) and slimmed `HTML-REPORT.md` to just its unique cross-package-diagram content.

**PII/sensitive-data fixes made during porting** (this repo is public):
- `_skylight-homework` hardcoded two real children's names as example values. Replaced with a `family.local.json` config (gitignored via `*.local.json`) that the user creates locally from a committed `family.local.json.example` template; `SKILL.md` now reads member names from that file instead of hardcoding them.
- `atlassian`/`vista-atlassian` used a real Confluence page ID (`5802328101`) as the example value across ~14 command examples. Replaced with a placeholder (`1234567890`), consistent with the other placeholder IDs already used in that file (`12345`, `98765`, `PROJ-123`).
- `studio-integration-testing/item-reference-testing.md` used a real internal service hostname (`udsinterop.document.vpsvc.com`) as an example fixture URL. Replaced with `example.internal`.
