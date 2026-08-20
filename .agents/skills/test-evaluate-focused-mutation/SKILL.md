---
name: test-evaluate-focused-mutation
description: Run mutation tests on newly added tests to verify they catch real bugs. Use when you say 'run mutation tests', 'test the tests', 'validate test quality', 'mutation testing', or need proof that new characterization tests detect actual regressions. Provides platform-specific tool selection and enforces 85% minimum kill rate.
metadata:
  category: 'Test Execution'
  tags: ['mutation-testing', 'test-quality', 'coverage', 'test-validation']
  author: TBD
  revision: 1
  status: experimental
---

# Focused Mutation Testing Specialist

## Purpose

Run the smallest practical mutation test scope that validates the newly added or updated tests without paying the cost of mutating the entire codebase.

This skill exists because mutation testing is expensive. Its job is to decide:

- what production code should be mutated
- what tests should execute against those mutations
- which mutation tool fits the platform
- whether that tool is already installed and configured
- how to install and minimally configure it if missing
- what configuration shape is required on that platform
- whether the result clears the minimum quality gate

## Deterministic Helpers

This skill bundles its deterministic helpers inside its own `scripts/` folder so the executable logic ships with the skill rather than living only in repository-level tooling.

When the environment allows script execution, prefer these bundled helpers to reduce guesswork and keep the mutation plan reproducible:

- `node .skills/test-evaluate-focused-mutation/scripts/mutation-readiness.mjs <repo-path>` to detect platform, selected tool, install/config readiness, and setup commands
- `node .skills/test-evaluate-focused-mutation/scripts/focused-mutation-plan.mjs --productionTargets <csv> --changedTests <csv> --taxonomyLevel <level> --targetKind <kind>` to generate a deterministic focused mutation plan

Use the bundled script paths when:

- documenting the skill itself
- reusing the skill in another repository
- you need the execution path to stay explicitly tied to this skill package

Use repository convenience wrappers such as `pnpm run mutation:readiness` and `pnpm run mutation:plan` when:

- working inside this repository
- you want shorter commands for manual local execution
- package scripts already point to the skill-bundled helpers and do not add different behavior

Use their output as structured evidence, then adapt only if the repository shows stronger existing mutation conventions.

## When to Use

Use this skill after adding or updating tests for legacy code and before claiming the characterization is strong enough.

Use it for unit, acceptance, integration, contract, or justified e2e characterization when mutation evidence is required.

## When NOT to Use

Do not use this skill when:

- mutation tooling should not be executed yet because tests are not ready
- the request is to classify smells or plan seams rather than execute mutation checks
- you only need coverage execution (`test-evaluate-targeted-coverage` owns that)

## Ownership Boundary

- **Owns**: mutation readiness, focused mutation execution, and mutation evidence interpretation
- **Does not own**: test smell detection, blocker detection, or seam strategy planning

## Prerequisite Gate

Before running mutation, require:

1. target tests identified
2. target production scope identified
3. runnable test command available

If any prerequisite is missing, stop and request it explicitly.

## Required Decision Output

- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list (empty if none)
- `Blocking Issues`: explicit list (empty if none)
- `Next Owner`: one downstream owner skill

## Core Principle

Mutation scope must follow the change in test intent, not repository size.

Default to the smallest scope that can answer this question:

> Do the new tests kill realistic faults in the production code they were written to protect?

## Required Inputs

Collect or infer these inputs before choosing scope:

1. Production target covered by the new tests
2. Test files or suites that were added or changed
3. Language / platform
4. Existing mutation tool and config if the repo already has one
5. Whether the behavior is local to one unit or spread across a flow/boundary
6. Whether the selected mutation tool is installed and invokable in the current environment

If some inputs are missing, choose the most conservative focused scope and state the assumption.

## Environment Readiness Check

Before planning or running mutations, verify all of the following:

1. A supported mutation tool is available for the platform.
2. The tool is installed in the current environment or project toolchain.
3. The project has enough configuration to target the intended production scope.
4. The test runner required by the mutation tool can execute the relevant tests.

Prefer this order:

1. Reuse an existing mutation tool already configured in the repository.
2. Reuse an installed tool that matches the platform if repository config is missing.
3. If no suitable tool is installed, help the user install and minimally configure the platform-appropriate tool before continuing.

## Local vs Global Tool Resolution Check

Before trusting a mutation run's output (or its absence/crash), verify the invoked command actually resolves to the repository's **pinned local** tool version, not a stale global install shadowing it on `PATH`. Ecosystems that support both (e.g. .NET local tools via a `.config/dotnet-tools.json` manifest, Node packages via `devDependencies` vs a global npm install) are prone to this: a bare command name can silently run an older/different global version instead of the pinned one.

- Use the ecosystem's explicit local-invocation form rather than the bare command name: `dotnet tool run <tool>` for .NET local tools, `npx <tool>` or the package-manager-scoped binary for Node, etc.
- Confirm the printed version banner matches the manifest/lockfile-pinned version before concluding the tool can't handle the scenario (e.g. cross-project reference resolution, a specific SDK version) — a stale global version failing at something the pinned version handles fine looks identical to a genuine tool limitation until the version is checked.
- If a mismatch is found, record the correct invocation form (and the working directory it must be run from, if project-scoped) so future runs in this repository don't rediscover it.

## Missing Tool Procedure

If no supported mutation tool is installed or configured:

1. Select the platform-appropriate default tool.
2. State the exact installation path to use in this environment:
   - project-local dependency when the ecosystem supports it
   - global install only when project-local installation is not the normal practice
3. Propose the minimum configuration needed to run a focused mutation pass on the characterized target.
4. Tell the user what command should verify the installation.
5. Resume with focused scope selection only after installation and minimal config are clear.

Do not pretend mutation execution is ready when the tool is absent.

## Scope Selection Rules

Choose mutation scope in this order, stopping at the first level that safely matches the target:

1. **Function / Method Adjacent Scope**
   - Use when the new tests protect one small production function, method, or class.
   - Mutate only that file or the smallest supported equivalent.

2. **Module / File Scope**
   - Use when the behavior spans multiple methods in one file or module.
   - Run only the tests that exercise that file if the tool supports test filtering.

3. **Package / Namespace Scope**
   - Use when the behavior crosses several tightly related files and file-only mutation would miss meaningful logic.

4. **Flow / Boundary Scope**
   - Use for acceptance, integration, contract, or justified e2e characterization when the protected behavior only makes sense across a higher-level flow.
   - Scope to the narrowest production package, service, adapter, or bounded context that owns that flow.

## Scope Rejection Rules

- ❌ Do not mutate the entire repository by default.
- ❌ Do not include unrelated packages just because the tool can.
- ❌ Do not run the entire test suite if the platform supports relevant test filtering.
- ❌ Do not widen scope until the focused scope has either passed or proven insufficient.

## Widening Rules

Widen scope only when one of these is true:

- the tool cannot target the changed production file precisely
- mutations in the focused file leak through neighboring collaborators and require a containing module
- integration or acceptance behavior is owned by a narrow flow rather than a single file
- the focused run produces misleading survivors because the execution context is too narrow

When scope widens, record both:

- why the narrower scope was insufficient
- what larger scope was chosen instead

## Platform Tool Selection

Prefer the repository's existing mutation tool if already configured. Otherwise choose the standard tool for the platform:

- TypeScript / JavaScript: `Stryker`
- Python: `mutmut` first, `cosmic-ray` when mutmut is not viable for the environment
- C#: `Stryker.NET`
- Go: `go-mutesting`

Tool selection is not complete until you also confirm whether the chosen tool is installed and runnable in the current environment.

## Platform Configuration Guidance

Keep the main skill focused on tool choice, mutation scope, and quality gates.

Read `references/mutation-config-examples.md` when you need:

- platform-specific configuration examples for Stryker, mutmut, Stryker.NET, or go-mutesting
- minimal setup snippets for focused mutation runs
- example commands for narrowing production and test scope

## Installation and Configuration Output Rules

When the tool is missing, the output must include:

- selected tool
- why that tool matches the platform
- install command or plugin/package addition path
- minimal config file, config keys, or build-plugin section required
- verification command
- focused mutation command to run after setup

When the tool is already present, explicitly say so and reuse the existing config instead of proposing a parallel setup.

## Mutation Testing Background

Read `references/mutation-testing-background.md` when you need:

- the mutation score interpretation table
- common mutation operators and what they reveal
- guidance on when to widen from focused runs to broader scans

## Quality Gate

Minimum gate:

- mutation score >= 85%

Fail conditions:

- mutation score < 85%
- surviving mutants with no triage
- scope so broad that the result is not attributable to the newly added tests
- no runnable mutation tool is available and no installation/configuration path was produced

Warning conditions:

- score >= 85% but equivalent mutants remain
- score >= 85% but the scope had to widen because the platform could not support a tighter target

## Surviving Mutant Triage

Every survivor must be classified as one of:

- `test gap`
- `equivalent mutant`
- `deferred`

Do not leave survivors unexplained.

## Output Format

```markdown
# Focused Mutation Test Plan

- Platform: {language/runtime}
- Tool: {selected tool}
- Environment Readiness: {installed and configured | installed-needs-config | missing-tool}
- Production Target: {file/module/package/flow}
- Changed Tests: {test files or suites}
- Selected Scope: {function-adjacent|file/module|package|flow}
- Scope Rationale: {why this is the smallest safe scope}
- Rejected Narrower Scope: {why it was not sufficient, if applicable}
- Test Selection Strategy: {specific tests/suites to execute}
- Config Shape: {platform-specific keys/flags that must be set}
- Setup Actions: {install/config/verification steps, or reused existing setup}
- Command: {mutation command}
- Quality Gate: mutation score >= 85%
- Result: {PASS|PASS_WITH_WARNINGS|FAIL}
- Surviving Mutants: {triage summary}
```

## Success Criteria

- Mutation testing runs only where the new tests add protection.
- Tool choice matches the platform and existing repo setup.
- Tool readiness is verified before mutation execution is claimed.
- Missing tools lead to explicit installation and minimal configuration guidance.
- Configuration is narrow enough to stay fast and broad enough to stay meaningful.
- The result is evaluated against the 85% minimum gate with explicit survivor triage.

## Troubleshooting

Read `references/mutation-tool-troubleshooting.md` for the detailed troubleshooting matrix, including:

- missing mutation tooling
- timeouts and overly broad scopes
- low scores and survivor follow-up
- invalid mutants or missing test discovery
- local versus CI mismatches
