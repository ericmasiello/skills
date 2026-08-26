# Agent Skills

Eric's personal collection of agent skills, installed at `~/.agents` (see `../docs/adr/0002-*.md` for why that's a symlink into this repo's `.agents/` directory, not a checkout of its own). Skills are managed via `npx skills` — `.skill-lock.json` tracks which ones are synced from upstream sources (`mattpocock/skills`, `vercel-labs/skills`, `jeffallan/claude-skills`) versus self-authored or reconciled in from other machines. See `CONTEXT.md` for the vocabulary used to talk about that provenance.

This file is a map back to any skill by what it's for, in the spirit of [mattpocock/skills](https://github.com/mattpocock/skills)'s own README.

## Getting Started

Configuring a new repo to use these skills? Run **[setup-ericmasiello-skills](./skills/setup-ericmasiello-skills/SKILL.md)** first — not `setup-matt-pocock-skills` directly. It asks one extra question (is this repo's root file or `docs/` restricted, e.g. a CODEOWNERS-gated monorepo?) and routes accordingly before deferring to the upstream setup flow. Every other skill below assumes that setup has already run.

## Planning & Delivery Flow

The backbone chain from idea to shipped change, roughly in the order you'd reach for them.

- **[ask-matt](./skills/ask-matt/SKILL.md)**: Ask which skill or flow fits your situation — a router over the skills in this repo.
- **[grill-me](./skills/grill-me/SKILL.md)**: A relentless interview to sharpen a plan or design.
- **[grill-with-docs](./skills/grill-with-docs/SKILL.md)**: The same interview as `grill-me`, but also creates ADRs and a glossary as you go.
- **[grilling](./skills/grilling/SKILL.md)**: The reusable interview primitive behind `grill-me`, `grill-with-docs`, `triage`, and `wayfinder` — grills the user until every branch of the design tree is resolved.
- **[domain-modeling](./skills/domain-modeling/SKILL.md)**: Build and sharpen a project's domain model — used when discussing terminology or editing `CONTEXT.md`/ADRs.
- **[to-spec](./skills/to-spec/SKILL.md)**: Turn the current conversation into a spec and publish it to the issue tracker — no interview, just synthesis.
- **[to-tickets](./skills/to-tickets/SKILL.md)**: Break a plan, spec, or conversation into tracer-bullet tickets with declared blocking edges.
- **[wayfinder](./skills/wayfinder/SKILL.md)**: Plan a huge chunk of work as a shared map of decision tickets on the issue tracker, resolved one at a time.
- **[implement](./skills/implement/SKILL.md)**: Implement a piece of work based on a spec or set of tickets.
- **[code-review](./skills/code-review/SKILL.md)**: Two-axis review (Standards + Spec) of the changes since a fixed point, run as parallel sub-agents.
- **[address-pr-feedback](./skills/address-pr-feedback/SKILL.md)**: Triage PR/MR review comments one at a time, reply, resolve, implement changes, and close out threads.
- **[triage](./skills/triage/SKILL.md)**: Move issues and external PRs through a state machine of triage roles, categorize, verify, and write agent-ready briefs.
- **[improve-codebase-architecture](./skills/improve-codebase-architecture/SKILL.md)**: Scan a codebase for deepening opportunities, present them as an HTML report, then grill through whichever one you pick.
- **[setup-matt-pocock-skills](./skills/setup-matt-pocock-skills/SKILL.md)**: One-time config of issue tracker, triage labels, and domain doc layout for the other engineering skills.
- **[setup-ericmasiello-skills](./skills/setup-ericmasiello-skills/SKILL.md)**: Run this instead of `setup-matt-pocock-skills` directly — same setup, plus a sidecar-and-symlink mode for repos where the root file or `docs/` is restricted. See `../docs/adr/0006-*.md`. Ships with `relink.sh` to recreate those symlinks in any new worktree or clone — see the root [`README.md`](../README.md#restricted-repos--worktrees).
- **[resolving-merge-conflicts](./skills/resolving-merge-conflicts/SKILL.md)**: Resolve an in-progress git merge/rebase conflict.

## Principles

Discipline applied automatically, not invoked by name — one behavior each.

- **[pstack-principle-boundary-discipline](./skills/pstack-principle-boundary-discipline/SKILL.md)**: Concentrate validation/error-handling guards at system boundaries; trust internal types and keep business logic pure.
- **[pstack-principle-build-the-lever](./skills/pstack-principle-build-the-lever/SKILL.md)**: Build the tool (codemod, script, generator) that does non-trivial work instead of doing it by hand.
- **[pstack-principle-encode-lessons-in-structure](./skills/pstack-principle-encode-lessons-in-structure/SKILL.md)**: Encode a recurring correction as a lint, flag, or check instead of repeating it in prose.
- **[pstack-principle-exhaust-the-design-space](./skills/pstack-principle-exhaust-the-design-space/SKILL.md)**: Build 2-3 competing prototypes for a novel UI/architecture decision before committing.
- **[pstack-principle-experience-first](./skills/pstack-principle-experience-first/SKILL.md)**: Choose user delight over implementation convenience; ship fewer polished features over more rough ones.
- **[pstack-principle-fix-root-causes](./skills/pstack-principle-fix-root-causes/SKILL.md)**: Trace each symptom to its root cause and fix it there, rather than guarding around a crash.
- **[pstack-principle-foundational-thinking](./skills/pstack-principle-foundational-thinking/SKILL.md)**: Get the core data structures right before writing logic, so downstream code becomes obvious.
- **[pstack-principle-guard-the-context-window](./skills/pstack-principle-guard-the-context-window/SKILL.md)**: Route bulk reading/output to subagents; keep summaries in the main thread, not raw payloads.
- **[pstack-principle-laziness-protocol](./skills/pstack-principle-laziness-protocol/SKILL.md)**: Bias toward deletion and the smallest change that solves the problem.
- **[pstack-principle-make-operations-idempotent](./skills/pstack-principle-make-operations-idempotent/SKILL.md)**: Design operations to converge to the same end state regardless of partial prior runs.
- **[pstack-principle-migrate-callers-then-delete-legacy-apis](./skills/pstack-principle-migrate-callers-then-delete-legacy-apis/SKILL.md)**: Migrate callers and delete the old API in the same wave — don't preserve compatibility layers.
- **[pstack-principle-minimize-reader-load](./skills/pstack-principle-minimize-reader-load/SKILL.md)**: Collapse one-caller wrappers and shrink mutable/hidden state so code is easier to trace.
- **[pstack-principle-model-the-domain](./skills/pstack-principle-model-the-domain/SKILL.md)**: Encode the domain in a structure instead of scattered conditionals when logic branches a lot.
- **[pstack-principle-never-block-on-the-human](./skills/pstack-principle-never-block-on-the-human/SKILL.md)**: Proceed on reversible work and let the human course-correct after; save confirmation for irreversible actions.
- **[pstack-principle-outcome-oriented-execution](./skills/pstack-principle-outcome-oriented-execution/SKILL.md)**: Converge directly on the target architecture during planned rewrites; don't preserve throwaway compatibility code.
- **[pstack-principle-prove-it-works](./skills/pstack-principle-prove-it-works/SKILL.md)**: Verify against the real artifact before declaring done, not a proxy or "it compiles."
- **[pstack-principle-redesign-from-first-principles](./skills/pstack-principle-redesign-from-first-principles/SKILL.md)**: Redesign as if a new requirement had been foundational from day one, instead of bolting it on.
- **[pstack-principle-separate-before-serializing-shared-state](./skills/pstack-principle-separate-before-serializing-shared-state/SKILL.md)**: Eliminate sharing between concurrent writers first; only serialize when one shared writer is a real invariant.
- **[pstack-principle-sequence-verifiable-units](./skills/pstack-principle-sequence-verifiable-units/SKILL.md)**: Break multi-step work into small units that each end in a verifiable state, checked before the next.
- **[pstack-principle-subtract-before-you-add](./skills/pstack-principle-subtract-before-you-add/SKILL.md)**: Remove dead weight and redundant code first, then build on the simpler base.
- **[pstack-principle-type-system-discipline](./skills/pstack-principle-type-system-discipline/SKILL.md)**: Make illegal states unrepresentable and parse external data at boundaries when designing types.

## Testing & Characterization

A pipeline for adding tests to legacy code, `test-plan-quality-workflow` orchestrates the rest.

**Orchestrator**

- **[test-plan-quality-workflow](./skills/test-plan-quality-workflow/SKILL.md)**: Plans and sequences the complete 4-stage test quality workflow (Detect → Refactor → Add Missing Tests → Validate).

**1. Plan**

- **[test-plan-characterization-tests](./skills/test-plan-characterization-tests/SKILL.md)**: Plan characterization tests for legacy code to pin existing behavior before refactoring.
- **[test-plan-seam-refactoring](./skills/test-plan-seam-refactoring/SKILL.md)**: Plan safe refactorings (seams, test doubles) to make untestable legacy code testable.

**2. Analyze**

- **[test-analyze-test-smells](./skills/test-analyze-test-smells/SKILL.md)**: Review test code for anti-patterns and give specific refactoring recommendations.
- **[test-analyze-testability-blockers](./skills/test-analyze-testability-blockers/SKILL.md)**: Detect what makes legacy code untestable via the 11-smell taxonomy and rank where to invest first.
- **[test-analyze-fallback-strategies](./skills/test-analyze-fallback-strategies/SKILL.md)**: Alternative approaches when standard seam refactoring is too risky or expensive.

**3. Generate**

- **[test-generate-acceptance-tests](./skills/test-generate-acceptance-tests/SKILL.md)**: Generate acceptance tests that exercise a full use case, mocking only the external world.
- **[test-generate-integration-tests](./skills/test-generate-integration-tests/SKILL.md)**: Generate integration tests that exercise a driven adapter against its real external system, no mocks inside the boundary.
- **[test-generate-unit-characterization-tests](./skills/test-generate-unit-characterization-tests/SKILL.md)**: Create unit tests with explicit assertions that lock current behavior for legacy code.
- **[test-generate-golden-master-tests](./skills/test-generate-golden-master-tests/SKILL.md)**: Create approval/snapshot tests that lock current behavior for complex legacy code.
- **[test-generate-object-mother-fixtures](./skills/test-generate-object-mother-fixtures/SKILL.md)**: Generate Object Mother and builder patterns for readable, reusable test fixtures.
- **[test-generate-missing-coverage-tests](./skills/test-generate-missing-coverage-tests/SKILL.md)**: Add targeted tests to partially tested code, with gap analysis.

**4. Evaluate**

- **[test-evaluate-hotspot-priority](./skills/test-evaluate-hotspot-priority/SKILL.md)**: Compute a deterministic hotspot score (change frequency × complexity × uncovered fraction) to rank modules to test first.
- **[test-evaluate-skipped-files](./skills/test-evaluate-skipped-files/SKILL.md)**: Decide whether a skipped/excluded test file is a legitimate skip or masks a real testing gap.
- **[test-evaluate-targeted-coverage](./skills/test-evaluate-targeted-coverage/SKILL.md)**: Run targeted tests with line/branch coverage reporting for newly added tests.
- **[test-evaluate-focused-mutation](./skills/test-evaluate-focused-mutation/SKILL.md)**: Run mutation tests on newly added tests to verify they catch real bugs (85% kill-rate gate).

**5. Refactor & Validate**

- **[test-refactor-test-smells](./skills/test-refactor-test-smells/SKILL.md)**: Step-by-step refactoring guidance for fixing test quality issues (Testing Theater, Implementation Coupling, etc.).
- **[test-validate-characterization-quality](./skills/test-validate-characterization-quality/SKILL.md)**: Validate that characterization tests are deterministic, well-covered, and actually catch bugs before trusting them.

## Code Quality & Review

- **[codebase-design](./skills/codebase-design/SKILL.md)**: Shared vocabulary for designing deep modules — interfaces, seams, testability.
- **[tdd](./skills/tdd/SKILL.md)**: Test-driven development with a red-green-refactor loop.
- **[prototype](./skills/prototype/SKILL.md)**: Build a throwaway prototype to answer a design question (state/logic or UI variations).
- **[diagnosing-bugs](./skills/diagnosing-bugs/SKILL.md)**: Disciplined diagnosis loop for hard bugs and performance regressions.
- **[node-version-mismatch](./skills/node-version-mismatch/SKILL.md)**: Fix a Node engine/version error (`EBADDEVENGINES`, etc.) by running `nvm install` against the repo's `.nvmrc`, instead of guessing or editing the requirement.
- **[research](./skills/research/SKILL.md)**: Investigate a question against high-trust primary sources and capture findings as a Markdown file, run as a background agent.
- **[code-comments](./skills/code-comments/SKILL.md)**: Write and improve code comments, using commenting as a design-review forcing function.
- **[wizard](./skills/wizard/SKILL.md)**: Generate an interactive bash wizard for steps only a human can perform (credentials, dashboards, provisioning).
- **[thermo-nuclear-review](./skills/thermo-nuclear-review/SKILL.md)**: Comprehensive security and correctness audit of a branch's changes.
- **[thermo-nuclear-code-quality-review](./skills/thermo-nuclear-code-quality-review/SKILL.md)**: Extremely strict maintainability review for abstraction quality and giant files.
- **[pstack-blast-radius](./skills/pstack-blast-radius/SKILL.md)**: Find what a change could break elsewhere before it ships, proven by running real code.
- **[pstack-why](./skills/pstack-why/SKILL.md)**: A cited read on design rationale and tradeoffs — queries source control, issue tracker, docs, chat, and observability in parallel.

## Productivity & Docs

- **[handoff](./skills/handoff/SKILL.md)**: Compact the current conversation into a handoff document for another agent to pick up.
- **[teach](./skills/teach/SKILL.md)**: Teach the user a new skill or concept within this workspace.
- **[to-questionnaire](./skills/to-questionnaire/SKILL.md)**: Turn a decision you can't fully answer into a questionnaire for someone else to fill in.
- **[wait-what](./skills/wait-what/SKILL.md)**: Re-pitch the last message the moment it didn't land, in plain English.
- **[find-skills](./skills/find-skills/SKILL.md)**: Discover and install agent skills that might already exist for what you're trying to do.
- **[skill-to-command](./skills/skill-to-command/SKILL.md)**: Create an opencode command wrapper that pins a specific model to an existing skill.
- **[writing-for-agents](./skills/writing-for-agents/SKILL.md)**: Writing documents for agents — skills, `AGENTS.md`/`CLAUDE.md`, anything an agent reaches by a pointer.
- **[diataxis](./skills/diataxis/SKILL.md)**: Classify, validate, generate, and audit documentation using the Diátaxis framework.
- **[proofread](./skills/proofread/SKILL.md)**: Work with hosted Proof documents and Proof SDK-compatible deployments over HTTP.
- **[visual-recap](./skills/visual-recap/SKILL.md)**: Generate and maintain a visual system-recap block in a PR description.
- **[pstack-unslop](./skills/pstack-unslop/SKILL.md)**: Cut AI tells from any writing — must always apply.
- **[pstack-typescript-best-practices](./skills/pstack-typescript-best-practices/SKILL.md)**: TypeScript best practices, used when reading or editing any `.ts`/`.tsx` file.
- **[atlassian-mcp](./skills/atlassian-mcp/SKILL.md)**: Generic Atlassian (Jira/Confluence) integration via MCP.
- **[gitlab-ci-watch](./skills/gitlab-ci-watch/SKILL.md)**: Check CI pipeline status across every open GitLab merge request you authored, on any project on your host, and report failures — read-only, built for recurring/scheduled checks. Needs an OpenChamber scheduled task to actually recur — see the root [`README.md`](../README.md#scheduled-tasks) setup prompt.
- **[ci-fix-dispatch](./skills/ci-fix-dispatch/SKILL.md)**: Turn a CI-failure report (e.g. from `gitlab-ci-watch`) into a live OpenChamber session rooted in the failing MR/PR's own repo and branch — no `/handoff` doc, no manual copy/paste. Works for both GitLab and GitHub.

## Work-context (Vistaprint / Studio)

Coupled to a specific employer's GitLab/Jira project — kept here deliberately (see `../docs/adr/0001-*.md`), tracked separately from the generic skills above.

- **[studio-improve-codebase-architecture](./skills/studio-improve-codebase-architecture/SKILL.md)**: Parallel architecture review of the Studio monorepo — batched sub-agents per package, HTML report, grilling loop.
- **[studio-integration-testing](./skills/studio-integration-testing/SKILL.md)**: Integration tests for hooks/components that depend on DesignEngine, providers, and complex runtime state.
- **[studio-migrate-to-jira](./skills/studio-migrate-to-jira/SKILL.md)**: Migrate GitLab work items from the Studio project into Jira Workstreams/Tasks.
- **[studio-rebase](./skills/studio-rebase/SKILL.md)**: Fetch and rebase onto a target branch, then resolve all merge conflicts.
- **[studio-review-test-coverage](./skills/studio-review-test-coverage/SKILL.md)**: Open HTML coverage reports for Studio source files in the browser.
- **[studio-ship-work](./skills/studio-ship-work/SKILL.md)**: Commit, push, optionally open a GitLab MR, and update the source issue's status labels.
- **[studio-worktree-zed](./skills/studio-worktree-zed/SKILL.md)**: Create a git worktree from a GitLab issue and open it in Zed.
- **[vista-atlassian](./skills/vista-atlassian/SKILL.md)**: Jira/Confluence via the `acli` CLI (Vistaprint-specific), with the Rovo MCP server as fallback.

`skills/_studio-shared/LABELS.md` is a shared GitLab label reference several of the skills above read from — not an invocable skill itself.

## Personal

- **[skylight-homework](./skills/skylight-homework/SKILL.md)**: Parse pasted homework schedules and create Skylight chores for each school day.
- **[todoist-cli](./skills/todoist-cli/SKILL.md)**: Manage Todoist tasks, projects, labels, and filters via the `td` CLI.
