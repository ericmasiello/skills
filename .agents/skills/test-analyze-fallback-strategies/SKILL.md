---
name: test-analyze-fallback-strategies
description: Provide alternative approaches when standard seam refactoring is too risky or expensive. Use when you say 'alternative approach', 'safer option', 'fallback strategy', 'seam too risky', or standard refactoring patterns feel dangerous and you need incremental or wrapper-based alternatives.
metadata:
  category: 'Fallback Strategies'
  tags: ['fallback', 'risk-mitigation', 'alternative-approaches', 'legacy-code']
  author: DOM-0080
  revision: 4
  status: experimental
---

# Stage 2 Legacy Fallback Strategy Selector

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

## Purpose

Choose a safe, incremental fallback strategy when direct seam refactoring is too risky, too expensive, or repeatedly blocked.

This is an exception path inside **Stage 2** seam introduction, not a replacement for the normal seam workflow.

## Why This Skill Exists

Fallback strategy choice directly affects delivery risk in legacy systems. The wrong strategy increases blast radius; the right one creates a safe path to testability with explicit rollback.

## Scope

This skill applies only after blocker analysis identifies high-risk legacy constraints.
Treat `test-plan-seam-refactoring` as the default Stage 2 path, and use this skill only when that normal seam path is unsafe, too expensive, or stalled.

These fallback strategies apply to **all service types**. Service classification affects the target architecture after testability improves, but not whether the fallback strategy is valid when legacy constraints are severe enough.

Use it to select and justify one primary fallback strategy from:

1. Sprout Method
2. Sprout Class
3. Wrap Method
4. Higher-level Integration Test
5. Strangler Fig

## When to Use

Use this skill once the "Scope" condition above is met: default seam planning
already assessed and deemed unsafe, too expensive, or stalled.

## Prerequisite Gate

Required before invocation:

1. blocker evidence from `test-analyze-testability-blockers`
2. attempted or considered default seam path from `test-plan-seam-refactoring`

If either is missing, stop and request those inputs first.

Before selecting a strategy, check whether the target repo already has a precedent
fallback (e.g. an existing Strangler Fig facade) for a similar blocker, and prefer
extending it over introducing a second, inconsistent approach.

## Ownership Boundary

- **Owns**: selecting a single fallback strategy when default seam planning is unsafe
- **Does not own**: blocker detection or default seam strategy authoring
- **Hands off to**: one concrete downstream owner for implementation or next planning step

## When NOT to Use

Do not use this skill when:

- default seam planning is still viable (`test-plan-seam-refactoring` remains primary)
- no blocker evidence has been established yet (`test-analyze-testability-blockers` first)
- the request is to implement code changes immediately rather than choose a fallback strategy

## How to Apply (Procedure)

Follow this exact sequence:

1. **Identify blocker shape**
   - Method-level side-effect hotspot?
   - New behavior needed around fragile legacy code?
   - Broad boundary replacement across many flows?
2. **Map blocker to candidate strategies**
   - Use the definitions and decision rules below.
3. **Select one primary strategy**
   - Prefer smallest safe incremental move.
4. **Plan two phases**
   - Phase 1 must preserve runtime behavior and reduce immediate risk.
   - Phase 2 must improve testability and reduce legacy surface.
5. **Define rollback explicitly**
   - One trigger and one concrete rollback action.
6. **Self-check output completeness**
   - Strategy + Why + Phase 1 + Phase 2 + Rollback Trigger + Rollback Action.

## Minimal Inputs Required

If available, base strategy on:

- location of hard dependency/side effect (method-level vs boundary-level)
- expected change scope (single flow vs multi-flow)
- tolerance for temporary integration-level safety nets

If input is partial, choose conservative strategy and state assumptions.

## Decision Rules

### 1) Wrap Method

Choose when the risky behavior is inside an existing method that directly calls hard dependencies/side effects and must preserve external behavior.

Typical signals:

- direct gateway/client calls in method body
- static/time/random calls in hot path
- constructor or method-level direct instantiation that cannot be broadly changed yet

Expected migration:

- Phase 1: Introduce wrapper seam around side effect boundary
- Phase 2: Move toward injectable dependency + broader characterization/specification tests

### 2) Sprout Method

Choose when adding new behavior alongside risky legacy logic is safer than modifying existing method internals.

Expected migration:

- Phase 1: Add new method for new behavior and delegate selectively
- Phase 2: Expand test coverage and gradually shift call sites

### 3) Sprout Class

Choose when a cohesive new slice can be implemented in a new class while legacy code delegates incrementally.

Expected migration:

- Phase 1: Introduce new class and delegate one use case
- Phase 2: Migrate additional flows and retire legacy branch

### 4) Higher-level Integration Test

Choose when low-level seams are currently impractical and confidence must come from behavior at a stable boundary.

Expected migration:

- Phase 1: Capture critical behavior through integration tests
- Phase 2: Introduce seams gradually to move down to faster tests

### 5) Strangler Fig

Choose when replacement must happen boundary-first across a broad legacy surface.

Expected migration:

- Phase 1: Route a narrow path through a new boundary adapter/facade
- Phase 2: Expand routing coverage and decommission legacy path incrementally

## Selection Heuristic

Prefer smallest safe incremental move:

1. Wrap Method (single-method side-effect isolation)
2. Sprout Method/Class (new behavior around legacy core)
3. Strangler Fig (boundary-first replacement)
4. Higher-level Integration Test (temporary confidence net)

If two are valid, choose the one with lower blast radius and clearer rollback path.

### Tie-Breakers

When selection is ambiguous, use these tie-breakers in order:

1. Lower behavior-change risk in Phase 1
2. Smaller initial code surface touched
3. Faster path to deterministic tests
4. Simpler rollback

If still tied, choose **Wrap Method** for method-local hotspots and **Strangler Fig** for boundary-wide migration.

## References (Optional, Manual Read)

Do not treat this section as default runtime knowledge.
Consult only when the task needs literal strategy definitions, examples, anti-patterns, or classification walk-throughs.

- `references/fallback-strategy-examples.md`

## Output Requirements

Every output must include:

- `Primary Strategy`: exactly one of the 5 allowed values
- `Why`: linked to observed blocker evidence
- `Phase 1` / `Phase 2`: the two-phase migration path (Phase 1 incremental and
  behavior-preserving; Phase 2 clearly advances testability)
- `Rejected Alternatives`: at least two rejected options with short rationale
- `Rollback Trigger`: a measurable signal, not a vague one
- `Rollback Action`: one executable rollback step

## Required Decision Output

Report the shared fields defined in `test-skills-decision-contract.md`
(`Result`, `Missing Evidence`, `Blocking Issues`, `Next Owner`).

## Output Format

```markdown
### Fallback Strategy

- Strategy: {Sprout Method | Sprout Class | Wrap Method | Higher-level Integration Test | Strangler Fig}
- Why: {blocker-linked rationale}
- Phase 1: {incremental step}
- Phase 2: {next incremental step}
- Rejected Alternatives: {at least two options with rationale}
- Rollback Trigger: {signal}
- Rollback Action: {safe rollback}

## Decision Contract

- Result: {COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED}
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: {test-apply-seam-refactoring | human | self}
```
