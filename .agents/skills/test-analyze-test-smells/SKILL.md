---
name: test-analyze-test-smells
description: Review test code for anti-patterns and provide specific refactoring recommendations. Use when you say 'test smells', 'clean up tests', 'improve test quality', 'brittle tests', or tests feel noisy, over-mocked, duplicated, or coupled to implementation details.
metadata:
  category: 'Test Quality'
  tags: ['test-smells', 'refactoring', 'test-quality', 'anti-patterns', 'code-review']
  author: TBD
  revision: 1
  status: experimental
---

# Test Smells Review Specialist

## Mission

Detect test smell patterns and provide actionable fix recommendations that preserve behavior confidence and reduce brittleness.

## When to Use

Use this skill when you need smell detection and severity classification for existing test code before deciding remediation.

## When NOT to Use

Do not use this skill when:

- you need to apply refactoring changes directly (`test-refactor-test-smells` owns remediation)
- you need legacy production blocker detection (`test-analyze-testability-blockers` owns that)
- you need quality gate pass/fail adjudication (`test-validate-characterization-quality` owns gate decisions)

## Ownership Boundary

- **Owns**: smell detection, severity classification, and minimal remediation recommendation
- **Does not own**: applying refactoring changes or final quality gate adjudication

## Prerequisite Gate

Before reviewing smells, require:

1. test files/scope identified
2. expectation that output is a smell report, not direct remediation

If prerequisites are missing, request them before analysis.

## Required Decision Output

- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list (empty if none)
- `Blocking Issues`: explicit list (empty if none)
- `Next Owner`: one downstream owner skill

## Test Smell Catalog (19)

| #   | Test Smell                 | Severity | Typical Detection Pattern                          |
| --- | -------------------------- | -------- | -------------------------------------------------- |
| 1   | Logic in Test              | HIGH     | `if/for/while/foreach` in test body                |
| 2   | Mock Overuse               | HIGH     | more than 3 mocks/stubs in one test                |
| 3   | Test Interdependence       | HIGH     | shared mutable/static test state, order dependency |
| 4   | Fragile Test               | HIGH     | exact call choreography assertions on internals    |
| 5   | Mystery Guest              | MEDIUM   | hidden file/env/global fixture dependencies        |
| 6   | Eager Test                 | MEDIUM   | many unrelated behaviors in one test               |
| 7   | Assertion Roulette         | MEDIUM   | many assertions with weak naming/context           |
| 8   | Obscure Test               | LOW      | vague names (`test_it_works`, `should_work`)       |
| 9   | Test Code Duplication      | MEDIUM   | repeated setup/assertion logic                     |
| 10  | Conditional Test Logic     | MEDIUM   | branch logic wrapping assertions                   |
| 11  | Hard-Coded Test Data       | LOW      | excessive magic values in tests                    |
| 12  | Testing Private Methods    | HIGH     | reflection/access hacks for internals              |
| 13  | Slow Unit Test             | MEDIUM   | waits, I/O, sleeps in a unit boundary              |
| 14  | Mocking Final/Concrete     | HIGH     | mocking concrete implementation instead of port    |
| 15  | Mocking Value Objects      | HIGH     | mocking immutable/domain value objects             |
| 16  | Implementation Coupling    | CRITICAL | tests depend on implementation details             |
| 17  | Shared Mutable State       | HIGH     | state persists between tests causing flakiness     |
| 18  | Port-Boundary Violations   | CRITICAL | mocking domain/application layers instead of ports |
| 19  | Testing Theater (10 types) | BLOCKER  | tests create false confidence without real checks  |

## Severity Matrix

| Severity     | Smells                                                                                                                                                        | Impact                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **BLOCKER**  | Testing Theater (all 10 sub-types)                                                                                                                            | Catastrophic false confidence - worse than no tests, team believes code is tested when not    |
| **CRITICAL** | Implementation Coupling, Port-Boundary Violations                                                                                                             | Tests prevent safe refactoring, violate architecture boundaries, couple to internal structure |
| **HIGH**     | Logic in Test, Mock Overuse, Test Interdependence, Fragile Test, Shared Mutable State, Testing Private Methods, Mocking Final/Concrete, Mocking Value Objects | False confidence, brittle suites, flakiness, design regressions hidden                        |
| **MEDIUM**   | Mystery Guest, Eager Test, Assertion Roulette, Conditional Test Logic, Duplication, Slow Unit Test                                                            | Low readability, poor maintainability, flakiness risk                                         |
| **LOW**      | Obscure Test, Hard-Coded Test Data                                                                                                                            | Naming/readability debt, weaker documentation value                                           |

## Quick Detection Heuristics

Use heuristics only as a fast triage layer, then confirm manually before reporting smells.

Read `references/detection-heuristics.md` when you need:

- grep-style triage patterns
- false-positive caveats
- stack-specific smell markers
- guidance on when manual verification overrides heuristic matches

## Critical Test Quality Issues

### Implementation Coupling (Smell #16)

**Pattern**: Tests depend on implementation details, preventing safe refactoring.

**Examples**:

- Mocking domain objects or application services (violates port-boundary policy)
- Asserting on private methods/fields/internal state
- Tests break on refactoring despite behavior remaining unchanged
- Tests duplicate production logic to verify correctness

**Detection**:

- Check if mocks are used inside hexagon (domain/application layers) - VIOLATION
- Verify tests call only public interfaces
- Confirm tests validate observable behavior, not implementation
- Check if Extract Method refactoring would break tests

**Severity**: CRITICAL

**Fix**: Replace implementation assertions with behavior assertions on public interfaces. Mock only infrastructure ports, never domain objects.

### Shared Mutable State (Smell #17)

**Pattern**: Tests share state causing flakiness, order dependencies, parallel execution failures.

**Examples**:

- Database state not reset between tests
- Static variables mutated across tests
- File system state persists between tests
- In-memory caches shared across test methods

**Detection**:

- Run tests in random order - do they still pass?
- Run tests in parallel - do they fail?
- Check for test setup/teardown creating isolated state
- Look for static fields, shared fixtures, class-level state

**Severity**: HIGH

**Fix**: Ensure complete test isolation. Reset all state in teardown. Use test-scoped fixtures, not class-level. Avoid static mutable state.

### Port-Boundary Violations (Smell #18)

**Pattern**: Test doubles policy violates port-boundary rules defined in hexagonal architecture.

**Examples**:

- Mocking domain entities, value objects, or aggregates
- Mocking application services (use cases)
- Stubbing business logic instead of infrastructure adapters
- Test doubles inside the hexagon boundary

**Detection**:

- Identify all mocks/stubs in test
- Classify each as: Domain, Application, or Infrastructure
- Flag any mocks of Domain or Application layers

**Severity**: HIGH to CRITICAL

**Fix**: Mock only infrastructure ports (repositories, external services, adapters). Keep domain and application layers real. Use Object Mothers for domain objects.

### Testing Theater Detection (Smell #19)

**Pattern**: Tests create illusion of safety without verifying real behavior. This is the **single most dangerous test quality issue** - undetected Testing Theater causes catastrophic production failures because the team believes code is tested when it is not.

Use this condensed review check in the main skill:

1. Delete the covered production code. If the test still passes, classify it as Theater.
2. Introduce a realistic logic bug. If the test misses it, classify it as Theater.
3. Trace each expected value to a business rule or acceptance criterion.
4. Prefer observable behavior assertions over existence checks, type checks, or internal call choreography.

Read `references/testing-theater-review-guide.md` for the full sub-pattern catalog, examples, and severity guidance.

## Review Method

For each detected test smell:

1. Name the smell category
2. Provide direct evidence (file + test + line/symptom)
3. Explain risk to determinism, readability, or behavior confidence
4. Provide one minimal fix recommendation

## Fix Guidance by Smell

| Smell                    | Minimal Fix Recommendation                                                        |
| ------------------------ | --------------------------------------------------------------------------------- |
| Logic in Test            | Move decision logic into parameterized cases or test data setup                   |
| Mock Overuse             | Replace infra mocks with fakes where possible; split test by behavior             |
| Test Interdependence     | Remove shared mutable state and isolate fixtures per test                         |
| Fragile Test             | Assert observable outcomes, not internal call choreography                        |
| Mystery Guest            | Inline data or use explicit fixture builders/mothers                              |
| Duplication              | Extract helper or use test builder/object mother                                  |
| Slow Unit Test           | Move to integration scope or replace real I/O with proper doubles                 |
| Mocking Domain Objects   | Keep entities/value objects real; mock only ports/adapters                        |
| Implementation Coupling  | Assert on public behavior only; never assert on private methods or internal state |
| Shared Mutable State     | Ensure complete isolation - reset all state in teardown, use test-scoped fixtures |
| Port-Boundary Violations | Mock only infrastructure ports; keep domain and application layers real           |
| Testing Theater          | Apply 4-point checklist: delete code, inject bug, trace values, verify behavior   |

## Approval Test Focus

When reviewing Golden Master or approval tests, treat these as non-negotiable:

- input matrices must be explicit data, not hidden in loops with branching logic
- Cartesian products are acceptable only when the resulting case set stays readable and behaviorally meaningful
- received/approved artifacts must come from deterministic execution with visible normalization rules
- the touched approval-test area should be free of high-severity smells before new artifacts are locked in

Approval suites are especially vulnerable to these smells:

- `Logic in Test`: loops and conditionals that compute expected coverage shape instead of declaring cases
- `Mystery Guest`: fixture files, globals, or environment inputs that make approved output hard to trust
- `Eager Test`: giant matrix tests that mix unrelated behavior families into one approval blob
- `Obscure Test`: case names that do not identify which input combination failed
- `Test Code Duplication`: repeated case construction that should be moved into builders, mothers, or case factories

## Examples

Read `references/smell-review-examples.md` for worked examples covering:

- logic in test
- over-mocking
- duplication and object-mother extraction
- fragile interaction verification

Use the examples only after you have already classified the smell and chosen the minimal remediation path.

## Related Skills

- `test-refactor-test-smells` for applying remediation after detection
- `test-validate-characterization-quality` for deterministic quality-gate decisions
- `test-generate-object-mother-fixtures` for fixture/helper extraction when removing duplication

## Output Format

```markdown
# Test Smell Report

## Summary

| Smell         | Count | Severity |
| ------------- | ----- | -------- |
| Logic in Test | {n}   | HIGH     |
| Mock Overuse  | {n}   | HIGH     |

## Findings

### {Smell Name} ({count} occurrences)

| File   | Test        | Severity | Evidence       | Owner Skill  |
| ------ | ----------- | -------- | -------------- | ------------ |
| {path} | {test name} | {level}  | {code symptom} | {next owner} |

**Fix Recommendation:** {minimal refactor}

## Action Items

1. **High Priority** — {high severity actions}
2. **Medium Priority** — {medium severity actions}
3. **Low Priority** — {cleanup actions}
```
