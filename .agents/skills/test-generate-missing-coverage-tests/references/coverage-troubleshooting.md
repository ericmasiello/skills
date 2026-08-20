# Coverage Troubleshooting

Read this file when the main skill has already chosen a coverage-addition plan but progress stalls or the remaining gaps need justification.

## Acceptable Residual Gaps

Not every uncovered line deserves a new test.

Common acceptable examples:

- trivial getters or setters
- framework-required overrides used only for plumbing or debugging
- truly unreachable defensive checks
- logging statements
- environment-specific configuration branches that are tested elsewhere

## Diminishing Returns

Stop adding tests when all of the following are true:

- coverage is already strong enough, typically `85%` or better
- critical business logic is covered
- happy path, edge case, and failure mode families are represented
- mutation quality is acceptable
- the remaining gaps are low-value or explicitly justified

## Coverage Not Improving After Adding Tests

Check:

- the new tests actually execute the intended lines
- the tests are running rather than being skipped or filtered out
- test data or doubles allow the uncovered branch to be reached

## Too Many Gaps To Address In One Pass

When starting from very low coverage, narrow the goal:

- focus on P0 gaps first
- consider whether the target really belongs in `test-generate-unit-characterization-tests`
- raise coverage incrementally instead of trying to reach the final threshold in one pass

## Cannot Reach A Code Path

If the target path is blocked by hard dependencies or tight coupling:

- apply seam refactoring first
- introduce dependency injection or port boundaries where justified
- use test doubles only at infrastructure edges

## High Coverage But Low Mutation Score

This is usually not a coverage-count problem. It usually means the tests execute code without proving behavior.

Common follow-up:

- improve assertions rather than adding more superficial tests
- check for Testing Theater patterns
- use `test-refactor-test-smells` to harden the existing tests
