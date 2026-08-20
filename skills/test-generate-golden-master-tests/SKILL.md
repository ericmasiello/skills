---
name: test-generate-golden-master-tests
description: Create approval tests that capture and lock current behavior for complex legacy code. Use when you say 'golden master tests', 'approval tests', 'snapshot tests', 'characterization tests', or outputs are large/complex and you want to detect any behavior change automatically through snapshot comparison.
metadata:
  category: 'Characterization Testing'
  tags: ['golden-master', 'approval-testing', 'snapshot-testing', 'characterization', 'legacy-code']
  author: TBD
  revision: 1
  status: experimental
---

# Stage 3 Golden Master Characterization Specialist

## Purpose

Generate characterization tests that capture full actual outputs as a baseline and detect regressions through approval/snapshot comparison.

These Stage 3 characterization techniques apply to **all service types**. Service classification affects the target architecture after characterization tests exist, but not whether Golden Master testing is valid. This is a characterization mechanism, not a separate test taxonomy.

When the target is a function or other finite input surface, prefer a data-driven Cartesian product of meaningful input dimensions to maximize behavioral coverage quickly. Use this only when the input domain is bounded enough to stay readable, deterministic, and maintainable.

Shared quality gates for determinism, coverage, and mutation effectiveness belong to `test-validate-characterization-quality`.
Focused mutation scope, tool selection, and platform config belong to `test-evaluate-focused-mutation`.
Targeted test and coverage execution belong to `test-evaluate-targeted-coverage`.

## What Golden Master Is

Golden Master testing records the system's real current behavior for representative inputs, approves that behavior as a baseline artifact, and flags any future behavioral drift by diffing current output against approved output.

This is especially useful for legacy logic with broad branching or complex structured/text outputs where hand-written assertions are brittle.

## When to Use

Use Golden Master when behavior produces complex outputs or many interacting branches where writing exact assertions by hand is brittle.

Use it only after seams are verified and after choosing the appropriate Stage 3 test level. In legacy work, tests are added outside-in following Acceptance -> Unit -> Integration.

## Ownership Boundary

- **Owns**: approval/snapshot-based characterization implementation
- **Does not own**: seam planning, mutation tool execution ownership, or final quality gate adjudication

## Prerequisite Gate

Before generating approval tests, require:

1. seams verified
2. deterministic capture or normalization strategy defined
3. bounded/maintainable input-space strategy selected

If any prerequisite is missing, stop and request it explicitly.

## Required Decision Output

- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list (empty if none)
- `Blocking Issues`: explicit list (empty if none)
- `Next Owner`: one downstream owner skill

## When NOT to Use

Do NOT use Golden Master when:

- **Outputs are simple and predictable**: Use explicit assertions (`test-generate-unit-characterization-tests`) when outputs can be asserted clearly
- **Behavior is still non-deterministic**: Control time/random/IDs/order first, or approval diffs will create false failures
- **Seams are not yet applied**: Code must be testable before Golden Master can capture behavior
- **Input space is unbounded**: Golden Master works for bounded, representative inputs, not infinite domains
- **Tests need to document specific business rules**: Approval artifacts show "what" but hide "why"; use explicit assertions when intent matters
- **You're characterizing side effects only**: Use explicit mocks/spies for boundary verification instead of capturing opaque output blobs

## Stage 3 Position

Golden Master is not a separate test type. It is a characterization technique that can support acceptance, unit, integration, or contract tests when broad observed behavior is better captured through approved output artifacts than through hand-written assertions.

## Preconditions

1. Seams already applied (code is testable).
2. Inputs can be made representative and replayable.
3. Output can be captured without changing behavior.
4. Input can be injected or replayed without changing behavior.
5. Nondeterminism (time/random/ids/order) is controlled or normalized.

## Generation Rules

- ✅ Capture actual output from real execution.
- ✅ Lean on approval-test frameworks as the default mechanism (snapshot-only assertions are secondary).
- ✅ Store approved baseline snapshot/approval artifact.
- ✅ Compare future runs against baseline.
- ✅ Document normalization strategy for nondeterministic fields.
- ✅ Generate the received output from real execution first, then approve the actual behavior as the baseline.
- ✅ Target high behavioral coverage of representative input space (happy path, edge cases, failure modes).
- ✅ For bounded input spaces, prefer a table-driven Cartesian product of input dimensions instead of hand-picking a few examples.
- ✅ Keep Cartesian generation explicit and data-driven; the approval assertion should consume prepared cases rather than hide branching logic inside the test body.
- ✅ Collapse or partition combinations when the full matrix would become unreadable, slow, or dominated by redundant cases.
- ✅ Keep the approval-test area free of test smells before finalizing the suite, especially logic in tests, mystery guests, eager tests, duplication, and obscure naming.
- ✅ Validate the resulting suite with `test-validate-characterization-quality`.
- ✅ Run `test-analyze-test-smells` on the approval tests or the touched test area before considering the characterization complete.
- ✅ Run targeted tests and coverage through `test-evaluate-targeted-coverage` before summarizing coverage evidence.
- ✅ Run focused mutation through `test-evaluate-focused-mutation` against the production code protected by the new Golden Master tests.
- ❌ Do not guess expected output.
- ❌ Do not classify this as a separate test type (still unit/acceptance/etc.).
- ❌ Do not hide the input matrix behind loops or conditionals that turn the approval test into a mini-program.
- ❌ Do not brute-force unbounded or huge domains just to inflate coverage numbers.

## Approval Framework Guidance

Prefer established approval frameworks because they provide stable artifact workflows (received vs approved files), clear diffs, and reviewer-friendly approvals.

- TypeScript/JavaScript: `approvals`, Jest/Vitest snapshots (fallback)
- Python: `approvaltests`, `pytest-snapshot`
- C#: `ApprovalTests`, `Verify`
- Go: `cupaloy`, `approvals`

## Input Space Strategy

For approval tests at function or module scope, choose the input-space strategy explicitly:

- `Cartesian Product`: use when each input dimension is finite, relevant, and the total matrix remains readable.
- `Partitioned Cartesian Product`: use when the full space is too large, but you can divide it into smaller behavior-preserving matrices.
- `Representative Sampling`: use only when the input space is effectively unbounded or the full combination set would stop being maintainable.

If you do not use a Cartesian approach, state why the domain size, runtime cost, or readability made that unsafe.

## Test Smell Hygiene

Approval tests are only a fast coverage tool if the resulting suite remains maintainable.

Before finalizing:

- remove logic-in-test patterns from the approval harness
- make fixtures and input tables explicit rather than hidden in files or globals
- keep case names descriptive enough to explain which combination is being approved
- deduplicate setup through builders, mothers, or case factories instead of copy-paste
- keep assertions focused on approved observed output, not interaction choreography

## Output Format

```markdown
Technique: Golden Master
Taxonomy Level: {acceptance | unit | integration | contract | e2e}
Target: {module/function}
Input Space Strategy: {Cartesian Product | Partitioned Cartesian Product | Representative Sampling}
Inputs: {representative cases}
Feasibility Checks: {capture safe, replay safe, deterministic or normalized}
Normalization: {time/random/id handling}
Approval Artifact: {path}
Test Smell Check: {clean | issues found + remediation plan}
Verification: compare current output to approved baseline
Shared Quality Gate: `test-validate-characterization-quality`
Targeted Coverage Skill: `test-evaluate-targeted-coverage`
Focused Mutation Skill: `test-evaluate-focused-mutation`
```

## Success Criteria

- Baseline generated from actual behavior.
- Re-runs consistently detect drift.
- Nondeterminism does not create false failures.
- Shared quality gate reports strong coverage and mutation evidence for characterized targets.

## Examples

Read `references/characterization-examples.md` for worked examples covering a legacy invoice generator (Cartesian approval cases) and a report generator with non-determinism normalization.

## Related Skills

- `test-validate-characterization-quality`
- `test-evaluate-targeted-coverage`
- `test-evaluate-focused-mutation`
- `test-analyze-test-smells`
- `test-generate-unit-characterization-tests`
- `test-plan-characterization-tests`
- `test-generate-object-mother-fixtures`
