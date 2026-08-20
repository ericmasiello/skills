---
name: test-generate-integration-tests
description: Generate integration tests that exercise a driven adapter against its real external system (real database, real API, real file system) with no mocks inside the boundary. Use when you say 'add integration tests', 'test the repository', 'test the adapter', 'test against real infrastructure', or need the final layer after acceptance and unit tests in the outside-in flow.
metadata:
  category: 'Characterization Testing'
  tags: ['integration-testing', 'outside-in', 'adapters', 'real-infrastructure', 'boundary']
  author: TBD
  revision: 1
  status: experimental
---

# Outside-In Integration Test Specialist

## Purpose

Generate integration tests that lock the behavior of a **driven adapter against its real external system**, covering the boundary the acceptance layer deliberately mocked.

This is the **innermost** step of the outside-in add-missing-tests order — **Acceptance → Unit → Integration**. After acceptance tests prove the use case with the external world mocked and unit tests pin branch-heavy domain internals, integration tests prove each adapter actually talks to its real infrastructure correctly.

You are documenting how the adapter maps to and from the external system today, not chasing coverage numbers.

Shared quality gates for determinism, representative coverage, and mutation effectiveness belong to `test-validate-characterization-quality`.
Targeted test and coverage execution belongs to `test-evaluate-targeted-coverage`.

## Boundary (from docs/RULES.md)

- **Boundary**: a single **adapter ↔ external system** (repository ↔ database, API client ↔ external API, file adapter ↔ file system, queue adapter ↔ message broker).
- **Mock**: nothing within the boundary.
- **Use real**: the real database, real external API (or a faithful local/emulated instance), real file system, real serialization.
- **Responsibility**: schema/mapping fidelity, external API communication, error handling, transaction/serialization behavior, entity ↔ domain conversion.

> Note (from RULES.md): "Integration test" here is strictly the adapter-to-infrastructure boundary. It is **not** a broad system test. Whole-feature behavior belongs to acceptance tests; single-class logic belongs to unit tests.

For this codebase, integration targets include `Dynamo*Repository` classes against a real/local DynamoDB, the Cloudinary and SmartAssets clients against their real endpoints, and SQS publishers/consumers against a real queue.

## When to Use

Use this skill when:

- the target is a driven adapter/repository and you need to prove it works against real infrastructure
- acceptance tests already mocked this adapter and you are now filling the boundary it stood in for
- you need to lock entity mapping, error translation, or transport behavior

## When NOT to Use

Do NOT use this skill when:

- the target is a whole use case with mocked infrastructure → `test-generate-acceptance-tests`
- the target is a pure domain class with no external system → `test-generate-unit-characterization-tests`
- the real (or a faithful local) external system cannot be provisioned → record as `Blocking Issues` and stay at the acceptance layer
- you only need planning, not test code → `test-plan-characterization-tests`

## Ownership Boundary

- **Owns**: adapter-to-external-system tests with real infrastructure and no in-boundary mocks
- **Does not own**: use-case acceptance behavior, single-class unit characterization, or seam planning
- **Hands off to**:
  - `test-generate-unit-characterization-tests` for branch-heavy mapping/error logic better pinned at unit scope
  - `test-generate-object-mother-fixtures` for reusable domain test data
  - `test-validate-characterization-quality` for the final evidence gate

## Prerequisite Gate

Before generating tests, require:

1. the adapter and its external system identified
2. a real or faithful local instance of the external system available (e.g. local DynamoDB, sandbox API, temp file system)
3. setup/teardown strategy that keeps tests isolated and repeatable
4. determinism controls for time/random/IDs and any server-side state

If the real infrastructure cannot be provisioned, return `BLOCKED` with the missing dependency; do not silently mock inside the boundary.

## Required Decision Output

- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list (empty if none)
- `Blocking Issues`: explicit list (empty if none)
- `Next Owner`: one downstream owner skill

## Core Principle

Drive from **behavior, not coverage**. Each integration test maps to an observable adapter behavior (round-trip persistence, error translation, transport contract), not to an uncovered line. Coverage and mutation are evidence, never the goal.

## Generation Rules

- ✅ Exercise the adapter through its public port interface (the same interface the domain depends on).
- ✅ Use the real external system (or a faithful local/emulated instance); never mock inside the boundary.
- ✅ Cover the round trip: write via the adapter, then read back and assert the domain object is faithfully reconstructed.
- ✅ Cover error handling: not-found, conflict, validation/transport failures, and how the adapter translates them into domain `Result` errors.
- ✅ Build domain inputs with Object Mothers / builders; keep domain objects real.
- ✅ Isolate tests: unique keys/namespaces, clean up created state in teardown, never depend on test order.
- ✅ Control non-determinism (time, IDs, ordering) so assertions are stable.
- ✅ Run coverage/mutation as evidence via `test-evaluate-targeted-coverage` and `test-evaluate-focused-mutation`.
- ❌ Do not mock the external system inside the boundary.
- ❌ Do not assert on private adapter internals; assert on observable external effects and returned domain objects.
- ❌ Do not broaden into full use-case/system behavior — that is the acceptance layer.
- ❌ Do not guess expected values; observe them from real infrastructure round-trips.

## Behavior Coverage (Explicit)

For the target adapter, mark each family:

- Happy path (round-trip read/write): `Detected` | `Considered-Not-Found` | `Not-Applicable`
- Edge case (empty/missing/boundary data): `Detected` | `Considered-Not-Found` | `Not-Applicable`
- Failure mode (transport/validation/conflict errors): `Detected` | `Considered-Not-Found` | `Not-Applicable`

Provide one evidence line per row.

## Output Format

```markdown
Technique: Integration (Outside-In)
Layer: integration (middle) — previous: acceptance, next: unit
Boundary: {adapter} ↔ {external system}
Infrastructure Used: {real DB/API/FS or faithful local instance}
Isolation Strategy: {unique keys/namespaces + teardown}
Behavior Summary: {how the adapter maps/communicates today}

Cases:

- Name: {Verb_WhenCondition}
  Setup: {domain object via object mother}
  Action: {port method invoked, e.g. Save then GetById}
  Observed External Effect: {row/object/message persisted}
  Reconstructed Domain: {domain object read back}
  Error Translation: {external failure → domain Result error}

Behavior Coverage:

| Family       | Status                                | Evidence |
| ------------ | ------------------------------------- | -------- |
| Happy path   | {Detected\|Considered-Not-Found\|N/A} | {ref}    |
| Edge case    | {Detected\|Considered-Not-Found\|N/A} | {ref}    |
| Failure mode | {Detected\|Considered-Not-Found\|N/A} | {ref}    |

Coverage/Mutation Evidence: {via test-evaluate-targeted-coverage / test-evaluate-focused-mutation}
Handoff: {test-generate-unit-characterization-tests for mapping/error logic Z}
```

## Success Criteria

- Each test drives the adapter through its port against real infrastructure with no in-boundary mocks.
- Round-trip mapping and error translation are both covered.
- Tests are isolated, deterministic, and clean up their state.
- Every test maps to a named adapter behavior, not a coverage line.
- Residual branch-heavy logic is handed off to the unit layer.

## Related Skills

- `test-generate-acceptance-tests`
- `test-generate-unit-characterization-tests`
- `test-generate-object-mother-fixtures`
- `test-plan-characterization-tests`
- `test-validate-characterization-quality`
- `test-evaluate-targeted-coverage`
- `test-evaluate-focused-mutation`
