---
name: test-generate-unit-characterization-tests
description: Create unit tests with explicit assertions that lock current behavior for legacy code. Use when you say 'write unit tests', 'characterization tests', 'lock behavior', 'add test assertions', or need focused unit-level tests with clear expected outputs rather than approval-based snapshots.
metadata:
  category: 'Characterization Testing'
  tags: ['unit-testing', 'characterization', 'legacy-code', 'behavior-lock']
  author: TBD
  revision: 1
  status: experimental
---

# Stage 3 Unit Characterization Specialist

## Purpose

Generate unit tests that capture and lock current legacy behavior before refactoring.

You are documenting what the system does today, not prescribing what it should do.

These Stage 3 characterization techniques apply to **all service types**. Service classification affects the target architecture after characterization tests exist, but not whether unit-level characterization is valid.

Shared quality gates for determinism, representative coverage, and mutation effectiveness belong to `test-validate-characterization-quality`.
Focused mutation scope, tool selection, and platform config belong to `test-evaluate-focused-mutation`.
Targeted test and coverage execution belong to `test-evaluate-targeted-coverage`.

## What Unit Characterization Is

Unit characterization captures existing behavior of legacy code without reliable documentation. You explore the system, record actual outputs and observable side effects, then lock those observations as unit tests.

- Not testing "correct" behavior first
- Testing and documenting "current" behavior first

Unlike Golden Master, this skill uses explicit unit assertions and behavior-focused test names, not approval/snapshot artifacts as the default mechanism.

When the observed behavior supports it, prefer a property-based test over a parameterized test, and prefer a parameterized test over a single-case unit test. Fall back only when the stronger form would stop being understandable, deterministic, or grounded in observed behavior.

## When to Use

Use when working with legacy code that lacks tests and documentation before refactoring, and behavior can be captured at unit level through direct assertions.

Unit is the **middle** layer of the outside-in add-missing-tests order: **Acceptance → Unit → Integration**. Reach for this skill after acceptance tests (`test-generate-acceptance-tests`) are in place, to pin branch-heavy domain internals the acceptance layer could not fully lock, before moving on to integration tests (`test-generate-integration-tests`).

## When NOT to Use

Do not use this skill when:

- seams are not verified yet (`test-plan-seam-refactoring` first)
- output complexity is better suited for approval testing (`test-generate-golden-master-tests`)
- you only need planning and not implementation (`test-plan-characterization-tests`)

## Ownership Boundary

- **Owns**: explicit-assertion characterization test implementation at unit scope
- **Does not own**: seam planning, mutation execution tooling, or final gate adjudication

## Prerequisite Gate

Before generating tests, require:

1. seams verified
2. observability of outputs/side effects
3. determinism controls defined

If any prerequisite is missing, stop and request it explicitly.

## Required Decision Output

- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list (empty if none)
- `Blocking Issues`: explicit list (empty if none)
- `Next Owner`: one downstream owner skill

## Stage 3 Position

Unit characterization is not testing ideal behavior. It is a Stage 3 technique for documenting actual current behavior at unit scope so later refactoring stays safe.

## Preconditions

1. Seams are already applied and verified.
2. Inputs, outputs, and boundary side effects are observable.
3. Non-determinism (time/random/ids/order) is controlled or normalized.
4. Unit scope is appropriate after the outer layers (acceptance, integration) have locked the behaviors they own.

## Test Shape Preference

Choose the strongest maintainable test shape that can still be justified from observed current behavior:

1. **Property-Based Tests**: use when you can state a stable invariant, relation, or algebraic rule discovered from real observations.
2. **Parameterized Unit Tests**: use when you have several concrete observed input/output pairs but not a trustworthy invariant.
3. **Single Unit Test**: use only when the behavior is too narrow, too irregular, or too poorly understood to support the stronger forms yet.

Do not choose a weaker test shape by default. If you do not use the strongest available option, state why.

## Progression Strategy

Apply tests incrementally as understanding improves, but move upward in expressive power whenever the behavior justifies it:

1. **Single Unit Test**: capture one concrete observed case when understanding is still narrow.
2. **Parameterized Unit Tests**: consolidate multiple observed cases into one readable case table.
3. **Property-Based Tests**: generalize the stable invariant once repeated observations show the rule is trustworthy.

The target end state is the highest-confidence maintainable form the observed behavior allows, not the first form that happens to pass.

## Property-Based Testing (PBT) Strategy

Prefer property-based tests when observed behavior reveals a stable invariant, relation, or algebraic rule that can be generated safely. Otherwise prefer parameterized tests, then single-case tests.

Read `references/pbt-strategy.md` for PBT value domains, property patterns (invariant/roundtrip/oracle/metamorphic), language tooling, example-count tuning, and shrinking.

## Generation Rules

- ✅ Use the characterization loop: write an assertion you expect to fail, run it, let the failure reveal actual behavior, then update the test to lock that observed behavior.
- ✅ Run real code and capture observed behavior before finalizing assertions.
- ✅ Prefer property-based tests when the current behavior reveals a stable invariant or relation that can be generated safely.
- ✅ Otherwise prefer parameterized tests when several concrete observed examples share the same assertion structure.
- ✅ Use a single-case unit test only when the behavior is too narrow or too irregular for the stronger forms.
- ✅ Assert explicit outputs and relevant side effects at infrastructure boundaries.
- ✅ Use fakes/spies/stubs only for boundary dependencies.
- ✅ Keep domain entities/value objects/aggregates real.
- ✅ Prefer behavior-driven, specific, readable test names.
- ✅ Preserve imperfect legacy behavior as baseline until intentionally changed.
- ✅ Validate the resulting suite with `test-validate-characterization-quality`.
- ✅ Run targeted tests and coverage through `test-evaluate-targeted-coverage` before summarizing coverage evidence.
- ✅ Run focused mutation through `test-evaluate-focused-mutation` against the production code protected by the new or updated unit tests.
- ❌ Do not guess expected values.
- ❌ Do not introduce property-based generators that invent behavior you did not actually observe or cannot explain.
- ❌ Do not keep duplicated one-input/one-output tests when a parameterized or property-based form would express the same behavior more clearly.
- ❌ Do not hide behavior behind vague test names (for example: `works`, `handles case`, `test1`).
- ❌ Do not use approval/snapshot as default for this skill (use `test-generate-golden-master-tests` when output complexity requires it).

## Coverage Requirements (Explicit)

For each target, explicitly cover both dimensions:

1. **I/O Characterization** (inputs → outputs)
2. **Side-Effect Characterization** (observable boundary writes/events/calls)

Minimum case families to consider and mark:

- Happy path
- Edge case
- Failure mode

Coverage evidence must be reported through `test-validate-characterization-quality`.
Test and coverage tool readiness plus targeted coverage execution must be reported through `test-evaluate-targeted-coverage` and summarized in `test-validate-characterization-quality`.
Mutation scope, tool choice, and mutation effectiveness must be reported through `test-evaluate-focused-mutation` and summarized in `test-validate-characterization-quality`.
Test shape choice must be reported through `test-validate-characterization-quality` with a brief justification for why property-based, parameterized, or single-case was selected.

For each family, report whether I/O and side-effect assertions were implemented,
or mark `Considered-Not-Found` / `Not-Applicable` with a brief reason.

## Completeness Gate

Before finalizing, include a completeness gate for characterization coverage:

- I/O Characterization: `Detected` | `Considered-Not-Found` | `Not-Applicable`
- Side-Effect Characterization: `Detected` | `Considered-Not-Found` | `Not-Applicable`

Provide one evidence line per row (test name, assertion, or boundary observation).

## Test Naming Guidance

Name tests as executable behavior documentation:

- Prefer a **domain behavior verb** + **observable outcome** + **context**.
- Use language from the business rule or externally visible behavior, not from the production method name.
- Keep names specific enough to explain the reverse-engineered behavior without reading implementation first.
- Avoid generic technical verbs such as `returns`, `handles`, `processes`, or `works` when a stronger domain verb exists.
- Avoid coupling names to internals such as `calculateDiscount`, `saveInvoiceInternal`, `buildPayload`, or similar implementation detail.
- Keep the naming rule compact in this skill; use `references/naming-guidance.md` for concrete ecosystem examples.

Choose the strongest verb the observed behavior supports:

- `Applies...` for policy/rule enforcement
- `Calculates...` for business computations
- `Emits...` for events/messages
- `Persists...` for stored state
- `Rejects...`, `Accepts...`, `Rounds...`, `Schedules...`, `Retries...` when those are the true domain actions

✅ Good:

- `Applies_zero_discount_when_customer_has_no_tier`
- `Calculates_zero_discount_when_customer_has_no_tier`
- `Emits_rejection_event_when_credit_limit_is_exceeded`
- `Persists_invoice_with_legacy_rounding_rule_when_total_has_three_decimals`

❌ Poor:

- `works`
- `handles input`
- `test discount`
- `Returns_zero_discount_when_customer_has_no_tier`
- `CalculateDiscount_returns_zero_when_customer_has_no_tier`

### Ecosystem-Specific Shapes

Use the ecosystem's discovery rules, but keep the **behavior-first** wording:

- **TypeScript / Vitest / Jest**: keep `describe(...)` on the business subject and `it/test(...)` on the behavior.
- **Python / pytest**: keep the `test_` prefix for discovery, but make the rest of the name behavior-first.
- **C# / xUnit**: prefer readable method names with domain verbs and underscores between words.
- **Go / testing**: keep `TestXxx` for discovery and move the detailed behavior into the function name or subtest name with `t.Run(...)`.

For full examples and anti-examples by ecosystem, see `references/naming-guidance.md`.

## Output Format

```markdown
Technique: Unit Characterization
Taxonomy Level: {acceptance-considered, unit-selected}
Target: {module/function}
Behavior Summary: {what current behavior appears to be}
Test Shape: {property-based | parameterized | single}
Test Shape Rationale: {why stronger forms were used or rejected}
Progression Stage: {single | parameterized | property-based}
Shared Quality Gate: `test-validate-characterization-quality`
Targeted Coverage Skill: `test-evaluate-targeted-coverage`
Focused Mutation Skill: `test-evaluate-focused-mutation`
Cases:

- Name: {behavior-driven test name}
  Input/Setup: {...}
  Observed Output: {...}
  Observed Side Effects: {...}
  Boundary Doubles: {fakes/spies/stubs used}

Coverage Matrix:

| Case Family  | I/O Characterization                  | Side-Effect Characterization          | Evidence |
| ------------ | ------------------------------------- | ------------------------------------- | -------- |
| Happy path   | {Detected\|Considered-Not-Found\|N/A} | {Detected\|Considered-Not-Found\|N/A} | {ref}    |
| Edge case    | {Detected\|Considered-Not-Found\|N/A} | {Detected\|Considered-Not-Found\|N/A} | {ref}    |
| Failure mode | {Detected\|Considered-Not-Found\|N/A} | {Detected\|Considered-Not-Found\|N/A} | {ref}    |

Characterization Completeness Gate:

| Dimension                    | Status                                | Evidence |
| ---------------------------- | ------------------------------------- | -------- |
| I/O Characterization         | {Detected\|Considered-Not-Found\|N/A} | {ref}    |
| Side-Effect Characterization | {Detected\|Considered-Not-Found\|N/A} | {ref}    |
```

## Success Criteria

- Tests document current behavior clearly and reproducibly.
- Test names explain behavior and context without reading implementation first.
- The chosen test shape is the strongest maintainable option supported by observed behavior.
- Progression advances from single-case to generalized coverage as knowledge grows.
- Side-effect assertions remain boundary-focused and mock-discipline compliant.
- Shared quality gate confirms coverage evidence and mutation effectiveness.

## Related Skills

- `test-generate-acceptance-tests`
- `test-generate-integration-tests`
- `test-validate-characterization-quality`
- `test-evaluate-targeted-coverage`
- `test-evaluate-focused-mutation`
- `test-generate-golden-master-tests`
- `test-plan-characterization-tests`
- `test-generate-object-mother-fixtures`
