---
name: test-refactor-test-smells
description: Step-by-step refactoring guidance for fixing test quality issues. Use when you say 'fix test smells', 'refactor tests', 'improve test quality', or need to systematically eliminate test anti-patterns (Testing Theater, Implementation Coupling, Port-Boundary Violations, etc.).
metadata:
  category: 'Test Refactoring'
  tags: ['refactoring', 'test-smells', 'test-quality', 'testing-theater']
  author: TBD
  revision: 1
  status: experimental
---

# Test Smell Refactoring Specialist

## Purpose

Provide step-by-step refactoring procedures for each of the 19 test smells detected by `test-analyze-test-smells`.

This skill exists because detecting smells is not enough—developers need concrete, actionable steps to fix them without breaking existing functionality.

## When to Use

Use this skill after smells are already detected and classified, and you are ready to apply fixes in test code.

Use when:

- Blocker or Critical smells were reported by `test-analyze-test-smells`
- A team asks for concrete remediation steps, not additional diagnosis
- Mutation evidence suggests tests are still weak even with acceptable coverage

## When NOT to Use

Do not use this skill when:

- You still need smell detection (`test-analyze-test-smells` owns detection)
- Code is untestable due to legacy production blockers (`test-analyze-testability-blockers` owns that)
- You are planning seam changes in production code (`test-plan-seam-refactoring` owns seam planning)

## Ownership Boundary

- **Owns**: refactoring existing test code to remove smells
- **Does not own**: smell detection, legacy blocker discovery, seam design, or quality gate decisions
- **Consumes input from**: `test-analyze-test-smells`
- **Hands off to**: `test-evaluate-focused-mutation` and `test-validate-characterization-quality`

## Prerequisite Gate

Before remediation, require:

1. smell report with severity classification
2. target test files identified

If prerequisites are missing, stop and request them.

## Required Decision Output

- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list (empty if none)
- `Blocking Issues`: explicit list (empty if none)
- `Next Owner`: one downstream owner skill

## Severity-Driven Refactoring Index

Use the main skill to decide what to fix first and how to work safely. Read the references only after the smell has been classified.

### BLOCKER: Testing Theater

Treat these as immediate blockers because they create false confidence rather than protection.

Common signatures:

- zero assertions
- tautological or type-only assertions
- mocked returns proving the result instead of production logic
- circular expected-value calculations
- swallowed exceptions or always-green control flow
- fully mocked systems under test

Main remediation pattern:

1. identify the observable behavior the test is supposed to protect
2. replace indirect or meaningless checks with behavior assertions
3. make the test fail against a realistic bug before trusting it

Read `references/testing-theater-refactoring.md` for the full sub-pattern catalog and examples.

### CRITICAL: Implementation Coupling And Port-Boundary Violations

These smells make tests brittle and block safe refactoring.

Common signatures:

- spying on the system under test
- assertions about internal call order or private structure
- mocking domain objects, application services, or business logic instead of infrastructure ports

Main remediation pattern:

1. move assertions to observable behavior
2. keep domain and application logic real
3. place doubles only at infrastructure boundaries

Read `references/smell-refactoring-catalog.md` for detailed remediation patterns.

### HIGH And MEDIUM: Flow, Isolation, Duplication, And Readability

These smells usually degrade maintainability, determinism, or diagnostics rather than completely invalidating the suite.

Common signatures:

- conditional logic or loops in tests
- shared mutable state or order dependence
- duplicated setup
- slow or over-broad unit tests
- eager tests that verify too many behaviors at once

Main remediation pattern:

1. isolate one behavior per test or parameterized family
2. remove shared state and make setup local or fixture-based
3. extract builders, mothers, or helpers instead of copy-paste setup
4. keep assertions focused and diagnostic

Read `references/smell-refactoring-catalog.md` and `references/refactoring-examples.md` for detailed examples.

**Success Criterion**: each refactored test verifies one clear behavior with explicit assertions.

### Remaining High/Medium/Low Smells

These map directly to the detection catalog in `test-analyze-test-smells`. Apply the smallest behavior-preserving fix:

- **Mock Overuse**: replace infrastructure mocks with fakes; split the test by behavior
- **Test Interdependence**: remove shared/static state so tests pass in any order
- **Fragile Test**: assert observable outcomes instead of internal call choreography
- **Mystery Guest**: inline the data or use an explicit fixture builder/mother
- **Assertion Roulette**: name assertions or split into focused cases so failures are diagnosable
- **Obscure Test**: rename to behavior-first names that explain intent without reading the body
- **Hard-Coded Test Data**: extract meaningful named constants or builder defaults
- **Testing Private Methods**: test through the public interface; drop reflection/access hacks
- **Mocking Final/Concrete**: mock the port/interface, not the concrete implementation
- **Mocking Value Objects**: keep immutable domain value objects real; never mock them

Use `references/smell-refactoring-catalog.md` as canonical remediation guidance.

---

## Refactoring Workflow

### Step-by-Step Process

1. **Load Inputs**
   - Take the smell report from `test-analyze-test-smells`
   - Group findings by severity and file

2. **Set Refactoring Order**
   - BLOCKER first
   - CRITICAL second
   - HIGH third
   - MEDIUM and LOW last

3. **Refactor One Smell Cluster**
   - Pick one smell in one file or tightly related file set
   - Apply the smallest behavior-preserving test refactor
   - Keep production code unchanged unless absolutely required for test compilation

4. **Verify Immediately**
   - Run the narrowest relevant tests
   - Confirm no new failures or flaky behavior

5. **Record Evidence**
   - Capture what changed, why, and what remains
   - Mark unresolved smells with explicit rationale

6. **Validate Strength**
   - Run focused mutation via `test-evaluate-focused-mutation`
   - If kill rate regresses, tighten assertions before moving on

## Safety Rules

- Do not rewrite entire test suites when a local fix is sufficient.
- Do not convert behavior assertions into interaction choreography.
- Do not replace real domain behavior with mocks to make tests pass.
- Do not claim completion without test execution evidence.
- Keep each refactoring batch small enough to isolate regressions quickly.

## Output Format

```markdown
# Test Smell Refactoring Report

## Smell Fixed: {Smell Name}

- Severity: {BLOCKER|CRITICAL|HIGH|MEDIUM|LOW}
- Occurrences Fixed: {count}
- Files Modified: {list}

## Changes Made

### Before

{code snippet showing smell}

### After

{code snippet after refactoring}

## Verification

- Tests Still Pass: {YES|NO}
- New Test Failures: {count, descriptions}
- Mutation Score: {before}% → {after}%

## Remaining Work

- Blocker Smells: {count}
- Critical Smells: {count}
- Total Smells Remaining: {count}
```

## Success Criteria

- All Blocker smells eliminated
- All Critical smells eliminated
- Tests pass after refactoring
- Mutation score maintained or improved
- No new smells introduced

## Related Skills

- `test-analyze-test-smells` (detection)
- `test-plan-quality-workflow` (overall workflow)
- `test-evaluate-focused-mutation` (validation)
- `test-validate-characterization-quality` (final gate)
