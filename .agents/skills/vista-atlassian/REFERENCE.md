# Atlassian CLI & MCP Reference

## acli Jira Commands

### workitem search

Search for issues using JQL or saved filters.

```bash
acli jira workitem search --jql "PROJECT = PROJ AND updated >= -7d" --json
acli jira workitem search --jql "assignee = currentUser()" --fields "key,summary,status,priority" --csv
acli jira workitem search --jql "PROJECT = PROJ" --limit 50 --paginate
acli jira workitem search --filter 10001 --json
acli jira workitem search --jql "PROJECT = PROJ" --count
```

**Flags**: `--jql`, `--filter`, `--fields` (default: issuetype,key,assignee,priority,status,summary), `--json`, `--csv`, `--limit`, `--paginate`, `--count`, `--web`

### workitem view

```bash
acli jira workitem view PROJ-123 --json
acli jira workitem view PROJ-123 --fields "summary,comment,description"
acli jira workitem view PROJ-123 --fields "*all" --json
```

**Flags**: `--fields` (default: key,issuetype,summary,status,assignee,description), `--json`, `--web`

### workitem create

```bash
acli jira workitem create --project PROJ --type Task --summary "Title" --description "Body" --assignee "@me" --label "bug,cli"
acli jira workitem create --project PROJ --type Bug --summary "Title" --from-file description.txt
acli jira workitem create --from-json workitem.json
acli jira workitem create --generate-json  # generate template
```

**Flags**: `--project`, `--type`, `--summary`, `--description`, `--description-file`, `--assignee` (`@me`, email, or account ID), `--label`, `--parent`, `--editor`, `--from-file`, `--from-json`, `--generate-json`, `--json`

### workitem edit

```bash
acli jira workitem edit --key PROJ-123 --summary "New title" --yes
acli jira workitem edit --key "PROJ-1,PROJ-2" --assignee user@company.com --yes
acli jira workitem edit --jql "project = PROJ AND status = Open" --labels "priority-high" --yes
acli jira workitem edit --key PROJ-123 --remove-labels "old-label" --yes
acli jira workitem edit --key PROJ-123 --description "Updated desc" --yes
```

**Flags**: `--key`, `--jql`, `--filter`, `--summary`, `--description`, `--description-file`, `--assignee`, `--remove-assignee`, `--labels`, `--remove-labels`, `--type`, `--from-json`, `--generate-json`, `--json`, `--yes`, `--ignore-errors`

### workitem transition

```bash
acli jira workitem transition --key PROJ-123 --status "Done" --yes
acli jira workitem transition --key "PROJ-1,PROJ-2" --status "In Progress" --yes
acli jira workitem transition --jql "project = PROJ AND status = 'To Do'" --status "In Progress" --yes
```

**Flags**: `--key`, `--jql`, `--filter`, `--status`, `--json`, `--yes`, `--ignore-errors`

### workitem comment

```bash
acli jira workitem comment create --key PROJ-123 --body "Comment text"
acli jira workitem comment list --key PROJ-123 --json
acli jira workitem comment update --key PROJ-123 --comment-id 12345 --body "Updated comment"
acli jira workitem comment delete --key PROJ-123 --comment-id 12345
acli jira workitem comment visibility --key PROJ-123
```

### workitem link

```bash
acli jira workitem link create --inward-key PROJ-123 --outward-key PROJ-456 --type "Blocks"
acli jira workitem link list --key PROJ-123 --json
acli jira workitem link delete --key PROJ-123 --link-id 12345
acli jira workitem link type  # list available link types
```

### workitem assign

```bash
acli jira workitem assign --key PROJ-123 --assignee "@me"
acli jira workitem assign --key PROJ-123 --assignee user@company.com
```

### workitem attachment

```bash
acli jira workitem attachment list --key PROJ-123 --json
acli jira workitem attachment delete --key PROJ-123 --attachment-id 12345
```

### workitem watcher

```bash
acli jira workitem watcher list --key PROJ-123
acli jira workitem watcher remove --key PROJ-123 --account-id "abc123"
```

### workitem archive / unarchive / clone / delete

```bash
acli jira workitem archive --key PROJ-123
acli jira workitem unarchive --key PROJ-123
acli jira workitem clone --key PROJ-123
acli jira workitem delete --key PROJ-123
acli jira workitem create-bulk --from-json bulk.json
```

### project

```bash
acli jira project list --json
acli jira project view PROJ --json
acli jira project create --key NEWPROJ --name "Project Name" --type software
acli jira project update --key PROJ --name "New Name"
acli jira project delete --key PROJ
acli jira project archive --key PROJ
acli jira project restore --key PROJ
```

### board

```bash
acli jira board search --json
acli jira board get --id 123 --json
acli jira board list-sprints --id 123 --json
acli jira board list-projects --id 123 --json
acli jira board create --name "Board Name" --type scrum
acli jira board delete --id 123
```

### sprint

```bash
acli jira sprint view --id 123 --json
acli jira sprint list-workitems --id 123 --json
acli jira sprint create --board-id 123 --name "Sprint 1"
acli jira sprint update --id 123 --name "Sprint 1 - Updated"
acli jira sprint delete --id 123
```

### filter

```bash
acli jira filter list --json
acli jira filter search --name "My Filter" --json
acli jira filter get --id 10001 --json
acli jira filter update --id 10001 --name "Updated Filter"
acli jira filter get-columns --id 10001
acli jira filter add-favourite --id 10001
```

### field

```bash
acli jira field create --name "Custom Field" --type string
acli jira field update --id customfield_10001 --name "Updated Name"
acli jira field delete --id customfield_10001
acli jira field cancel-delete --id customfield_10001
```

---

## acli Confluence Commands

### page view

```bash
acli confluence page view --id 1234567890 --json
acli confluence page view --id 1234567890 --body-format view
acli confluence page view --id 1234567890 --body-format storage --json
acli confluence page view --id 1234567890 --include-labels --include-direct-children --json
acli confluence page view --id 1234567890 --version 3 --json
```

**Flags**: `--id`, `--body-format` (storage, atlas_doc_format, view), `--json`, `--version`, `--status`, `--get-draft`, `--include-labels`, `--include-direct-children`, `--include-versions`, `--include-version`, `--include-collaborators`, `--include-likes`, `--include-properties`, `--include-operations`, `--include-webresources`, `--include-favorited-by-current-user-status`

### blog create

```bash
acli confluence blog create --space-id 12345 --title "Post Title" --body "<p>Content</p>"
acli confluence blog create --space-id 12345 --title "Draft" --status draft --body "<p>WIP</p>"
acli confluence blog create --space-id 12345 --title "From File" --from-file content.html
acli confluence blog create --from-json blog.json
```

**Flags**: `--space-id`, `--title`, `--body` (XHTML storage format), `--status` (current/draft), `--from-file`, `--from-json`, `--generate-json`, `--private`, `--created-at`, `--json`

### blog list / view

```bash
acli confluence blog list --space-id 12345 --json
acli confluence blog list --space-id 12345 --title "Release" --limit 10 --json
acli confluence blog view --id 98765 --json
```

### space list / view / create / update / archive / restore

```bash
acli confluence space list --json
acli confluence space list --type personal --json
acli confluence space view --key SPACE --json
acli confluence space create --key NEWSPACE --name "Space Name"
acli confluence space update --key SPACE --name "Updated Name"
acli confluence space archive --key SPACE
acli confluence space restore --key SPACE
```

---

## Rovo MCP Fallback Commands

Use these when acli cannot handle the operation. Requires `io.vista/atlassian-rovo-mcp` to be enabled.

### Confluence — Search (CQL)

```
searchConfluenceUsingCql(
  cloudId: "vistaprint.atlassian.net",
  cql: "type = page AND space = 'MYSPACE' AND lastModified >= now('-7d')",
  limit: 25
)
```

Common CQL patterns:
- Pages by contributor: `contributor = currentUser() AND lastModified >= now("-7d")`
- Pages by title: `title ~ "meeting notes" AND type = page`
- Pages in space: `space = "MYSPACE" AND type = page`

### Confluence — Get Page (with body)

```
getConfluencePage(
  cloudId: "vistaprint.atlassian.net",
  pageId: "1234567890",
  contentFormat: "markdown"   // or "adf" for full fidelity
)
```

### Confluence — Create Page

```
createConfluencePage(
  cloudId: "vistaprint.atlassian.net",
  spaceId: "<space-id>",
  title: "Page Title",
  body: "# Content here",
  contentFormat: "markdown",
  status: "current"   // or "draft"
)
```

### Confluence — Update Page

```
updateConfluencePage(
  cloudId: "vistaprint.atlassian.net",
  pageId: "1234567890",
  body: "# Updated content",
  contentFormat: "markdown",
  title: "Optional new title",
  versionMessage: "Updated via agent"
)
```

**Important**: Always fetch the current page content first with `getConfluencePage`, merge your changes, then update. Never blindly overwrite.

### Confluence — Comments

```
// Footer comment
createConfluenceFooterComment(
  cloudId: "vistaprint.atlassian.net",
  pageId: "1234567890",
  body: "Comment text",
  contentFormat: "markdown"
)

// Get footer comments
getConfluencePageFooterComments(
  cloudId: "vistaprint.atlassian.net",
  pageId: "1234567890",
  contentFormat: "markdown"
)

// Inline comment (requires text selection)
createConfluenceInlineComment(
  cloudId: "vistaprint.atlassian.net",
  pageId: "1234567890",
  body: "Inline comment",
  contentFormat: "markdown",
  inlineCommentProperties: {
    textSelection: "exact text to anchor to",
    textSelectionMatchCount: 1,
    textSelectionMatchIndex: 0
  }
)
```

### Confluence — Page Descendants

```
getConfluencePageDescendants(
  cloudId: "vistaprint.atlassian.net",
  pageId: "1234567890",
  depth: 2,
  limit: 50
)
```

### Confluence — Full-Text Search (Rovo)

```
search(query: "quarterly plan goals")
```

### Jira — Worklogs

```
addWorklogToJiraIssue(
  cloudId: "cimpress-support.atlassian.net",
  issueIdOrKey: "PROJ-123",
  timeSpent: "2h",
  commentBody: "Worked on implementation",
  contentFormat: "markdown"
)
```

### Jira — Remote Links

```
getJiraIssueRemoteIssueLinks(
  cloudId: "cimpress-support.atlassian.net",
  issueIdOrKey: "PROJ-123"
)
```

### Jira — User Lookup

```
lookupJiraAccountId(
  cloudId: "cimpress-support.atlassian.net",
  searchString: "John Smith"
)
```
