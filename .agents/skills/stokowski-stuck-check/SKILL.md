---
name: stokowski-stuck-check
description: Find testing-uplift work that Stokowski has parked on a human — escalated items, failed or cancelled runs, and work items that stopped moving — across the ERICRULEZ and DEX Jira boards. Re-dispatches failed runs automatically, and triages every open MR into drafts, MRs with feedback, and MRs ready to merge. Use when the user says "run the stokowski stuck check", "what's stuck in Stokowski", "which Stokowski runs need me", "check my testing uplift work", or as the prompt for a recurring/scheduled stuck check.
---

# Stokowski Stuck Check

Stokowski hands control back to a human in three ways, and only one of them is good news. This skill separates them, so a run that is quietly rotting does not hide behind the merge requests that are merely waiting for review.

Scope is the testing-uplift workflows (`coverage-execute`, `coverage-audit`, `install-mutation-testing`) on the `ERICRULEZ` and `DEX` boards. One write, and only in Stokowski: a failed run is re-dispatched, the same as the dashboard's re-dispatch. Everything else is read-only; this skill never writes to Jira or GitLab, and never answers a gate.

Requires `twg` authenticated against `vistaprint.atlassian.net` (see [`vista-atlassian`](../vista-atlassian/SKILL.md)), `stok` authenticated against Stokowski (see [`stokowski-cli`](../stokowski-cli/SKILL.md)), and — unless you pass `--no-mr-check` — `glab` authenticated against `gitlab.com`, because the script opens every claimed merge request to confirm it still is one.

## Run it

```
python3 <this-skill>/scripts/scan.py --redispatch-failed
```

Resolve `<this-skill>` to the directory holding this `SKILL.md` (e.g. `~/.agents/skills/stokowski-stuck-check`). The script prints one JSON document and takes two to four minutes, so run it with a shell timeout of at least 300 seconds: one label query, one `stok list` per project, one batched ticket hydrate, a `stok status` call for each work item that needs explaining, a GitLab check for every ticket whose stage claims a merge request, a Jira comment read for every audit gate, a `stok run` per failed item, and four GitLab reads per open MR.

- `--redispatch-failed` re-dispatches every `failed` row (`stok run <id> -w <workflow>`). Always pass it unless the user asked for a report only.
- `--max-redispatches 2` caps retries per work item, counted from its earlier primary runs of the same workflow. Past the cap the row stays in `needs_human`, so a failure that repeats lands on the user instead of burning a run on every scan.
- `--board ERICRULEZ` limits to one board (repeatable).
- `--idle-days 3` sets when a wait counts as stale.
- `--stall-hours 6` sets when a silent running item counts as stalled.
- `--no-mr-check` skips the GitLab verification and the MR triage. Only for working offline: without it a `merge-review` row may name a merged or closed MR.

Exit `0` means the scan is sound. Exit `1` means the scan itself failed or was truncated — read `errors`, report it, and do not present partial results as complete. A clean exit with empty buckets is the normal all-clear, not an error.

## Read the buckets

| Bucket | Meaning |
|---|---|
| `code_review` | Waiting at a merge-review gate, **and the MR is verified open**. The run is done and the MR is there to read. Expected, not broken. |
| `needs_human` | Escalated, failed, cancelled, or parked at a non-merge gate (`blocked_gate`). The run stopped because it could not continue. Also holds a merge-review stage whose MR was closed unmerged, or which has no MR at all. |
| `idle` | Nothing is waiting on a human and nothing is moving: `never_picked_up`, `finished_not_closed`, `stalled_running`, `mr_merged_ticket_open`, `gate_without_plan`. |
| `healthy` | Running normally. Never report these, only count them. |
| `redispatched` | Was `failed`; the script started a fresh run this scan. `redispatch` carries the `run_id` and the failure `cause`. |
| `mr_triage` | Every open MR linked to an in-scope ticket, from any bucket, read in full. See [Read the MR triage](#read-the-mr-triage). |

A `failed` row still in `needs_human` carries `redispatch.status`: `skipped` (closed item, or the retry cap was reached; `why` says which) or `error` (`stok run` refused; `why` holds the message).

`age_days` is time since Stokowski last did anything (`waiting_since`), not ticket age — that is what makes a wait visible. `stale` is the same number against `--idle-days`. `kind` is the precise classification; `stage` is where the run stopped.

Each row also carries `mrs` and `mr_check`. `mr_check` is `found`, `none`, `unknown`, `no_repo_mapping`, `not_applicable` (audit stages never open MRs), or `disabled`. **`none` means nothing was ever pushed**: no branch in the ticket's repo carries the key and the run recorded no MR artifact. That single fact is usually the answer to "is it really stuck?" — the work is not sitting in review, it does not exist.

Rows at an audit or plan gate also carry `plan_check` and `plan_comment_at`. `plan_check` is `posted`, `missing`, `unknown`, or `not_applicable`. **`posted` means the plan comment exists on the ticket, newer than the gate that is open** — so there is something to read and approve. `missing` means the gate opened but the plan never arrived, and the row moves to `idle` as `gate_without_plan` rather than sitting in `needs_human` asking for an approval nobody can give.

### Read the MR triage

`mr_triage` sorts every open MR into one `category`; the script decides, in this order:

| `category` | Rule |
|---|---|
| `draft` | GitLab marks it draft. |
| `ready_to_merge` | Not draft, approved, and `merge_status` is `mergeable`: GitLab itself says the merge button works. |
| `has_feedback` | Not draft, not mergeable yet, and `feedback` is non-empty. |
| `awaiting_review` | Not draft, no feedback, no approval yet. Nobody has looked; nothing for the user to do. |

`feedback` is the list of reasons someone has to act: a `failed`/`canceled` pipeline, `needs rebase` or `merge conflicts`, AI review findings (`must_fix` and `suggestions` titles under `ai_review`), `unresolved_threads`, and `comments_since_push` (human comments newer than the last commit). Each thread entry carries `author`, `excerpt`, and a `url` straight to the note. `rework_running: true` means Stokowski is already reworking the MR right now; say so, because the feedback may be addressed in minutes.

Translate `stage` into plain words in the report rather than pasting the raw value:

| `stage` | In plain words |
|---|---|
| `*-merge-review` | MR is open, waiting on review (only when `mr_check` is `found`) |
| `coverage-audit-review`, `plan-review` | a plan is drafted and on the ticket, waiting on your approval (only when `plan_check` is `posted`) |
| `coverage-execute-escalated` | an item escalated mid-loop and the loop stopped |
| `coverage-execute-review` | per-item review; only a problem once it escalates |

## Report

Lead with one line: how many tickets were scanned, how many runs were re-dispatched, how many MRs are ready to merge, and how many items need a decision. Then emit only the sections that have rows, in this order: re-dispatched, ready to merge, MRs with feedback, drafts, needs a decision or fix, idle one-liners. The user is scanning for work, so every row answers *which ticket*, *what is true right now*, and *what they can do about it*.

### Re-dispatched

One line per `redispatched` row: ticket link, the stage it failed at, the `cause` in plain words, and that a fresh run started. Nothing for the user to do.

### Open MRs

The MR triage replaces the old code-review list: `code_review` rows all appear here, sorted by what the user has to do. Every MR here was read from GitLab this scan.

```markdown
## Ready to merge
| Ticket | MR | Approved by | Notes |
|---|---|---|---|
| [ERICRULEZ-390](url) universal-tools: alignment button groups | [!13913](url) | roman.dziuba | pipeline passed · approver left one suggestion (update zero coverage thresholds) |

## MRs with feedback
| Ticket | MR | Pipeline | What needs doing |
|---|---|---|---|
| [ERICRULEZ-401](url) … | [!13919](url) | ❌ failed | fix the pipeline · 2 AI suggestions: … |
| [ERICRULEZ-394](url) … | [!13915](url) | ✅ | 2 unresolved threads from june.eldred: [happy-dom vs …](note-url), [DIYCP-1417 note](note-url) |

## Drafts
| Ticket | MR | Pipeline | Rebase | Feedback |
|---|---|---|---|---|
```

- Name the feedback, not its count: the AI finding titles and each thread's excerpt with its link, so the user can act without opening the MR. Collapse to "N more" past three per row.
- Say whether a must-fix or a failed pipeline is the blocker; those come before suggestions in the cell.
- A `ready_to_merge` row may still carry suggestions. Show them as notes: GitLab already permits the merge, so they are the user's call, not a blocker.
- Write `awaiting_review` MRs as one line listing the MR links; they are waiting on a reviewer, not on the user.

### Needs a decision or fix

Escalations and blocked gates. Link the ticket key to Jira; the title rides beside it so the row is identifiable without clicking.

```markdown
## Needs a decision or fix

Four coverage-execute runs lost their workspace at 23:10 UTC on Oct 30.

| Ticket | Stopped at | Waiting | Current state | Your options |
|---|---|---|---|---|
| [ERICRULEZ-352](url) Coverage uplift (utils-assets) | item 6 of 22 | 2.5d | Workspace re-cloned between stages; the approved commits for items 1–5 are gone and the branch was never pushed. Nothing is running. | `approve` after pushing the branch from the old pod, resumes at item 6 · `needs-rework: workspace lost, redo 1–5` resets the progress comment and redoes items 1–5 · [dashboard](url) |
| [ERICRULEZ-229](url) Coverage audit: sim-framework | plan awaiting approval | 21d ⚠ | The audit drafted a ticket plan for 17 backlog items and has been waiting on you since Oct 12. Nothing is running. | `approve` publishes the drafted tickets · `needs-rework: strategy=per-module` redrafts the plan without creating anything · [dashboard](url) |
```

**`Current state`** — one or two sentences, built from `reason`, `reason_tail`, and `events`:

- Name what broke and what is blocked now. The `turn.failed` event carries the real cause (deadline exceeded, OOM) when `latest_result.summary` only says "Execution stopped".
- State whether anything is still running. "Nothing is running" tells the user time will not fix it.
- Translate the novelty voice: several runs write in an affected `uwu`/cackling style. Report the substance in plain English; never quote the voice.
- Name the item and its position when the run does ("item 6 of 22"), since that is what the user has to reason about.

**`Your options`** — the actual decision, not a pointer to one:

- Start from the row's `choices` and say what each one does *in this run's terms*, taken from the run's own summary. "`approve` resumes at item 6" beats "`approve`".
- For an escalation with no clean approve path, give the concrete recovery the run proposed — restore the branch vs reset the progress comment — instead of a generic rework.
- If the summary never says what a choice does, name the choice and link the dashboard. Never invent the consequence.
- End with the dashboard link: it is the only place the full turn output and logs live.

General rules:

- **Group a shared cause into one finding.** When several items failed the same way within minutes of each other (same `stage`, same `waiting_since` hour, same error event), say it once above the table — "four coverage-execute runs lost their workspace at 23:10 UTC on the 30th". Then each row says only its own consequence: which item is blocked and how much work is lost. Restating the cause in every row is what makes a table worse than prose.
- **Say when two rows look like the same work.** Identical summaries usually mean a re-run superseded the other; naming that saves the user from answering the same gate twice.
- **Never call a `merge_review` item stuck.** It is the handoff working. Give the link and move on.
- **State the MR evidence when a run claims lost work.** If `mr_check` is `none`, write it plainly — "no MR exists; the branch was never pushed" — because that is what separates lost work from work that is waiting on a reviewer. If `mr_check` is `unknown` or `no_repo_mapping`, say the MR state is unverified rather than implying there is none.
- **Collapse `never_picked_up` to one line** with the keys and their ticket age (`ticket_age_days`, measured from creation) — a dozen rows of backlog drowns the two rows that matter. Say whether they carry `stokowski_label`, because it splits the fix in two: missing label, or a label that landed without a pickup.
- **Other `idle` kinds get one line each**, not a table: `mr_merged_ticket_open` (work landed, ticket still open — close it), `gate_without_plan` (gate open, plan not on the ticket yet — nothing to approve), `stalled_running` (quiet past `--stall-hours` with nothing waiting on you), `finished_not_closed` (the run completed but nobody opened the MR or closed the ticket). They are interesting only when the user can act, so name the action in the same line.
- **Flag `stale` rows with ⚠** and mention how long in the heading when every row is stale.
- **Omit empty sections.** If every bucket is empty, the whole report is one line: `Nothing stuck in the testing uplift (<n> tickets).`
- **Report `warnings` verbatim-ish** when non-empty: they name rows whose MR state could not be checked, which the reader must not mistake for "no MR".

## Options vocabulary

Fallback phrasing for the `Your options` cell when the run's own summary is thin. Each is a suggestion the user may take; the only one this skill performs itself is re-dispatching a `failed` run.

| `kind` | What the user can do |
|---|---|
| `merge_review` | Review and merge the MR. |
| `mr_merged_ticket_open` | The MR merged but the ticket is still open. Verify the work is on master, then close the ticket (and any child items) rather than re-dispatching. |
| `mr_closed_unmerged` | The MR was closed without merging, so the work never landed. Re-dispatch, or close the ticket if the work is obsolete. |
| `merge_review_without_mr` | The run believes it handed off a merge review, but no branch or MR exists. Treat as lost work: re-dispatch or recover the branch. |
| `gate_without_plan` | The audit gate is open but the plan comment never reached the ticket. Nothing to approve yet: wait for the comment, or open the dashboard if it stays missing. |
| `blocked_gate` | Answer the gate: add `approved` or leave a comment plus `needs-rework` (or `@stokowski approved` / `@stokowski needs-rework: <what to change>`). |
| `escalated` | Decide the item. If there is nothing to approve, re-dispatch with corrected input. |
| `failed` | Re-dispatched automatically. A row still here was not: past the cap means the same failure keeps coming back, so read the cause on the dashboard and fix the input before dispatching again; `error` means `stok run` refused, so quote `why`. |
| `cancelled`, `closed_without_success` | Re-dispatch, or close the ticket if the work is obsolete. |
| `never_picked_up` | No work item exists at all. Missing `stokowski-ericrulez` (`workflow:gitlab-first` on DEX) means the label never landed — add it. Already present (`stokowski_label: true`) means the label landed without a pickup: remove and re-add it, or `stok dispatch` the work directly. |
| `finished_not_closed` | The run finished but nobody opened the MR or closed the ticket. |
| `stalled_running` | Open the dashboard; cancel and re-dispatch if the turn is hung. |

## Gotchas

- **"In Review" on the board is a gate status, not an MR.** Stokowski moves a ticket to `In Review` when it parks on any review gate — including a blocked item whose branch was never pushed. ERICRULEZ-347 sat `In Review` for three days with no MR, no branch, and five approved commits lost. Read `mr_check`, not the Jira status.
- **An MR that mentions a ticket key is not that ticket's MR.** On 2026-10-30 a prompt-fix MR in `stokowski-configs` mentioned ERICRULEZ-347 in its description while that ticket's coverage run was still blocked; GitLab's search returns it for the key and it was merged. The script therefore links only through a run's `merge_request` artifact or a branch whose name contains the key — a structural link, never a text match. Don't "improve" it back to a search.
- **A `merge-review` stage does not prove an MR is open.** The stage string is the run's own claim. ERICRULEZ-228's MR was closed unmerged on 2026-10-10 and the stage still said merge review. That is why every merge-review row is now verified against GitLab before it is called the good stuck.
- **A running item's clock starts at the newest event, not the last finished turn.** `latest_result.completed_at` only moves when a turn completes, so a rework that started minutes ago inherits the old turn's timestamp. On 2026-11-02 three fresh reworks were reported 62.9 hours quiet — abandoned — while they were actively running. The script asks the event log before calling a live turn dead.
- **An open gate does not mean the comment is on the ticket.** The engine opens the gate and the stage's Jira comment lands separately, lagging by minutes and on 2026-11-02 by up to 2.5 hours: ERICRULEZ-318's gate opened 13:12:57Z and its plan comment arrived 14:06:16Z, while ERICRULEZ-327/328 had no plan comment at all. Reporting those as "plan awaiting approval" told the reader to approve a plan that did not exist. The script now looks for the plan comment (`Next Action Needed`, `Ticket Plan`, or `the plan below`) newer than the gate before counting the row as a review.
- **Jira search can omit tickets the issue API still returns.** ERICRULEZ-228/229/230 were all missing from `labels in (...)` JQL while `workitem get` read them fine. That is why the script resolves every ticket through `twg jira workitem get` (issue API) and uses JQL only to discover labeled tickets with no work item. Do not "simplify" this back to a single JQL.
- **`stok list --all-projects` silently truncates at `--limit`**, dropping whole projects (500 rows returned 12 of 92 ericrulez items). One `stok list -p <project>` per board is the only complete read.
- **`--all` is not optional.** A work item can be closed while its ticket is still open; without `--all` that case vanishes instead of showing up as `closed_without_success`.
- **DEX returning zero rows is normal** — VADP tickets carry `workflow:gitlab-first`, not these uplift labels. It is not a broken query.
- **Re-dispatch is `stok run`, not `stok dispatch`.** `dispatch` creates a new work item and orphans the ticket's progress comment and branch; `run -w <workflow>` on the existing item starts a new primary run in place. Verified on ERICRULEZ-343 on 2026-11-03: the failed run stayed in the run list and the new one started at `coverage-execute-implement`. The idempotency key is built from the failed attempt id, so two scans of the same failure send one request.
- **The AI review runs once per MR.** A push after the review usually means a rework already took its findings (often via an `@stokowski-native fix the following` comment), so the script marks that review `stale` and does not count its findings as outstanding. GitLab's `discussions_not_resolved` status, not the AI note, is what blocks a merge.
- If `scope.truncated` reports anything true, say so in the report; the check is incomplete by definition at that point.
