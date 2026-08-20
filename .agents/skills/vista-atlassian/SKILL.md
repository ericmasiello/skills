---
name: vista-atlassian
description: Interact with Atlassian Jira and Confluence using the acli CLI as the primary tool, with Rovo MCP server fallback for operations acli cannot handle. Use when querying Jira issues, searching with JQL, viewing or editing Confluence pages, creating issues or pages, transitioning work items, adding comments, managing sprints or boards, or any Atlassian product interaction.
---

# Atlassian (Jira + Confluence)

## Auth Context

| Product    | Site                              | MCP Cloud ID                      |
|------------|-----------------------------------|-----------------------------------|
| Jira       | vistaprint.atlassian.net          | vistaprint.atlassian.net          |
| Confluence | vistaprint.atlassian.net          | vistaprint.atlassian.net          |

## Tool Routing

**Use `acli` (primary)** — run via `bash` tool:

| Domain     | Operations                                                                                     |
|------------|-----------------------------------------------------------------------------------------------|
| Jira       | workitem: search/view/create/edit/transition/comment/link/assign/delete/archive/clone/attach   |
|            | project: list/view/create/update/delete/archive                                                |
|            | board: search/create/get/list-sprints/list-projects                                            |
|            | sprint: create/view/update/delete/list-workitems                                               |
|            | filter: list/search/get/update                                                                 |
|            | field: create/update/delete                                                                    |
| Confluence | page: view (by ID only)                                                                        |
|            | blog: create/list/view                                                                         |
|            | space: list/view/create/update/archive/restore                                                 |

**Use Rovo MCP (fallback)** — `io.vista/atlassian-rovo-mcp`:

| Domain     | Operations                                                        | MCP Tool                         |
|------------|------------------------------------------------------------------|----------------------------------|
| Confluence | Search pages (CQL)                                                | `searchConfluenceUsingCql`       |
| Confluence | Create page                                                       | `createConfluencePage`           |
| Confluence | Update/edit page                                                  | `updateConfluencePage`           |
| Confluence | Get page with body content                                        | `getConfluencePage`              |
| Confluence | Footer/inline comments                                            | `createConfluenceFooterComment`, `getConfluencePageFooterComments`, `createConfluenceInlineComment`, `getConfluencePageInlineComments` |
| Confluence | Page descendants                                                  | `getConfluencePageDescendants`   |
| Confluence | Full-text search (Rovo)                                           | `search`                         |
| Jira       | Add/update worklog                                                | `addWorklogToJiraIssue`          |
| Jira       | Remote issue links                                                | `getJiraIssueRemoteIssueLinks`   |
| Jira       | Lookup user by name                                               | `lookupJiraAccountId`            |

## MCP Fallback Protocol

The Rovo MCP server is **disabled by default**. When an operation requires MCP:

1. Attempt the operation — if MCP tools are unavailable, tell the user:
   > "This operation requires the Rovo MCP server. Please run `/mcp` to enable `io.vista/atlassian-rovo-mcp`, then let me know when it's on."
2. Wait for confirmation, then retry.
3. If the user declines, degrade gracefully:
   - **CQL search** → ask the user for page IDs or URLs directly
   - **Page updates** → draft the content and provide the Confluence edit link for manual paste
   - **Comments** → provide text for user to post manually

## Quick Reference

### Jira — Common Patterns

```bash
# Search issues with JQL (use --json for structured output)
acli jira workitem search --jql "project = PROJ AND status = 'In Progress'" --json

# View issue details
acli jira workitem view PROJ-123 --json

# Create an issue
acli jira workitem create --project PROJ --type Task --summary "Title" --description "Details" --assignee "@me"

# Edit an issue
acli jira workitem edit --key PROJ-123 --summary "Updated title" --yes

# Transition an issue
acli jira workitem transition --key PROJ-123 --status "Done" --yes

# Add a comment
acli jira workitem comment create --key PROJ-123 --body "Comment text"

# Link two issues
acli jira workitem link create --inward-key PROJ-123 --outward-key PROJ-456 --type "Blocks"
```

### Confluence — Common Patterns

```bash
# View a page by ID (with body content)
acli confluence page view --id 1234567890 --body-format view --json

# List spaces
acli confluence space list --json

# List blog posts in a space
acli confluence blog list --space-id 12345 --json
```

### Confluence — MCP Patterns (when acli can't)

```
# CQL search (cloud ID: vistaprint.atlassian.net)
searchConfluenceUsingCql(cql="contributor = currentUser() AND lastModified >= now('-7d')")

# Get page body for editing
getConfluencePage(pageId="1234567890", contentFormat="markdown")

# Update page
updateConfluencePage(pageId="1234567890", body="...", contentFormat="markdown")
```

See [REFERENCE.md](REFERENCE.md) for the full command reference with all flags and options.
