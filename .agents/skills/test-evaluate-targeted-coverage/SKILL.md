---
name: test-evaluate-targeted-coverage
description: Run targeted tests with coverage reporting for newly added tests. Use when you say 'run tests', 'check coverage', 'test coverage', 'run with coverage', or need line and branch coverage evidence for specific test files without running the entire test suite.
metadata:
  category: 'Test Execution'
  tags: ['coverage', 'test-execution', 'line-coverage', 'branch-coverage']
  author: DOM-0080
  revision: 4
  status: experimental
---

# Targeted Test And Coverage Specialist

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

## Purpose

Run the narrowest practical test slice with coverage and verify that both the test runner and coverage tooling are installed and minimally configured before claiming coverage evidence.

This skill exists to make test execution and coverage collection as deterministic as mutation execution.

## Deterministic Helpers

This skill bundles its executable helpers inside its own `scripts/` folder.

When script execution is available, prefer these bundled helpers:

- `node .skills/test-evaluate-targeted-coverage/scripts/test-coverage-readiness.mjs <repo-path>`
- `node .skills/test-evaluate-targeted-coverage/scripts/targeted-coverage-plan.mjs --productionTargets <csv> --changedTests <csv> --taxonomyLevel <level> --targetKind <kind>`
- `node .skills/test-evaluate-targeted-coverage/scripts/normalize-coverage-report.mjs --filePath <coverage-report-path>`

Pass `--repoPath <target-repository>` when the current directory is not the
target repository. Use the bundled paths when documenting or reusing the skill.
Use repository convenience wrappers such as `pnpm run coverage:readiness` and
`pnpm run coverage:plan` only when those wrappers simply point to these
skill-bundled scripts.

## When to Use

Use this skill after adding or updating tests and before reporting line or branch coverage for legacy characterization.

Use it for unit, acceptance, integration, contract, or justified e2e characterization whenever you need:

- the narrowest relevant test command
- coverage tool readiness checks
- install/config guidance if coverage tooling is missing
- a normalized coverage evidence summary

Normalize coverage output before handing it to downstream quality gates so line and branch summaries are reported in one consistent shape across platforms.

## When NOT to Use

Do not use this skill when:

- tests are not identified yet and coverage scope cannot be selected
- mutation quality is required instead of coverage evidence (`test-evaluate-focused-mutation`)
- you need blocker or seam analysis rather than execution evidence

## Ownership Boundary

- **Owns**: targeted test/coverage execution readiness and coverage evidence normalization
- **Does not own**: mutation execution, blocker taxonomy, or seam planning

## Prerequisite Gate

Before running targeted coverage, require:

1. target tests or suites identified
2. target production scope identified
3. selected runner/coverage tool available or installation path defined

If any prerequisite is missing, stop and request it explicitly.

## Required Decision Output

Report the shared fields defined in `test-skills-decision-contract.md`
(`Result`, `Missing Evidence`, `Blocking Issues`, `Next Owner`).

## Core Principle

Coverage runs should follow the smallest test slice that still proves the new tests execute the protected behavior.

Do not default to full-suite coverage when a narrower stable slice is available.

Coverage is **evidence** that a layer's behaviors are exercised (Acceptance → Unit → Integration), never a target to chase. Report it to confirm that added tests execute real behavior; do not recommend adding tests solely to raise a percentage. An uncovered line that maps to no observable behavior may be a legitimate skip (`test-evaluate-skipped-files`), not a gap.

## Required Inputs

Collect or infer these inputs before choosing a command:

1. Production target covered by the tests
2. Test files or suites that were added or changed
3. Language / platform
4. Existing test runner and coverage tool if the repo already has one
5. Whether behavior is local to one unit or spread across a higher-level flow
6. Whether the selected test and coverage tools are installed and invokable

## Environment Readiness Check

Before planning or running targeted coverage, verify all of the following:

1. A supported test runner is available for the platform.
2. The test runner is installed in the current environment or project toolchain.
3. A supported coverage mechanism is available for the platform.
4. The coverage tool or provider is installed and minimally configured.
5. The project has enough configuration to target the intended test slice and report coverage.

Prefer this order:

1. Reuse the repository's existing test runner and coverage configuration.
2. Reuse installed platform-standard tools if config is partial.
3. If required tooling is missing, help the user install and minimally configure it before continuing.

## Missing Tool Procedure

If the test runner or coverage tool is missing or not minimally configured:

1. Select the platform-appropriate default runner and coverage tool.
2. State the exact installation path to use in this environment.
3. Propose the minimum configuration needed for a focused coverage run.
4. Tell the user what command should verify the setup.
5. Resume with targeted coverage planning only after setup is clear.

Do not claim coverage evidence is ready when the toolchain is absent.

## Scope Selection Rules

Choose test and coverage scope in this order, stopping at the first level that safely matches the target:

1. **Single Test File / Case Family Scope**
   - Use when one small test file or one focused suite protects one production behavior.

2. **Module / File Scope**
   - Use when the behavior spans a single production file or module and a small related test slice covers it.

3. **Package / Namespace Scope**
   - Use when several tightly related files must run together for meaningful coverage.

4. **Flow / Boundary Scope**
   - Use for acceptance, integration, contract, or justified e2e characterization when meaningful coverage only exists across a narrow higher-level flow.

## Scope Rejection Rules

- ❌ Do not run the entire suite by default.
- ❌ Do not claim overall project coverage when only a targeted slice was executed.
- ❌ Do not widen the target until the narrower run has proven insufficient.

## Platform Tool Selection

Prefer the repository's existing test runner and coverage setup if already configured. Otherwise choose the platform standard:

- TypeScript / JavaScript: `Vitest` or `Jest` with `@vitest/coverage-v8`, `@vitest/coverage-istanbul`, or Jest/Istanbul coverage
- Python: `pytest` with `pytest-cov`
- C#: `dotnet test` with `coverlet` or built-in collector integration
- Go: `go test -cover`
- Java: Maven or Gradle with the JaCoCo plugin and a generated XML or CSV report
- Rust: `cargo llvm-cov` with LCOV or JSON output
- C/C++: `gcovr` after the target build enables GCC or Clang coverage instrumentation

## Platform Configuration Guidance

Keep the main skill focused on tool selection, scope, and report shape.

Read `references/coverage-config-examples.md` when you need:

- platform-specific coverage setup examples
- minimal config snippets for TypeScript / JavaScript, Python, C#, Go, Java, Rust, or C/C++
- example coverage commands and reporter choices

## Output Requirements

When the toolchain is missing, the output must include:

- selected test runner
- selected coverage tool
- why they match the platform
- install command or setup path
- minimal config keys or plugin/package additions required
- verification command
- focused test and coverage commands to run after setup

When the toolchain is already present, explicitly say so and reuse the existing setup.

## Coverage Normalization

After running coverage, prefer normalizing the result into one JSON summary shape before passing evidence to `test-validate-characterization-quality`.

Supported normalization inputs:

- Istanbul/Vitest/Jest coverage summary JSON
- `lcov.info`
- coverage.py JSON
- JaCoCo CSV
- Go coverprofile
- gcov text
- Cobertura XML
- text summary output with a `TOTAL` or `All files` line, including pytest-cov

Normalized output shape:

- `format`
- `source`
- `metrics.lines`
- `metrics.branches`
- `metrics.functions`
- `metrics.statements`
- `notes`

If a tool does not provide a metric directly, keep counts null and mark unsupported metrics explicitly rather than inventing values.

## Output Format

```markdown
# Targeted Test And Coverage Plan

- Platform: {language/runtime}
- Test Runner: {selected runner}
- Coverage Tool: {selected tool/provider}
- Environment Readiness: {installed and configured | installed-needs-config | missing-tool}
- Production Target: {file/module/package/flow}
- Changed Tests: {test files or suites}
- Selected Scope: {single-test|file/module|package|flow}
- Scope Rationale: {why this is the smallest safe scope}
- Test Selection Strategy: {specific tests/suites to execute}
- Config Shape: {platform-specific keys/flags that must be set}
- Setup Actions: {install/config/verification steps, or reused existing setup}
- Test Command: {targeted test command}
- Coverage Command: {targeted coverage command}
- Coverage Expectations: {line/branch metrics if supported}
- Normalized Coverage Report: {path or inline JSON summary}

## Decision Contract

- Result: {COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED}
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: {one downstream skill}
```

## Troubleshooting

Read `references/coverage-tool-troubleshooting.md` for the detailed troubleshooting matrix, including:

- missing or misconfigured coverage tooling
- empty or 0% reports
- import and path-resolution failures
- unexpectedly low or inconsistent coverage
- CI/reporter compatibility issues
