---
name: stokowski-implement
description: Hand off ERICRULEZ ticket(s) to Stokowski by resolving which workflow (`workflow:*`) and repo (`repo:*`) label each one needs — inferred from the prompt, ticket context, or an interactive menu when ambiguous — then applying it only once Jira's own blocking relationships confirm the ticket is actually startable. Use when the user says "hand this off to Stokowski", "dispatch this to Stokowski", "label this for Stokowski", "run a coverage audit on this ticket", "quick-mr this ticket", "full CE this", or right after filing ERICRULEZ follow-up tickets that should become pickable.
---

# Stokowski Implement

Stokowski (the execution agent that works ERICRULEZ tickets) only picks up a ticket once it carries `stokowski-ericrulez`. Which of its workflows actually runs is decided by whichever `workflow:*` label rides along with it — get that wrong and the ticket runs the wrong playbook, not just a late one. This skill resolves the ticket, the workflow, and the repo, then applies all three labels — but only to a ticket Jira's own blocking relationships say is actually startable.

Requires `twg` authenticated against `vistaprint.atlassian.net`; see [`vista-atlassian`](../vista-atlassian/SKILL.md) for auth/setup.

## 1. Identify the ticket(s)

1. Look for `ERICRULEZ-\d+` keys or `https://vistaprint.atlassian.net/browse/ERICRULEZ-\d+` URLs in the prompt.
2. If none, scan the recent conversation for a referenced ticket.
3. Still none, or more than one plausible match → ask with the `question` tool.

## 2. Resolve the workflow

Canonical source: the `workflows:` block in `/Users/emasiello/Sites/stokowski-configs/workflows/ericrulez/workflow.yaml`, when that checkout exists on this machine — re-derive the table below from it rather than trusting a stale cache if the two ever disagree.

| Workflow label | Name | Use case | Inference keywords |
|---|---|---|---|
| `workflow:eric` | Direct Implement (default) | Code, test, revise/unslop comments, draft MR, review, merge — no planning | "implement", "work on this", "fix this", "do this", "quick mr", "quick fix", "small change" |
| `workflow:coverage-audit` | Coverage Audit | Dispatches `coverage-auditor`, drafts a ticket backlog, gates for review, publishes tickets | "coverage audit", "audit coverage", "audit tests", "test backlog" |
| `workflow:coverage-execute` | Coverage Execute | Executes test characterization/uplift items from a plan, mutation-review gate, opens MR | "coverage execute", "execute coverage", "write tests from plan" |
| `workflow:install-mutation-testing` | Install Mutation Testing | Installs/scaffolds whatever mutation-testing tool `mutation-readiness.mjs` selects for the target repo's platform, until it reports "installed and configured"; fails closed (no commit, no MR) on any incompatibility. Optional prerequisite for `coverage-auditor` — not a CI integration, not a mutation run | "mutation testing", "add mutation testing", "mutation testing library", "install stryker", "set up mutation testing" |
| `workflow:quick-mr-with-compound` | Quick MR + Compound | Light plan, implement, review, compound learnings, risk score, merge wait | "compound", "record learnings" |
| `workflow:full-ce` | Full CE (deep plan) | Full plan + plan-review gate, implement, review, compound, risk score, merge wait | "full ce", "plan first", "architecture plan", "deep plan" |
| `workflow:triage` | Triage | Classify before routing (not the default on this team) | "triage", "classify" |

### Retired: do not use `workflow:quick-mr`

Don't offer `workflow:quick-mr`. In the `ericrulez` config the `implement` state runs `ericrulez-implement.md`, which forbids `git push` and any `glab mr` call and delegates both to an `open-draft-mr` stage. `workflow:quick-mr`'s path has no `open-draft-mr` stage, so nothing ever pushes the branch or opens the MR, and the run deadlocks at `merge_wait` waiting for a merge that cannot happen (ERICRULEZ-292, 2026-10-26). Requests for "quick mr" / "quick fix" / "small change" resolve to `workflow:eric`.

### Guard: the resolved path must contain a stage that opens the MR

Before applying a `workflow:*` label, read that workflow's `path` in `workflow.yaml` and confirm it contains `open-draft-mr`, `coverage-open-draft-mr`, or `install-mutation-open-draft-mr` — unless the workflow makes no code changes at all (`triage`, `coverage-audit`). While `implement` is commit-only, any path without such a stage stalls before an MR exists.

1. If the prompt names a workflow explicitly or matches a keyword above, use it. A request for `workflow:quick-mr` resolves to `workflow:eric`.
2. Otherwise, present the table as a `question` tool menu (one question, options = the human-readable names) — don't guess silently; the wrong workflow runs a materially different playbook, not just a differently-worded one.

## 3. Resolve the repo label

| Repo label | Clone URL |
|---|---|
| `repo:studio` (default) | `studio.git` |
| `repo:calcifer` | `studio-calcifer.git` |
| `repo:stokowski-configs` | `stokowski-configs.git` |
| `repo:stokowski` | `stokowski.git` |

Canonical source: the `repos:` block in the same `workflow.yaml` as above — re-derive this table from it if the two disagree.

1. If the ticket already carries a `repo:*` label, keep it — don't re-infer.
2. Otherwise, infer from the ticket/prompt context (a mention of "calcifer" → `repo:calcifer`; a mention of the Stokowski config repo itself → `repo:stokowski-configs`; a mention of the Stokowski service/codebase itself → `repo:stokowski`) or default to `repo:studio`.
3. If the ticket or prompt targets a repo that isn't in the table, use the dynamic fallback below instead of defaulting to `repo:studio`.

### Dynamic fallback (repo not in the table)

The `repos.dynamic` entry in `workflow.yaml` uses `url_template: "{{ repo_name }}"` — no transformation — so for a dynamic repo **the label value is the full HTTPS clone URL, verbatim**, not a slug:

```
repo:https://gitlab.com/vistaprint-org/<subgroup>/<repo>.git
```

1. Resolve the repo's full HTTPS clone URL (ask with the `question` tool if it isn't clear from the ticket/prompt).
2. Read `repos.dynamic.allowed_url_prefixes` live from `workflow.yaml` — don't hardcode it; teams scope it differently.
3. URL starts with an allowed prefix → use `repo:<full-clone-url>` as the label. (Jira labels can't contain spaces or commas; `:` `/` `.` `-` are fine.)
4. URL outside every allowed prefix → stop and tell the user. Stokowski refuses to clone it; don't guess or silently fall back to the default repo.

## 4. Check readiness

For each ticket:

1. `twg jira workitem get <key> --fields labels,status,summary,description` — current labels, status, summary.
2. `twg jira workitem link query --issue-id <key>` and inspect inward "is blocked by" links.
3. For every blocker found, check its status (`twg jira workitem get <blocker-key>`). If any blocker isn't Done/Closed, the ticket is **not ready** — skip it and note why.

Never label a ticket still gated by an open blocker: Stokowski grabs it the moment the label lands, whether or not the work behind it is actually startable yet.

## 5. Apply labels

For each ready ticket, add `stokowski-ericrulez` plus the resolved `workflow:<name>` and `repo:<name>`, and strip any other `workflow:*` label already on the ticket — only one should ever ride at once:

```bash
twg jira workitem update --id <key> --add-labels "stokowski-ericrulez,workflow:<name>,repo:<name>" --remove-labels "workflow:<stale-name>"
```

Omit `--remove-labels` when the ticket carries no stale workflow label to drop.

## 6. Verify and report

Re-fetch each ticket's `labels` field to confirm the write stuck. Report one table: ticket key + summary, resolved `repo:*`, resolved `workflow:*`, and action taken — `Labeled & ready` or `Skipped (blocked by <key>)`.
