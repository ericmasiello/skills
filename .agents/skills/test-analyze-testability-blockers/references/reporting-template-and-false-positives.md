# Reporting Template And False Positives

Preserved reporting guidance and false-positive checks extracted from the earlier inline skill.
Use this file when a task needs the longer validation ritual rather than only the compact inline contract.

## False Positives To Remove

- long method without difficult instantiation
- high cyclomatic complexity by itself
- deep nesting by itself
- multiple responsibilities by itself
- poor naming or lack of abstraction
- missing tests as a standalone finding

## Final Validation Prompt

For each reported smell, complete this sentence:

`I cannot write a test for {method} because {specific blocker}.`

If that sentence cannot be completed with a concrete blocker such as constructor side effects, singleton access, direct globals, or production-only static calls, remove the smell.

## Full Reporting Template

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

| Smell                                  | Status                                  | Evidence   |
| -------------------------------------- | --------------------------------------- | ---------- |
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

### Recommended Refactoring Order

1. {Refactoring} → enables testing of {methods}
2. ...

### Next Steps

1. Apply seam refactorings (Stage 2)
2. Verify build after each seam
3. Generate tests using characterization techniques (Stage 3)
```
