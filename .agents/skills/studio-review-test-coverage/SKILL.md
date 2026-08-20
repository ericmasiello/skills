---
name: studio-review-test-coverage
description: Open HTML coverage reports for Studio source files in browser. Converts source file paths to coverage HTML paths and opens them. Use when reviewing test coverage, checking which lines are covered/uncovered, investigating coverage gaps, or when user says 'show coverage', 'open coverage report', 'coverage for [file]', or mentions reviewing test coverage for a specific file.
---

# Studio Review Test Coverage

Open HTML coverage reports for Studio source files in your browser. DO NOT ANALYZE THE COVERAGE. ONLY OPEN THE REPORT.

## Quick Start

**With source file path:**
```
Show me coverage for apps/studio/src/studioSix/features/editorUI/textEditing/components/itemEditorPosition/ItemEditorPosition.tsx
```

**With test file path:**
```
Open coverage for ItemEditorPosition.test.tsx
```

## Workflow

1. **Determine source file path**
   - If given a test file path (ends with `.test.tsx` or `.test.ts`):
     - Remove `__tests__/` directory and `.test` suffix to find source file
     - Example: `.../__tests__/Foo.test.tsx` → `.../Foo.tsx`
   - If given a source file path: use as-is

2. **Convert to coverage HTML path**
   - Strip `apps/studio/src/` prefix
   - Prepend `build/studio/coverage/`
   - Append `.html` suffix
   - Example:
     - Source: `apps/studio/src/studioSix/features/editorUI/textEditing/components/itemEditorPosition/ItemEditorPosition.tsx`
     - Coverage: `build/studio/coverage/studioSix/features/editorUI/textEditing/components/itemEditorPosition/ItemEditorPosition.tsx.html`

3. **Check if coverage HTML exists**
   - If exists: open in browser using `open` command (macOS) or equivalent
   - If not exists:
     - Inform user coverage doesn't exist yet
     - Suggest running: `pnpm go ./apps/studio test:coverage --run`
     - Ask if they want you to run it now
     - If yes: run coverage, then open HTML

4. **Open in browser**
   ```bash
   open build/studio/coverage/path/to/file.tsx.html
   ```

## Path Conversion Examples

| Input | Coverage HTML |
|-------|---------------|
| `apps/studio/src/foo/Bar.tsx` | `build/studio/coverage/foo/Bar.tsx.html` |
| `apps/studio/src/foo/__tests__/Bar.test.tsx` | `build/studio/coverage/foo/Bar.tsx.html` |
| `ItemEditorPosition.test.tsx` | Find source → convert → coverage HTML |

## Error Handling

- **Source file not found**: Search codebase with `glob` to find it
- **Coverage HTML not found**: Prompt to generate coverage
- **Invalid path format**: Ask user to clarify which file they mean
