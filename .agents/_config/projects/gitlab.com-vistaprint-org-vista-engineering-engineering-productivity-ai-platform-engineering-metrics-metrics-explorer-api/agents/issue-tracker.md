# Issue tracker: Jira (ERICRULEZ)

Issues for this repo live as Jira work items in project **ERICRULEZ** (space id
`27794`) on `vistaprint.atlassian.net`, even though the code lives in GitLab.
Use the `twg` CLI for all operations.

## Conventions

- **Create**: `twg jira workitem create --space 27794 --type Task --summary "..." --description "..." --description-format markdown --labels "..."`
- **Read**: `twg jira workitem get <KEY> --comments`
- **List/search**: `twg jira workitem query --jql "project = ERICRULEZ AND ..." --first N`
- **Comment**: `twg jira workitem comment create --issue-id <KEY> --body "..." --body-format markdown`
- **Transition**: discover first — `twg jira workitem transition --id <KEY> -o json` (no `--transition-id`) — then supply `--transition-id`. Never guess status names; this board's "In Review" and "In Progress" share the same `indeterminate` category.
- **Blocking edges**: `twg jira workitem link workitem --id <BLOCKER_KEY> --target-id <BLOCKED_KEY> --link-type-id Blocks`. Direction matters: `--id` is the blocker, `--target-id` is the blocked ticket.
- Default issue type for this project: `Task`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a Jira work item in ERICRULEZ, issue type Task.

## When a skill says "fetch the relevant ticket"

`twg jira workitem get <KEY> --comments`
