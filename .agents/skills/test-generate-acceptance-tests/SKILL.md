---
name: test-generate-acceptance-tests
description: Generate acceptance tests that exercise a complete use case while mocking only the external world (repositories, external services, infrastructure ports) and keeping the domain real. Use when you say 'add acceptance tests', 'test the use case', 'outside-in tests', 'start outside-in', or need the outermost safety net before unit and integration tests.
metadata:
  category: 'Characterization Testing'
  tags: ['acceptance-testing', 'outside-in', 'use-case', 'behavior-lock', 'boundary-mocking']
  author: DOM-0080
  revision: 3
  status: experimental
---

# Outside-In Acceptance Test Specialist

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

## Purpose

Generate acceptance tests that lock the behavior of a **complete use case** while mocking **only the external world** and keeping the domain real.

This is the **outermost** step when adding missing tests. In the outside-in add-missing-tests order — **Acceptance → Unit → Integration** — you start here: the widest behavioral net that proves the feature works before narrowing inward.

You are documenting what the use case does today from the caller's perspective, not chasing coverage numbers and not prescribing new behavior.

Shared quality gates for determinism, representative coverage, and mutation effectiveness belong to `test-validate-characterization-quality`.
Targeted test and coverage execution belongs to `test-evaluate-targeted-coverage`.
Focused mutation scope and tooling belong to `test-evaluate-focused-mutation`.

## Boundary

- **Boundary**: **use case → domain** (recommended, transport-agnostic) OR **controller → domain** (pragmatic, when the app is HTTP-only and you accept coupling to transport).
- **Mock (the external world) ONLY**: repositories / driven ports, external services (APIs, queues, email), infrastructure ports (time, ID generation, file system).
- **Use real**: domain objects (entities, value objects, aggregates, domain services) and the use case itself; optionally real controllers if testing from the HTTP boundary.
- **Responsibility**: feature completeness, business requirements, user-story validation.

If a dependency is not part of the external world, do not mock it. If the external world cannot be mocked because the use case constructs its own infrastructure, that is a seam blocker — hand off to `test-analyze-testability-blockers` / `test-plan-seam-refactoring`.

## Mock Discipline

- ✅ **Mock/stub** infrastructure boundaries only. Use **stubs** for time/ID (fixed values, no verification). Use **mocks** for repositories/services with side effects.
- ✅ **Verify commands** (save, send, publish) that change state.
- ❌ **Never verify queries** (find, get) used only for data retrieval.
- ❌ **Never mock domain objects** — entities, value objects, aggregates, domain services stay real.

## When to Use

Use this skill when:

- you are adding missing tests and want to start at the outermost layer
- a use case / workflow / command / query handler is the target
- the external world can be mocked and the domain can run for real
- you want an executable specification of the feature before integration/unit work

## When NOT to Use

Do NOT use this skill when:

- the target is a driven adapter/repository against real infrastructure → `test-generate-integration-tests`
- the target is a single branch-heavy domain class in isolation → `test-generate-unit-characterization-tests`
- output is large/opaque and best locked as a snapshot → `test-generate-golden-master-tests`
- the use case cannot be constructed with mocked infrastructure (seam blocker) → `test-plan-seam-refactoring`
- you only need planning, not test code → `test-plan-characterization-tests`

## Ownership Boundary

- **Owns**: acceptance-level behavior tests at the use-case→domain boundary with external-world-only mocking
- **Does not own**: real-infrastructure adapter tests, single-class unit characterization, seam planning, or mutation execution tooling
- **Hands off to**:
  - `test-generate-unit-characterization-tests` for branch-heavy domain internals the acceptance tests could not fully pin
  - `test-generate-integration-tests` for the driven adapters this layer mocked
  - `test-generate-object-mother-fixtures` for reusable domain test data
  - `test-validate-characterization-quality` for the final evidence gate

## Prerequisite Gate

Before generating tests, require:

1. the use case / handler under test identified
2. the external-world dependencies (driven ports, external services, infra ports) identified
3. the use case constructible with those dependencies substituted by test doubles
4. determinism controls defined for time/random/IDs/ordering

**Before claiming the acceptance layer is complete for a module** (not just adding one test): enumerate the full driving surface first — every REST endpoint (HTTP verb + route) for an HTTP API, or every public use-case entry point otherwise — and check each one directly against test files. Do not infer completeness from a coverage/quality-baseline doc's list of flagged items: such docs are frequently scoped to a single test project and both under-report gaps (endpoints never flagged) and over-report them (endpoints actually covered by tests living in a different test project, e.g. HTTP-level tests in an Api.Tests project exercising an Application-layer workflow). Only a full verb+route (or entry-point) enumeration, checked file-by-file, supports a "layer complete" claim.

If (1) is not yet identified and the workspace has multiple projects/modules, do not ask the user which one — resolve it first via `test-plan-quality-workflow`'s auto-discovery (its `references/multi-project-scope-selection.md`), then return here with a concrete target. If any other prerequisite is missing once a target is chosen, stop and request it, or hand off the seam blocker.

Before writing new scenarios, check the target's existing acceptance tests (if any) or a neighboring use case's tests for naming and object-mother convention already in use.

## Required Decision Output

Report the shared fields defined in `test-skills-decision-contract.md`
(`Result`, `Missing Evidence`, `Blocking Issues`, `Next Owner`). `Next Owner` is normally
`test-generate-unit-characterization-tests`.

## Core Principle

Drive from **behavior, not coverage**. Each acceptance test maps to one observable use-case behavior (a business scenario), not to an uncovered line. Coverage and mutation are evidence that the behaviors are exercised — never the goal. Do not add an acceptance test whose only justification is raising a number.

## Generation Rules

- ✅ Enter through the use case's public entry point (execute/handle), never through internal collaborators.
- ✅ Substitute the external world with fakes/spies/stubs; keep all domain objects real.
- ✅ Build domain inputs with Object Mothers / builders (`test-generate-object-mother-fixtures`), not ad-hoc literals.
- ✅ Assert the observable result (returned `Result`/value) AND the commanded side effects at boundaries (e.g. repository `Save`, queue `Publish`).
- ✅ Verify commands; do not verify queries.
- ✅ Cover the behavior families: happy path, edge cases, failure modes (including domain validation failures surfaced as `Result` errors).
- ✅ Keep names as business scenarios in `Verb_WhenCondition` form so they read as executable specifications.
- ✅ Preserve current (even imperfect) behavior as the baseline until it is intentionally changed.
- ✅ Run coverage/mutation as evidence via `test-evaluate-targeted-coverage` and `test-evaluate-focused-mutation`.
- ❌ Do not mock domain objects or verify query calls.
- ❌ Do not reach into private methods, internal state, or private classes inside an aggregate.
- ❌ Do not widen to real infrastructure — that is the integration layer.
- ❌ Do not guess expected values; observe them from real domain execution.

## Behavior Coverage (Explicit)

For the target use case, enumerate its observable behaviors and mark each:

- Happy path: `Detected` | `Considered-Not-Found` | `Not-Applicable`
- Edge case: `Detected` | `Considered-Not-Found` | `Not-Applicable`
- Failure mode: `Detected` | `Considered-Not-Found` | `Not-Applicable`

Provide one evidence line per row (test name + commanded side effect or returned result).

## Output Format

```markdown
Technique: Acceptance (Outside-In)
Layer: acceptance (outermost) — next: unit
Boundary: {use-case→domain | controller→domain}
Target Use Case: {name}
External World Mocked: {repositories/ports/services + double type per item}
Real Domain: {aggregates/value objects kept real}
Behavior Summary: {what the use case does today}

Scenarios:

- Name: {Verb_WhenCondition}
  Given: {domain setup via object mother}
  When: {use case entry point invoked}
  Then (result): {returned Result/value}
  Then (commands verified): {repository.Save / queue.Publish / ...}
  Queries NOT verified: {find/get calls left unverified}

Behavior Coverage:

| Family       | Status                                | Evidence |
| ------------ | ------------------------------------- | -------- |
| Happy path   | {Detected\|Considered-Not-Found\|N/A} | {ref}    |
| Edge case    | {Detected\|Considered-Not-Found\|N/A} | {ref}    |
| Failure mode | {Detected\|Considered-Not-Found\|N/A} | {ref}    |

Coverage/Mutation Evidence: {via test-evaluate-targeted-coverage / test-evaluate-focused-mutation}
Handoff: {test-generate-unit-characterization-tests for residual domain behavior, or test-generate-integration-tests when no unit behavior remains}

## Decision Contract

- Result: {COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED}
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: {one downstream skill}
```

## Related Skills

- `test-generate-integration-tests`
- `test-generate-unit-characterization-tests`
- `test-generate-object-mother-fixtures`
- `test-plan-characterization-tests`
- `test-validate-characterization-quality`
- `test-evaluate-targeted-coverage`
- `test-evaluate-focused-mutation`
