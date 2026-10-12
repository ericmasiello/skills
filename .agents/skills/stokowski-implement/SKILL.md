---
name: stokowski-implement
description: Hand off ERICRULEZ ticket(s) to Stokowski by resolving which workflow (`workflow:*`) and repo (`repo:*`) label each one needs — inferred from the prompt, ticket context, or an interactive menu when ambiguous — then applying it only once Jira's own blocking relationships confirm the ticket is actually startable. Use when the user says "hand this off to Stokowski", "dispatch this to Stokowski", "label this for Stokowski", "run a coverage audit on this ticket", "quick-mr this ticket", "full CE this", or right after filing ERICRULEZ follow-up tickets that should become pickable.
---

# Stokowski Implement

Stokowski (the execution agent that works ERICRULEZ tickets) only picks up a ticket once it carries `stokowski-ericrulez`. Which of its workflows actually runs is decided by whichever `workflow:*` label rides along with it — get that wrong and the ticket runs the wrong playbook, not just a late one. This skill resolves the ticket, the workflow, and the repo, then applies all three labels — but only to a ticket Jira's own blocking relationships say is actually startable.

Supersedes `stokowski-handoff-labels`, which only ever applied the single default `workflow:eric`.

Requires `twg` authenticated against `vistaprint.atlassian.net`; see [`vista-atlassian`](../vista-atlassian/SKILL.md) for auth/setup.

## 1. Identify the ticket(s)

1. Look for `ERICRULEZ-\d+` keys or `https://vistaprint.atlassian.net/browse/ERICRULEZ-\d+` URLs in the prompt.
2. If none, scan the recent conversation for a referenced ticket.
3. Still none, or more than one plausible match → ask with the `question` tool.

## 2. Resolve the workflow

Canonical source: the `workflows:` block in `/Users/emasiello/Sites/stokowski-configs/workflows/ericrulez/workflow.yaml`, when that checkout exists on this machine — re-derive the table below from it rather than trusting a stale cache if the two ever disagree.

| Workflow label | Name | Use case | Inference keywords |
|---|---|---|---|
| `workflow:eric` | Direct Implement (default) | Code, test, revise/unslop comments, draft MR, review, merge — no planning | "implement", "work on this", "fix this", "do this" |
| `workflow:coverage-audit` | Coverage Audit | Dispatches `coverage-auditor`, drafts a ticket backlog, gates for review, publishes tickets | "coverage audit", "audit coverage", "audit tests", "test backlog" |
| `workflow:coverage-execute` | Coverage Execute | Executes test characterization/uplift items from a plan, mutation-review gate, opens MR | "coverage execute", "execute coverage", "write tests from plan" |
| `workflow:quick-mr` | Quick MR | Light plan, implement, review, risk score, automated merge wait | "quick mr", "quick fix", "small change" |
| `workflow:quick-mr-with-compound` | Quick MR + Compound | Same as Quick MR, plus a compound-learnings step before risk score | "compound", "quick mr compound", "record learnings" |
| `workflow:full-ce` | Full CE (deep plan) | Full plan + plan-review gate, implement, review, compound, risk score, merge wait | "full ce", "plan first", "architecture plan", "deep plan" |
| `workflow:triage` | Triage | Classify before routing (not the default on this team) | "triage", "classify" |

1. If the prompt names a workflow explicitly or matches a keyword above, use it.
2. Otherwise, present the table as a `question` tool menu (one question, options = the human-readable names) — don't guess silently; the wrong workflow runs a materially different playbook, not just a differently-worded one.

## 3. Resolve the repo label

| Repo label | Clone URL |
|---|---|
| `repo:studio` (default) | `studio.git` |
| `repo:calcifer` | `studio-calcifer.git` |
| `repo:stokowski-configs` | `stokowski-configs.git` |

1. If the ticket already carries a `repo:*` label, keep it — don't re-infer.
2. Otherwise, infer from the ticket/prompt context (a mention of "calcifer" or "sim-framework" → `repo:calcifer`; a mention of the Stokowski config repo itself → `repo:stokowski-configs`) or default to `repo:studio`.

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
