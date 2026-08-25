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
3. **Report — headline first, then every MR with a link.** The very first line of your response must state the overall result, since that's what a push notification preview shows:
   - No failures anywhere: `✅ All N open MRs green`
   - One or more failures: `❌ N MR(s) have failing pipelines`

   Then list **every** MR checked in step 1 — passing and failing alike, not just failures — one line each: status icon (✅/❌), title, project path (`references.full`), and `web_url`. For a failing MR, also name the failed job(s) from step 2. A link on every line means you can jump straight to any MR from the report, not just the ones that are red.

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
4. Branch, using this exact prompt in both cases — **not** `"Run the gitlab-ci-watch skill and report results."`:

   > Re-read `.agents/skills/gitlab-ci-watch/SKILL.md` fresh from disk right now — don't rely on how you ran it earlier in this conversation, the file may have changed since. Then follow it exactly and report.

   - **Found, not archived** → `session.send` that prompt to the stored `sessionId` — the report lands in the existing thread.
   - **Not found, or `time.archived` is set, or no state file yet** → `session.create` (same directory, same prompt), capture the returned `sessionId`, and overwrite the state file with it.

   **Why the exact wording matters:** a persistent thread that's already run this skill once tends to replay its own remembered procedure on later turns instead of re-invoking the `skill` tool — verified directly: after editing this file's report format, a reused thread kept producing the *old* format until told explicitly to re-read the file, while a brand-new session (no prior memory) picked up the change automatically. Every routed-mode dispatch has to force the re-read, or skill edits silently stop reaching whatever thread is currently active.
5. **Clean up the previous tick's router session.** `openchamber` has no archive action, but the underlying OpenCode server does, over its own REST API — undocumented for agent use, verified working directly, but not an officially supported surface (could break on an OpenChamber update):

   - Discover the port fresh every time, don't hardcode it — it isn't a fixed default. Use a self-filtering grep pattern (`[o]pencode`) so the discovery command doesn't match its own `ps aux` row, and extract the `--port` value robustly: `ps aux | grep '[o]pencode serve' | grep -oE -- '--port[= ]+[0-9]+' | grep -oE '[0-9]+' | head -1`
   - Auth is HTTP Basic: username `opencode`, password `$OPENCODE_SERVER_PASSWORD` (already in the environment).
   - Archive: `curl -X PATCH -u "opencode:$OPENCODE_SERVER_PASSWORD" -H "Content-Type: application/json" -d '{"time":{"archived": <current-epoch-ms>}}' "http://127.0.0.1:<port>/session/<id>"`.

   Use `session.list(all=true)` (the normal tool, not curl) to find candidates: title matching this scheduled task's own auto-generated pattern (`GitLab CI Watch <date> <time>`), status `idle`, no `archived` timestamp yet. The persistent thread is safe from this filter — its title is `gitlab-ci-watch report`, a different pattern entirely.

   This **won't catch the current run's own session** — it's still `busy` while this step runs, so it can't match its own `idle` filter. That's fine: each run archives the *previous* tick's now-finished router session, so at most one stays visible at a time instead of accumulating forever.
6. Done — don't wait for the target session's reply; it runs and notifies independently.

**Known tradeoff:** the outer cron-triggered session (which runs this routing procedure) still gets created every tick — that part of OpenChamber's model can't be avoided, and step 5 only bounds the visible pile-up to one, it doesn't eliminate the session-per-tick cost. Each run still produces two "session finished" events: one near-instant from the router, one shortly after from the actual report.
