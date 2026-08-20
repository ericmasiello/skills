---
name: test-evaluate-skipped-files
description: Evaluate files that are skipped or excluded from testing and coverage to decide whether the skip is legitimate (no meaningful behavior) or masks an underlying testing gap. Use when you say 'evaluate skipped files', 'why is this file excluded from coverage', 'is this skip ok', 'audit coverage exclusions', 'justify test exclusions', or need to separate safe skips from hidden risk.
metadata:
  category: 'Test Evaluation'
  tags: ['coverage', 'skipped-files', 'exclusions', 'test-gaps', 'risk-triage']
  author: TBD
  revision: 1
  status: experimental
---

# Skipped Files Evaluation Specialist

## Purpose

Decide, file by file, whether each file skipped or excluded from testing/coverage is a **legitimate skip** (no meaningful behavior to protect) or a **masked gap** (real behavior that is silently untested).

This skill exists because coverage exclusions and skipped tests hide risk. A skip that is justified for a generated DTO is dangerous for a branch-heavy workflow. Without an explicit rubric, skips accumulate and quietly erode the meaning of every coverage number.

## When to Use

Use this skill when:

- a coverage report or config excludes files and you need to know if that is safe
- files carry exclusion markers (`[ExcludeFromCodeCoverage]`, `/* istanbul ignore */`, coverage `exclude`/`ignore` globs, `.stryker` mutate excludes, `# pragma: no cover`)
- tests exist but are skipped/quarantined (`[Skip]`, `it.skip`, `@pytest.mark.skip`, `t.Skip`)
- a coverage delta drops because files moved out of the measured set
- you are about to trust a coverage or mutation gate and want the exclusion list audited first

## When NOT to Use

Do not use this skill when:

- you just need to run tests and collect coverage evidence (`test-evaluate-targeted-coverage`)
- you need mutation quality on tests that already run (`test-evaluate-focused-mutation`)
- the code is included in coverage but simply undertested — that is a coverage-gap task (`test-generate-missing-coverage-tests`)
- you need blocker/seam analysis rather than a skip verdict (`test-analyze-testability-blockers`)

## Ownership Boundary

- **Owns**: enumerating skipped/excluded files, classifying each skip as justified or a masked gap, and producing a per-file verdict with evidence and a next owner.
- **Does not own**: writing tests, selecting seams, running coverage, or changing production behavior.
- **Hands off to**:
  - `test-analyze-testability-blockers` when a masked-gap file is untestable as written
  - `test-generate-missing-coverage-tests` / `test-generate-unit-characterization-tests` when a masked-gap file is testable and just needs tests
  - `test-evaluate-targeted-coverage` to remeasure after a skip is removed

## Prerequisite Gate

Before evaluating, require:

1. the list of skipped/excluded files, or the config/markers that produce it
2. the mechanism producing the skip (coverage exclude, mutate exclude, ignore comment, skipped test, non-instrumented path)
3. read access to the skipped files themselves

If the skip list cannot be produced, stop and request the coverage/mutation config or the exclusion markers first.

## Required Decision Output

- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list (empty if none)
- `Blocking Issues`: explicit list (empty if none)
- `Next Owner`: one downstream owner skill

## Core Principle

A skip is only legitimate when the file has **no meaningful behavior to protect**. Meaningful behavior means branching logic, calculation, transformation, error handling, or observable side effects. Absence of coverage is acceptable only when there is nothing a test could meaningfully assert.

Default to suspicion: treat every skip as a potential masked gap until the file's contents prove it has no behavior. Never justify a skip from its name, folder, or the fact that it was already excluded.

## Required Inputs

Collect or infer before classifying:

1. The skipped/excluded file paths
2. The skip mechanism per file (see Skip Mechanisms)
3. The file contents (to inspect for behavior)
4. Language/platform
5. Where the skip is declared (config, attribute, inline comment, test annotation)
6. Any stated reason for the skip (commit message, comment, config note)

## Skip Mechanisms

Identify how each file leaves the measured set. Common mechanisms:

- **Coverage config excludes**: `coverage.exclude` / `collectCoverageFrom` negations (Vitest/Jest), `[coverage:run] omit` / `.coveragerc` (pytest), `<Exclude>` / `[ExcludeFromCodeCoverage]` (coverlet/.NET), build tags or `-coverpkg` scoping (Go).
- **Mutation excludes**: Stryker `mutate` negations, mutation-tool ignore lists.
- **Inline ignore markers**: `/* istanbul ignore file|next */`, `# pragma: no cover`, `//coverage:ignore`.
- **Skipped/quarantined tests**: `it.skip`/`describe.skip`, `[Fact(Skip=...)]`, `@pytest.mark.skip`/`xfail`, `t.Skip()`.
- **Never-instrumented paths**: files outside the runner's include globs, generated output folders, or code compiled out by flags.

State the mechanism per file — the mechanism determines who can remove the skip and how.

## Classification Taxonomy

Classify each skipped file into exactly one bucket. Full definitions, examples, and edge cases live in `references/skip-classification-taxonomy.md`.

### Legitimate skip (no meaningful behavior)

- **Generated / vendored code**: emitted by a tool, owned by its generator, reproducible.
- **Pure declarations**: interfaces, abstract signatures, enums, constants, marker types.
- **Plain data carriers**: DTOs/records/POCOs with no logic beyond auto-properties.
- **Framework wiring with no branching**: DI registration, plain `Program`/bootstrap with no decisions.
- **Trivial pass-through**: one-line delegations with no transformation or branching.
- **Test-support / fixtures**: code that only exists to support tests.

### Masked gap (skip hides real behavior)

- **Branching logic**: conditionals, switches, guard clauses, loops with decisions.
- **Calculation / transformation**: mapping with rules, parsing, formatting, math.
- **Error handling**: try/catch, `Result` failure paths, retries, fallbacks.
- **Side effects**: I/O, persistence, messaging, external calls with observable outcomes.
- **Validation**: value-object `Create()` rules, input checks.
- **Quarantined behavior**: a skipped test that used to protect real logic (flaky ≠ safe to skip).

### Needs-info (cannot classify from evidence)

Use only when the file cannot be read or the mechanism is ambiguous. Report it as `Missing Evidence`, do not guess a verdict.

## Decision Rubric

Apply per file, stopping at the first rule that fires:

1. Any branching, calculation, error handling, validation, or observable side effect present → **Masked gap**.
2. File is tool-generated/vendored and reproducible → **Legitimate skip** (recommend confirming the generator is the source of truth).
3. File is purely declarative or a plain data carrier with no logic → **Legitimate skip**.
4. Skip is a disabled test over real logic → **Masked gap** (flakiness is a separate defect, not a skip justification).
5. Cannot read the file or mechanism is ambiguous → **Needs-info**.

Escalate a `COMPLETE_WITH_WARNINGS` result whenever any masked gap sits on a high-value or frequently changed file, or when the skip was applied to make a red gate pass.

## Output Format

```markdown
# Skipped Files Evaluation

- Platform: {language/runtime}
- Skip Source(s): {coverage config | mutate config | inline markers | skipped tests}
- Files Evaluated: {n}
- Legitimate Skips: {n} | Masked Gaps: {n} | Needs-Info: {n}

## Per-File Verdict

| File | Mechanism | Verdict | Evidence | Recommended Action | Next Owner |
| ---- | --------- | ------- | -------- | ------------------ | ---------- |
| {path} | {exclude/ignore/skipped-test} | Legitimate / Masked gap / Needs-info | {behavior seen or absent} | {keep skip / remove skip + test / confirm generator} | {skill or none} |

## Highest-Risk Masked Gaps

1. {file} — {behavior at risk} — {why it matters}

## Result

- Result: {COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED}
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: {one downstream skill}
```

## Success Criteria

- Every skipped/excluded file has exactly one verdict backed by evidence from its contents.
- No skip is justified from file name, folder, or prior exclusion alone.
- Masked gaps are ranked and routed to a concrete next owner.
- Legitimate skips state why the file has no behavior to protect.
- Files that cannot be read are reported as `Needs-Info`, never guessed.

## References

Read `references/skip-classification-taxonomy.md` for:

- full definitions and worked examples per bucket
- platform-specific skip-mechanism detection
- edge cases (partial-logic DTOs, generated-then-edited files, flaky quarantines)
- common false justifications and how to reject them
