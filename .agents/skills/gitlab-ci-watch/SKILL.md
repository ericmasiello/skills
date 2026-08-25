---
name: gitlab-ci-watch
description: Check GitLab CI pipeline status across every open merge request you authored, on any project on your GitLab host, and report failures. Use when the user says "check my pipelines", "check my MRs", "any CI failures", "watch my merge requests", or as the prompt for a recurring/scheduled pipeline check.
---

# GitLab CI Watch

Report which of your open GitLab merge requests have failing CI pipelines — across every project on the host, not just the current checkout. Read-only: reports, never fixes.

## Why this shape

`glab mr list` is project-scoped — it only sees the repo you're standing in. GitLab's instance-wide endpoint sees everything you authored in one call, so this skill needs no working directory and no per-project loop to discover MRs:

```bash
glab api "merge_requests?scope=created_by_me&state=opened"
```

Each result carries `references.full` (e.g. `"group/project!42"`) and `iid` — enough to check that MR's pipeline without cloning or `cd`-ing anywhere, via `--repo`:

```bash
glab ci get --repo <group/project> --merge-request=<iid> --status=failed --with-job-details -F json
```

**Single-host assumption:** both calls run against whichever host `glab auth status` is currently pointed at. If you author MRs on more than one GitLab host, repeat both steps once per host with `--hostname <host>`.

**Recency filter:** without it, this reports every currently-red pipeline forever — including MRs abandoned years ago that never got their failing CI fixed. Verified against a real account: 4 of 6 open MRs were untouched since 2023 and permanently "failing"; only `updated_after` filtering separated stale noise from an actually-active MR. Always scope discovery to recent activity (default: 7 days) unless the user asks otherwise.

## Steps

1. **Discover.** Compute a cutoff timestamp 7 days back in ISO 8601 UTC (`date -u -v-7d +%Y-%m-%dT%H:%M:%SZ` on macOS, or `date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ` on Linux), then run:

   ```bash
   glab api "merge_requests?scope=created_by_me&state=opened&updated_after=<cutoff>"
   ```

   Parse each result for `iid`, `references.full` (split on `!` for the project path), `title`, `updated_at`, and `web_url`.
2. **Check each MR's pipeline.** For every MR, run the `glab ci get --repo ... --merge-request=...` call above. A `null` (not `[]`) `jobs` field means no jobs matched the `--status=failed` filter — i.e. no failures. A populated `jobs` array means those specific jobs failed; each entry has a `name` and `web_url`. No need to also check `status` for running/pending pipelines — this skill only cares about failures.

   Some MRs have no pipeline at all (e.g. an old MR never re-run under current CI config) — the command exits non-zero with `No pipeline found for merge request !<iid>`. Treat this as "nothing to report" for that MR, not an error: log it and move on, don't abort the whole check over one MR.
3. **Report — headline first.** The very first line of your response must state the overall result, since that's what a push notification preview shows:
   - No failures anywhere: `✅ All N open MRs green`
   - One or more failures: `❌ N MR(s) have failing pipelines`, then one line per failing MR: title, project path, failed job name(s), and `web_url`.

Don't include MRs with no failed jobs in the failure list — keep the report to signal, not a full status dump.

## Not in scope

- No auto-fix, no comment posting, no retry — this skill only reports.
- No polling loop inside a single run — it checks current state once and returns. Recurrence is the caller's job (e.g. an OpenChamber scheduled task invoking this skill on a cron).

## Running as a persistent thread (routed mode)

OpenChamber's scheduler always starts a brand-new session per run — there's no native setting to reuse one. Use this procedure when the scheduled task's prompt says to **"route the check into the persistent thread"** (instead of "run the gitlab-ci-watch skill" directly): it keeps every run's report in one scrollable conversation, starting a fresh one only when that thread has been archived.

**State file:** `~/.cache/gitlab-ci-watch/session.json` — `{"sessionId": "ses_..."}`. Not part of this repo; runtime bookkeeping only.

1. `mkdir -p ~/.cache/gitlab-ci-watch` (idempotent).
2. If the state file exists, read `sessionId` from it.
3. Call the `openchamber` tool, `session.list` with `all: true`, scoped to this directory. Search the returned array for that `sessionId`.

   **Don't use `session.status` for this check** — it returns `idle` even for a nonexistent session ID, so it can't distinguish a real active session from a fake or deleted one. `session.list` is the only reliable source: a real, non-archived session has a `time` object with no `archived` key; an archived one has `time.archived` set.
4. Branch:
   - **Found, not archived** → `session.send` with that `sessionId` and prompt `"Run the gitlab-ci-watch skill and report results."` — the report lands in the existing thread.
   - **Not found, or `time.archived` is set, or no state file yet** → `session.create` (same directory, same prompt), capture the returned `sessionId`, and overwrite the state file with it.
5. Done — don't wait for the target session's reply; it runs and notifies independently.

**Known tradeoff:** the outer cron-triggered session (which runs this routing procedure) still gets created every tick — that part of OpenChamber's model can't be avoided. It finishes almost immediately after step 4, so each run produces two "session finished" events: one near-instant from the router, one shortly after from the actual report. If that double-notification is worse than the clutter it replaces, this mode isn't worth it — fall back to direct mode.
