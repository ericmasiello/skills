# Studio GitLab Labels

Canonical reference for scoped labels used across Studio skills.

## Workstream (one per issue)

- `workstream::css-modules`
- `workstream::i18n`
- `workstream::sim-framework`
- `workstream::tooling`

> If none fit, create a new one: `glab label create -n "workstream::<name>" -c "<hex-color>" -d "<description>"`

## Status (one per issue, mutually exclusive)

| Label | Meaning |
|---|---|
| `status::blocked` | Has open blockers |
| `status::ready` | Unblocked, ready for work |
| `status::in-progress` | Active work or branch pushed |
| `status::awaiting-review` | MR open, awaiting review |
| `status::needs-investigation` | Unclear, needs review |

## Type labels (optional)

- `PRD` — Product requirements document

## Rules

- **Scoped labels** are mutually exclusive within their scope. GitLab enforces this automatically — applying `status::in-progress` removes any existing `status::*` label.
- Every issue must have exactly one `workstream::*` and one `status::*` label.
