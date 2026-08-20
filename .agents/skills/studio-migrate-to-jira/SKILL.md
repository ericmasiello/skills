---
name: studio-migrate-to-jira
description: Migrate GitLab work items from vistaprint-org/design-technology/studio/studio to Jira project ERICRULEZ — PRD-labeled items become Jira Workstreams, and their workstream::* siblings become child Tasks. Handles idempotent re-runs, label carry-over, MR repointing, and closing the source item with a backlink comment. Use when the user says "migrate this to jira", "migrate this workstream/PRD to jira", or gives a studio/studio work_items URL alongside an ERICRULEZ target.
---

# Studio → Jira Migration

Migrate GitLab work items to Jira, preserving the PRD/workstream hierarchy as a Jira Workstream/Task hierarchy.

## Data model

| GitLab | Jira |
|---|---|
| Work item labeled `PRD` | Issue type `Workstream` (hierarchy level 1, no parent) |
| Work item labeled `workstream::X` (no `PRD` label) | Issue type `Task`, `--parent` = the Workstream for `X` |
| `workstream::X` label | **Dropped** — the relationship is now structural (parent link), not a label |
| `PRD` label | **Dropped** — conveyed by issue type `Workstream` |
| Other labels (`status::*`, `type::*`, custom) | Copied verbatim as Jira labels (colons are valid in Jira labels) |
| Description | Copied, plus a footer linking back to the GitLab URL |
| — | A comment `Migrated to Jira: <url>` is posted on the GitLab item — this is both the idempotency marker and the traceability link |

**Not migrated by default** (call these out to the user if the item has them, rather than silently dropping): assignee, milestone, due date, weight, GitLab "blocks"/linked-item relationships. These need explicit user/account mapping decisions — don't guess.

**Hardcoded defaults** (this is a personal workflow skill):
- GitLab project: `vistaprint-org/design-technology/studio/studio` (URL-encoded: `vistaprint-org%2Fdesign-technology%2Fstudio%2Fstudio`)
- Jira project: `ERICRULEZ`, issue types `Workstream` / `Task` / `Sub-task`

## Setup (one-time)

`acli --description-file` only accepts plain text or literal Atlassian Document Format (ADF) JSON — it does **not** parse markdown. Passing raw GitLab markdown through results in Jira storing the `##`/backticks/etc. as literal plain text with no rendering (confirmed: `acli jira workitem create --generate-json` shows `description` must be `{ type: "doc", version: 1, content: [...] }`). This skill converts markdown to ADF via `scripts/md-to-adf.mjs` before every Jira description write. Install its dependency once:

```bash
cd "$(dirname <this-skill-dir>)/studio-migrate-to-jira/scripts" && npm install
```

## Two entry points

- **Single/list mode**: one or more GitLab work item URLs/IIDs that belong to an *already-migrated* workstream (its Jira Workstream must already exist or be resolvable).
- **Workstream mode**: a PRD URL, or a `workstream::X` label name — migrates the PRD (→ Workstream) plus every sibling sharing that label (→ Tasks) in one run, skipping any already migrated.

Ask the user which mode applies if it isn't obvious from what they gave you.

## Workflow

### 1. Resolve the target set

Parse each GitLab URL for iid. In **workstream mode**, resolve the full set via REST:

```bash
PROJECT="vistaprint-org%2Fdesign-technology%2Fstudio%2Fstudio"

# The PRD item for this workstream
glab api "projects/${PROJECT}/issues?labels=PRD,workstream::<name>"

# Every sibling sharing the label (includes the PRD item — filter it out client-side)
glab api "projects/${PROJECT}/issues?labels=workstream::<name>&per_page=100&state=opened"
```

Process the PRD first, then its siblings — siblings need the Workstream's Jira key as `--parent`.

### 2. Fetch full work item data

One GraphQL call per item gets everything needed — description, labels, hierarchy, linked MRs, and notes (for the idempotency check in step 3):

```bash
glab api graphql -f query='
query {
  project(fullPath: "vistaprint-org/design-technology/studio/studio") {
    workItems(iids: ["<IID>"]) {
      nodes {
        id
        iid
        title
        state
        widgets {
          type
          ... on WorkItemWidgetDescription { description }
          ... on WorkItemWidgetLabels { labels { nodes { title } } }
          ... on WorkItemWidgetHierarchy { parent { id iid title } children { nodes { id iid title } } }
          ... on WorkItemWidgetDevelopment { relatedMergeRequests { nodes { iid title webUrl state } } }
          ... on WorkItemWidgetLinkedItems { linkedItems { nodes { linkType workItem { iid title } } } }
          ... on WorkItemWidgetNotes { discussions { nodes { notes { nodes { body } } } } }
        }
      }
    }
  }
}'
```

### 3. Idempotency check

Grep the notes widget for the marker: `Migrated to Jira: (https://vistaprint\.atlassian\.net/browse/\S+)`.

- **Found** → already migrated. Extract the Jira key, skip step 5 (creation), but still run steps 6–7 (comment/close, MR repoint) in case a prior run was interrupted partway. Report the existing key.
- **Not found** → proceed with creation.

### 4. Resolve the Jira Workstream (for non-PRD items)

The mapping between a `workstream::X` label and its Jira Workstream key lives in `workstream-map.json` next to this file (`[skill-dir]/workstream-map.json`), seeded with known mappings.

```bash
MAP="$(dirname "$0")/../workstream-map.json"  # or hardcode the absolute skill path
jq -r --arg k "workstream::<name>" '.[$k] // empty' workstream-map.json
```

- **Hit** → use that Jira key as `--parent`.
- **Miss** → fall back to a Jira text search (the label is literally embedded in the Workstream's description, e.g. ERICRULEZ-1 contains `workstream::extraction`):

  ```bash
  acli jira workitem search --jql 'project = ERICRULEZ AND issuetype = Workstream AND description ~ "workstream::<name>"' --json
  ```

  - **Found** → use it, and write it back to `workstream-map.json` (self-healing cache):
    ```bash
    jq --arg k "workstream::<name>" --arg v "ERICRULEZ-N" '.[$k] = $v' workstream-map.json > tmp.json && mv tmp.json workstream-map.json
    ```
  - **Still missing** → the PRD for this workstream hasn't been migrated yet.
    - Single/list mode: **stop**, tell the user to migrate the PRD first.
    - Workstream mode: migrate the PRD now (step 5, `--type Workstream`, no parent), record the mapping, then continue with the siblings.

### 5. Create the Jira issue

Build the markdown body, convert it to ADF, then create with `--description-file` pointed at the **ADF JSON**, not the markdown:

```bash
MD_FILE=$(mktemp) && cat > "$MD_FILE" <<'__DESC__'
<GitLab description, verbatim>

_Migrated from GitLab: https://gitlab.com/vistaprint-org/design-technology/studio/studio/-/work_items/<IID>_
__DESC__
# Note: no `---` thematic break in content you author — ADF doesn't support the
# `rule` node in this conversion path and it'll surface as a warning. Fine if
# it appears in the *source* GitLab markdown (just gets flagged, not fatal);
# just don't introduce one yourself in the footer above.

ADF_FILE=$(mktemp)
node "<skill-dir>/scripts/md-to-adf.mjs" "$MD_FILE" "$ADF_FILE"
# ^ prints any lossy-conversion warnings to stderr — surface those in step 8's report

# PRD item → Workstream (no parent)
acli jira workitem create --project ERICRULEZ --type Workstream \
  --summary "<title>" --description-file "$ADF_FILE" \
  --label "<other labels, comma-separated, minus workstream::*/PRD>" --json

# Sibling item → Task (parented to the Workstream)
acli jira workitem create --project ERICRULEZ --type Task \
  --summary "<title>" --description-file "$ADF_FILE" --parent "<workstream-key>" \
  --label "<other labels, comma-separated, minus workstream::*/PRD>" --json
```

Extract the new key from the JSON response (`.key`). Update `workstream-map.json` if this was a PRD/Workstream creation.

Verified end-to-end against ERICRULEZ (test issue created then deleted): with `preset: "default", useHeadings: true`, headings/code-blocks-with-language/bullet-lists/task-lists all convert to real ADF nodes and render properly — Jira echoes the description back as a structured object (not a string) when it worked.

### 6. Comment + close on GitLab

Always comment **before** closing — the comment is the idempotency marker, so if closing fails you haven't lost the record.

```bash
glab issue note <iid> -R vistaprint-org/design-technology/studio/studio \
  -m "Migrated to Jira: https://vistaprint.atlassian.net/browse/<jira-key>"

glab issue close <iid> -R vistaprint-org/design-technology/studio/studio
```

### 7. Repoint related merge requests

For every MR from the `relatedMergeRequests` widget (step 2), plus a fallback search in case a linking MR doesn't use the closing keywords:

```bash
glab api "projects/${PROJECT}/merge_requests?state=opened&search=<iid>&in=title,description"
```

For each open MR found, **append** — never replace — a line to the description (preserves any `Closes #<iid>` text, since the GitLab item still closes normally):

```bash
CURRENT=$(glab mr view <mr-iid> -R vistaprint-org/design-technology/studio/studio --output json | jq -r '.description')
NEW_FILE=$(mktemp) && printf '%s\n\n---\nMigrated to: https://vistaprint.atlassian.net/browse/%s\n' "$CURRENT" "<jira-key>" > "$NEW_FILE"
glab mr update <mr-iid> -R vistaprint-org/design-technology/studio/studio -d "$(cat "$NEW_FILE")"
```

### 8. Report

Print a table for the user to review:

| GitLab | Jira | MRs updated | Closed |
|---|---|---|---|
| #277 | ERICRULEZ-5 | !42 | ✅ |

Call out anything skipped (already-migrated items, missing assignee/milestone/weight data, unmigrated blocking links) so the user can decide whether to handle them manually.

## Rules

- Never close a GitLab item without the migration comment landing first.
- Never overwrite an MR description — always append.
- Don't guess at assignee/user mapping between GitLab and Jira — ask, or skip and flag it.
- If a workstream lookup fails in single/list mode, stop and ask rather than creating a Task with no parent.
