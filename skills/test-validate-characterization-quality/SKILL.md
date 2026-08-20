---
name: test-validate-characterization-quality
description: Validate quality and effectiveness of characterization tests before trusting them. Use when you say 'quality gate', 'validate tests', 'test quality check', 'verify characterization', or need evidence that tests are deterministic, have good coverage, and catch real bugs through mutation testing.
metadata:
  category: 'Quality Gates'
  tags: ['quality-gate', 'test-validation', 'coverage', 'mutation-testing', 'determinism']
  author: TBD
  revision: 1
  status: experimental
---

# Stage 4 Legacy Characterization Gate

## Purpose

Apply one reusable quality gate to legacy characterization tests regardless of whether they use explicit assertions or Golden Master approval artifacts.

This skill exists to centralize the rules both characterization strategies share: level selection, determinism, representative coverage, and mutation effectiveness.

Platform-specific test execution, coverage tool choice, and coverage setup guidance belong to `test-evaluate-targeted-coverage`.
Platform-specific mutation scope selection, tool choice, and configuration belong to `test-evaluate-focused-mutation`.
Tool installation readiness and missing-tool setup guidance also belong to `test-evaluate-focused-mutation`.

## Scope

Use this skill after Stage 3 characterization tests are generated or updated by any legacy characterization workflow.

It applies to these taxonomy levels:

- acceptance
- unit
- integration
- contract
- e2e

It applies to these characterization techniques:

- explicit assertions
- Golden Master / approval testing
- mixed suites

## When to Use

Use this skill when Stage 3 characterization artifacts are ready and a final Stage 4 quality gate decision is required.

## When NOT to Use

Do not use this skill when:

- you need to run coverage commands or install coverage tooling (`test-evaluate-targeted-coverage` owns execution)
- you need to run mutation tooling or configure mutation scope (`test-evaluate-focused-mutation` owns execution)
- characterization tests are not created yet (run Stage 3 generation first)

## Ownership Boundary

- **Owns**: Stage 4 gate adjudication and evidence completeness decisions
- **Does not own**: executing coverage or mutation toolchains

## Prerequisite Gate

Before gate adjudication, require:

1. characterization outputs from Stage 3
2. coverage evidence
3. mutation evidence

If prerequisites are missing, return `BLOCKED` with missing evidence.

## Required Decision Output

Every invocation must return this compact decision contract:

- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list of required evidence not provided (empty if none)
- `Blocking Issues`: explicit list of issues preventing pass (empty if none)
- `Next Owner`: exactly one next owner skill to invoke

## Core Rules

- Tests must lock **observed current behavior**, not guessed desired behavior.
- The selected taxonomy level must be stated and justified.
- Non-determinism must be controlled or normalized before approval or assertion lock-in.
- Coverage must include representative behavior families, not only happy path execution.
- Explicit-assertion characterization should prefer property-based tests when a stable observed invariant exists, otherwise parameterized tests, with single-case tests as the fallback.
- Approval-style characterization should prefer a Cartesian input matrix when the target input dimensions are finite and deterministic; otherwise the report must justify a smaller partitioned or representative set.
- The tests being added, or at minimum the touched approval-test area, must be free of high-severity test smells and must not carry medium-severity smells that obscure observed behavior.
- Test execution and coverage collection must be planned and run through `test-evaluate-targeted-coverage`.
- Mutation testing must be planned and run through `test-evaluate-focused-mutation`.
- Smell review must be run through `test-analyze-test-smells` before the characterization is considered complete.
- Surviving mutants must be triaged as `test gap`, `equivalent mutant`, or `deferred`, with one-line rationale.

## Required Evidence

Every report must include evidence for all of the following:

1. **Level Selection**
   - Why this target is acceptance, unit, integration, contract, or e2e.
   - Why a cheaper lower-scope test was not sufficient if integration or e2e was chosen.

2. **Behavior Family Coverage**
   - Happy path
   - Edge case
   - Failure mode

3. **Input Space Strategy**
   - Cartesian product, partitioned Cartesian product, or representative sampling.
   - For approval tests, justify why the chosen strategy is the highest-value maintainable coverage shape.

4. **Explicit Test Shape Strategy**
   - Property-based, parameterized, or single-case.
   - For explicit-assertion tests, justify why the strongest maintainable form was or was not used.

5. **Observation Method**
   - Explicit assertions, approval artifact, or mixed approach.

6. **Determinism Controls**
   - Time, random values, IDs, ordering, concurrency, external I/O.

7. **Coverage Evidence**
   - Report from `test-evaluate-targeted-coverage`
   - Normalized coverage report when available
   - Environment readiness state
   - Test runner used
   - Coverage tool used
   - Command used
   - Line coverage summary
   - Branch coverage summary when tool support exists

8. **Mutation Evidence**
   - Report from `test-evaluate-focused-mutation`
   - Environment readiness state
   - Tool used
   - Command used
   - Scope under mutation
   - Mutation score
   - Surviving mutant triage

9. **Test Smell Hygiene**
   - Report from `test-analyze-test-smells`
   - High-severity smell count in the touched area
   - Medium-severity smells that still affect readability or determinism
   - Concrete remediation or justification if anything remains

## Mutation Gate

Use the minimum shared gate from `test-evaluate-focused-mutation`:

- `Minimum Gate`: mutation score >= 85%

Decision rule:

- `PASS`: >= 85% and surviving mutants are triaged
- `PASS_WITH_WARNINGS`: >= 85% with documented equivalent/deferred mutants or scope widened because the platform could not support a narrower run
- `FAIL`: < 85% or surviving mutants are left unexplained

## When E2E Is Acceptable

E2E characterization is allowed only when one of these is true:

- the behavior can only be safely observed through the full production-facing boundary
- lower-level seams are not yet available and a temporary high-level safety net is the smallest safe move
- system-level orchestration is the behavior being characterized

If e2e is chosen, the report must state why acceptance, unit, or integration characterization was not sufficient yet.

## Combined PBT + Mutation Quality Workflow

The gate validates test quality through a **quality ratchet**: example-based tests, mutation testing, property-based generalization, and a second mutation pass each expose gaps the others miss.

Read `references/quality-ratchet-workflow.md` for the staged workflow, when to apply the full ratchet, per-technique gap coverage, and the mutation-testing phase rule.

## Output Format

```markdown
# Legacy Characterization Quality Gate

- Result: {PASS|PASS_WITH_WARNINGS|FAIL}
- Taxonomy Level: {acceptance|unit|integration|contract|e2e}
- Characterization Technique: {explicit assertions|Golden Master|mixed}
- Target: {module/function/flow}
- Level Selection Rationale: {why this level was chosen}
- Behavior Families Covered: {happy path / edge case / failure mode summary}
- Input Space Strategy: {Cartesian Product|Partitioned Cartesian Product|Representative Sampling}
- Explicit Test Shape Strategy: {Property-Based|Parameterized|Single|N/A}
- Determinism Controls: {time/random/id/order/external I/O handling}
- Coverage: {command + line summary + branch summary if available}
- Normalized Coverage: {normalized JSON summary or report path if available}
- Coverage Environment: {installed/configured state + setup actions if needed}
- Mutation Testing: {tool + command + scope + score}
- Mutation Environment: {installed/configured state + setup actions if needed}
- Test Smell Review: {clean | findings + remediation plan}
- Surviving Mutants: {triage summary}
- Gate Notes: {missing evidence, follow-up, or equivalent-mutant justification}
```

## Success Criteria

- Both strategy skills share one consistent gate for coverage and mutation evidence.
- Focused test and coverage execution are delegated to one reusable platform-aware skill.
- Focused mutation scope is delegated to one reusable platform-aware skill.
- Good line coverage is backed by strong mutation evidence, not reported alone.
- Explicit-assertion tests use the strongest maintainable shape supported by observed behavior instead of defaulting to single examples.
- Approval-test breadth comes from an explicit maintainable input-space strategy, not ad hoc example selection.
- The touched test area remains free of significant test smells.
- E2E usage is justified rather than treated as default characterization.
- Surviving mutants are actionable, not ignored.

## Related Skills

- `test-evaluate-focused-mutation`
- `test-evaluate-targeted-coverage`
- `test-analyze-test-smells`
