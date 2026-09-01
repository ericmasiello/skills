---
name: test-apply-seam-refactoring
description: Apply one approved, behavior-preserving seam plan in a separate change. Use after test-plan-seam-refactoring has selected a seam and before adding tests to blocked legacy code.
metadata:
  category: 'Seam Refactoring'
  tags: ['seams', 'refactoring', 'testability', 'legacy-code']
  author: DOM-0080
  revision: 2
  status: experimental
---

# Apply Seam Refactoring

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

## Purpose

Apply one approved seam plan with the smallest production change that makes the target constructible for tests. Preserve observed behavior. Ship this seam change separately from new tests.

## Ownership Boundary

- **Owns**: the approved production edit, behavior-preservation checks, and the applied-seam evidence.
- **Does not own**: blocker discovery, seam selection, test generation, or test-smell remediation.
- **Consumes input from**: `test-plan-seam-refactoring` or `test-analyze-fallback-strategies`.
- **Hands off to**: `test-generate-acceptance-tests`, or the minimum safe integration fallback when acceptance remains blocked.

## Prerequisite Gate

Require all of the following before editing:

1. A named blocker and affected behavior.
2. An approved seam plan with exact production paths and operations.
3. A target-repository command that proves current behavior.

Return `BLOCKED` when any item is absent. Do not invent a seam or broaden the plan.

## Workflow

1. Read the approved plan and inspect the named paths.
2. Apply only the named seam operation.
3. Run the existing narrowest behavior check after each edit.
4. Do not add tests in this change.
5. Record the changed paths, command output, and residual blocker state.
6. Return the change to the caller or host for independent review coordination.

## Output Format

```markdown
# Applied Seam — {target}

- Approved plan: {path or identifier}
- Blocker removed: {description}
- Production paths changed: {list}
- Behavior-preservation evidence: {command and result}
- Remaining blocker: {none | description}

## Decision Contract

- Result: {COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED}
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: {caller/host | test-generate-acceptance-tests | human | self}
```
