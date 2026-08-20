# Test Skills Workflow Diagram

The `test-*` skills form a planner-coordinated ecosystem. `test-plan-quality-workflow`
assesses the current state and routes to one of two 4-stage workflows, which converge
on a shared Stage 4 quality gate.

```
                          ┌───────────────────────────────────────────┐
                          │   Improve test quality / add missing tests  │
                          └───────────────────────────────────────────┘
                                              │
                                              ▼
                     ┌─────────────────────────────────────────────────┐
                     │          test-plan-quality-workflow             │
                     │     Assess state · route · enforce gates        │
                     └─────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
        tests exist,│ quality issues                    no tests, 0%    │
                    ▼                                                   ▼
   ╔═══════════════════════════════════╗          ╔═══════════════════════════════════╗
   ║  SCENARIO A — Improve Existing     ║          ║  SCENARIO B — Legacy              ║
   ║  Tests (10–79% coverage)           ║          ║  Characterization (0% coverage)   ║
   ╠═══════════════════════════════════╣          ╠═══════════════════════════════════╣
   ║ STAGE 1 · DETECT                   ║          ║ STAGE 1 · ANALYZE                 ║
   ║   test-analyze-test-smells         ║          ║   test-analyze-testability-       ║
   ║                                    ║          ║     blockers (detect + rank)      ║
   ║        │ Blocker/Critical          ║          ║              │                    ║
   ║        ▼                           ║          ║              ▼                    ║
   ║ STAGE 2 · REFACTOR                 ║          ║ STAGE 2 · SEAM WORK               ║
   ║   test-refactor-test-smells        ║          ║   test-plan-seam-refactoring      ║
   ║        │ (minor smells skip ─┐)    ║          ║   test-analyze-fallback-          ║
   ║        ▼                      │    ║          ║     strategies (if risky)         ║
   ║ STAGE 3 · ADD COVERAGE ◄──────┘    ║          ║              │                    ║
   ║   test-generate-missing-           ║          ║              ▼                    ║
   ║     coverage-tests                 ║          ║ STAGE 3 · CHARACTERIZE            ║
   ║   test-evaluate-targeted-coverage  ║          ║   test-plan-characterization-     ║
   ║   test-generate-object-mother-     ║          ║     tests                         ║
   ║     fixtures                       ║          ║   test-generate-unit-             ║
   ║                                    ║          ║     characterization-tests        ║
   ║                                    ║          ║   test-generate-golden-master-    ║
   ║                                    ║          ║     tests                         ║
   ║                                    ║          ║   test-generate-object-mother-    ║
   ║                                    ║          ║     fixtures                      ║
   ║                                    ║          ║   test-evaluate-targeted-coverage ║
   ╚═══════════════════════════════════╝          ╚═══════════════════════════════════╝
                    │ coverage ≥80%                                    │ coverage ≥80%
                    └─────────────────────────┬─────────────────────────┘
                                              ▼
              ╔═══════════════════════════════════════════════════════════╗
              ║  STAGE 4 · VALIDATE  (shared quality gate)                 ║
              ║    test-validate-characterization-quality  (orchestrate)  ║
              ║    test-evaluate-focused-mutation          (mutation ≥85%)║
              ║    test-evaluate-targeted-coverage                        ║
              ║    test-analyze-test-smells                (no new smells)║
              ╚═══════════════════════════════════════════════════════════╝
                                              │
                      ┌───────────────────────┴───────────────────────┐
                 PASS │                                    FAIL: gaps  │
                      ▼                                    / survivors │
        ┌───────────────────────────────┐                             │
        │ Tests high quality ·          │              back to planner │
        │ safe to refactor              │◄────── (re-route) ───────────┘
        └───────────────────────────────┘
```

> **Stage 3 is outside-in.** In both scenarios, Stage 3 adds tests by layer in the order **Acceptance → Unit → Integration**: `test-generate-acceptance-tests` (mock only the external world) → `test-generate-unit-characterization-tests` (domain internals) → `test-generate-integration-tests` (real infrastructure). The Stage 3 boxes above name the innermost skill for brevity; the acceptance and unit generators run first. Coverage is evidence, never the target.

## Stage gates

| Stage             | Gate                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| A1 Detect         | All smells classified; Blocker/Critical identified                                                  |
| A2 Refactor       | Blocker/Critical smells resolved; tests still pass                                                  |
| B1 Analyze        | Blocker evidence + prioritized target list                                                          |
| B2 Seam Work      | Seam plan exists; default-vs-fallback path justified                                                |
| Stage 3 (A3 / B3) | Every behavior protected at its layer (Acceptance→Unit→Integration); coverage/mutation are evidence |
| Stage 4           | Mutation ≥85%; survivors triaged; no Testing Theater                                                |

## Skill roster (14 skills)

**Planner**: `test-plan-quality-workflow`

**Detect / Analyze**: `test-analyze-test-smells` · `test-analyze-testability-blockers` · `test-analyze-fallback-strategies`

**Refactor / Seam**: `test-refactor-test-smells` · `test-plan-seam-refactoring`

**Coverage / Generate**: `test-plan-characterization-tests` · `test-generate-unit-characterization-tests` · `test-generate-golden-master-tests` · `test-generate-missing-coverage-tests` · `test-generate-object-mother-fixtures`

**Validate**: `test-evaluate-targeted-coverage` · `test-evaluate-focused-mutation` · `test-validate-characterization-quality`
