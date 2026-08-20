---
name: test-plan-quality-workflow
description: Plans and sequences the complete 4-stage test quality workflow (Detect → Refactor → Add Missing Tests Outside-In → Validate). Use when you say 'improve test quality', 'fix test issues', 'add test coverage', or need to systematically address test problems in existing code or add tests to legacy code.
metadata:
  category: 'Test Orchestration'
  tags: ['orchestration', 'test-quality', 'workflow', 'test-improvement']
  author: TBD
  revision: 1
  status: experimental
---

# Test Quality Workflow Planner

## Purpose

Provide explicit guidance for the complete 4-stage test quality improvement workflow, handling both scenarios:

- **Scenario A**: Existing tests with quality issues
- **Scenario B**: Legacy code without tests

This skill exists because test quality improvement is a multi-stage process that requires careful orchestration. The four stages (Detect → Refactor → Add Missing Tests Outside-In → Validate) must be executed in order with clear gates between them.

## When to Use

Use this skill when:

- Starting test improvement work on a codebase
- Unsure whether to refactor existing tests or write new ones
- Need explicit workflow guidance across all 4 stages
- Want to ensure proper stage sequencing and gates

## When NOT to Use

Do not use this skill when:

- you already know the exact stage-specific skill to run next
- you only need a single specialized action (smell review, mutation run, or seam plan)

## Ownership Boundary

- **Owns**: entry assessment, stage routing, gate sequencing, and workflow-level decisions
- **Does not own**: direct execution details of stage-specialized skills

## Prerequisite Gate

Before orchestration, require:

1. target scope/module identified
2. current test state known (no tests / partial / existing with quality issues)

Resolve both via auto-discovery first — see "Step -1: Multi-Project Auto-Discovery" below and `references/multi-project-scope-selection.md`. Only request them from the user when auto-discovery genuinely cannot produce a confident target (no enumeration tools available, or two+ candidates tied on every evidence signal). Minimizing questions asked of the user is a goal of this skill: a ranked, evidence-backed default beats a clarifying question whenever discovery evidence is available.

## Required Decision Output

- `Candidate Modules`: ranked list considered, with the one-line evidence used for each (state "single module — no discovery needed" when only one exists)
- `Selected Target`: module/layer chosen and why it ranked first
- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list (empty if none)
- `Blocking Issues`: explicit list (empty if none)
- `Next Owner`: one immediate next skill

## The 4-Stage Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ ASSESS CURRENT STATE                                        │
│ • Existing tests? Quality? Coverage?                        │
│ • Route to Scenario A (improve) or B (create)               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ STAGE 1: DETECT                                             │
│ • Skill: test-analyze-test-smells                            │
│ • Output: Test smell inventory (19 smell types)             │
│ • Gate: Blocker/Critical smells identified or none found    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ STAGE 2: REFACTOR (if issues detected)                      │
│ • Skill: test-refactor-test-smells                          │
│ • Output: Refactored tests free of critical smells          │
│ • Gate: All Blocker/Critical smells resolved                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ STAGE 3: ADD MISSING TESTS (OUTSIDE-IN)                     │
│ • Order: Acceptance → Unit → Integration                    │
│ • 3a test-generate-acceptance-tests (mock external world)   │
│ • 3b test-generate-unit-characterization-tests (domain)     │
│ • 3c test-generate-integration-tests (real infrastructure)  │
│ • Gate: every behavior covered at its layer (coverage=evidence)│
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ STAGE 4: VALIDATE                                           │
│ • Skills: test-evaluate-focused-mutation, test-validate-characterization-quality │
│ • Output: Mutation score, quality gate report               │
│ • Gate: Mutation score ≥85%                                 │
└─────────────────────────────────────────────────────────────┘
```

## Step -1: Multi-Project Auto-Discovery (do this before asking the user)

When the workspace has multiple projects/modules — a monorepo, a solution with several test projects, a package-based frontend, a solution split into layered assemblies — do **not** ask the user which one to target by default. Discover it:

1. **Enumerate modules** — solution/workspace files, one test project/folder per source project (or note it has none).
2. **Gather cheap evidence per module**, reusing whatever already exists before generating anything new: existing coverage/mutation reports (freshest wins), a committed baseline/quality doc, git branch name and recent commit subjects, and whether a test project exists **at all** for that module.
3. **Rank by acceptance-layer gap severity**: no test project at all > a use case with zero test coverage > a use case with a weak/theater test > a module only missing mutation survivors. Tie-break on business criticality, blast radius (behavior/mutant count), or the module implicated by the current git signal.
4. **Apply outside-in across modules, not just within one**: sweep for acceptance-layer gaps across all ranked modules first; do not exhaust all 4 stages in module A before checking whether module B has a more severe, completely untested acceptance-layer gap.
5. **Select and proceed** — record the ranked candidates and evidence in the Required Decision Output, then start on the top-ranked target. Only ask the user when no evidence-gathering tool is available or candidates are genuinely tied.

Full algorithm and a worked example: `references/multi-project-scope-selection.md`.

## Step 0: Assess Current State

Before starting the workflow, assess the current test state:

### Assessment Questions

1. **Do tests exist for the target code?**
   - Yes → Scenario A (improve existing tests)
   - No → Scenario B (create tests for legacy code)

2. **If tests exist, what is their quality?**
   - Run `test-analyze-test-smells` to detect issues
   - Check coverage: `test-evaluate-targeted-coverage`
   - Check mutation score (if available): `test-evaluate-focused-mutation`

3. **What is the coverage level?**
   - 0% → Scenario B (legacy characterization)
   - 1-79% → Scenario A with heavy Stage 3 work
   - 80%+ with low mutation score → Scenario A focused on Stage 2

### Routing Decision

| Current State                             | Route      | Primary Focus                           |
| ----------------------------------------- | ---------- | --------------------------------------- |
| No tests                                  | Scenario B | Stage 1 analysis → Stage 2 seams        |
| Tests with blocker smells                 | Scenario A | Stage 2 (refactor first)                |
| Tests with missing behavior coverage      | Scenario A | Stage 3 (add missing tests, outside-in) |
| Tests with good coverage but low mutation | Scenario A | Stage 2 + 4 (improve assertions)        |

### Outside-In Principle (Stage 3)

Stage 3 adds tests **outside-in by layer**, never by chasing a coverage percentage:

1. **Acceptance** (outermost) — mock only the external world (repositories/driven ports, external services, infra ports), keep the domain real.
2. **Unit** (middle) — pin branch-heavy domain internals not already locked by the acceptance layer.
3. **Integration** (innermost) — exercise each driven adapter against real infrastructure, no in-boundary mocks.

Coverage and mutation are **evidence** that each layer's behaviors are exercised — they are lagging indicators, never the driver. Never add a test whose only justification is raising a number. Layer boundaries are defined in [docs/RULES.md](../../../docs/RULES.md). This outside-in backfill order (widest behavioral net first) is deliberate and differs from the per-story RED flow in RULES.md.

**Before declaring the acceptance layer complete**, enumerate the full driving surface — every REST endpoint (verb + route) for an HTTP API, or every public use-case entry point otherwise — and check each one directly against test files. A coverage/quality-baseline doc's list of flagged gaps is not a substitute for this enumeration: such docs are often scoped to a single test project and can both miss real gaps and falsely flag behavior that is actually covered by tests in a different test project (e.g. HTTP-level tests in an Api.Tests project exercising an Application-layer workflow). Only a full endpoint/entry-point sweep, checked file-by-file, supports a "layer complete" conclusion.

**Multiple projects/modules**: outside-in applies across the workspace before it applies within one module. When several projects exist, rank and start the acceptance sweep on the module with the widest gap first (see Step -1), rather than exhausting all 4 stages in whichever module happened to be mentioned first.

## Scenario A: Improve Existing Tests

Use when tests exist but have quality issues.

### Stage 1: Detect Test Issues

**Skill**: `test-analyze-test-smells`

Review the target tests, classify findings by severity, and decide whether refactoring is required before any new tests are added.

**Gate Criteria**:

- All test smells classified
- Blocker/Critical smells clearly identified
- No uncertainty about smell count or severity

**Exit Decision**:

- If Blocker/Critical smells found → Stage 2 (Refactor)
- If only Medium/Low smells → Stage 3 (Add Missing Tests)
- If no smells and behaviors are unprotected at any layer → Stage 3 (Add Missing Tests)
- If no smells and all layers protected → Stage 4 (Validate)

### Stage 2: Refactor Test Smells

**Skill**: `test-refactor-test-smells`

Remove Blocker and Critical smells first, validating after each refactoring step so the suite stays stable.

**Gate Criteria**:

- All Blocker smells resolved
- All Critical smells resolved
- Tests still pass after refactoring
- No new smells introduced

**Exit Decision**:

- If behaviors are unprotected at any layer → Stage 3 (Add Missing Tests)
- If all layers protected → Stage 4 (Validate)

### Stage 3: Add Missing Tests (Outside-In)

Add tests **outside-in by layer** — Acceptance → Unit → Integration — driven by unprotected behavior, not by a coverage percentage. Complete each layer before moving inward.

**Sub-steps**:

- **3a Acceptance** — `test-generate-acceptance-tests`: exercise each use case through its entry point, mocking only the external world (repositories/driven ports, external services, infra ports), keeping the domain real.
- **3b Unit** — `test-generate-unit-characterization-tests` (or `test-generate-golden-master-tests` for complex outputs): pin branch-heavy domain internals not already locked by the acceptance layer.
- **3c Integration** — `test-generate-integration-tests`: exercise each driven adapter the acceptance layer mocked against real infrastructure, no in-boundary mocks. Use `test-generate-missing-coverage-tests` to close remaining per-layer behavior gaps.

**Gate Criteria** (behavior-at-layer, coverage as evidence only):

- Every use-case behavior has an acceptance test mocking only the external world
- Every branch-heavy domain class has unit tests
- Every driven adapter has integration tests against real infrastructure
- All behavior families covered per target: happy path, edge cases, failure modes
- For HTTP APIs, acceptance completeness is confirmed by a full endpoint (verb+route) enumeration cross-checked against test files; for other driving surfaces (CLI commands, message/event consumers, public library API), the equivalent full entry-point enumeration is used instead — never inferred from a coverage/quality-baseline doc alone
- Coverage/mutation confirm the above (lagging evidence, never the target)
- No new test smells introduced

**Exit Decision**:

- All layers protected → Stage 4 (Validate)
- Any layer still has unprotected behavior → Continue Stage 3 at the outermost incomplete layer

### Stage 4: Validate Quality

**Skills**:

- `test-evaluate-focused-mutation`
- `test-validate-characterization-quality`

Run focused mutation testing and the final characterization gate, then triage survivors until the remaining risk is explicitly explained.

**Gate Criteria**:

- Mutation score ≥85%
- All surviving mutants triaged
- No Testing Theater patterns present
- Coverage maintained or improved

**Success**: Workflow complete, tests are high quality

## Scenario B: Legacy Code Without Tests

Use when target code has no tests (0% coverage).

### Stage 1: Analyze Testability Blockers

**Skills**:

- `test-analyze-testability-blockers` (taxonomy-based blocker detection)
- `test-analyze-testability-blockers` (cross-component prioritization)

Identify what prevents tests, then rank where to invest first.

**Gate Criteria**:

- blocker evidence captured for top targets
- prioritized target list produced

### Stage 2: Plan Seam Work

**Skills**:

- `test-plan-seam-refactoring` (default path)
- `test-analyze-fallback-strategies` (only when seam risk is high)

Create behavior-preserving seam plans for prioritized targets before writing characterization tests.

**Gate Criteria**:

- seam plan exists for prioritized target(s)
- chosen path (default seam vs fallback) is justified

### Stage 3: Add Characterization Tests (Outside-In)

**Skills** (applied in outside-in order):

- `test-generate-acceptance-tests` (outermost — mock only the external world, real domain)
- `test-generate-unit-characterization-tests` (middle — branch-heavy domain internals)
- `test-generate-integration-tests` (innermost — driven adapters against real infrastructure)
- `test-generate-golden-master-tests` (for complex outputs at any layer)

Lock current behavior outside-in: start with acceptance tests around each use case, then unit characterization for residual domain logic, then integration tests for the adapters the acceptance layer mocked. Control non-determinism first and favor the strongest stable test shape per behavior family. Seams from Stage 2 must make each layer constructible before its tests are written.

**Gate Criteria** (same as Scenario A Stage 3):

- Every use-case behavior protected by acceptance tests (external world mocked)
- Every branch-heavy domain class protected by unit tests
- Every driven adapter protected by integration tests (real infrastructure)
- All behavior families covered (happy/edge/failure)
- Coverage/mutation confirm the above as evidence, not as the target
- Determinism controls in place

**Exit Decision**: → Stage 4 (Validate)

### Stage 4: Validate Quality

Same as Scenario A Stage 4.

## Stage Gates and Success Criteria

### Stage 1 Gate: Detection Complete

- ✅ All test files reviewed for smells
- ✅ Findings classified by severity
- ✅ Blocker/Critical smells identified
- ✅ Exit routing decision made

### Stage 2 Gate: Refactoring Complete

- ✅ All Blocker smells resolved
- ✅ All Critical smells resolved
- ✅ Tests pass after refactoring
- ✅ No new smells introduced

### Stage 3 Gate: Missing Tests Added (Outside-In)

- ✅ Every use-case behavior has an acceptance test (external world mocked)
- ✅ Every branch-heavy domain class has unit tests
- ✅ Every driven adapter has integration tests (real infrastructure)
- ✅ Happy path covered
- ✅ Edge cases covered
- ✅ Failure modes covered
- ✅ Coverage/mutation confirm the above as evidence (not chased as a target)
- ✅ No test smells in new tests

### Stage 4 Gate: Validation Complete

- ✅ Mutation score ≥85%
- ✅ Surviving mutants triaged
- ✅ No Testing Theater present
- ✅ Quality gate passed

## Detailed Guidance

Read `references/WORKFLOW.md` for the full workflow map and role boundaries across the test skills.

Read `references/workflow-troubleshooting.md` for common failure modes during Stage 1 through Stage 4.

Read `references/multi-project-scope-selection.md` **before** asking the user which module/project to target — it defines how to auto-discover and rank candidates so that question is rarely needed.

## Output Format

```markdown
# Test Quality Workflow Report

## Assessment

- Candidate Modules Considered: {ranked list + one-line evidence each, or "single module — no discovery needed"}
- Selected Target: {module/package} — {why it ranked first}
- Current State: {no tests | tests with issues | partial coverage}
- Scenario: {A - Improve Existing | B - Legacy Code}
- Routing Decision: {Stage 1 | Stage 3}

## Stage 1: Detection (if applicable)

- Skill Used: test-analyze-test-smells
- Blocker Smells: {count} - {list}
- Critical Smells: {count} - {list}
- Gate Status: {PASS | FAIL}
- Exit Decision: {Stage 2 | Stage 3}

## Stage 2: Refactoring (if applicable)

- Skill Used: test-refactor-test-smells
- Smells Fixed: {list}
- Tests Pass: {YES | NO}
- Gate Status: {PASS | FAIL}
- Exit Decision: {Stage 3 | Stage 4}

## Stage 3: Add Missing Tests (Outside-In)

- Order Applied: Acceptance → Unit → Integration
- Skills Used: {test-generate-acceptance-tests | test-generate-unit-characterization-tests | test-generate-integration-tests | test-generate-missing-coverage-tests}
- Acceptance (use-case behaviors protected): {list}
- Unit (domain classes protected): {list}
- Integration (adapters protected): {list}
- Happy Path: {Detected | Missing}
- Edge Cases: {Detected | Missing}
- Failure Modes: {Detected | Missing}
- Coverage/Mutation Evidence: {summary — evidence only}
- Gate Status: {PASS | FAIL}
- Exit Decision: Stage 4

## Stage 4: Validation

- Skills Used: test-evaluate-focused-mutation, test-validate-characterization-quality
- Mutation Score: {score}%
- Survivors: {killed}/{total}
- Triaged: {test gap: N | equivalent: N | deferred: N}
- Gate Status: {PASS | FAIL}

## Workflow Result

- Status: {COMPLETE | NEEDS_REVISION}
- Quality Level: {Blocker Issues | Low Quality | Good Quality | Excellent Quality}
- Next Steps: {none | address survivors | improve coverage}
```

## Success Criteria

- Workflow executed in correct stage order
- Target module/project selected via ranked evidence (Step -1), not a default clarifying question, whenever discovery tools were available
- All stage gates passed
- Final mutation score ≥85%
- No Blocker or Critical test smells remain
- Every behavior protected at its layer (acceptance/unit/integration), with coverage as confirming evidence
- Surviving mutants triaged and explained

## Related Skills

**Detection**: `test-analyze-test-smells`
**Refactoring**: `test-refactor-test-smells`
**Add Missing Tests (Outside-In)**: `test-generate-acceptance-tests`, `test-generate-unit-characterization-tests`, `test-generate-integration-tests`, `test-generate-golden-master-tests`, `test-generate-missing-coverage-tests`, `test-evaluate-targeted-coverage`
**Validation**: `test-evaluate-focused-mutation`, `test-validate-characterization-quality`
