---
name: ci-fix-dispatch
description: Dispatch a fix for a failing MR/PR's CI pipeline into a fresh OpenChamber session, scoped to the right local repo and branch — instead of writing a handoff doc for manual copy/paste. Use when a CI-failure report (e.g. from gitlab-ci-watch) names a failing MR/PR in a project other than the current one, or when the user says "dispatch a fix for MR/PR X", "send this CI failure to its own worktree", or "spin up a session to fix this failing pipeline".
argument-hint: "platform (gitlab/github), project slug or repo, MR/PR number, and whatever failure details are already known (title, URL, failed check names/links)"
disable-model-invocation: true
---

# CI Fix Dispatch

Turn a CI-failure report into a live session rooted in the right repo and branch, via OpenChamber's own `session.create`/`session.send` — not a `/handoff` doc for manual copy-paste.

## Why this shape

A CI-failure report (from `gitlab-ci-watch` or elsewhere) names a project by its remote slug (`group/project`), not a filesystem path — OpenChamber's `session.create` needs a `directory` or `projectId`, and has no way to derive one from a GitLab/GitHub slug on its own. That mapping has to be built and cached locally, once, from repos already registered as OpenChamber projects.

Once the repo is resolved, don't lean on `session.create`'s `worktree`/`branch`/`startRef` params to check out the MR/PR's own branch — those params look built for branching *from* a ref, and the failing branch already exists upstream, so asking them to also attach to an existing branch risks a create-vs-attach collision this skill can't verify from the tool schema alone. Simpler and platform-correct either way: hand `session.create` a plain worktree, then make the dispatched session's *own first action* `glab mr checkout`/`gh pr checkout` — a command that already knows how to fetch and switch correctly, on either platform.

## Inputs

Gather before dispatching (from the failure report, or ask if missing):

- **Platform**: `gitlab` or `github`.
- **Project slug**: `group/project` (GitLab) or `owner/repo` (GitHub).
- **MR/PR number**.
- **Title, URL, source branch** — fetch if not already known: `glab mr view <iid> --repo <slug> -F json` (field `source_branch`) or `gh pr view <number> --repo <slug> --json headRefName,title,url`.
- **Failed check(s)**: name + log URL for each.

## 1. Resolve the local repo

`mkdir -p ~/.cache/ci-fix-dispatch` (idempotent — run this before the first read/write below).

State file: `~/.cache/ci-fix-dispatch/repo-map.json` — `{ "<slug>": { "directory": "...", "projectId": "..." } }`.

If the slug isn't in the map yet (first run, or a project registered since the map was last built), refresh it: call `openchamber projects.list`, and for each entry not already mapped, read its remote and derive the slug:

```bash
remote_url=$(git -C "<dir>" remote get-url origin 2>/dev/null) || continue
slug=$(echo "$remote_url" | sed -E 's#^git@([^:]+):#\1/#; s#^https?://##; s#\.git$##' | cut -d/ -f2-)
```

This strips the host, matching `gitlab-ci-watch`'s single-host assumption — see that skill for what to do if MRs/PRs get authored on more than one host.

Write the refreshed map back. **Miss after refresh** → there's no known local checkout for this project. Don't auto-clone one — a fresh clone has no visibility into the repo's install/build tooling or auth setup. Report that back and stop; the failure still got reported, it just isn't dispatchable yet.

## 2. Check for an existing fix session

State file: `~/.cache/ci-fix-dispatch/sessions.json` — `{ "<slug>#<number>": "<sessionId>" }`.

If an entry exists for this MR/PR, verify it's still live the same way `gitlab-ci-watch`'s routed mode does: `session.list(all=true)`, find that ID, check `time.archived` is unset. **Don't** use `session.status` for this — it reports `idle` even for a nonexistent session, so it can't distinguish a real live session from a dead one.

- **Live** → `session.send` an update into that session (new failed check, or "still red after N minutes") and skip to step 4.
- **Missing or archived** → continue to step 3.

## 3. Create the session

Derive the two values `session.create` needs beyond what step 1 already resolved — no extra API call, both come from the same local checkout:

```bash
default_branch=$(git -C "<resolved directory>" symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@')
slug_safe="${slug//\//-}"
```

```
openchamber session.create({
  directory: <resolved directory>,
  worktree: "ci-fix-${slug_safe}-<number>",
  startRef: "origin/${default_branch}",
  prompt: <see template below>
})
```

Capture the returned `sessionId` and write it into `sessions.json` under `<slug>#<number>`.

### Prompt template

```
CI failure dispatched for {title}
{web_url}

Branch: {source_branch}
Failed check(s):
- {job_name}: {job_url}
[repeat per failed check]

1. Land on the failing branch in this worktree:
   glab mr checkout {number} --repo {slug}      # GitLab
   gh pr checkout {number} --repo {slug}         # GitHub
2. Read this repo's own AGENTS.md/README for install and test commands; install deps.
3. Reproduce the failing check locally. Load the `diagnosing-bugs` skill and find the
   root cause before changing anything.
4. Apply the minimal fix. Re-run the failing check locally until it's green.
5. Commit locally. Leave the diff for human review — push is a separate, deliberate
   step once it's been looked at. Report back: what failed, why, what changed, and
   the local commit SHA.
```

## 4. Confirm

Report the session ID, worktree path, and MR/PR link back to whoever triggered this dispatch. Don't wait for the dispatched session's reply — it runs and notifies independently.

## Not in scope

- No auto-push, no MR/PR comment, no thread resolution — once the fix lands as a local commit, `address-pr-feedback` or `studio-ship-work` (Studio-specific) close that loop.
- No auto-clone for an unregistered project — see step 1's fallback.
- No re-detection of failures — this skill consumes a failure report; `gitlab-ci-watch` (or an equivalent GitHub watcher) produces one.
