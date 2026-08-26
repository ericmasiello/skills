# Issue tracker: Jira

Issues live in Jira project **ERICRULEZ** (Vistaprint Atlassian instance: `vistaprint.atlassian.net`).
Board: https://vistaprint.atlassian.net/jira/core/projects/ERICRULEZ/board?filter=&groupBy=none

Use the `acli` CLI (see the `vista-atlassian` skill) for all operations; fall back to the Rovo MCP
server (`io.vista/atlassian-rovo-mcp`) only for operations `acli` can't handle (e.g. CQL search on
Confluence, worklogs, remote issue links).

## Epic-first structure (mandatory)

Every work item — issue, story, task, or bug — is tracked as a **child of an Epic**. Never create a
bare standalone issue.

- **Before creating any task/bug/story**, find-or-create the Epic for the initiating body of work
  (feature, project, initiative): `acli jira workitem search --jql "project = ERICRULEZ AND type = Epic AND text ~ \"<topic>\"" --json`.
- **The Epic holds the "why" and the "in what order"**: high-level design write-ups, architecture
  decisions, and sequencing of the work go in the Epic's description (or a linked Confluence page via
  `vista-atlassian`) — not scattered across child tickets.
- **Child issues are the executable units**: each is a concrete, independently actionable task —
  never a design doc. Set the Epic as parent at creation time with `--parent <EPIC-KEY>`.
- **When a skill says "publish to the issue tracker"**: resolve the Epic first (find or create), then
  create the work item as its child.

## Conventions

- **Create an Epic**: `acli jira workitem create --project ERICRULEZ --type Epic --summary "..." --description "..."`
- **Create a child issue**: `acli jira workitem create --project ERICRULEZ --type Task --summary "..." --description "..." --parent <EPIC-KEY>`
- **View an issue**: `acli jira workitem view ERICRULEZ-123 --json`
- **Search**: `acli jira workitem search --jql "project = ERICRULEZ AND status = 'In Progress'" --json`
- **Comment**: `acli jira workitem comment create --key ERICRULEZ-123 --body "..."`
- **Transition**: `acli jira workitem transition --key ERICRULEZ-123 --status "Done" --yes`
- **Edit / label**: `acli jira workitem edit --key ERICRULEZ-123 --summary "..." --labels "needs-triage" --yes`
- **Link two issues** (non-parent relationships, e.g. blocking): `acli jira workitem link create --out ERICRULEZ-123 --in ERICRULEZ-456 --type "Blocks" --yes`

## When a skill says "fetch the relevant ticket"

Run `acli jira workitem view <KEY> --json`.

## Pull/merge requests as a request surface

**MRs as a request surface: no.** This repo's code review surface is GitLab merge requests (see
`AGENTS.md`), but issue tracking itself is Jira, not GitLab Issues. `/triage` treats GitLab MRs as
code review, not as feature-request intake.

## Wayfinding operations

Used by `/wayfinder`. Per the Epic-first structure above, the **map** *is* the Epic — don't wrap it in
a separate outer Epic.

- **Map**: a Jira issue in ERICRULEZ, **type Epic**, labelled `wayfinder-map`. Its description holds
  the Notes / Decisions-so-far / Fog body — consistent with design/sequencing content living on the
  Epic. `acli jira workitem create --project ERICRULEZ --type Epic --summary "..." --label wayfinder-map`
- **Child ticket**: created as a child of the map via `--parent <map-key>`, labelled
  `wayfinder-research` / `wayfinder-prototype` / `wayfinder-grilling` / `wayfinder-task`.
- **Blocking**: `acli jira workitem link create --out <child> --in <blocker> --type "Blocks" --yes`.
  A ticket is unblocked when every blocker is closed.
- **Frontier query**: `acli jira workitem search --jql "project = ERICRULEZ AND parent = <map-key>" --json`,
  drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `acli jira workitem edit --key <child> --assignee "@me" --yes`
- **Resolve**: `acli jira workitem comment create --key <child> --body "<answer>"`, then
  `acli jira workitem transition --key <child> --status "Done" --yes`

## Related

`studio-migrate-to-jira` migrates GitLab work items from this repo to Jira project ERICRULEZ — relevant
if an issue originates on the GitLab side and needs porting over.
