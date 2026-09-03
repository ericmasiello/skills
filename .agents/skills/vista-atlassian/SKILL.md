---
name: vista-atlassian
description: Interact with Atlassian Jira and Confluence using the official `twg` (Teamwork Graph CLI) as the primary tool, with the Rovo MCP server as a fallback when `twg` is unavailable. Use when querying Jira issues, searching with JQL, viewing or editing Confluence pages, creating issues or pages, transitioning work items, adding comments, managing sprints or boards, or any Atlassian product interaction.
---

# Atlassian (Jira + Confluence)

## Auth Context

| Product    | Site                      |
|------------|---------------------------|
| Jira       | vistaprint.atlassian.net  |
| Confluence | vistaprint.atlassian.net  |

Run `twg doctor` if unsure which site/org the CLI is currently authenticated against; run `twg access` to see which products, sites, and orgs the current token can reach.

## Tool Routing

**Use `twg` (primary)** — run via `bash` tool. `twg` is Atlassian's own agent-first CLI (`developer.atlassian.com/cloud/twg-cli/`), superseding `acli` for agent use: it standardizes command/output shape across products and covers everything this skill needs — Jira work items, boards, sprints, filters, and full Confluence CRUD + CQL search (the acli/MCP split this skill used before `twg` existed is gone; `twg` alone covers both).

**Use Rovo MCP (fallback)** — `io.vista/atlassian-mcp` (remote server, disabled by default) — only if `twg` is not installed/authenticated in the current environment. See "MCP Fallback Protocol" below.

### Don't hardcode command syntax — discover it live

`twg`'s command surface is large and evolves independently of this skill. Instead of memorizing flags here, discover them at call time, exactly as Atlassian's own docs instruct agents to:

```bash
twg help                                   # top-level namespaces
twg help jira workitem                     # commands in a namespace
twg help describe "jira workitem create"   # exact args/flags/examples for one command
twg help discover-skills "sprint prioritization" --skill twg-jira   # find relevant reference docs
```

Use `twg help describe <path>` before any command whose exact arguments, choices, or defaults matter — don't guess flags from memory or from an older skill revision.

### Verified command surface (names only — confirm flags via `twg help describe`)

| Domain     | Operation                          | Command                                    |
|------------|-------------------------------------|---------------------------------------------|
| Jira       | JQL search                          | `twg jira workitem query`                   |
| Jira       | Fuzzy text search                   | `twg jira workitem search`                   |
| Jira       | View one work item                  | `twg jira workitem get`                      |
| Jira       | Create work item                    | `twg jira workitem create`                   |
| Jira       | Edit work item                      | `twg jira workitem update`                   |
| Jira       | List valid transitions              | `twg jira workitem transitions query --id <key>` |
| Jira       | Transition work item                | `twg jira workitem update --id <key> --status "<Status name>"` (the tool's own `transitions query` output points here; `twg jira workitem transition --id <key> --transition-id <id\|name>` also works) |
| Jira       | Comment                             | `twg jira workitem comment create/query/update/delete` |
| Jira       | Link two work items                 | `twg jira workitem link workitem`            |
| Jira       | Board / sprint                      | `twg jira board query/create/get`, `twg jira sprint create/start/complete/workitems query` |
| Jira       | Project admin ("space" in `twg`'s naming = Jira project) | `twg jira space create/get/query/update` |
| Jira       | JSM request (not a plain work item) | `twg jsm request create` — use this instead of `jira workitem create` when the target project is a service desk |
| Confluence | CQL search                          | `twg confluence search query`                |
| Confluence | Natural-text search                 | `twg confluence search text`                 |
| Confluence | Read a page/blogpost/whiteboard     | `twg confluence content get`                 |
| Confluence | Create page/blog/whiteboard/etc.    | `twg confluence content create`              |
| Confluence | Update content                      | `twg confluence content update` (also: `move`, `copy`, `archive`, `delete-draft`) |
| Confluence | Comments                            | `twg confluence content comments create/query/reply/resolve` |
| Confluence | Attachments                         | `twg confluence content attachments upload/list/download` |
| Confluence | Spaces                              | `twg confluence space *` |

All of the above run on the free tier (no Rovo Credits). Cross-product "Enriched" commands (`twg context`, `twg subgraph`, `twg collaborators`, `twg rovo search`, `twg search-code`, etc.) consume Rovo Credits — reach for `twg confluence search query` / `twg jira workitem query` first, and only use an Enriched command when the task genuinely needs cross-product graph context (e.g. "who else is touching this issue").

## MCP Fallback Protocol

Only needed if `twg` isn't installed/authenticated. The Rovo MCP server (`io.vista/atlassian-mcp`) is **disabled by default**.

1. First, try to unblock `twg` itself — check `twg doctor`; if it's not installed, tell the user: "This needs the `twg` CLI — run `curl -fsSL --retry 2 https://teamwork-graph.atlassian.com/cli/install | bash` then `twg setup`, or I can fall back to MCP for this one operation."
2. If the user wants the MCP fallback instead: tell them to run `/mcp` to enable `io.vista/atlassian-mcp`, then retry.
3. If they decline both, degrade gracefully:
   - **Search** → ask the user for issue keys / page IDs / URLs directly
   - **Page/issue updates** → draft the content and give them the edit link for manual paste
   - **Comments** → provide text for the user to post manually

## Note on `twg`'s own official skill

`twg setup` installs Atlassian's own maintained skill bundle to `~/.agents/skills/twg*` (`twg-jira`, `twg-confluence`, `twg-context-discovery`, etc.) — that bundle is the authoritative, self-updating source for command discovery and Atlassian-wide workflows. This skill exists only to pin the Vistaprint-specific site/auth context above; it deliberately does not duplicate `twg`'s own command reference (see `docs/adr/0008-*.md` for why).
