---
name: test-analyze-testability-blockers
description: Detect what makes legacy code untestable using the 11-smell taxonomy AND prioritize where to invest first by ranking testability gaps, quick wins, and seam effort across components. Use when you say 'what blocks testing', 'why can't I test this', 'find test blockers', 'prioritize blockers', 'what to fix first', or 'testability ranking'.
metadata:
  category: 'Testability Analysis'
  tags: ['testability', 'blockers', 'prioritization', 'legacy-code', 'analysis', 'test-smells']
  author: DOM-0080
  revision: 4
  status: experimental
---

# Stage 1 Testability Blocker Analyzer

Detect the legacy code smells that block tests, then rank where to invest first.
This skill is **Stage 1** legacy analysis. It combines taxonomy-based blocker detection with cross-component prioritization so a single pass produces both _what blocks testing_ and _what to fix first_. It is not a general code-quality review — see "Scope Guardrail" below.

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

## Mission

1. **Detect blockers**: Identify only the legacy code smells that make code untestable, using a fixed 11-smell taxonomy, with concrete evidence per finding.
2. **Prioritize**: When multiple targets exist, rank them by business value, change frequency, and testability effort, separating seam work from direct test-writing quick wins.

**Core Principle**: Before tests can be written, the code must be testable. Legacy code smells are blockers to testing, not just indicators of poor design. When blockers exist, tests can only be written after seams are applied; directly constructible, controllable, and observable code needs no seam.

## Scope Guardrail

Detection covers **11 legacy code smells** in a fixed taxonomy. It is intentionally narrower than a normal code review.

Report ONLY if the smell directly prevents creating or running tests. Do not report:

- general code quality issues
- maintainability concerns
- performance problems
- security issues
- ordinary design smells that remain testable

These legacy testing techniques apply to **all service types**. Service classification affects the target architecture after refactoring, but not whether the blocker smell, seam model, or prioritization approach applies.

## Ownership Boundary

- **Owns**: taxonomy-based blocker detection, evidence collection, cross-component prioritization, sequencing, and effort/value ranking
- **Does not own**: seam pattern selection or test generation
- **Hands off to**:
  - `test-plan-seam-refactoring` for canonical Stage 2 seam selection on prioritized targets
  - `test-analyze-fallback-strategies` for safer fallback choices when standard seams are risky
  - Stage 3 characterization skills when targets are already testable

## When to Use

Use this skill when blocker evidence is needed to explain why tests cannot be written, and/or when multiple candidate targets exist and you need a ranked execution order.

## When NOT to Use

Do NOT use this skill when:

- **Code is already testable**: If you can instantiate the class, call the method, and observe outputs/side effects without changes, skip this skill and write tests directly
- **You need a general code quality review**: This skill only detects test blockers, not design smells, performance issues, or security vulnerabilities
- **Tests already exist and pass**: This is for legacy code without test coverage, not for improving existing test suites
- **You need seam pattern selection for a single blocker**: Use `test-plan-seam-refactoring`
- **You need test smell detection**: Use `test-analyze-test-smells` for evaluating test code quality

## Prerequisite Gate

Before analysis, require:

1. target class/method, flow, or candidate inventory specified
2. goal is blocker evidence and/or prioritization, not general code review

If prerequisites are missing, request them before proceeding.

## Required Decision Output

Report the shared fields defined in `test-skills-decision-contract.md`
(`Result`, `Missing Evidence`, `Blocking Issues`, `Next Owner`).

---

# Part A: Blocker Detection (Taxonomy)

## Taxonomy

Use only this approved taxonomy: **6 categories, 11 specific smells**.

### Category 1: Difficult Class

- 1.1 Long Method in Difficult Class
- 1.2 Independent Method in Difficult Class

### Category 2: Hardcoded Values

- 2.1 Hardcoded Instance Variable in Constructor
- 2.2 Hardcoded Variable in Method

### Category 3: Types

- 3.1 Difficult Parameter
- 3.2 Difficult Parameter with Primitive Access

### Category 4: Globals

- 4.1 Local Variable Hardcoded to Singleton
- 4.2 Local Variable Hardcoded to Global
- 4.3 Method Using Globals as Parameters

### Category 5: Static

- 5.1 Difficult Static Method

### Category 6: Cross-Methods

- 6.1 Difficult Unrelated Method

## Core Detection Rules

- Every reported smell must map to one of the 11 approved smells above.
- Name the exact blocker that prevents a test from being written or run.
- If the class or method is still directly testable, do not report a blocker smell.
- Long or complex code alone is not enough.
- Static helpers are not smells unless they touch external state or production-only dependencies.
- Global and singleton smells must be classified precisely, not generically.

## Critical Prioritization Rule

If both of these are true for the same target behavior:

1. the class is difficult to instantiate, and
2. the target method is long or complex,

report **1.1 Long Method in Difficult Class** as the primary difficult-class finding before secondary blockers.

## Mandatory Target Enumeration

Before analysis, list every class/file within the given scope by name (not just the
ones that already look interesting). Assess each one individually against all 11
smells. A class with no blockers found must still appear in the report, marked
`No blocker smells detected` with a one-line reason — never omit a class from the
report, and never let a summary-only section (e.g. "Quick Wins") substitute for
individually assessing it.

## Mandatory Coverage Gate

Before finalizing, explicitly classify all four of these as `Detected` or `Considered-Not-Found` with evidence:

- 4.2 Local Variable Hardcoded to Global
- 4.3 Method Using Globals as Parameters
- 5.1 Difficult Static Method
- 6.1 Difficult Unrelated Method

Do not submit a final report that skips any of those four classifications.

## Required Disambiguation Rules

- 4.1 vs 4.2: singleton accessor calls are 4.1; direct global or static holder access is 4.2.
- 4.2 vs 4.3: direct reads are 4.2; passing globals into internal methods is 4.3.
- 5.1 vs static utility: pure deterministic static helpers are not 5.1; static methods with DB, network, file, env, clock, or production-only side effects are 5.1.
- 6.1 vs ordinary complexity: use 6.1 only when an unrelated difficult path in the same class blocks testing of the target behavior.
- 2.1 vs 1.1: when constructor hardcoding and a directly evidenced long target method coexist in the same difficult class, report **1.1 Long Method in Difficult Class** as primary and use **2.1 Hardcoded Instance Variable in Constructor** only as a secondary blocker if helpful.
- 2.1 vs 1.2: when the target method is short, delegating, or otherwise not independent from the hardcoded instance dependency, do not classify as **Independent Method in Difficult Class**.
- 1.1 inference guard: do not infer **Long Method in Difficult Class** for one-line delegators, thin wrappers, or short orchestration methods just because the class is difficult to instantiate.
- 1.1 confirmation rule: loops, nested branches, or business-rule accumulation directly shown in the target method are enough to keep **1.1 Long Method in Difficult Class** primary.
- 3.1 vs 3.2: when an external or framework-owned parameter cannot be instantiated in tests, classify at least **Difficult Parameter**; if the method only reads primitive-accessible fields and the logic could be expressed with primitives, prefer **Difficult Parameter with Primitive Access**.
- 2.2 substitutability rule: determinism is a 5.1 exemption, not a 2.2 exemption. A hardcoded data set (lookup table, price list, obstacle grid) is **2.2** whenever a test cannot supply a *different* set through a seam — regardless of how predictable today's values are.
- 2.1 substitutability rule: the test is whether a fake/mock/spy can be injected at the seam, not whether today's hardcoded collaborator is itself simple or well-behaved. "It's easy to use as-is" is not a 2.1 exemption.
- 6.1 secondary-concern rule: "unrelated" means a different *responsibility* than the class's core purpose, not a different call path — a method reachable from the workflow under test can still be **6.1** (e.g. logging/notification mixed into a domain method).

## Self-Validation Rules

For every reported smell, confirm all of the following:

1. It is one of the 11 approved smells.
2. A concrete test blocker exists.
3. You can complete this sentence: `I cannot write a test for {method} because {specific blocker}.`
4. If that sentence cannot be completed with a concrete blocker, remove the smell.

If no approved blocker smells remain, report that the code is testable and no blocking legacy smells were detected.

**Note on Deterministic Helpers**: This skill uses manual code review guided by the 11-smell taxonomy. Unlike `test-evaluate-focused-mutation` and `test-evaluate-targeted-coverage`, which bundle deterministic helper scripts, legacy blocker detection requires contextual judgment to distinguish true blockers from testable-but-complex code. The manual approach ensures each reported smell prevents an actual test from being written.

---

# Part B: Prioritization

Use Part B when multiple candidate targets exist and you need a ranked execution order. Blocker evidence from Part A feeds the testability-effort factor below.

## Gap Analysis Process

For each candidate, inventory existing tests and coverage (tested / untested /
partially-tested paths), then classify why any gap is untested:

| Reason                | Description                                 | Action Required                       |
| --------------------- | ------------------------------------------- | ------------------------------------- |
| **Has Legacy Smells** | Code is currently untestable                | Use blocker evidence, then plan seams |
| **Missing Tests**     | Code is already testable                    | Write tests directly                  |
| **Low Priority**      | Testable but not worth immediate investment | Document the decision                 |
| **Dead Code**         | Never executed or obsolete                  | Consider removal                      |

### Calculate Priority

**Priority Formula**:

```txt
Priority Score = (Business Criticality × Change Frequency) / Testability Effort
```

| Factor                   | Scale | Description                                                           |
| ------------------------ | ----- | --------------------------------------------------------------------- |
| **Business Criticality** | 1-10  | How important is this to the business? Revenue path = 10, Utility = 3 |
| **Change Frequency**     | 1-10  | How often does this change? Weekly = 10, Never = 1                    |
| **Testability Effort**   | 1-10  | How much work to make testable? No smells = 1, Many smells = 10       |

### Priority Score Interpretation

| Score | Priority | Action                    |
| ----- | -------- | ------------------------- |
| > 15  | CRITICAL | Address immediately       |
| 10-15 | HIGH     | Address in current sprint |
| 5-10  | MEDIUM   | Plan for next sprint      |
| < 5   | LOW      | Address when convenient   |

## Recommended Seam Order

When multiple seams are needed, order by:

1. **Unblocks most tests** — Highest value first
2. **Lowest risk** — Simple refactorings before complex
3. **Dependency chain** — Some seams enable others

This is portfolio-level ordering only; see "Seam Planning Handoff" below for the
canonical-selection boundary with `test-plan-seam-refactoring`.

For direct test additions where no seams are needed, add tests outside-in from widest behavioral net to narrowest: **Acceptance → Unit → Integration** (Contract for the HTTP transport layer when the app is HTTP-only).

---

## Seam Planning Handoff

After identifying and ranking blockers, hand off to `test-plan-seam-refactoring` for
the canonical seam choice and full pattern comparison (primary vs secondary choice,
comparison across all 18 patterns, implementation guidance) — this skill may name a
likely direction in plain language but does not own that matrix.

If standard seam planning is unsafe or stalled, hand off to `test-analyze-fallback-strategies` instead.

## References (Optional, Manual Read)

Do not treat this section as default runtime knowledge. Consult only when a task needs the detailed material.

- `references/smell-taxonomy.md` — detailed smell catalog, examples, and rationale.
- `references/reporting-template-and-false-positives.md` — full report template and false-positive checks.
- `references/scoring-and-report-examples.md` — worked scoring walkthroughs and coverage-map illustrations.
- `references/testability-workflow.md` — Stage 1 workflow map and role boundaries.

## Output Format

Return both a blocker report and (when multiple targets exist) a prioritized gap report.

```markdown
## Legacy Code Smell Report: {ClassName}

### Summary

| Severity | Count |
| -------- | ----- |
| CRITICAL | {n}   |
| HIGH     | {n}   |
| MEDIUM   | {n}   |
| LOW      | {n}   |

### Coverage Gate Results (Required)

| Smell                                  | Status                           | Evidence   |
| -------------------------------------- | -------------------------------- | ---------- |
| 4.2 Local Variable → Global            | {Detected\|Considered-Not-Found\|N/A} | {line/ref} |
| 4.3 Method Using Globals as Parameters | {Detected\|Considered-Not-Found\|N/A} | {line/ref} |
| 5.1 Difficult Static Method            | {Detected\|Considered-Not-Found\|N/A} | {line/ref} |
| 6.1 Difficult Unrelated Method         | {Detected\|Considered-Not-Found\|N/A} | {line/ref} |

### Smells Detected

#### {Severity}

1. **{SmellName}** (line {N})
   - **Category**: {Category}
   - **Problem**: {description}
   - **Why Untestable**: {reason}
   - **Recommended Refactoring**: {RefactoringName}
   - **Effort Estimate**: {LOW|MEDIUM|HIGH}

## Testability Gap Report: {Module} (when multiple targets)

### Priority Gap Summary

| Priority | Count | Smells | Tests Blocked |
| -------- | ----- | ------ | ------------- |
| CRITICAL | {n}   | {n}    | {n}           |
| HIGH     | {n}   | {n}    | {n}           |
| MEDIUM   | {n}   | {n}    | {n}           |
| LOW      | {n}   | {n}    | {n}           |

### Gaps by Priority

| Component | Score   | Smells | Seams Needed |
| --------- | ------- | ------ | ------------ |
| {name}    | {score} | {list} | {list}       |

### Recommended Seam Order

1. {Seam} → unblocks {N} tests (risk: {LOW|MEDIUM|HIGH})
2. ...

### Quick Wins (No Seams Needed)

| Component | Tests Needed  | Effort  |
| --------- | ------------- | ------- |
| {name}    | {description} | {hours} |

### Next Handoff

1. Use `test-plan-seam-refactoring` to choose the canonical seam for the top-ranked blocker(s).
2. If standard seam planning is unsafe or stalled, use `test-analyze-fallback-strategies`.
3. Write tests for Quick Wins using outside-in Acceptance → Unit → Integration order.
4. Re-assess coverage.

## Decision Contract

- Result: {COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED}
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: {test-plan-seam-refactoring | test-generate-acceptance-tests | human | self}
```

## Related Skills

- `test-plan-seam-refactoring` for Stage 2 seam planning after blockers are identified and ranked
- `test-analyze-fallback-strategies` for safer fallback choices when standard seams are risky
- `test-analyze-test-smells` for evaluating existing test code quality
