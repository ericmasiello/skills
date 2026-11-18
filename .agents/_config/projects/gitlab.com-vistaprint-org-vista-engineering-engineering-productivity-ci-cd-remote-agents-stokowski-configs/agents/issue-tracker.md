# Issue tracker: Jira (ERICRULEZ)

Issues and specs for maintaining this stokowski-configs repo itself are tracked in Jira project ERICRULEZ (https://vistaprint.atlassian.net/jira/core/projects/ERICRULEZ), not in this repo's GitLab Issues. This is separate from the `STOKOWSKI_ISSUE_IDENTIFIER` Jira issue that individual Stokowski agent runs comment on — this tracker is for planning/triaging changes to the configs/prompts in this repo, not for a given deployed agent run.

## Conventions

- Use the `vista-atlassian` / `twg-jira` skill (twg CLI, falling back to Rovo MCP) for all Jira operations against project ERICRULEZ.
- Reference the Jira key (e.g. `ERICRULEZ-123`) in commit messages and MR titles, per this repo's Conventional Commits convention (`feat(<team-slug>):`, etc.) — append it after the scope.

## When a skill says "publish to the issue tracker"

Create a Jira issue in project ERICRULEZ.

## When a skill says "fetch the relevant ticket"

Look up the Jira issue by key in project ERICRULEZ.

## Wayfinding operations

Used by `/wayfinder`. ERICRULEZ has no Epic type: its hierarchy is Workstream → Task → Sub-task. The map is labelled `wayfinder-map` and sits one level above its tickets:

- **When an existing Workstream already covers the effort** (the usual case): the map is a **Task** under that Workstream, and its tickets are **Sub-tasks** of the map.
- **When the effort is its own initiative**: the map is a new **Workstream**, and its tickets are **Tasks** under it.

Tickets carry `wayfinder-research` / `wayfinder-prototype` / `wayfinder-grilling` / `wayfinder-task` labels, and are gated with native `Blocks` issue links. The full command recipes live in the Studio repo's `docs/agents/issue-tracker.md` ("Wayfinding operations").
