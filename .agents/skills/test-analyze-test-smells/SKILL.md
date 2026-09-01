---
name: test-analyze-test-smells
description: Review test code for anti-patterns and provide specific refactoring recommendations. Use when you say 'test smells', 'clean up tests', 'improve test quality', 'brittle tests', or tests feel noisy, over-mocked, duplicated, or coupled to implementation details.
metadata:
  category: 'Test Quality'
  tags: ['test-smells', 'refactoring', 'test-quality', 'anti-patterns', 'code-review']
  author: DOM-0080
  revision: 4
  status: experimental
---

# Test Smells Review Specialist

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

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

Report the shared fields defined in `test-skills-decision-contract.md`
(`Result`, `Missing Evidence`, `Blocking Issues`, `Next Owner`).

## Test Smell Catalog (19)

| #   | Test Smell                 | Severity | Typical Detection Pattern                          |
| --- | -------------------------- | -------- | -------------------------------------------------- |
| 1   | Logic in Test              | HIGH     | `if/for/while/foreach` in test body                |
| 2   | Mock Overuse               | HIGH     | more than 3 mocks/stubs in one test                |
| 3   | Test Interdependence       | HIGH     | shared mutable/static test state, order dependency |
| 4   | Fragile Test               | HIGH     | exact call choreography assertions on internals, or an identity/reference assertion (`toBe`) that only holds because of the current implementation (e.g. an in-memory store returning the same object) rather than the behavioral contract |
| 5   | Mystery Guest              | MEDIUM   | hidden file/env/global fixture dependencies, or any value the test uses without it being visible in the test's own body — including a module-level constant declared once and reused implicitly across many tests |
| 6   | Eager Test                 | MEDIUM   | many unrelated behaviors in one test               |
| 7   | Assertion Roulette         | MEDIUM   | many assertions with weak naming/context           |
| 8   | Obscure Test               | LOW      | vague names (`test_it_works`, `should_work`)       |
| 9   | Test Code Duplication      | MEDIUM   | repeated setup/assertion logic                     |
| 10  | Conditional Test Logic     | MEDIUM   | branch logic wrapping assertions                   |
| 11  | Hard-Coded Test Data       | LOW      | unnamed literal strings/numbers passed as call arguments, with no constant, builder, or explanation of what the value represents |
| 12  | Testing Private Methods    | HIGH     | reflection/access hacks for internals              |
| 13  | Slow Unit Test             | MEDIUM   | waits, I/O, sleeps in a unit boundary              |
| 14  | Mocking Final/Concrete     | HIGH     | mocking concrete implementation instead of port    |
| 15  | Mocking Value Objects      | HIGH     | mocking immutable/domain value objects             |
| 16  | Implementation Coupling    | CRITICAL | tests depend on implementation details             |
| 17  | Shared Mutable State       | HIGH     | state persists between tests causing flakiness     |
| 18  | Port-Boundary Violations   | CRITICAL | mocking domain/application layers instead of ports |
| 19  | Testing Theater (10 types) | BLOCKER  | tests create false confidence without real checks  |

## Co-Occurring Smell Disambiguation

Some smells share a root cause and commonly appear at the same lines. Report both,
as two separate rows in the Findings table, rather than collapsing one into the
other:

- **Logic in Test (#1) + Conditional Test Logic (#10)**: when a test uses a loop to
  reimplement production's branching and compute an expected value, report **#1**
  for the reimplementation itself (a loop/computation inside the test) and
  separately report **#10** for the `if`/`else` branching that drives it. The same
  lines evidence both; do not report only #1 when the branching is present.
- **Port-Boundary Violations (#18) + Mocking Final/Concrete (#14) + Mock Overuse
  (#2)**: when a test hand-builds a double for a concrete domain/application class
  (no port/interface exists for it) and passes it where a real instance is
  expected, report **#18** for crossing the domain/infrastructure boundary, **#14**
  for doubling a concrete class instead of a port, and **#2** if that double stubs
  more than one method for a single call. These are three angles on the same
  evidence — report all that apply, not just the first one noticed.
- **Fragile Test (#4) + Implementation Coupling (#16)**: an exact call-choreography
  assertion (`toHaveBeenCalledWith`, `toHaveBeenCalledTimes`, argument-matching on a
  mock) is both. Report **#4** because the assertion breaks on any internal refactor,
  and **#16** because it couples the test to *how* the call happens rather than
  *what* the caller observes. Do not report only #4 for this evidence.

## Quick Detection Heuristics

Use heuristics only as a fast triage layer, then confirm manually before reporting smells.

### Characterization Oracle Exception

Characterization tests lock in **observed** behavior, not specified behavior. That is
their purpose: the business rule is unknown, which is why the code is being
characterized. Requiring every expected value to trace to a business rule would
therefore flag correct characterization work as `Hardcoded magic oracle` (#19).

An expected value is traceable when it comes from **either**:

- a business rule or acceptance criterion, **or**
- a recorded execution observation — the exact command run plus the output it
  produced, as `test-generate-unit-characterization-tests` requires before locking
  any value.

Apply it this way:

- Expected value backed by a recorded observation → **not** a finding. Prefer the
  observation over a guess even when it encodes a legacy defect; that is
  characterization working correctly.
- Expected value with **no** stated rule and **no** recorded observation → still a
  finding. The absence of *any* provenance is the smell, not the absence of a
  business rule specifically.
- Unsure which applies → ask for the observation evidence before reporting. A
  missing observation is `Missing Evidence`, not automatically Theater.

This exception governs point 3 of the 4-point check only. Points 1, 2 and 4 apply to
characterization tests unchanged: a characterization test must still fail when the
code it covers is deleted or broken, and must still assert observable behavior.

### Go Assertion Guard Exception

In Go, an assertion commonly uses an `if got != want { t.Errorf(...) }` guard.
Do not report that guard alone as Logic in Test or Conditional Test Logic. Report
those smells only when the control flow computes expected values, transforms
production results, selects test data, retries behavior, or otherwise changes
the test's behavioral oracle. This exception does not apply to loops or
conditionals that recreate production rules.

Read `references/detection-heuristics.md` when you need:

- grep-style triage patterns
- false-positive caveats
- stack-specific smell markers
- guidance on when manual verification overrides heuristic matches

## Critical Test Quality Issues

### Implementation Coupling (Smell #16)

Standard implementation-coupling smell (see catalog table above for pattern/severity).
Includes identity/reference equality (`toBe`) that only holds because of the current
implementation (e.g. an in-memory store handing back the same reference), not the
behavioral contract — not just mocking domain objects or asserting on internals.

**Detection**: check if mocks are used inside the hexagon (domain/application layers)
— VIOLATION; confirm tests validate observable behavior, not implementation, and
would survive an Extract Method refactor.

**Fix**: assert on public behavior only. Mock only infrastructure ports, never
domain objects.

### Shared Mutable State (Smell #17)

Standard test-isolation smell (see catalog table above for pattern/severity).

**Detection**: run tests in random order and in parallel — failures indicate shared
state; look for static fields, shared fixtures, or class-level state.

**Fix**: complete isolation, state reset in teardown, test-scoped (not class-level)
fixtures.

### Port-Boundary Violations (Smell #18)

Standard port-boundary smell (see catalog table above for pattern/severity) — a test
doubles domain entities/value objects, application services, or business logic
instead of only infrastructure adapters.

**Detection**: identify every mock/stub in the test; classify each as Domain,
Application, or Infrastructure; flag any mock of a Domain or Application type.

**Fix**: mock only infrastructure ports (repositories, external services,
adapters); keep domain and application layers real; use Object Mothers for domain
objects.

### Testing Theater Detection (Smell #19)

The single most dangerous test smell — tests create false confidence, so the team
believes code is tested when it is not. Use this 4-point check:

1. Delete the covered production code. If the test still passes, classify it as Theater.
2. Introduce a realistic logic bug. If the test misses it, classify it as Theater.
3. Trace each expected value to a business rule, an acceptance criterion, **or a recorded execution observation** (see the Characterization Oracle Exception below).
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

Golden Master/approval suites are especially vulnerable to Logic in Test (loops
computing the case matrix instead of declaring it), Mystery Guest (fixture files
making approved output hard to trust), Eager Test (one giant matrix mixing
unrelated behaviors), Obscure Test, and Test Code Duplication. The touched area
must be free of high-severity smells before new artifacts are locked in.

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

The Summary must contain one explicit row for every one of the 19 catalogued
smell categories, including categories with count `0`. Never merge categories
under a generic heading: for example, report Mock Overuse, Mocking
Final/Concrete, Mocking Value Objects, and Port-Boundary Violations as separate
rows when the same evidence supports each one.

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

## Decision Contract

- Result: {COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED}
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: {one downstream skill}
```
