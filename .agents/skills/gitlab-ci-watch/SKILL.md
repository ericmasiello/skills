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
