---
name: studio-ship-work
description: "Commit, push, and optionally create a GitLab merge request, then update the source issue's status labels. Use when the user says 'ship this', 'commit and push', 'push it up', 'create MR', 'create merge request', or wants to go from reviewed code to a pushed branch with issue tracking updated. Closes the loop between implement and GitLab issue status."
---

# Ship Work

Commit, push, optionally open a GitLab MR, and update the source issue's status labels.

## Workflow

### 1. Identify the source issue(s)

Determine which GitLab issue(s) this work addresses. A single branch/MR may close multiple issues. Check, in order:

1. **Conversation context** — if `implement` was invoked earlier in this session with an issue reference, use that.
2. **Branch name** — if the branch name contains an issue number (e.g., `123-fix-thing`), use that.
3. **Commit messages** — scan `git log origin/HEAD..HEAD --oneline` for issue references (e.g., `#124`, `Closes #125`).
4. **Ask the user** — "Which GitLab issue(s) does this work close? (e.g., `#124` or `#124, #125`)"

Fetch each issue to confirm it exists and read its current labels:

```
glab issue view <iid>
```

Note each issue's `workstream::*` label and current `status::*` label.

### 2. Commit (if needed)

If there are uncommitted changes, stage and commit following the repo's conventions (see recent `git log --oneline -10` for style). Prefer conventional commits: `type(scope): description`.

```bash
git add <files> && git commit -m "type(scope): description"
```

If the working tree is clean, skip to step 3.

### 3. Push

```bash
git push -u origin HEAD
```

### 4. Merge request

Check if an MR already exists for this branch:

```bash
glab mr view 2>&1
```

#### 4a. No existing MR

Create an MR by default. Only skip if the user explicitly says not to (e.g., "don't create an MR", "no MR").

Create the MR using the repo's MR template (`.gitlab/merge_request_templates/Default.md`). Fill in the template sections following the ["How to test this MR" guidance](#how-to-test-this-mr-section) and the ["Architecture section" guidance](#architecture-section) below.

Append a **Closes** section at the bottom listing every issue this MR addresses:

```
## Issues

Closes #<iid1>
Closes #<iid2>
```

Create with:

```bash
BRANCH=$(git branch --show-current)
BODY_FILE=$(mktemp) && cat > "$BODY_FILE" <<'__MR_BODY__'
<filled template content with Closes references>
__MR_BODY__
glab mr create --title "<derive from commit subject(s) — if single commit use its subject; if multiple summarize the change in conventional commit format; may also use the issue title>" \
  --source-branch "$BRANCH" \
  --description "$(cat "$BODY_FILE")" \
  --label "<workstream::* label from step 1>" \
  --label "status::awaiting-review"
```

> **⚠️ Always pass `--source-branch` explicitly.** Without it, flags like `--related-issue` cause glab to auto-generate a source branch name from the issue title instead of using the current branch — resulting in an MR with 0 commits.
>
> **Do NOT use `--related-issue` or `--copy-issue-labels`** — `--related-issue` triggers the branch-name override bug. Instead, copy the issue's labels manually via `--label` flags, and link the issue via `Closes #<iid>` in the MR description body.

If **no**, skip to step 5.

#### 4b. Existing MR — update description

If an MR already exists and new commits were just pushed, update the MR description to reflect the latest changes:

1. Read the current MR description: `glab mr view --output json`
2. Update all sections to cover all commits (not just the latest push)
3. Rewrite the "How to test this MR" section following the ["How to test this MR" guidance](#how-to-test-this-mr-section) below
4. Add or update the `## Architecture` section following the ["Architecture section" guidance](#architecture-section) below
5. Ensure every closed issue is listed in the **Closes** section — if this branch now addresses additional issues beyond the original, add them
6. Apply the update:

```bash
BODY_FILE=$(mktemp) && cat > "$BODY_FILE" <<'__MR_BODY__'
<updated description>
__MR_BODY__
glab mr update --description "$(cat "$BODY_FILE")"
```

### 5. Update issue status

Update **every** issue identified in step 1 to reflect the current state:

| Scenario | New status label |
|----------|-----------------|
| MR created or updated, ready for review | `status::awaiting-review` |
| Pushed, no MR yet | `status::in-progress` |
| Work is partial (more slices remain) | `status::in-progress` |

```bash
# For each issue:
glab issue update <iid> -l "status::awaiting-review"   # if MR exists
glab issue update <iid> -l "status::in-progress"       # if no MR / partial work
```

If the issue was previously `status::ready` or `status::blocked`, the scoped label replacement is automatic — GitLab enforces mutual exclusivity on `status::*` scoped labels.

### 6. Report

Output:
- Commit hash(es) and subject line(s)
- Push result (branch + remote)
- MR URL (if created or updated) and which issues it closes
- Issue status update confirmation for each issue

## "How to test this MR" section

This section is for **human reviewers doing manual validation** against the MR's deployment previews. It is NOT for CI — automated tests, linting, and type-checking are already handled by the pipeline.

**NEVER include** instructions like "run `pnpm test`", "run `pnpm lint`", "execute the test suite", or any CLI commands a reviewer would run locally. CI does all of that.

**DO include** specific things a human reviewer should look for in the deployed environments:

- **Application changes** → Tell reviewers what to verify in the deployed DEX. The MR will create preview deployments for the Vistaprint DEX, VCS DEX, and Design Services DEX.
  - If the change affects the **Vistaprint DEX** (the most common case), no need to call it out by name — just describe what to look for (e.g., "Open the color picker and verify the new swatch renders correctly").
  - If the change affects a **non-default DEX** (VCS DEX, Design Services DEX), explicitly name which DEX the reviewer should check (e.g., "In the **VCS DEX**, verify the template selector shows the updated categories").
- **Docs changes** → Tell reviewers to check the docs deployment and what content to verify (e.g., "Review the updated Props table on the Button docs page to confirm the new `variant` prop is documented").
- **Mixed changes** → Cover both: application behavior in the relevant DEX(es) AND docs content.

Keep instructions concrete and actionable. Focus on *what changed visually or behaviorally* and *where to look*.

## Architecture section

Include a `## Architecture` section in the MR description when the change involves **structural modifications** to code: new providers, context boundaries, hook extractions, data flow changes, API/interface changes, module restructuring, or significant call-site migrations.

**Skip it** for trivial changes: pure bug fixes, isolated prop/style tweaks, test-only changes, or renames where the before/after is self-evident from the diff.

### Diagram format

Use **text-based code and JSX diagrams** — no Mermaid, no ASCII boxes. Each diagram is a fenced code block annotated with file paths.

**Annotate every block with its file path as a comment:**

```tsx
// Before — apps/studio/src/path/to/File.tsx
<OldStructure />

// After — apps/studio/src/path/to/File.tsx
<NewStructure />
```

For new files, use `// NEW`:

```tsx
// NEW — apps/studio/src/path/to/NewFile.tsx
export function NewProvider({ children }: PropsWithChildren) { ... }
```

For diagrams spanning multiple files (e.g., a provider tree), add `// ComponentName.tsx (simplified)` if it helps orient the reader — but it's not required.

### Before/after rules

- **Show before/after** when structure or behavior changes.
- **Show after-only** (`// NEW`) when something is purely additive — new file, new export, new feature with no prior equivalent.
- **Omit before** for bug fixes (the before state was broken), pure renames (obvious from the diff), or anything where the before adds noise without insight.

### What to diagram

Cover two levels, in order:

1. **API / call-site level** — how consumers interact with the changed code (props, hook signatures, context shape, import paths). Ground the reviewer here first.
2. **Internals level** — what changed inside the implementation (extracted hooks, new providers, restructured logic). Add this after the API-level diagram.

Use multiple diagrams when the MR touches multiple distinct structural changes.

### Example — new provider in the tree

```tsx
// Before — apps/studio/src/studioSix/defaultExperience/DefaultExperience.tsx
<DesignEngineProvider>
  <ErrorBoundaryWithSave>
    ...feature tree...
  </ErrorBoundaryWithSave>
</DesignEngineProvider>

// After — apps/studio/src/studioSix/defaultExperience/DefaultExperience.tsx
<DesignEngineProvider>
  <StudioSaveIntegrationProvider>  {/* NEW */}
    <ErrorBoundaryWithSave>
      ...feature tree...
    </ErrorBoundaryWithSave>
  </StudioSaveIntegrationProvider>
</DesignEngineProvider>
```

### Example — API change (curried hook)

```ts
// Before — apps/studio/src/shared/features/Save/useSave.tsx
const save = useSave({
  allowAnonymousUser: true,
  showSaveToast: false,
  getDocumentForSave: useGetDocumentForSave(),
  udsTenant, workTenant  // integration params mixed with call-site params
})

// After — apps/studio/src/shared/features/Save/useSave.tsx
const { configureSave, getDocumentForSave } = useSaveFunctions()
const save = configureSave({
  allowAnonymousUser: true,
  getDocumentForSave  // integration params now bound by the provider
})
```

## Label reference

See [shared label reference](../_studio-shared/LABELS.md) for the full list of workstream and status labels.
