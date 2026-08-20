# Workflow Troubleshooting

Use this reference when the planner has already routed the work but one of the stage gates is stuck.

## Problem: Stage 1 Finds Too Many Smells

**Symptoms**: 50+ smells across all severity levels.

**Response**:

1. focus on Blocker and Critical smells only
2. defer Medium and Low smells to a later improvement pass
3. batch by smell type only when that reduces churn rather than hiding risk

## Problem: Stage 2 Refactoring Breaks Tests

**Symptoms**: tests fail after refactoring test code.

**Likely Causes**:

- hidden implementation coupling
- shared mutable state
- refactoring steps that were too large

**Response**:

1. restore the last known-good state
2. reapply the fix in smaller steps
3. isolate shared setup or mutable fixtures before retrying

## Problem: Stage 3 Coverage Stalls Below 80%

**Symptoms**: many tests were added but the coverage gate barely moves.

**Likely Causes**:

- new tests are not executing the uncovered paths
- the remaining gaps are defensive or unreachable branches
- the wrong coverage scope is being measured

**Response**:

1. rerun `test-evaluate-targeted-coverage` and inspect exact uncovered lines
2. review branch-level gaps, not only headline percentages
3. debug the uncovered paths and justify any acceptable residual gap explicitly

## Problem: Stage 4 Mutation Score Stays Below 85%

**Symptoms**: tests pass but realistic mutants survive.

**Likely Causes**:

- assertions are weak or missing
- failure modes are under-tested
- tests execute code without checking outcomes

**Response**:

1. review survivor triage from `test-evaluate-focused-mutation`
2. check for Testing Theater patterns such as zero-assertion tests
3. add assertions that verify behavior, not just execution
4. route back to Stage 2 if smell cleanup is still needed
