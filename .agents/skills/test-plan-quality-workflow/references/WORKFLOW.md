# Test Skills Workflow Integration Reference

## Purpose

This document validates that all test-\* skills have clear roles in the test quality improvement workflows and documents when and how each skill is used.

## Two Complementary Workflows

The test skills ecosystem supports two complementary workflows:

### Workflow A: Test Quality Improvement (Existing Tests)

**Stages**: Detect → Refactor → Add Missing Tests (Outside-In) → Validate
**Entry**: Code with 10-79% coverage and potential test quality issues
**Planner**: `test-plan-quality-workflow` (Scenario A)

### Workflow B: Legacy Code Testing (No Tests)

**Stages**: Analysis → Seam Work → Characterization → Quality Gate
**Entry**: Legacy code with 0% coverage
**Planner**: `test-plan-quality-workflow` (Scenario B)

---

## Complete Skill Inventory (16 Skills)

All test-\* skills validated ✅:

1. test-plan-quality-workflow
2. test-analyze-testability-blockers
3. test-analyze-fallback-strategies
4. test-plan-seam-refactoring
5. test-analyze-test-smells
6. test-refactor-test-smells
7. test-generate-missing-coverage-tests
8. test-generate-acceptance-tests
9. test-generate-unit-characterization-tests
10. test-generate-integration-tests
11. test-generate-golden-master-tests
12. test-plan-characterization-tests
13. test-generate-object-mother-fixtures
14. test-evaluate-targeted-coverage
15. test-evaluate-focused-mutation
16. test-validate-characterization-quality

---

## Workflow A: Test Quality Improvement (Existing Tests)

### Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  WORKFLOW A: IMPROVE EXISTING TESTS              │
│                       (10-79% coverage)                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: DETECT Issues                                          │
│ Skill: test-analyze-test-smells                                  │
│ Output: Smell inventory (Blocker/Critical/High/Medium/Low)      │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: REFACTOR Smells (if Blocker/Critical found)            │
│ Skill: test-refactor-test-smells                                │
│ Output: Clean tests free of critical smells                     │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: ADD MISSING TESTS (OUTSIDE-IN)                         │
│ Order: Acceptance → Unit → Integration                          │
│ Skills:                                                          │
│  - test-generate-acceptance-tests (mock only the external world)│
│  - test-generate-unit-characterization-tests (domain internals) │
│  - test-generate-integration-tests (real infrastructure)        │
│  - test-generate-missing-coverage-tests (per-layer behavior gaps)│
│  - test-evaluate-targeted-coverage (evidence, not a target)     │
│  - test-generate-object-mother-fixtures (test data)             │
│ Output: every behavior protected at its layer                   │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4: VALIDATE Quality                                       │
│ Skills:                                                          │
│  - test-evaluate-focused-mutation (validate new tests)               │
│  - test-validate-characterization-quality (final gate)        │
│  - test-analyze-test-smells (verify no new smells)               │
│ Output: Mutation score ≥85%, quality gate PASS                  │
└─────────────────────────────────────────────────────────────────┘
```

### Workflow A Skill Roles

| Skill                                  | Stage | When Used            | Role                                         | Status        |
| -------------------------------------- | ----- | -------------------- | -------------------------------------------- | ------------- |
| test-plan-quality-workflow             | All   | Entry point          | Routes to Scenario A, coordinates all stages | ✅ Required   |
| test-analyze-test-smells               | 1, 4  | Start and validation | Detect 19 smell types, verify no new smells  | ✅ Critical   |
| test-refactor-test-smells              | 2     | If smells found      | Fix Blocker/Critical smells step-by-step     | ✅ Critical   |
| test-generate-missing-coverage-tests   | 3     | Coverage <80%        | Add tests to partially tested code           | ✅ Critical   |
| test-evaluate-targeted-coverage        | 3     | Measure gaps         | Identify uncovered lines/branches            | ✅ Critical   |
| test-generate-object-mother-fixtures   | 3     | Complex test data    | Create reusable test fixtures                | ✅ Supporting |
| test-evaluate-focused-mutation         | 4     | Validation           | Verify tests catch real bugs (≥85% score)    | ✅ Critical   |
| test-validate-characterization-quality | 4     | Final gate           | Consolidate all evidence, issue verdict      | ✅ Critical   |

**Skills Used**: 8 skills (7 critical + 1 supporting)
**Typical Path**: Planner → Detect (1) → Refactor (2) → Add Missing Tests Outside-In (3) → Validate (4)

---

## Workflow B: Legacy Code Testing (No Tests)

### Overview

```
┌─────────────────────────────────────────────────────────────────┐
│              WORKFLOW B: LEGACY CODE CHARACTERIZATION            │
│                          (0% coverage)                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: ANALYSIS (Assess Testability)                          │
│ Skills:                                                          │
│  - test-analyze-testability-blockers (detect + rank blockers)   │
│ Output: Blocker inventory or "testable" verdict                 │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: SEAM WORK (Make Testable)                              │
│ Skills:                                                          │
│  - test-plan-seam-refactoring (apply seams)                 │
│  - test-analyze-fallback-strategies (if seams too risky)  │
│ Output: Code is now testable (seams verified)                   │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: CHARACTERIZATION (Lock Behavior)                       │
│ Skills:                                                          │
│  - test-plan-characterization-tests (plan approach)                   │
│  - test-generate-unit-characterization-tests (explicit assertions - primary)       │
│  - test-generate-golden-master-tests (approval tests)             │
│  - test-generate-object-mother-fixtures (test data)                      │
│  - test-evaluate-targeted-coverage (measure coverage)                │
│ Output: Characterization tests with 80%+ coverage               │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4: QUALITY GATE (Validate Tests)                          │
│ Skills:                                                          │
│  - test-validate-characterization-quality (orchestrate)       │
│  - test-evaluate-focused-mutation (mutation testing)                 │
│  - test-evaluate-targeted-coverage (coverage validation)             │
│  - test-analyze-test-smells (smell check)                        │
│ Output: Quality gate PASS, safe to refactor                     │
└─────────────────────────────────────────────────────────────────┘
```

### Workflow B Skill Roles

| Skill                                     | Stage | When Used         | Role                                                | Status        |
| ----------------------------------------- | ----- | ----------------- | --------------------------------------------------- | ------------- |
| test-plan-quality-workflow                | All   | Entry point       | Routes to Scenario B, coordinates all stages        | ✅ Required   |
| test-analyze-testability-blockers         | 1     | Start of analysis | Detect blockers (11 smell types) and rank targets   | ✅ Critical   |
| test-plan-seam-refactoring                | 2     | Apply seams       | Generate refactoring for 18 seam patterns           | ✅ Critical   |
| test-analyze-fallback-strategies          | 2     | If seams risky    | Provide alternative approaches (Wrap, Sprout, etc.) | ✅ Used       |
| test-plan-characterization-tests          | 3     | Plan tests        | Generate test scaffolding, plan approach            | ✅ Optional   |
| test-generate-unit-characterization-tests | 3     | Primary technique | Create unit tests with explicit assertions          | ✅ Critical   |
| test-generate-golden-master-tests         | 3     | Complex outputs   | Create approval tests for complex outputs           | ✅ Used       |
| test-generate-object-mother-fixtures      | 3     | Test data         | Create reusable test fixtures                       | ✅ Supporting |
| test-evaluate-targeted-coverage           | 3, 4  | Measure coverage  | Identify gaps, validate coverage achieved           | ✅ Critical   |
| test-evaluate-focused-mutation            | 4     | Validation        | Verify tests catch real bugs (≥85% score)           | ✅ Critical   |
| test-validate-characterization-quality    | 4     | Final gate        | Consolidate all evidence, issue verdict             | ✅ Critical   |
| test-analyze-test-smells                  | 4     | Validation        | Verify new tests are smell-free                     | ✅ Critical   |

**Skills Used**: 13 skills (9 critical + 2 used + 1 optional + 1 supporting)
**Typical Path**: Planner → Analysis (1) → Seam Work (2) → Characterization (3) → Quality Gate (4)

---

## Skill-by-Skill Integration Validation

### 1. test-plan-quality-workflow ✅

**Role**: Master planner and sequencer for both workflows

**When Used**:

- Entry point for all test quality work
- Routes to Workflow A (Scenario A) or Workflow B (Scenario B)

**How Used**:

1. Assesses current state (tests exist? coverage? quality?)
2. Routes to appropriate scenario
3. Coordinates stage progression
4. Enforces stage gates
5. Tracks overall progress

**Used In**: Cross-cutting (both workflows)
**Status**: ✅ CRITICAL - Required entry point

---

### 2. test-analyze-testability-blockers ✅

**Role**: Detect what makes legacy code untestable (11-smell taxonomy) and rank where to invest first

**When Used**:

- Workflow B (Scenario B - legacy code)
- Stage 1: Analysis
- Before attempting characterization or seam refactoring

**How Used**:

1. Analyzes code for testability barriers (hard dependencies on time, random, DB, filesystem; static methods, singletons, new operators)
2. Catalogs each blocker with location and type using the 11-smell taxonomy
3. Prioritizes blockers/targets by severity and value
4. Recommends the likely seam direction for each blocker

**Output**: Blocker inventory + priority ranking → routes to Stage 2 (if blockers) or Stage 3 (if clean)

**Used In**: Workflow B only
**Status**: ✅ CRITICAL for Scenario B

---

### 3. test-analyze-fallback-strategies ✅

**Role**: Provide alternative approaches when seams are too risky

**When Used**:

- Workflow B when seam refactoring is not viable
- Stage 2: Seam Work (alternative path)
- When stakeholder approval needed for invasive changes

**How Used**:

1. Evaluates why seams aren't viable (risk, cost, permissions)
2. Proposes fallback strategies:
   - Sprout Method/Class
   - Wrap Method
   - Strangler Fig pattern
   - Higher-level integration tests first
3. Documents trade-offs and risks

**Output**: Fallback strategy → adjusted Stage 3 approach

**Used In**: Workflow B only (conditional)
**Status**: ✅ USED when seams not viable

---

### 4. test-plan-seam-refactoring ✅

**Role**: Generate seam refactoring code using 18 Feathers patterns

**When Used**:

- Workflow B after blockers identified
- Stage 2: Seam Work
- When testability blockers must be removed

**How Used**:

1. Takes blocker inventory from `test-analyze-testability-blockers`
2. Selects appropriate seam pattern (Extract Interface, Parameterize Constructor, etc.)
3. Generates refactoring code
4. Validates behavior preservation (no logic changes)
5. Applies seams incrementally with verification

**Output**: Seam refactoring code → Stage 3 characterization (code now testable)

**Used In**: Workflow B only
**Status**: ✅ CRITICAL for Scenario B with blockers

**Key Patterns**: 18 patterns from Feathers' "Working Effectively with Legacy Code"

---

### 5. test-analyze-test-smells ✅

**Role**: Detect 19 test quality anti-patterns

**When Used**:

- **Workflow A**: Stage 1 (initial detection) and Stage 4 (validation)
- **Workflow B**: Stage 4 only (validate new tests)
- After any test addition to verify quality

**How Used**:

1. Scans test files for anti-patterns
2. Classifies by severity: Blocker (Testing Theater) → Critical → High → Medium → Low
3. Identifies specific smell instances with locations
4. Reports inventory

**Output**: Smell inventory → Stage 2 refactoring (if Blocker/Critical found)

**Used In**: Both workflows
**Status**: ✅ CRITICAL - Used in both workflows

**Detects**: 19 smell types including Testing Theater (10 sub-patterns), Implementation Coupling, Port-Boundary Violations

---

### 6. test-refactor-test-smells ✅

**Role**: Step-by-step refactoring procedures for all 19 test smells

**When Used**:

- **Workflow A**: Stage 2 (primary use - refactor existing bad tests)
- **Workflow B**: Stage 4 only if new tests have smells (rare)
- Required when Blocker/Critical smells detected

**How Used**:

1. Takes smell inventory from `test-analyze-test-smells`
2. Prioritizes by severity (Blocker first)
3. Provides detailed refactoring steps for each smell
4. Applies one smell at a time with verification
5. Runs tests after each fix

**Output**: Refactored tests → Stage 3 (add missing tests outside-in) or Stage 4 (validate)

**Used In**: Primarily Workflow A
**Status**: ✅ CRITICAL for Scenario A with smells

**Fixes**: All 19 smells with before/after examples and safety procedures

---

### 7. test-generate-missing-coverage-tests ✅

**Role**: Rank per-layer behavior gaps in partially tested code and hand off to the right layer generator

**When Used**:

- **Workflow A**: Stage 3 (rank behavior gaps at the outermost incomplete layer)
- **Workflow B**: Not used (0% coverage uses characterization instead)
- After Stage 2 refactoring if behaviors remain unprotected at any layer

**How Used**:

1. Measures baseline with `test-evaluate-targeted-coverage`
2. Maps uncovered lines/branches to missing _behaviors_ (not raw numbers)
3. Assigns each behavior to a layer (Acceptance → Unit → Integration), outermost first
4. Hands off to that layer's generator to write the test
5. Validates that the behavior is now exercised (coverage as evidence)
6. Uses test shape preference: Property-Based > Parameterized > Single

**Output**: Behavior gaps ranked and routed to layer generators → Stage 4 validation

**Used In**: Workflow A only
**Status**: ✅ CRITICAL for Scenario A

**Coverage Range**: 10-79% → 80%+

---

### 8. test-generate-unit-characterization-tests ✅

**Role**: Create unit tests with explicit assertions for legacy code (0% coverage)

**When Used**:

- **Workflow B**: Stage 3 (primary characterization technique)
- **Workflow A**: Not typically used (already has tests)
- After seams applied in Stage 2

**How Used**:

1. Applies characterization loop: write test, run, observe, lock behavior
2. Chooses test shape: Property-Based > Parameterized > Single
3. Covers behavior families: Happy Path, Edge Cases, Failure Modes
4. Uses real domain objects, mocks only infrastructure
5. Creates explicit assertions based on observed current behavior

**Output**: Unit characterization tests → Stage 4 validation

**Used In**: Workflow B only
**Status**: ✅ CRITICAL for Scenario B

**Coverage Range**: 0% → 80%+

---

### 9. test-generate-golden-master-tests ✅

**Role**: Create approval tests for complex outputs (0% coverage)

**When Used**:

- **Workflow B**: Stage 3 (alternative to unit characterization)
- When output is too complex for explicit assertions
- Reports, HTML, JSON, large data structures

**How Used**:

1. Captures current output as approval artifact
2. Uses Cartesian product strategy for input space
3. Normalizes non-determinism (timestamps, IDs, order)
4. Stores golden master files
5. Compares future runs against approved baseline

**Output**: Approval test suite → Stage 4 validation

**Used In**: Workflow B only (alternative technique)
**Status**: ✅ USED for complex outputs

**When to Prefer**: Complex outputs, multiple input dimensions, large output graphs

---

### 10. test-plan-characterization-tests ✅

**Role**: Generate initial characterization test scaffolding

**When Used**:

- **Workflow B**: Stage 3 (optional accelerator)
- Start of characterization to bootstrap quickly
- Large codebases where manual test creation is time-consuming

**How Used**:

1. Analyzes legacy code structure
2. Identifies public methods and entry points
3. Generates test scaffolding with TODO assertions
4. Creates file structure matching code organization
5. User completes assertions based on observed behavior

**Output**: Test scaffolding → User completes with `test-generate-unit-characterization-tests`

**Used In**: Workflow B only (optional)
**Status**: ✅ OPTIONAL accelerator

**Note**: Generates incomplete tests - user must fill in assertions

---

### 11. test-generate-object-mother-fixtures ✅

**Role**: Generate test data builders (Object Mother pattern)

**When Used**:

- **Both workflows**: Stage 3 (cross-cutting support)
- When test setup data is complex or duplicated
- Creates reusable fixtures for test data

**How Used**:

1. Identifies complex objects used in tests
2. Generates builder/factory classes
3. Creates sensible defaults
4. Provides fluent API for customization
5. Reduces test duplication

**Output**: Object Mother/Builder classes → Used by characterization and coverage skills

**Used In**: Both workflows (supporting skill)
**Status**: ✅ SUPPORTING - Cross-cutting test data support

---

### 12. test-evaluate-targeted-coverage ✅

**Role**: Run tests and measure coverage with platform-specific tools

**When Used**:

- **Both workflows**: Stage 3 (measure baseline and gaps) and Stage 4 (validation)
- Before adding tests (baseline)
- After each test (verify improvement)
- Final validation (consolidate evidence)

**How Used**:

1. Detects platform (Python/JS/C#/Go)
2. Selects appropriate tool (pytest-cov, Jest, JaCoCo, etc.)
3. Verifies tool installation/configuration
4. Runs tests with coverage
5. Generates reports (HTML, JSON, terminal)
6. Identifies uncovered lines/branches

**Output**: Coverage report → Feeds gap prioritization or validation evidence

**Used In**: Both workflows (measurement skill)
**Status**: ✅ CRITICAL - Required for coverage measurement

**Platform Support**: Python, JavaScript/TypeScript, C#, Go

---

### 13. test-evaluate-focused-mutation ✅

**Role**: Run mutation testing to validate tests catch real bugs

**When Used**:

- **Both workflows**: Stage 4 (validation)
- After tests added/written
- Validates test quality (not just coverage)
- Enforces 85% minimum mutation score

**How Used**:

1. Determines smallest mutation scope for changed code
2. Selects platform tool (Stryker, mutmut, PIT, etc.)
3. Verifies tool installation/configuration
4. Runs focused mutation on production code
5. Triages surviving mutants (test gap / equivalent / deferred)
6. Reports mutation score

**Output**: Mutation report → Quality gate evidence

**Used In**: Both workflows (validation skill)
**Status**: ✅ CRITICAL - Required quality gate

**Scope Strategy**: Function → File → Package → Flow (smallest viable)

**Quality Gate**: ≥85% mutation score with triaged survivors

---

### 14. test-validate-characterization-quality ✅

**Role**: Unified quality gate consolidating all evidence

**When Used**:

- **Both workflows**: Stage 4 (final validation)
- After `test-evaluate-focused-mutation` completes
- Before declaring work complete
- Issues PASS / PASS_WITH_WARNINGS / FAIL verdict

**How Used**:

1. Validates taxonomy level selection (unit/integration/acceptance/e2e)
2. Confirms behavior family coverage (happy/edge/failure)
3. Reviews test shape strategy (PBT/Parameterized/Single)
4. Verifies determinism controls
5. Consolidates coverage evidence from `test-evaluate-targeted-coverage`
6. Consolidates mutation evidence from `test-evaluate-focused-mutation`
7. Runs `test-analyze-test-smells` for hygiene check
8. Issues final verdict

**Output**: Comprehensive quality gate report

**Used In**: Both workflows (final gate)
**Status**: ✅ CRITICAL - Required final validation

**Validates**: Level justified, coverage ≥80%, mutation ≥85%, no smells, determinism controls

---

## Skill Usage Matrix

### Cross-Workflow Comparison

| Skill                                     | Workflow A<br/>(Existing Tests) | Workflow B<br/>(Legacy Code) | Primary Use Case |
| ----------------------------------------- | ------------------------------- | ---------------------------- | ---------------- |
| test-plan-quality-workflow                | ✅ Entry                        | ✅ Entry                     | Both             |
| test-analyze-testability-blockers         | -                               | ✅ Stage 1                   | Legacy only      |
| test-analyze-fallback-strategies          | -                               | ✅ Stage 2                   | Legacy only      |
| test-plan-seam-refactoring                | -                               | ✅ Stage 2                   | Legacy only      |
| test-analyze-test-smells                  | ✅ Stage 1, 4                   | ✅ Stage 4                   | Both             |
| test-refactor-test-smells                 | ✅ Stage 2                      | Rare                         | Existing tests   |
| test-generate-missing-coverage-tests      | ✅ Stage 3                      | -                            | Existing tests   |
| test-generate-acceptance-tests            | ✅ Stage 3 (3a)                 | ✅ Stage 3 (3a)              | Both             |
| test-generate-unit-characterization-tests | ✅ Stage 3 (3b)                 | ✅ Stage 3 (3b)              | Both             |
| test-generate-integration-tests           | ✅ Stage 3 (3c)                 | ✅ Stage 3 (3c)              | Both             |
| test-generate-golden-master-tests         | -                               | ✅ Stage 3                   | Legacy only      |
| test-plan-characterization-tests          | -                               | Optional Stage 3             | Legacy only      |
| test-generate-object-mother-fixtures      | ✅ Stage 3                      | ✅ Stage 3                   | Both             |
| test-evaluate-targeted-coverage           | ✅ Stage 3, 4                   | ✅ Stage 3, 4                | Both             |
| test-evaluate-focused-mutation            | ✅ Stage 4                      | ✅ Stage 4                   | Both             |
| test-validate-characterization-quality    | ✅ Stage 4                      | ✅ Stage 4                   | Both             |

### Skills by Workflow Coverage

**Workflow A Only** (3 skills):

- test-refactor-test-smells
- test-generate-missing-coverage-tests
- (test-analyze-test-smells used more heavily in A)

**Workflow B Only** (6 skills):

- test-analyze-testability-blockers
- test-analyze-fallback-strategies
- test-plan-seam-refactoring
- test-generate-unit-characterization-tests
- test-generate-golden-master-tests
- test-plan-characterization-tests

**Both Workflows** (6 skills):

- test-plan-quality-workflow (orchestration)
- test-analyze-test-smells (detection + validation)
- test-generate-object-mother-fixtures (supporting)
- test-evaluate-targeted-coverage (measurement)
- test-evaluate-focused-mutation (validation)
- test-validate-characterization-quality (final gate)

---

## Validation Results

### ✅ All Skills Have Clear Roles

Every test-\* skill has a defined, validated role:

- **1 Planner**: test-plan-quality-workflow
- **9 Critical**: Required in their respective workflows
- **3 Used**: Needed for specific scenarios
- **1 Optional**: Accelerator (test-plan-characterization-tests)
- **1 Supporting**: Cross-cutting (test-generate-object-mother-fixtures)

**Total**: 14 skills, all validated ✅

### ✅ Complete Stage Coverage

**Workflow A Stages**:

- Stage 1 (Detect): 1 skill ✅
- Stage 2 (Refactor): 1 skill ✅
- Stage 3 (Add Coverage): 3 skills ✅
- Stage 4 (Validate): 3 skills ✅

**Workflow B Stages**:

- Stage 1 (Analysis): 1 skill ✅
- Stage 2 (Seam Work): 2 skills ✅
- Stage 3 (Characterization): 6 skills ✅
- Stage 4 (Quality Gate): 4 skills ✅

### ✅ No Orphan Skills

All 14 skills integrate into at least one workflow. Zero orphans.

### ✅ No Workflow Gaps

All workflow needs are covered:

- ✅ Testability assessment (Workflow B)
- ✅ Seam refactoring (Workflow B)
- ✅ Smell detection (Both)
- ✅ Smell refactoring (Workflow A)
- ✅ Partial coverage (Workflow A)
- ✅ Zero coverage characterization (Workflow B)
- ✅ Coverage measurement (Both)
- ✅ Test data generation (Both)
- ✅ Mutation testing (Both)
- ✅ Quality gates (Both)
- ✅ Workflow orchestration (Both)

### ✅ Consistent Quality Gates

Both workflows enforce the same quality standards:

- Coverage ≥80% (line)
- Mutation score ≥85%
- No high-severity test smells
- Surviving mutants triaged
- Determinism controls applied

---

## Usage Patterns

### Sequential Pattern (Pipeline)

Skills form pipelines where output of one feeds the next:

**Workflow A Pipeline**:

```
test-analyze-test-smells → test-refactor-test-smells → test-generate-missing-coverage-tests → test-evaluate-focused-mutation → test-validate-characterization-quality
```

**Workflow B Pipeline**:

```
test-analyze-testability-blockers → test-plan-seam-refactoring → test-generate-unit-characterization-tests → test-evaluate-focused-mutation → test-validate-characterization-quality
```

### Parallel Pattern (Multiple Options)

Some stages offer multiple techniques used in parallel:

**Workflow B Stage 3** (Choose characterization technique):

```
├─ test-generate-unit-characterization-tests (most common)
├─ test-generate-golden-master-tests (complex outputs)
└─ test-plan-characterization-tests (optional scaffolding)
```

### Supporting Pattern (Cross-Cutting)

Some skills support others without being in main path:

```
test-generate-missing-coverage-tests
  └─ calls: test-evaluate-targeted-coverage
  └─ uses: test-generate-object-mother-fixtures

test-generate-unit-characterization-tests
  └─ calls: test-evaluate-targeted-coverage
  └─ uses: test-generate-object-mother-fixtures
```

### Validation Pattern (Re-Entry)

Some skills used at multiple stages:

```
Stage 1: test-analyze-test-smells (detect)
Stage 4: test-analyze-test-smells (validate no new smells)

Stage 3: test-evaluate-targeted-coverage (measure baseline and gaps)
Stage 4: test-evaluate-targeted-coverage (consolidate evidence)
```

---

## Recommended Entry Points

### For Users

**"I want to improve test quality"**
→ `test-plan-quality-workflow` (auto-routes to appropriate workflow)

**"I need to add tests to legacy code with no tests"**
→ `test-plan-quality-workflow` (routes to Workflow B)

**"My tests have quality issues"**
→ `test-analyze-test-smells` → `test-refactor-test-smells`

**"Code is untestable, too many dependencies"**
→ `test-analyze-testability-blockers` → `test-plan-seam-refactoring`

**"I just want to measure coverage"**
→ `test-evaluate-targeted-coverage` (standalone)

**"I just want to run mutation testing"**
→ `test-evaluate-focused-mutation` (standalone)

### For Planner

The planner automatically routes based on assessment:

```
test-plan-quality-workflow
  ├─ If tests exist (10-79% coverage) → Workflow A
  └─ If no tests (0% coverage) → Workflow B
```
