# Test Quality Policy

This file is the canonical policy for shared test-skill and coverage-agent
gates. Skills and agents must link here rather than restating competing
thresholds or verdict mappings.

## Evidence Principles

- Coverage is evidence that behavior executes; it is never a completion target
  by itself.
- A coverage metric is `Not-Applicable` when the native tool reports no
  measurable denominator, such as zero branch points.
- Use project-native tools discovered from manifests, scripts, CI, and fresh
  reports. Language defaults are recommendations, not requirements.
- Do not install tools, change project configuration, or invent metrics as an
  implicit task side effect.

## Coverage Gates

- No universal line or branch threshold applies to every project.
- An orchestrator may set a project/tier gate. Its default pilot gate is
  line 80%, branch 70%, mutation 85% when the corresponding metric is
  measurable.
- A behavior-level gap remains a gap even when neighboring files raise the
  directory-average coverage.
- Low-value defensive/default wiring may remain uncovered when deterministic
  tests already protect all observable behavior.

## Mutation Gates

- A valid target-scoped mutation result must reach 85% or higher unless a
  project policy explicitly sets another gate. This applies at every test level,
  including e2e tests.
- Every survivor must be classified as `test gap`, `equivalent mutant`, or
  `deferred` with rationale.
- Mutation evidence must name the target, source revision, exact command, report
  location, eligible-mutant denominator, exclusions, and timeout status.
- Zero eligible mutants and unavailable mutation tooling are Missing Evidence,
  never a passing mutation result. Report a setup path. Do not fabricate a score.
- **Per-scope-item coverage of the mutant set.** A passing score is evidence only
  for the behavior the mutants actually reached. Report, for each named scope item,
  whether the run produced at least one eligible mutant on the code implementing it.
  Never let the aggregate imply coverage it does not carry: disclosure is mandatory
  even at 100%. Then classify the cause, because the two causes differ in remedy:
  - **Tests do not reach it** (the mutants exist but are `NoCoverage`, or no test
    exercises the statement). This is a real test gap and `Missing Evidence` for
    that scope item. It is executor-actionable — ask for a test.
  - **The tool cannot mutate it** (no applicable mutator, or every candidate mutant
    is type-invalid and excluded — for example an empty-collection reset whose only
    mutation violates the element type). No test can create an eligible mutant here,
    so demanding one is waste. Discharge the item with a targeted fault injection:
    perturb or delete the statement, name the test that fails, and restore the
    source. Record the tool limitation and the injection result. This counts as
    satisfied evidence for that item, not an escalation.

  This is the one place fault injection substitutes for mutation evidence rather
  than supplementing it, and only because no mutation evidence is obtainable.
  Undisclosed absence remains a finding.

## Scenario Routing

- Scenario B applies when the selected driving behavior has no tests or 0%
  direct coverage.
- Scenario A applies when the selected driving behavior has existing tests.
- Directly constructible, deterministic, observable code has `No seam required`
  readiness and may proceed to characterization.
- Scenario routing is based on selected behavior evidence, not module averages.

## Refactoring Gates

- Blocker and Critical smells require remediation before behavior evidence can
  be trusted.
- High smells require remediation when they prevent reliable behavior evidence.
- Medium and Low smells are reported and scheduled; they do not invalidate a
  completed bounded refactor batch.
- A refactor batch completes when its selected cluster is removed, tests stay
  green, post-refactor smell analysis runs, and remaining findings are reported.

## Orchestration Retry Budget

- Attempt 1 is the initial executor run.
- Attempts 2 and 3 are reviewer-feedback rework runs.
- A rejection after attempt 3 routes to human escalation.
- `APPROVE` always routes to `human champion (merge-review)`; agents never
  commit or merge approved changes.

## Verdict Mapping

| Quality gate verdict | Shared decision contract |
| --- | --- |
| `PASS` | `COMPLETE` |
| `PASS_WITH_WARNINGS` | `COMPLETE_WITH_WARNINGS` |
| `FAIL` | `BLOCKED` |
| Missing prerequisite evidence | `BLOCKED` |
