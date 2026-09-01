# Mutation Testing Background

Read this file when the main skill has already selected a focused mutation scope and you need interpretation guidance rather than execution rules.

Mutation testing introduces artificial faults and checks whether the test suite catches them. This is stronger than raw coverage because it asks whether tests verify behavior instead of merely executing code.

## Mutation Score Targets

| Score Range | Quality Assessment           | Action                                  |
| ----------- | ---------------------------- | --------------------------------------- |
| < 60%       | Weak suite, significant gaps | Major test improvements required        |
| 60-80%      | Moderate quality, some gaps  | Add tests for critical paths            |
| 80-<85%     | Strong quality, minor gaps   | Below the gate; classify every survivor and close the test gaps |
| >=85%       | Excellent quality            | Maintain this level for new code        |

The table above describes industry score bands. It is not a gate. The gate is
defined once, in [`../../test-quality-policy.md`](../../test-quality-policy.md),
and only an explicit project policy may set a value other than the documented
default. This reference cannot lower it.

Default interpretation for this skill:

- `85%` is the minimum focused-mutation gate unless a project policy sets another
- a score below the gate is a FAIL, whatever the band above calls it
- every survivor must be classified as `test gap`, `equivalent mutant`, or
  `deferred`; equivalent mutants exist, but "probably equivalent" is not a
  classification
- the gate is adjudicated by
  `scripts/evaluate-mutation-report.mjs`, not by reading this table

## Common Mutation Operators

Use survivor clusters to infer what kind of tests are missing.

| Operator Type         | Example Mutation                      | What It Often Reveals              |
| --------------------- | ------------------------------------- | ---------------------------------- |
| Relational Operators  | `==` to `!=`, `<` to `>=`             | boundary-condition tests missing   |
| Arithmetic Operators  | `+` to `-`, `*` to `/`                | calculation verification gaps      |
| Logical Operators     | remove negation or flip boolean logic | incomplete boolean-path tests      |
| Statement Deletion    | remove a method call or return early  | side effects not verified          |
| Constant Replacement  | `0` to `1`, `true` to `false`         | defaults and edge cases not tested |
| Loop Boundary Changes | `< n` to `<= n`                       | off-by-one gaps                    |

When one operator family dominates the survivors, treat that as a signal for systematic weakness rather than isolated test failures.

## Incremental Mutation Strategy

Mutation testing is expensive, so widen only when the focused result is no longer meaningful.

- pull requests: changed code only
- normal CI: recently modified modules or bounded areas
- nightly or scheduled runs: broad or full scans
- reporting and trend analysis: offline or periodic, not in the main focused workflow

This skill is intentionally optimized for PR-level focused mutation, not whole-repo mutation.
