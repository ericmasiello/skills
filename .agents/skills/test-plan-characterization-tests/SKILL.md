---
name: test-plan-characterization-tests
description: Plan characterization tests for legacy code to pin existing behavior before refactoring. Use when you say 'plan tests', 'add tests to legacy code', 'characterization test plan', 'test strategy', or need guidance on which test types to write and in what order for untested code.
metadata:
  category: 'Test Planning'
  tags: ['test-planning', 'characterization', 'legacy-code', 'test-strategy']
  author: DOM-0080
  revision: 3
  status: experimental
---

# Stage 3 Legacy Characterization Planning Primer

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

## Purpose

Plan characterization tests for seam-enabled legacy code so current behavior can be locked before refactoring.

This is **Stage 3** planning in the legacy workflow: produce the characterization strategy after Stage 2 seams are in place.

These characterization techniques apply to **all service types**. Service classification affects the target architecture after characterization tests exist, but not whether the characterization approach is valid.

## Stage Focus

Use this skill when code already exists, Stage 2 readiness is confirmed, and you need a safe regression baseline before changing behavior.
Readiness means either seams are verified **or** the target is already directly
constructible, controllable, and observable in tests, so no seam is required.
Seam analysis and seam choice are upstream concerns; if seams are still being debated, return to `test-plan-seam-refactoring` before planning Stage 3 tests.

Characterization is not a separate test taxonomy: still plan tests as acceptance, unit, integration, or contract tests based on boundary and I/O.

## When to Use

Use this skill when:

- seams are verified, or no seam is required, and you need a Stage 3 characterization strategy
- you must choose technique/scope/order before implementation
- you need one consolidated plan and handoff to implementation skills

## Prerequisite Gate

Before producing a plan, require:

1. Stage 2 readiness confirmed: seams verified **or** no seam required because
   the target is directly constructible, controllable, and observable
2. target behavior and test scope identified

If prerequisites are missing, stop and request them before planning.

Before choosing a strategy, check the target repo's existing test suite structure and
conventions so the plan hands off to implementation skills with a style they can match.

## Required Decision Output

Report the shared fields defined in `test-skills-decision-contract.md`
(`Result`, `Missing Evidence`, `Blocking Issues`). `Next Owner` here is one
implementation skill.

## Ownership Boundary

- **Owns**: Stage 3 characterization planning (strategy, scope, sequencing, and evidence plan)
- **Does not own**: writing test code or approval artifacts
- **Hands off to**:
  - `test-generate-acceptance-tests` for outermost use-case behavior tests that mock only the external world
  - `test-generate-integration-tests` for driven-adapter tests against real infrastructure
  - `test-generate-unit-characterization-tests` for explicit-assertion implementation at unit scope
  - `test-generate-golden-master-tests` for approval/snapshot implementation

## Focused Rule Sources

Use these focused skills for the detailed rules:

- `test-generate-acceptance-tests` for outside-in acceptance tests at the use-case→domain boundary (mock only the external world)
- `test-generate-integration-tests` for adapter↔external-system tests against real infrastructure
- `test-generate-golden-master-tests` for Golden Master / approval characterization of complex outputs
- `test-generate-unit-characterization-tests` for explicit observed-behavior assertions on outputs and side effects
- `test-validate-characterization-quality` for shared determinism, coverage, and mutation gates across all characterization levels
- `test-evaluate-targeted-coverage` for platform-aware test execution, coverage readiness, and focused coverage commands
- `test-evaluate-focused-mutation` for platform-aware mutation scope, config, and 85% minimum quality gate
- `test-generate-object-mother-fixtures` for maintainable test data setup

## Core Planning Questions

1. Which seams are already verified and make the target testable?
2. Which behavior needs Golden Master, and which needs explicit unit characterization?
3. Which sources of non-determinism still need control or normalization?
4. What is the smallest maintainable **Test Data Plan**: `Object Mother`, `Fluent Builder`, or `Fixture File`?
5. What is the next test slice in outside-in order (Acceptance → Unit → Integration), starting at the outermost layer with unprotected behavior?
6. What is the narrowest production scope that should be mutated for the tests being added?
7. Which platform-specific test runner and coverage tool should be used?
8. Are the test runner and coverage tool already installed and minimally configured in the environment?
9. Which platform-specific mutation tool and config shape should be used?
10. Is that mutation tool already installed and minimally configured in the environment?
11. How will shared quality evidence be produced for coverage and mutation effectiveness?
12. If approval tests are chosen, is the target input space finite enough to justify a Cartesian product of meaningful dimensions?
13. How will the touched test area be checked and cleaned for test smells before approval artifacts are locked?
14. For explicit unit characterization, can the observed behavior be expressed as a property-based test, or at least as a parameterized case table, before falling back to single-case tests?

## Core Rules

- Never plan characterization execution before Stage 2 readiness is confirmed: seams verified, or no seam required for directly constructible, controllable, and observable code.
- Capture **actual behavior**, not desired behavior.
- Let failing observations reveal actual behavior before locking assertions.
- Use Golden Master for broad or complex outputs; use unit characterization for explicit outputs and boundary side effects.
- For explicit unit characterization, prefer property-based tests when a stable observed invariant exists; otherwise prefer parameterized tests; fall back to single-case tests last.
- For approval tests over bounded input domains, prefer a Cartesian or partitioned Cartesian input matrix to maximize fast behavioral coverage.
- Reject Cartesian expansion when the domain is unbounded, unreadable, or mostly redundant; use explicit partitions instead.
- Control or normalize time, random values, GUIDs/UUIDs, ordering, and external calls before locking assertions.
- Prefer the outside-in add-missing-tests order when choosing the next slice: **Acceptance → Unit → Integration** (widest behavioral net first, then narrow inward). Contract tests cover the HTTP transport layer when the app is HTTP-only.
- Allow e2e characterization only when no cheaper stable boundary can safely lock the required behavior yet.
- Run tests and coverage through `test-evaluate-targeted-coverage` with the smallest practical slice first.
- Validate test and coverage tool readiness first; if missing, produce install and minimal configuration steps before claiming coverage evidence.
- Run mutation through `test-evaluate-focused-mutation` with the smallest practical production scope first.
- Validate mutation tool readiness first; if missing, produce install and minimal configuration steps before claiming mutation coverage.
- Run `test-analyze-test-smells` on the touched approval-test area and fix significant smells before calling the suite complete.
- Apply `test-validate-characterization-quality` before considering the characterization complete.
- Always report an explicit **Test Data Plan** and reject weaker alternatives.

## When NOT to Use

Do not use this skill when:

- you want the agent to write characterization test code directly (use `test-generate-acceptance-tests`, `test-generate-integration-tests`, `test-generate-unit-characterization-tests`, or `test-generate-golden-master-tests`)
- seam eligibility is still unresolved (use `test-plan-seam-refactoring` first)
- you only need execution evidence for already-written tests (use `test-evaluate-targeted-coverage` and `test-evaluate-focused-mutation`)

## Test Data Strategy

Choose the smallest maintainable option and state it explicitly:

- `Object Mother` for fast valid defaults and named scenarios
- `Fluent Builder` for multi-variant setup with several controlled overrides
- `Fixture File` for large, stable payloads where inline setup would hide intent

Avoid these anti-patterns:

- inline literal sprawl
- duplicate arrange blocks and copy-paste setup
- fixture sprawl without ownership or naming discipline

## Immediate Blockers

- Stage 2 seams are missing or unverified
- target behavior still depends on uncontrolled time, random values, IDs, or external APIs
- the target cannot be instantiated safely in tests
- proposed assertions are guessed instead of observed from real execution

## Output Format

```markdown
## Legacy Test Plan: {Target}

- Stage: 3 - Characterization after verified seams
- Seams Verified: {list of seams | No seam required: direct construction/control/observation | blocker}
- Characterization Strategy: {Golden Master | Unit Characterization | Mixed}
- Non-Determinism Controls: {time/random/id/external-call handling}
- Coverage Plan: {test slice | selected runner | selected coverage tool | environment readiness | config shape}
- Mutation Plan: {target scope | selected tool | environment readiness | config shape | quality gate >= 85%}
- Unit Test Shape Strategy: {Property-Based | Parameterized | Single | N/A}
- Approval Input Strategy: {Cartesian Product | Partitioned Cartesian Product | Representative Sampling | N/A}
- Test Data Plan: {Object Mother | Fluent Builder | Fixture File} - {why this is minimal and maintainable}
- Test Smell Hygiene Plan: {how the touched test area will be reviewed and cleaned}
- Rejected Alternatives: {what was avoided and why}
- Anti-Patterns to Avoid: {inline literal sprawl | duplicate arrange | fixture sprawl | guessed expectations}
- Next Test Slice: {acceptance | unit | integration | contract}

## Decision Contract

- Result: {COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED}
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: {one implementation skill}
```

## Related Skills

- `test-generate-acceptance-tests`
- `test-generate-integration-tests`
- `test-generate-golden-master-tests`
- `test-generate-unit-characterization-tests`
- `test-validate-characterization-quality`
- `test-evaluate-targeted-coverage`
- `test-evaluate-focused-mutation`
- `test-analyze-test-smells`
- `test-generate-object-mother-fixtures`

## References (Optional, Manual Read)

Do not treat this section as default runtime knowledge.
Consult only when a task needs canonical examples or edge-case handling.

- [Legacy Characterization Playbook](./references/legacy-characterization-playbook.md)
