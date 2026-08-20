---
name: test-generate-missing-coverage-tests
description: Add tests to partially tested code with targeted gap analysis. Use when you say 'add missing tests', 'improve coverage', 'fill test gaps', or need to systematically add tests to code that already has some tests but needs more.
metadata:
  category: 'Test Coverage'
  tags: ['coverage', 'test-addition', 'gap-analysis', 'targeted-testing']
  author: TBD
  revision: 1
  status: experimental
---

# Missing Test Coverage Specialist

## Purpose

Guide adding tests to **partially tested** code by identifying specific coverage gaps and prioritizing test addition.
This skill exists because partially tested code requires a different approach than completely untested legacy code:

- Existing tests reveal current testing style and patterns
- Coverage reports show specific gaps, not general absence
- Must avoid duplicating existing test coverage
- Should maintain consistency with existing test suite

## Ownership Boundary

- **Owns**: adding tests for partially tested code and ranking concrete behavior gaps at the current outside-in layer
- **Does not own**: first-time legacy characterization strategy for 0% coverage, nor the choice of which layer to test at
- **Hands off to**:
  - `test-generate-acceptance-tests`, `test-generate-integration-tests`, `test-generate-unit-characterization-tests`, or `test-generate-golden-master-tests` to write the actual tests once a gap is assigned to a layer
  - `test-refactor-test-smells` when coverage is high but assertion quality is weak

## When to Use

Use this skill when:

- Code has **some** tests but specific behaviors remain unprotected
- A coverage report reveals uncovered lines/branches that point to a missing behavior
- You need to fill behavior gaps systematically rather than randomly

## Anti-Goal: Do Not Chase Coverage

Coverage is a **lagging indicator**, never the target. Use uncovered lines/branches only as a pointer to a missing _behavior_, then assign that behavior to the correct outside-in layer (Acceptance → Unit → Integration) and hand off to that layer's generator. Never add a test whose only justification is raising a percentage; if an uncovered line maps to no observable behavior, it may be a legitimate skip (`test-evaluate-skipped-files`).

## When NOT to Use

Do NOT use this skill when:

- Code has **zero** tests (0% coverage) → Use `test-generate-unit-characterization-tests` or `test-generate-golden-master-tests` instead
- Code has excellent coverage (80%+) but low mutation score → Use `test-refactor-test-smells` to improve assertions
- Adding tests to brand new code → Use normal TDD workflow

## Trigger Guards

- If measured coverage is **0%**, stop and hand off to characterization generation skills.
- If measured coverage is **80%+** and mutation is weak, stop and hand off to `test-refactor-test-smells`.
- Use this skill only when the target is **partially tested** and a gap-ranked add-tests pass is needed.

## Prerequisite Gate

Before gap expansion, require:

1. baseline coverage measurement
2. target files or flows identified

If prerequisites are missing, return `BLOCKED` and request them.

## Required Decision Output

- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list (empty if none)
- `Blocking Issues`: explicit list (empty if none)
- `Next Owner`: one downstream owner skill

## The Coverage Gap Analysis Process

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: MEASURE BASELINE                                    │
│ • Run coverage on existing tests                            │
│ • Identify current coverage % (line + branch)               │
│ • Export detailed coverage report (HTML/JSON)               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: ANALYZE GAPS                                        │
│ • Identify uncovered lines/branches                         │
│ • Group by risk/criticality                                 │
│ • Check for behavior families (happy/edge/failure)          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: PRIORITIZE GAPS                                     │
│ • Critical business logic first                             │
│ • Edge cases and error handling second                      │
│ • Happy paths last (often already covered)                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: ADD TARGETED TESTS                                  │
│ • Match existing test style/framework                       │
│ • One gap at a time with coverage verification              │
│ • Apply test shape preference (PBT > Param > Single)        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: VALIDATE QUALITY                                    │
│ • Re-run coverage, verify improvement                       │
│ • Run mutation testing on new tests                         │
│ • Check no new test smells introduced                       │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Measure Baseline Coverage

### Run Coverage Analysis

Use `test-evaluate-targeted-coverage` to generate current coverage report.

**Required Information**:

1. Current line coverage %
2. Current branch coverage %
3. Uncovered line numbers
4. Uncovered branches (if available)

### Coverage Report Formats

Most tools support HTML or JSON output for detailed analysis.

Read `references/coverage-commands-by-platform.md` when you need concrete coverage commands for Python, TypeScript or JavaScript, C#, or Go.

### Interpret Coverage Numbers

| Coverage Level | Status           | Action                                     |
| -------------- | ---------------- | ------------------------------------------ |
| 0-20%          | Critical gaps    | Major test addition needed                 |
| 21-50%         | Significant gaps | Systematic test addition required          |
| 51-79%         | Moderate gaps    | Targeted test addition (this skill)        |
| 80-89%         | Minor gaps       | Selective test addition for critical paths |
| 90%+           | Excellent        | Focus on mutation score, not more coverage |

## Step 2: Analyze Coverage Gaps

### Gap Classification

Classify each uncovered line/branch by type:

1. **Critical Business Logic**
   - Calculations (pricing, discounts, taxes)
   - Validation rules (business rules, constraints)
   - State transitions (order status, workflow states)
   - Authorization decisions
   - **Priority**: HIGH

2. **Edge Cases**
   - Boundary values (min/max, empty/null)
   - Rare conditions (leap years, timezone handling)
   - Corner cases (division by zero, overflow)
   - **Priority**: HIGH

3. **Error Handling**
   - Exception handling (`catch` blocks)
   - Error recovery logic
   - Validation failures
   - Timeout handling
   - **Priority**: MEDIUM-HIGH

4. **Happy Path**
   - Normal successful execution
   - Most common code paths
   - **Priority**: MEDIUM (often already covered)

5. **Defensive Code**
   - "This should never happen" checks
   - Framework-required overrides
   - Logging/debugging code
   - **Priority**: LOW (may be acceptable gaps)

### Gap Analysis Example

Convert uncovered lines into a short classification list, then rank them by business criticality and behavior family.

Read `references/coverage-gap-patterns.md` for representative examples of this classification step.

### Behavior Family Analysis

Check if gaps span behavior families:

| Behavior Family | Definition                   | Gap Example                             |
| --------------- | ---------------------------- | --------------------------------------- |
| Happy Path      | Normal successful execution  | User logs in with valid credentials     |
| Edge Case       | Boundary/unusual valid input | Empty shopping cart, very long username |
| Failure Mode    | Expected errors/exceptions   | Invalid password, network timeout       |

**Coverage Matrix**:

If one family is missing across multiple code areas, treat that as a systematic priority rather than a local gap.

## Step 3: Prioritize Test Addition

Prioritize by **outermost incomplete layer first** (Acceptance → Unit → Integration): a gap in a use-case behavior is fixed with an acceptance test before a domain-internal unit gap, which is fixed before an adapter gap. Within a layer, order by the priority matrix below.

### Priority Matrix

| Risk   | Criticality | Priority | Action                      |
| ------ | ----------- | -------- | --------------------------- |
| High   | High        | P0       | Add tests immediately       |
| High   | Medium      | P1       | Add tests this iteration    |
| Medium | High        | P1       | Add tests this iteration    |
| Medium | Medium      | P2       | Add tests when time permits |
| Low    | Any         | P3       | Defer or skip               |

**Risk Factors**:

- Complexity (cyclomatic complexity >10)
- Change frequency (modified in last 3 months)
- Bug history (bugs found in this area)
- Business impact (payment, security, data loss)

**Criticality Factors**:

- Business logic vs infrastructure code
- User-facing vs internal code
- Security-sensitive vs non-sensitive
- Data-modifying vs read-only

### Prioritization Example

Given the gap classification from Step 2:

```
P0 - Lines 20-21: Discount edge case (Business logic + Edge case)
P0 - Lines 12-13: Negative total validation (Business logic + Error handling)
P1 - Lines 50-51: Payment error handling (Critical flow + Error handling)
```

**Work Order**:

1. Add test for discount edge case
2. Add test for negative total validation
3. Add test for payment error handling

## Step 4: Add Targeted Tests

### Match Existing Test Style

Before adding tests, analyze existing suite:

**Checklist**:

- [ ] What test framework? (pytest, Jest, JUnit, NUnit, etc.)
- [ ] What assertion style? (assert, expect, should)
- [ ] What naming convention? (test*\*, should*\*, it('...'))
- [ ] What test organization? (test classes, describe blocks, flat files)
- [ ] What test doubles? (mocks, stubs, fakes, spies)
- [ ] What fixtures/setup? (@pytest.fixture, beforeEach, @Before)

Read `references/matching-existing-test-style.md` for a worked example of style analysis and how to mirror the existing suite when adding new tests.

### Test Addition Workflow

For each prioritized gap:

1. **Write failing test**
   - Follow existing test pattern
   - Name test clearly: `test_{gap_being_covered}`
   - Use characterization approach: run code, observe behavior, assert it

2. **Verify test covers gap**
   - Run test (should pass if behavior exists)
   - Run coverage on this test only
   - Confirm the target line or branch is now covered

3. **Check baseline coverage improved**
   - Re-run full coverage
   - Verify percentage increased
   - Confirm specific line/branch now covered

4. **Commit and move to next gap**
   - One gap per commit (makes reviews easier)
   - Commit message: "test: cover {gap description}"

### Test Shape Preference

Apply the same preference as unit characterization:

1. **Property-Based**: when a stable invariant exists
2. **Parameterized**: when multiple examples share structure
3. **Single Test**: when the gap is narrow and specific

Read `references/test-shape-preference.md` for worked examples and selection guidance.

### Avoid Duplication

Before adding a test, confirm the gap is not already covered by:

1. an existing test with a different name but the same behavioral assertion
2. an integration test that already protects the critical path
3. a parameterized table that already includes the candidate case

Read `references/test-shape-preference.md` for duplication examples and when a separate unit test still adds value.

## Step 5: Validate Coverage Improvement

### Measure Coverage Improvement

After adding tests, capture before/after coverage, newly covered lines or branches, and any remaining justified gaps.

Read `references/coverage-validation-examples.md` for a worked report example and concrete validation commands.

### Run Mutation Testing

Validate new tests with `test-evaluate-focused-mutation` and focus on the code or test files changed in this pass.

**Success Criteria**:

- Mutation score ≥85% on newly covered code
- New tests kill realistic mutants
- No Testing Theater patterns (Zero-Assertion, Mock-Dominated, etc.)

### Check for Test Smells

Run `test-analyze-test-smells` on the new or modified tests only.

**Red Flags**:

- New tests have Testing Theater smells
- Implementation Coupling introduced
- Duplicate test code instead of using fixtures

## Common Patterns and Solutions

Read `references/coverage-gap-patterns.md` for worked examples of common coverage gaps, including error handling, edge cases, conditional branches, early returns, and nested-condition misses.

## When to Stop Adding Tests

Stop when all critical logic and behavior families are covered, mutation quality is acceptable, and the remaining gaps are low-value or justified.

Read `references/coverage-troubleshooting.md` for:

- acceptable residual gaps
- diminishing-returns criteria
- low-improvement troubleshooting
- unreachable-path guidance
- high-coverage but low-mutation follow-up

## Output Format

```markdown
# Missing Coverage Test Addition Report

## Baseline Measurement

- Line Coverage: {before}%
- Branch Coverage: {before}%
- Coverage Tool: {pytest-cov|jest|jacoco|etc}
- Measurement Date: {date}

## Gap Analysis

Total Gaps: {count}

- Critical Business Logic: {count}
- Edge Cases: {count}
- Error Handling: {count}
- Happy Path: {count}
- Defensive Code: {count}

## Gap Prioritization

P0 (Immediate): {list}
P1 (This Iteration): {list}
P2 (When Time Permits): {list}
P3 (Acceptable Gap): {list}

## Next Owner Decision

- Continue With: {this skill | test-refactor-test-smells | test-generate-unit-characterization-tests | test-generate-golden-master-tests}
- Reason: {coverage + mutation + testability rationale}

## Tests Added

{For each test:}

- Test Name: {name}
- Lines Covered: {line numbers}
- Branches Covered: {branch descriptions}
- Test Shape: {Property-Based|Parameterized|Single}
- Behavior Family: {Happy Path|Edge Case|Failure Mode}

## Coverage Improvement

- Line Coverage: {before}% → {after}% ({delta}%)
- Branch Coverage: {before}% → {after}% ({delta}%)
- Uncovered Lines: {before} → {after} ({delta})

## Quality Validation

- Mutation Score: {score}% (on new tests)
- Test Smells: {clean | issues found}
- All P0 Gaps Covered: {YES|NO}
- All P1 Gaps Covered: {YES|NO}

## Remaining Gaps

{For each remaining gap:}

- Lines: {line numbers}
- Type: {defensive|logging|framework|etc}
- Priority: {P2|P3}
- Justification: {why acceptable}
```

## Success Criteria

- Coverage improved by ≥10% or reached 80%+ threshold
- All P0 and P1 gaps covered
- New tests match existing test style
- No test duplication
- Mutation score ≥85% on new tests
- No test smells introduced
- Remaining gaps documented and justified

## Related Skills

- `test-evaluate-targeted-coverage` (measure coverage)
- `test-generate-unit-characterization-tests` (for 0% coverage scenarios)
- `test-evaluate-focused-mutation` (validate new tests)
- `test-analyze-test-smells` (check test quality)
- `test-plan-quality-workflow` (overall workflow)

## Troubleshooting

Read `references/coverage-troubleshooting.md` for the full troubleshooting matrix covering:

- poor coverage improvement after adding tests
- too many gaps to address in one pass
- tightly coupled or unreachable code paths
- high coverage but weak assertions or low mutation quality
