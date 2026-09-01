# Test Skills Workflow

`test-plan-quality-workflow` routes each selected driving behavior. Route from
the behavior's own evidence, not aggregate coverage from neighboring classes.

```text
                         test-plan-quality-workflow
                                      |
              +-----------------------+-----------------------+
              |                                               |
       existing tests for behavior                    no tests / 0% behavior coverage
              |                                               |
              v                                               v
   Scenario A: Improve Existing Tests             Scenario B: Legacy Characterization
   A1 test-analyze-test-smells                    B1 test-analyze-testability-blockers
              |                                               |
    blocker/critical smell?                         blocker prevents direct observation?
              |                                    B2 test-plan-seam-refactoring
       yes ----+---- no                           yes ----+---- no seam required → B3
               |                                    -> test-plan-seam-refactoring
               |                                    -> test-apply-seam-refactoring
               |                                    -> test-analyze-fallback-strategies
              v                                               |
    A2 test-refactor-test-smells                              v
              |                                      B3 characterize outside-in
              +-----------------------+-----------------------+
                                      |
                                      v
                    Stage 3: Acceptance -> Unit -> Integration
                    - test-generate-acceptance-tests
                    - test-generate-unit-characterization-tests
                    - test-generate-integration-tests
                    - test-generate-golden-master-tests (when approved output fits)
                    - test-generate-missing-coverage-tests (remaining behavior gaps)
                    - test-generate-object-mother-fixtures (supporting test data)
                                      |
                         behavior protection complete
                                      |
                                      v
                         Stage 4: Validate Evidence
                    - test-evaluate-targeted-coverage
                    - test-evaluate-focused-mutation
                    - test-analyze-test-smells
                    - test-validate-characterization-quality
                                      |
                       pass / warning / fail or blocked
                                      |
                         re-route to the owning stage
```

## Canonical Gates

| Stage | Gate |
| --- | --- |
| A1 Detect | Smells classified; Blocker/Critical findings identified. |
| A2 Refactor | Selected smell cluster removed, tests pass, remaining findings reported. |
| B1 Analyze | Blocker evidence and target priority recorded. |
| B2 Seam | Approved plan applied separately; behavior-preservation evidence recorded; no test generation in the seam change. |
| Stage 3 | Required behavior families protected at the correct layer; coverage is evidence, not the target. |
| Stage 4 | Quality gate has complete evidence; mutation meets the project gate or 85% default; survivors are triaged; no Blocker/Critical smell remains in the touched area. |

## Verdict Mapping

| Quality gate verdict | Shared decision contract |
| --- | --- |
| `PASS` | `COMPLETE` |
| `PASS_WITH_WARNINGS` | `COMPLETE_WITH_WARNINGS` |
| `FAIL` or missing prerequisite evidence | `BLOCKED` |

## Skill Roster

**Planner**: `test-plan-quality-workflow`

**Analyze**: `test-analyze-test-smells` · `test-analyze-testability-blockers` · `test-analyze-fallback-strategies`

**Refactor / Seam**: `test-refactor-test-smells` · `test-plan-seam-refactoring` · `test-apply-seam-refactoring`

**Generate**: `test-plan-characterization-tests` · `test-generate-acceptance-tests` · `test-generate-unit-characterization-tests` · `test-generate-integration-tests` · `test-generate-golden-master-tests` · `test-generate-missing-coverage-tests` · `test-generate-object-mother-fixtures`

**Evaluate / Validate**: `test-evaluate-targeted-coverage` · `test-evaluate-focused-mutation` · `test-evaluate-skipped-files` · `test-evaluate-hotspot-priority` · `test-validate-characterization-quality`

Shared ownership, prerequisite, and decision fields are defined in
`test-skills-decision-contract.md`.
