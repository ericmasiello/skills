# Issue tracker: Jira

Issues live in Jira project **ERICRULEZ** (Vistaprint Atlassian instance: `vistaprint.atlassian.net`).
Board: https://vistaprint.atlassian.net/jira/core/projects/ERICRULEZ/board?filter=&groupBy=none

Use the `acli` CLI (see the `vista-atlassian` skill) for all operations; fall back to the Rovo MCP
server (`io.vista/atlassian-rovo-mcp`) only for operations `acli` can't handle (e.g. CQL search on
Confluence, worklogs, remote issue links).

## Workstream-first structure (mandatory)

ERICRULEZ has no Epic issue type. Its hierarchy is **Workstream → Task → Sub-task**. Every Task is
tracked as a **child of a Workstream**. Never create a bare standalone Task.

- **Before creating any Task**, find-or-create the Workstream for the initiating body of work
  (feature, project, initiative): `acli jira workitem search --jql "project = ERICRULEZ AND type = Workstream AND text ~ \"<topic>\"" --json`.
- **The Workstream holds the "why" and the "in what order"**: high-level design write-ups, architecture
  decisions, and sequencing of the work go in the Workstream's description (or a linked Confluence page via
  `vista-atlassian`) — not scattered across child tickets.
- **Tasks are the executable units**: each is a concrete, independently actionable task —
  never a design doc. Set the Workstream as parent at creation time with `--parent <WORKSTREAM-KEY>`.
- **Sub-tasks** break one Task down further, with `--type Sub-task --parent <TASK-KEY>`.
- **When a skill says "publish to the issue tracker"**: resolve the Workstream first (find or create), then
  create the work item as its child.

## Conventions

- **Create a Workstream**: `acli jira workitem create --project ERICRULEZ --type Workstream --summary "..." --description "..."`
- **Create a Task**: `acli jira workitem create --project ERICRULEZ --type Task --summary "..." --description "..." --parent <WORKSTREAM-KEY>`
- **Create a Sub-task**: `acli jira workitem create --project ERICRULEZ --type Sub-task --summary "..." --description "..." --parent <TASK-KEY>`
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

Used by `/wayfinder`. The map sits one level above its tickets, so pick the level by whether a
Workstream already covers the effort:

- **Map**, labelled `wayfinder-map`, its description holding the Destination / Notes / Decisions-so-far /
  Not-yet-specified / Out-of-scope body:
  - **When an existing Workstream already covers the effort** (the usual case): the map is a **Task**
    under that Workstream. `acli jira workitem create --project ERICRULEZ --type Task --parent <WORKSTREAM-KEY> --summary "..." --label wayfinder-map`
  - **When the effort is its own initiative**: the map is a new **Workstream**.
    `acli jira workitem create --project ERICRULEZ --type Workstream --summary "..." --label wayfinder-map`
- **Child ticket**: a **Sub-task** of a Task map, or a **Task** of a Workstream map, created with
  `--parent <map-key>`, labelled `wayfinder-research` / `wayfinder-prototype` / `wayfinder-grilling` /
  `wayfinder-task`.
- **Blocking**: `acli jira workitem link create --out <blocker> --in <child> --type "Blocks" --yes`
  reads "<blocker> blocks <child>". On the child, the blocker shows up as the link's `outwardIssue`.
  A ticket is unblocked when every blocker is closed.
- **Frontier query**: `acli jira workitem search --jql "project = ERICRULEZ AND parent = <map-key>" --json`,
  drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `acli jira workitem edit --key <child> --assignee "@me" --yes`
- **Resolve**: `acli jira workitem comment create --key <child> --body "<answer>"`, then
  `acli jira workitem transition --key <child> --status "Done" --yes`

## Related

`studio-migrate-to-jira` migrates GitLab work items from this repo to Jira project ERICRULEZ — relevant
if an issue originates on the GitLab side and needs porting over.
