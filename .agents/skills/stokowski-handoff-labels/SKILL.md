---
name: stokowski-handoff-labels
description: Apply the two Jira labels that hand an ERICRULEZ ticket off to Stokowski (`stokowski-ericrulez` + `workflow:eric`), after confirming via Jira's own blocking relationships that the ticket is actually startable. Use when the user says "label this for Stokowski", "hand this off to Stokowski", or right after filing ERICRULEZ follow-up tickets that should become pickable.
---

# Stokowski Hand-off Labels

Stokowski (the execution agent that works ERICRULEZ tickets) only picks up a ticket once it carries **both**:

- `stokowski-ericrulez`
- `workflow:eric`

This skill applies both — but only to a ticket that Jira's own blocking relationships say is actually startable. Requires `twg` authenticated against `vistaprint.atlassian.net`; see [`vista-atlassian`](../vista-atlassian/SKILL.md) for auth/setup.

## 1. Identify the tickets

Gather the ERICRULEZ ticket keys to hand off — from context (e.g. tickets just filed as follow-up work) or ask the user.

## 2. Check Jira's blocking relationships

For each ticket:

1. `twg jira workitem link query --issue-id <key>` and inspect inward "is blocked by" links.
2. For every blocker found, check its status (`twg jira workitem get <blocker-key>`). If any blocker isn't Done/Closed, the ticket is **not ready** — skip it and note why.
3. No blocking links, or every blocker is Done → ready to label.

Never label a ticket still gated by an open blocker: Stokowski grabs it the moment the label lands, whether or not the work behind it is actually startable yet.

## 3. Apply the labels

For each ready ticket:

```
twg jira workitem update <key> --add-labels "stokowski-ericrulez,workflow:eric"
```

## 4. Verify and report

Re-fetch each ticket's `labels` field to confirm both landed. Report one table: ticket key, labeled or skipped, and — for anything skipped — which open blocker gated it.
