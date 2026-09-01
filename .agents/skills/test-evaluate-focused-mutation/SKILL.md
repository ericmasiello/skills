---
name: test-evaluate-focused-mutation
description: Run mutation tests on newly added tests to verify they catch real bugs. Use when you say 'run mutation tests', 'test the tests', 'validate test quality', 'mutation testing', or need proof that new characterization tests detect actual regressions. Provides platform-specific tool selection, and adjudicates the project mutation gate with a bundled evaluator rather than by assertion.
metadata:
  category: 'Test Execution'
  tags: ['mutation-testing', 'test-quality', 'coverage', 'test-validation']
  author: DOM-0080
  revision: 5
  status: experimental
---

# Focused Mutation Testing Specialist

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

## Purpose

Run the smallest practical mutation test scope that validates the newly added or updated tests without paying the cost of mutating the entire codebase.

This skill exists because mutation testing is expensive. Its job is to decide:

- what production code should be mutated
- what tests should execute against those mutations
- which mutation tool fits the platform
- whether that tool is already installed and configured
- how to install and minimally configure it if missing
- what configuration shape is required on that platform
- whether the result clears the project quality gate, adjudicated by
  `scripts/evaluate-mutation-report.mjs` rather than asserted in prose

## Deterministic Helpers

This skill bundles its deterministic helpers inside its own `scripts/` folder so the executable logic ships with the skill rather than living only in repository-level tooling.

When the environment allows script execution, prefer these bundled helpers to reduce guesswork and keep the mutation plan reproducible:

- `node .skills/test-evaluate-focused-mutation/scripts/mutation-readiness.mjs <repo-path>` to detect platform, selected tool, install/config readiness, and setup commands
- `node .skills/test-evaluate-focused-mutation/scripts/focused-mutation-plan.mjs --productionTargets <csv> --changedTests <csv> --taxonomyLevel <level> --targetKind <kind> [--mutationGate <n>]` to generate a deterministic focused mutation plan
- `node .skills/test-evaluate-focused-mutation/scripts/evaluate-mutation-report.mjs --filePath <report> --gate <n> --target <target> --sourceRevision <rev> --command <cmd> --triage <triage.json>` to **adjudicate** the gate. This is the only sanctioned way to claim a mutation result passed. It exits `0` on PASS, `7` when the score is below the gate, and `5` when the evidence is missing — including zero eligible mutants, a denominator wrecked by compile errors, and unclassified survivors.

Use the bundled script paths when:

- documenting the skill itself
- reusing the skill in another repository
- you need the execution path to stay explicitly tied to this skill package

Use target-repository convenience wrappers (for example `pnpm run mutation:readiness`) only when:

- working inside the target repository
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

Report the shared fields defined in `test-skills-decision-contract.md`
(`Result`, `Missing Evidence`, `Blocking Issues`, `Next Owner`).

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
- If a mismatch is found, record the correct invocation form (and the working directory it must be run from, if project-scoped) so future runs in that target repository don't rediscover it.

### Isolated Worktree Readiness

In an isolated Git worktree, a visible executable is not enough. Before claiming
mutation readiness, run the mutation runner's dry run or equivalent initial test
run from that worktree and confirm it resolves every runtime dependency (test
environment, plugins, transforms, and project modules) from the worktree's own
dependency layout. Do not borrow a binary or `NODE_PATH` from another checkout
and treat a resulting partial run as valid evidence. If dependency resolution
fails, report `installed-needs-config` with the error as Missing Evidence and
escalate; do not report a mutation score.

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
- Java, Rust, and C/C++: reuse a configured project-native tool; otherwise report missing evidence and a setup path

Tool selection is not complete until you also confirm whether the chosen tool is installed and runnable in the current environment.

## Platform Configuration Guidance

Keep the main skill focused on tool choice, mutation scope, and quality gates.

Read `references/mutation-config-examples.md` when you need:

- platform-specific configuration examples for Stryker, mutmut, Stryker.NET, and go-mutesting
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

## Script Interface

Use `scripts/focused-mutation-plan.mjs` with `--repoPath <target-repository>` when the target differs from the current directory. The script checks command readiness before it emits a runnable plan.

## Mutation Testing Background

Read `references/mutation-testing-background.md` when you need:

- the mutation score interpretation table
- common mutation operators and what they reveal
- guidance on when to widen from focused runs to broader scans

## Quality Gate

Minimum gate: the project mutation gate, or 85% when none is defined.

Fail conditions:

- mutation score is below the applicable gate
- surviving mutants with no triage
- scope so broad that the result is not attributable to the newly added tests
- no runnable mutation tool is available

Warning conditions:

- score meets the applicable gate but equivalent mutants remain
- score meets the applicable gate but the scope had to widen because the platform could not support a tighter target

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
- Source Revision: {commit or unchanged-worktree identity}
- Report Location: {path or tool output reference}
- Eligible Mutants: {eligible total, attempted total, invalid count, exclusions, timeout status}
- Scope Item Mutant Coverage: {per named scope item — `covered` with an example mutant id, or `no-eligible-mutants` with the reason, e.g. its only mutations were type-invalid and excluded}
- Unmeasured Scope Items: {list, or none — per item state the cause: `tests-do-not-reach` (Missing Evidence, needs a test) or `tool-cannot-mutate` (discharge via fault injection, naming the statement perturbed and the test that failed)}
- Mutation Score: {killed}/{eligible} = {score}% vs gate {gate}% -> {PASS | FAIL | MISSING-EVIDENCE}
- Gate Adjudication: {exact evaluate-mutation-report.mjs command + its exit code}
- Rejected Narrower Scope: {why it was not sufficient, if applicable}
- Test Selection Strategy: {specific tests/suites to execute}
- Config Shape: {platform-specific keys/flags that must be set}
- Setup Actions: {install/config/verification steps, or reused existing setup}
- Command: {exact mutation command}
- Quality Gate: {project gate or default 85%}
- Surviving Mutants: {triage summary}

## Decision Contract

- Result: {COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED}
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: {test-validate-characterization-quality | human | self}
```

## Troubleshooting

Read `references/mutation-tool-troubleshooting.md` for the detailed troubleshooting matrix, including:

- missing mutation tooling
- timeouts and overly broad scopes
- low scores and survivor follow-up
- invalid mutants or missing test discovery
- local versus CI mismatches
