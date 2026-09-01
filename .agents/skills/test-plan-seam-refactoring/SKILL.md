---
name: test-plan-seam-refactoring
description: Plan safe refactorings to make untestable legacy code testable. Use when you say 'make this testable', 'plan seams', 'introduce test doubles', 'refactor for testing', or code has hardcoded dependencies, global state, difficult constructors, or other barriers preventing test creation.
metadata:
  category: 'Seam Refactoring'
  tags: ['seams', 'refactoring', 'testability', 'legacy-code', 'dependency-breaking']
  author: DOM-0080
  revision: 4
  status: experimental
---

# Stage 2 Seam Refactoring Planner

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

## Purpose

Generate behavior-preserving seam refactoring plans that make legacy code testable with the smallest safe change.

**Core Principle**: Introduce the smallest seam that enables tests. The design may become temporarily less elegant, but behavior must stay the same and testability must improve.

This is **Stage 2** of the legacy workflow: introduce seams that unblock tests, then improve design later.

## When to Use

Use this skill after a legacy blocker has already been identified and you need a concrete seam plan, ordered by safety, effort, and test impact.

This is the canonical skill for smell-to-pattern selection once `test-analyze-testability-blockers` has established the blocker evidence.

These seam techniques apply to **all service types**. Service classification affects the target architecture after tests exist, but not whether the seam refactoring is valid.

## Ownership Boundary

- **Owns**: canonical seam pattern selection and the Stage 2 behavior-preserving seam plan
- **Does not own**: blocker taxonomy detection, cross-component prioritization, or production edits
- **Hands off to**: `test-apply-seam-refactoring` to apply and prove the approved plan
- **Consumes input from**:
  - `test-analyze-testability-blockers` for blocker evidence and target ordering when multiple targets exist

## Prerequisite Gate

Before producing the final seam plan, require:

1. blocker evidence
2. target behavior/component
3. target priority when multiple candidates exist

If prerequisites are missing, stop and request them explicitly.

Before selecting a pattern, check whether the target repo already has a precedent
seam for the same kind of blocker elsewhere. Prefer the established local pattern
over an equally-valid alternative from the catalog, for consistency.

## Language Scope

This skill is **language-aware, not language-agnostic**.

The 18 patterns form a complete seam catalog, but they are not equally idiomatic in every language.

- Prefer patterns that match the target language's normal substitution and extension mechanisms.
- In **Go**, prefer interface extraction, constructor or function parameterization, and wrapper/adaptor seams over inheritance-style seams.
- In **TypeScript**, prefer constructor injection, interface extraction, parameterization, and thin wrappers first; use subclass-based seams only when the code is already class-oriented and inheritance is the natural extension point.
- In **Python**, prefer parameterization, wrapper seams, extracted helper methods, and explicit monkeypatch-friendly boundaries; use inheritance-based seams only when the code is already structured around overridable methods.
- In more object-oriented codebases such as **C#**, patterns such as subclass-and-override or pull-up/push-down may be more applicable.
- Mark a pattern `Not Applicable` when the language or code style makes it unnatural, high-risk, or unnecessary.

Do not force inheritance-heavy or hierarchy-based seams into languages where smaller composition-based seams are the normal fit.

## When NOT to Use

Do NOT use this skill when:

- **No blocker analysis exists yet**: Run `test-analyze-testability-blockers` first to establish concrete evidence
- **Code is already testable**: If you can write tests directly, skip seam work and proceed to characterization
- **You want to improve design**: Seams make code testable, often at the cost of temporary design degradation. Design improvements come after tests exist
- **Standard seam patterns feel too risky**: Use `test-analyze-fallback-strategies` instead for safer incremental approaches
- **You're refactoring production code with tests**: This is for legacy code without tests; if tests exist, use standard refactoring techniques

## Seam Philosophy

> "A seam is a place where you can alter behavior in your program without editing in that place."
>
> - Michael C. Feathers

A seam is successful only when it preserves existing production behavior while allowing controlled substitution in tests.

## Pattern Coverage Contract

For every seam plan, you MUST explicitly consider all 18 refactorings and classify each as:

- `Primary` - selected now
- `Secondary` - valid alternative
- `Not Applicable` - not a fit for this blocker

If the task explicitly requests a specific pattern and that pattern is compatible with the evidenced blocker, honor it as `Primary` and classify the remaining patterns around it.

## Smell-To-Pattern Baseline

Use this decision matrix as the canonical baseline for the primary seam choice.

Do not duplicate or redefine this mapping in upstream blocker-detection skills; those skills should hand off here after naming the blocker.

| #   | Refactoring                          | Primary Smell(s)                           |
| --- | ------------------------------------ | ------------------------------------------ |
| 1   | Subclass and Override Method         | Hardcoded Variable in Method               |
| 2   | Extract Interface                    | Difficult Parameter                        |
| 3   | Parameterize Constructor             | Hardcoded Instance Variable in Constructor |
| 4   | Parameterize Method                  | Hardcoded Variable in Method               |
| 5   | Extract and Override Call            | Hardcoded Variable in Method               |
| 6   | Extract and Override Factory Method  | Hardcoded Instance Variable in Constructor |
| 7   | Extract and Override Getter          | Hardcoded Variable in Method               |
| 8   | Introduce Static Setter              | Local Variable Hardcoded to Singleton      |
| 9   | Supersede Instance Variable          | Hardcoded Instance Variable in Constructor |
| 10  | Adapt Parameter                      | Difficult Parameter                        |
| 11  | Primitivize Parameter                | Difficult Parameter with Primitive Access  |
| 12  | Break Out Method Object              | Long Method in Difficult Class             |
| 13  | Expose Static Method                 | Independent Method in Difficult Class      |
| 14  | Pull Up Feature                      | Difficult Unrelated Method                 |
| 15  | Push Down Dependency                 | Difficult Unrelated Method                 |
| 16  | Encapsulate Global Reference         | Method Using Globals as Parameters         |
| 17  | Replace Global Reference with Getter | Local Variable Hardcoded to Global         |
| 18  | Introduce Instance Delegator         | Difficult Static Method                    |

If multiple patterns are valid, choose the smallest behavior-preserving seam first.

## Core Rules

- Preserve behavior: same inputs, same outputs, no new observable production behavior.
- Prefer one seam at a time over large cleanup batches.
- Use IDE-safe structural refactorings where possible.
- Verify compile/build and existing tests after every seam.
- Hand the approved plan to `test-apply-seam-refactoring` for one atomic seam change at a time.
- Create seams for infrastructure and non-determinism, not for domain objects.
- Favor the smallest seam that unlocks characterization or regression tests.
- Treat blocker detection as input, not output: this skill consumes blocker evidence rather than owning the blocker taxonomy.
- Do not use seam work as a pretext for design cleanup; design refactoring belongs after tests are in place.

## Required Inputs

Before producing the final plan, ensure the following inputs are explicit:

1. target behavior or component
2. blocker evidence from Stage 1 detection
3. target priority (if multiple candidates exist)
4. language/runtime constraints affecting seam options

If blocker evidence is missing, request `test-analyze-testability-blockers` output first.

## Required Decision Output

Report the shared fields defined in `test-skills-decision-contract.md`
(`Result`, `Missing Evidence`, `Blocking Issues`, `Next Owner`).

## Safety Checks

Before finalizing a plan, verify:

- the seam is the smallest practical move
- the seam targets the blocker actually evidenced in code
- test double injection becomes possible after the change
- domain behavior is not replaced with mocks or fake domain objects

## Functional Alternative

For languages with first-class functions, consider **Peel and Slice** as a lighter variant of method-level seam extraction when it preserves behavior more simply than inheritance.

## Output Format

````markdown
## Refactoring Plan: {ClassName}

### Summary

| Smell   | Refactoring   | Risk                | Effort |
| ------- | ------------- | ------------------- | ------ |
| {smell} | {refactoring} | {LOW\|MEDIUM\|HIGH} | {time} |

### Refactoring #{N}: {RefactoringName}

**Solves**: {SmellName} (line {N})
**Risk**: {LOW|MEDIUM|HIGH} | **Effort**: {time estimate}

**Before (PROBLEM)**:

```{language}
// Smell: {description}
{code}
```

**After (SEAM)**:

```{language}
// Seam: {description}
{code}
```

**Behavior Preservation**: ✅ No logic changes

**Test Usage**:

```{language}
// How to use seam in tests
{test code}
```

### Pattern Coverage (18 Refactorings)

| #   | Refactoring                          | Status (Primary/Secondary/Not Applicable) | Rationale |
| --- | ------------------------------------ | ----------------------------------------- | --------- |
| 1   | Subclass and Override Method         | {status}                                  | {reason}  |
| 2   | Extract Interface                    | {status}                                  | {reason}  |
| 3   | Parameterize Constructor             | {status}                                  | {reason}  |
| 4   | Parameterize Method                  | {status}                                  | {reason}  |
| 5   | Extract and Override Call            | {status}                                  | {reason}  |
| 6   | Extract and Override Factory Method  | {status}                                  | {reason}  |
| 7   | Extract and Override Getter          | {status}                                  | {reason}  |
| 8   | Introduce Static Setter              | {status}                                  | {reason}  |
| 9   | Supersede Instance Variable          | {status}                                  | {reason}  |
| 10  | Adapt Parameter                      | {status}                                  | {reason}  |
| 11  | Primitivize Parameter                | {status}                                  | {reason}  |
| 12  | Break Out Method Object              | {status}                                  | {reason}  |
| 13  | Expose Static Method                 | {status}                                  | {reason}  |
| 14  | Pull Up Feature                      | {status}                                  | {reason}  |
| 15  | Push Down Dependency                 | {status}                                  | {reason}  |
| 16  | Encapsulate Global Reference         | {status}                                  | {reason}  |
| 17  | Replace Global Reference with Getter | {status}                                  | {reason}  |
| 18  | Introduce Instance Delegator         | {status}                                  | {reason}  |

### Build Verification

After `test-apply-seam-refactoring` applies the selected seam:

```bash
{build command}
{test command}
```

Apply and verify one seam at a time before moving to the next candidate seam.

### Decision Contract

- Result: {COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED}
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: {one downstream skill}
````

## Worked Examples

Read `references/seam-refactoring-examples.md` for worked examples covering constructor parameterization, clock seams, and interface extraction.

## References (Optional, Manual Read)

Do not treat this section as default runtime knowledge.
Consult only when a task needs canonical pattern detail or worked code examples.

- [18 Pattern Catalog](./references/18-pattern-catalog.md)
- [Language Examples](./references/language-examples.md)
- [Worked Seam Refactoring Examples](./references/seam-refactoring-examples.md)
