# Issue tracker: Jira (ERICRULEZ)

Issues and specs for this repo live as Jira work items in the **ERICRULEZ** project on `vistaprint.atlassian.net`, even though source lives on GitLab (`gitlab.com/vistaprint-org/diy-design-curation/design-exploration/quick-view-modal`). Use the `vista-atlassian` skill (the official `twg` CLI, with the Rovo MCP server as fallback) for all operations.

## Conventions

- **Create a ticket**: `twg jira workitem create` with the project set to `ERICRULEZ`. Pass `--description-format markdown` when the description contains Markdown — otherwise Jira stores it as unrendered literal text instead of ADF.
- **Read a ticket**: `twg jira workitem get --id ERICRULEZ-<number>`.
- **List / search tickets**: `twg jira workitem query` with a JQL filter scoped to `project = ERICRULEZ`.
- **Comment on a ticket**: `twg jira workitem comment create --id ERICRULEZ-<number> --body-format markdown`.
- **Apply / remove labels**: `twg jira workitem update --id ERICRULEZ-<number>` with the labels field; Jira labels are a plain list, not a separate "labels" subcommand.
- **Close**: Jira has no single universal "closed" state — check `twg jira workitem transitions query --id ERICRULEZ-<number>` for this project's actual terminal status name, then `twg jira workitem update --id ERICRULEZ-<number> --status "<Status name>"`.
- **Merge requests**: this repo's code lives on GitLab, a separate system from the tracker. Open MRs there as usual (see `studio-ship-work` / `write-pr-description`), and reference the ERICRULEZ key in the MR title or description so the two stay linked. There is no native GitLab↔Jira issue link; the key reference is the convention.
- Before any command whose exact flags matter, run `twg help describe "jira workitem <subcommand>"` rather than guessing from memory — `vista-atlassian` documents this as the required discovery step.

## Merge requests as a triage surface

**N/A.** The issue tracker (Jira) and the code host (GitLab) are different systems here, so there's no "external MR as a feature request" flag to set — that convention only applies when issues and merge/pull requests live on the same platform.

## When a skill says "publish to the issue tracker"

Create a Jira work item in the ERICRULEZ project (`twg jira workitem create`).

## When a skill says "fetch the relevant ticket"

Fetch the Jira work item by its `ERICRULEZ-<number>` key (`twg jira workitem get --id ERICRULEZ-<number>`).

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single Jira work item with **child** work items as tickets.

- **Map**: a work item labelled `wayfinder:map` in ERICRULEZ, holding the Notes / Decisions-so-far / Fog body. `twg jira workitem create` with that label. (If ERICRULEZ has native Epics enabled, an Epic may hold the map instead; a labelled Story/Task works everywhere.)
- **Child ticket**: a work item carrying `Part of ERICRULEZ-<map>` at the top of its description, labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`), and linked to the map via Jira's native "Epic Link" (if the map is an Epic) or a `relates to` issue link otherwise. Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Jira's **native `is blocked by` / `blocks` issue link type**, the canonical, UI-visible representation — `twg jira workitem link workitem` with that link type. A ticket is unblocked when every blocker is closed (its terminal status reached, per the project's workflow).
- **Frontier query**: `twg jira workitem query` scoped to `project = ERICRULEZ AND "Epic Link" = <map>` (or the `relates to` equivalent), drop any ticket with an open `is blocked by` link or an assignee; first in map order wins.
- **Claim**: `twg jira workitem update --id ERICRULEZ-<n> --assignee <self>`, the session's first write.
- **Resolve**: `twg jira workitem comment create --id ERICRULEZ-<n> --body-format markdown` with the answer, then transition the ticket to its terminal status, then append a context pointer (gist + link) to the map's Decisions-so-far.
