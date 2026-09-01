---
name: test-generate-object-mother-fixtures
description: Generate Object Mother and builder patterns for readable, maintainable test fixtures. Use when you say 'object mother', 'test fixtures', 'test data', 'test builders', or tests need reusable domain object setup with sensible defaults and named scenarios.
metadata:
  category: 'Test Fixtures'
  tags: ['object-mother', 'test-data', 'fixtures', 'builders', 'test-setup']
  author: DOM-0080
  revision: 3
  status: experimental
---

# Object Mother Generation Guide

Generate Object Mothers, fluent builders, and related fixture guidance that centralize test data creation and keep tests focused on intent rather than setup noise.

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

## Purpose

Define how tests should create valid domain objects with sensible defaults, named scenarios, and optional customization points.
Object Mother output should make test setup reusable, readable, and resilient to constructor or factory changes.

**Stage Context**: This is a cross-stage supporting skill, primarily used during Stage 3 (Characterization) to create maintainable test data setups, but also valuable in Stage 4 when expanding test coverage.

## Ownership Boundary

- **Owns**: generating fixture artifacts (Object Mothers/builders) for test data setup
- **Does not own**: writing business assertions or selecting characterization strategy
- **Hands off to**:
  - `test-generate-unit-characterization-tests` and `test-generate-golden-master-tests` for test implementation
  - `test-plan-characterization-tests` for planning strategy when test scope is unclear

## Core Principle

Centralize fixture creation.
Prefer one Object Mother per important domain object or aggregate, with valid defaults and scenario-specific helpers that make the test intent obvious.

## When To Generate

Generate an Object Mother or equivalent test-data builder when:

1. Tests repeat complex domain object setup.
2. Constructors or factories are noisy enough to hide test intent.
3. The same valid defaults are needed across multiple test types.
4. Scenario-specific data should be named explicitly instead of rebuilt inline.

## When to Use

Use this skill when fixture setup noise is reducing readability and reusable domain test data artifacts are needed.

## When NOT to Generate

Do NOT create Object Mothers when:

- **For DTOs or data transfer objects**: These are typically simple containers; inline construction is often clearer than a mother
- **For infrastructure objects**: Database connections, HTTP clients, message queues should use fakes or test doubles, not mothers
- **For value objects used once**: If only one test needs the object, inline creation is simpler
- **For external API responses**: Use fixture files or recorded responses instead of mothers that duplicate external schemas
- **When construction is trivial**: If `new Thing()` with no arguments is sufficient, a mother adds ceremony without value
- **To hide production behavior**: Mothers create test data, they should never replicate business logic or validation rules

## When NOT to Use

Do not use this skill when:

- fixture setup is already simple and not repeated
- the request is for test assertion logic rather than test data artifacts

## Prerequisite Gate

Before generating artifacts, require:

1. target domain type(s) identified
2. target test context identified (unit/acceptance/integration)

If prerequisites are missing, stop and request them explicitly.

An explicit task statement that names the aggregate, repeated setup need, and
test context satisfies this gate. Inability to inspect existing test files or
fixture locations is Missing Evidence and a warning, not a blocker, when the
requested fixture need is already concrete.

Before generating a new mother or builder, check whether one already exists for this
domain type or a close neighbor in the target repo. Extend or reuse it rather than
creating a duplicate.

## Required Decision Output

Report the shared fields defined in `test-skills-decision-contract.md`
(`Result`, `Missing Evidence`, `Blocking Issues`, `Next Owner`).

## Core Rules

- Generate one mother or builder per important domain object, aggregate, or event used heavily in tests.
- Ensure `create()` or the equivalent returns a valid object by default.
- Add named scenario helpers such as `createPending()` or `createExpired()` when the scenario communicates domain intent.
- Provide targeted customization through overrides, fluent builder methods, or language-idiomatic options.
- Support child collections or aggregate members through explicit helper methods rather than long inline arrange blocks.
- Generate invalid fixtures only when tests need validation or error paths.
- Keep object-mother code in test support, not production code.
- Prefer readable defaults over random data unless randomness is explicitly controlled.

## Builder Selection Rules

- Use an Object Mother for readable defaults and named scenarios.
- Add a fluent builder when the object has many optional fields or combinatorial setup paths.
- Use fixture files only when the test data is large, stable, and naturally document-shaped.
- Combine a mother plus a builder when defaults are simple but a few tests need richer customization.

## Scope Rules

- Generate mothers for aggregates, entities, value objects, and domain events only when tests actually need them.
- Do not generate massive shared fixture utilities that become a second domain model.
- Keep customization domain-oriented, not transport- or persistence-oriented.
- Avoid leaking infrastructure DTOs or database rows into object-mother APIs unless the test is explicitly infrastructure-facing.

## Testing Usage Rules

- Unit tests use mothers to make arrange sections small and intention-revealing.
- Acceptance tests may combine mothers with in-memory fakes or repositories.
- Integration tests may use mothers to create valid aggregates before persistence.
- Mothers should reduce fixture sprawl, not hide essential assertions.

## Immediate Blockers

- The default fixture is invalid.
- Tests still require long manual constructor setup after introducing the mother.
- The mother exposes irrelevant infrastructure details.
- Named scenarios do not communicate domain meaning.
- The generated builder duplicates all production behavior instead of only constructing test data.

## Common Anti-Patterns

- Hardcoded object construction repeated in every test
- Fixture utilities with unclear defaults
- Scenario intent hidden behind raw literals
- Randomized defaults that make failures hard to reproduce
- Builders so powerful that they become a parallel domain API

## Related Skills

- `test-plan-characterization-tests` when characterization work needs a maintainable test-data plan

## References (Optional, Manual Read)

Do not treat this section as default runtime knowledge.
Consult only when a task needs language-specific template examples or detailed anti-pattern walkthroughs.

- See `references/language-templates.md` for preserved Object Mother and builder examples across languages.
- See `references/usage-and-anti-patterns.md` for test-usage examples and detailed anti-pattern guidance.

## Output Format

Return Object Mother guidance in this order:

1. Target domain object and why a mother or builder is needed
2. Default fixture strategy and validity rules
3. Named scenarios to generate
4. Customization approach: overrides, builder, or options
5. Supporting mothers for dependent value objects or events if needed
6. Test usage notes and anti-patterns avoided
7. Shared decision contract:
   - `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
   - `Missing Evidence`: explicit list (empty if none)
   - `Blocking Issues`: explicit list (empty if none)
   - `Next Owner`: one downstream skill

## Required Artifacts

When generation is requested, produce this minimum artifact set:

1. Object Mother file for the target domain type
2. Optional builder file only if customization complexity justifies it
3. One short usage example in a test context
4. One anti-pattern check note explaining what was intentionally avoided
