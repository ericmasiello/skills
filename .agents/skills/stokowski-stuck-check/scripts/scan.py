#!/usr/bin/env python3
"""Stokowski stuck-check driver.

Answers one question: across the testing-uplift work Stokowski is doing, which
work items are waiting on a human, and why?

Encapsulates the deterministic part -- scope, join, classify, age, MR link
resolution -- so every scheduled run classifies identically. The invoking agent
writes the prose report from this JSON; it never re-derives the join by hand.

Usage:
  python3 scan.py [--idle-days 3] [--stall-hours 6] [--review-wait-hours 24]
                  [--board ERICRULEZ] [--redispatch-failed] [--max-redispatches 2]

Read-only by default. The one write is opt-in: `--redispatch-failed` starts a
fresh run of the same workflow on each work item whose run failed, which is
what the dashboard's re-dispatch does. No Jira or GitLab writes, ever.

Why the join is work-item-first: a work item carries `origin.reference
.display_key` back to its Jira ticket, so `stok list` alone names every ticket
Stokowski has ever touched. JQL discovery is added on top for the opposite
case -- a ticket carrying the label that Stokowski has never picked up -- but
it cannot be the primary source: Jira's search index can omit a ticket the
issue API still returns, which would silently drop exactly the stuck work this
check exists to find. Every ticket read goes through `twg jira workitem get`,
which hits the issue API.

Archived tickets are the one case where search omission is the answer rather
than a gap: an archived issue is dropped from JQL entirely and comes back from
the issue API looking like any other ticket. `fetch_archived_ticket_keys`
therefore probes exact keys and confirms each miss with the transition list,
because reporting an archived ticket as idle work (ERICRULEZ-230, 25 days old)
sends the reader to close a ticket nobody can open.
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

# Scope: the `workflow:*` labels `stokowski-implement` applies for the testing
# uplift, plus the workflow ids those labels map to. The ids also catch a work
# item whose ticket has since lost or never carried the label.
LABELS = (
    "workflow:coverage-execute",
    "workflow:coverage-audit",
    "workflow:install-mutation-testing",
)
WORKFLOW_IDS = {
    "coverage-execute",
    "coverage-execute-agents",
    "coverage-audit",
    "install-mutation-testing",
}

# Jira project -> Stokowski project id. Re-derivable from
# stokowski-configs/workflows/<team>/workflow.yaml: `tracker.project_slug` is
# the Jira key and `docker.stokowski_instance_id` yields the `jira-<id>` project.
STOK_PROJECTS = {
    "ERICRULEZ": "jira-ericrulez",
    "DEX": "jira-vadp",
}

DASHBOARD = "https://stokowski-dashboard.prod.cobalt.vpsvc.com/task/native/{project}/{item}"

MR_URL_RE = re.compile(r"https://gitlab\.com/[^\s\)\]\"'<>]+/-/merge_requests/\d+")

# Jira `repo:<name>` label -> GitLab project path, so a ticket's MRs can be
# found from the branch Stokowski pushes. Branch names are normalized by the
# dispatcher (`utils-browser` becomes `utilsbrowser`), so the reliable search is
# "branch name contains the ticket key", never a guessed branch name.
REPO_PATHS = {
    "studio": "vistaprint-org/design-technology/studio/studio",
    "stokowski-configs": (
        "vistaprint-org/vista-engineering/engineering-productivity/ci-cd/"
        "remote-agents/stokowski-configs"
    ),
}

# Stages that never produce a merge request: the audit only reads code and
# drafts a ticket plan. Skipping the MR lookup for them keeps the scan fast and
# avoids claiming "no MR" about work that was never supposed to have one.
NO_MR_STAGE_MARKERS = ("coverage-audit", "plan-review")

# Stages where the human cannot act until a plan is published as a Jira
# comment. The gate opens first and the comment lands later -- usually minutes,
# observed up to 2.5 hours -- so a gate alone does not mean there is anything to
# approve.
PLAN_STAGE_MARKERS = ("coverage-audit-review", "plan-review")

# Strings that only the plan comment carries, matched case-insensitively.
# Deliberately heading-level, not the bare phrase "ticket plan": the analysis
# comment says "explored separately from the ticket plan", which matched a loose
# marker and reported ERICRULEZ-327 as having a plan it never received.
# Both prompt generations are covered -- "Next Action Needed" and "the plan
# below and ..." (Nov 2026), "Coverage Backlog Ticket Plan" (Oct 2026).
PLAN_MARKERS = ("next action needed", "coverage backlog ticket plan", "the plan below and")

# Jira comment delivery trails the gate by tens of minutes, so a comment may
# legitimately sit a little before the gate timestamp inside one turn. Anything
# older than this belonged to a previous round and must not satisfy a new gate.
PLAN_GRACE = timedelta(minutes=2)

# A gate waiting at this stage is the merge review: Stokowski is finished and
# only a human code review stands between the branch and master. That is the
# good kind of stuck.
MERGE_REVIEW_STAGE = "merge-review"

# Markers that point at the human-actionable part of a turn summary.
BLOCKER_MARKERS = (
    "## blocker",
    "## blockers",
    "**what a human",
    "what a human must do",
    "why escalate",
    "what's blocked",
    "what is blocked",
    "## action needed",
    "what a human should",
    "execution stopped",
    "unable to",
    "could not",
)

# Event types that explain a stop. `gate.waiting` marks the moment a gate
# opened, which is what age is measured from on a waiting item.
REPORTABLE_EVENTS = (
    "turn.failed",
    "run.failed",
    "turn.escalated",
    "run.escalated",
    "run.cancelled",
    "gate.waiting",
)


# The AI reviewer posts one summary note per review, tagged with this marker.
# Its verdict heading is either "✅ AI Review: Approved" or "⚠️ AI Review:
# Changes Requested"; findings sit under "🚨 Must Fix" and "💡 Suggestions".
AI_REVIEW_MARKER = "<!-- ai-code-review -->"

# GitLab `detailed_merge_status` values that mean the branch must be rebased
# or have conflicts resolved before anything else can happen.
REBASE_STATUSES = {"need_rebase", "conflict"}

PIPELINE_BAD = {"failed", "canceled"}

# Commit statuses whose name starts with this are visual-snapshot reviews: a
# person approves them in Percy, and no code change in a rework clears them.
VISUAL_REVIEW_PREFIX = "percy"

# Automation that comments on MRs. Its notes are not reviewer feedback.
BOT_AUTHOR_PREFIXES = ("project_", "sa-", "group_")

# Mentioning the Stokowski GitLab bot on an MR opens a conversation that, when
# the comment asks for changes, sends the merge review back for rework.
REWORK_MENTION = "@stokowski-native"

# How Stokowski's GitLab bot opens its reply when it could not run a step.
REWORK_FAILED_PREFIX = "**I couldn't finish this step.**"

# The literal line request_rework.py writes when a pipeline fails with no
# specific job to blame (e.g. the pipeline never ran because of a merge
# conflict). Matching it lets a past rework comment fingerprint this case too,
# the same way it fingerprints named jobs.
GENERIC_PIPELINE_PHRASE = "find the failing job, fix the cause, and push"

# The system note GitLab posts when an MR comes off draft. Its one marker for
# when a reviewer was actually asked to look, so a 24h-old draft removal counts
# as waiting even though the MR itself may be older.
READY_FOR_REVIEW_PHRASE = "marked this merge request as ready"


class CommandError(RuntimeError):
    pass


def sh(args: list[str]) -> str:
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        raise CommandError(
            f"{' '.join(args[:3])} failed (exit {proc.returncode}): "
            f"{(proc.stderr or proc.stdout).strip()[:500]}"
        )
    return proc.stdout


def parse_json(text: str, label: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise CommandError(f"{label} returned non-JSON: {text.strip()[:300]}") from exc


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    cleaned = value.replace("Z", "+00:00")
    if re.search(r"[+-]\d{4}$", cleaned):
        cleaned = cleaned[:-5] + cleaned[-5:-2] + ":" + cleaned[-2:]
    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def days_between(later: datetime, earlier: datetime | None) -> float | None:
    if earlier is None:
        return None
    return round((later - earlier).total_seconds() / 86400, 2)


def fetch_labeled_ticket_keys(boards: list[str]) -> tuple[list[str], bool]:
    """Tickets carrying a scope label. May miss recently-touched issues (index lag)."""
    jql = (
        f"project in ({', '.join(boards)}) "
        f"AND labels in ({', '.join(LABELS)}) "
        "AND statusCategory != Done ORDER BY updated DESC"
    )
    raw = parse_json(
        sh(
            [
                "twg",
                "-o",
                "json",
                "--output-summary",
                "none",
                "jira",
                "workitem",
                "query",
                "--jql",
                jql,
                "--fields",
                "key",
                "--first",
                "200",
            ]
        ),
        "jira workitem query",
    )
    issues = raw.get("data", {}).get("issues", [])
    return [issue["key"] for issue in issues], len(issues) >= 200


def fetch_work_items(stok_project: str) -> tuple[list[dict[str, Any]], bool]:
    raw = parse_json(
        sh(["stok", "list", "-p", stok_project, "--all", "--limit", "500", "--json"]),
        f"stok list {stok_project}",
    )
    if not raw.get("ok"):
        raise CommandError(f"stok list {stok_project}: {raw.get('error')}")
    items = raw["data"].get("items", [])
    return items, len(items) >= 500


def hydrate_tickets(
    keys: list[str], errors: list[str], chunk: int = 40
) -> dict[str, dict[str, Any]]:
    """Read tickets from the issue API in batches, never from the search index."""
    tickets: dict[str, dict[str, Any]] = {}
    for start in range(0, len(keys), chunk):
        batch = keys[start : start + chunk]
        raw = parse_json(
            sh(
                [
                    "twg",
                    "-o",
                    "json",
                    "--output-summary",
                    "none",
                    "jira",
                    "workitem",
                    "get",
                    *batch,
                    "--fields",
                    "key,summary,status,statusCategory,labels,created,updated,url",
                    "--batch-concurrency",
                    "10",
                ]
            ),
            "jira workitem get",
        )
        for entry in raw.get("data", {}).get("items", []):
            if not entry.get("ok"):
                # One unreadable ticket must not sink the whole scan: record it,
                # skip it, and let the non-empty `errors` array flag the gap.
                errors.append(
                    f"jira workitem get {entry.get('input')}: {str(entry.get('error'))[:200]}"
                )
                continue
            data = entry["data"]
            tickets[data["key"]] = {
                "key": data["key"],
                "summary": data.get("summary") or "",
                "status": ((data.get("status") or {}).get("name")) or "unknown",
                "status_category": (
                    ((data.get("status") or {}).get("statusCategory") or {}).get("key")
                    or (data.get("statusCategory") or {}).get("key")
                    or ""
                ),
                "labels": data.get("labels") or [],
                "created": data.get("created"),
                "updated": data.get("updated"),
                "url": data.get("url"),
            }
    missing = [key for key in keys if key not in tickets]
    if missing:
        errors.append(f"jira workitem get returned no data for: {', '.join(missing)}")
    return tickets


ARCHIVE_PROBE_CHUNK = 50


def searchable_ticket_keys(keys: list[str], chunk: int = ARCHIVE_PROBE_CHUNK) -> set[str]:
    """Keys an exact-key JQL query can see.

    An archived issue is absent from Jira search entirely -- even `key = PROJ-1`
    returns nothing for one -- while the issue API still serves it looking
    exactly like a live ticket: same status, same fields, no archive flag on the
    payload. Probing by key is therefore the only way to tell the two apart.
    It is cheap: 139 keys cost three queries.
    """
    found: set[str] = set()
    for start in range(0, len(keys), chunk):
        batch = keys[start : start + chunk]
        raw = parse_json(
            sh(
                [
                    "twg",
                    "-o",
                    "json",
                    "--output-summary",
                    "none",
                    "jira",
                    "workitem",
                    "query",
                    "--jql",
                    f"key in ({', '.join(batch)})",
                    "--fields",
                    "key",
                    "--first",
                    str(len(batch)),
                ]
            ),
            "jira workitem query (archive probe)",
        )
        for issue in (raw.get("data") or {}).get("issues") or []:
            key = issue.get("key")
            if key:
                found.add(key)
    return found


def ticket_is_archived(key: str) -> bool:
    """An archived issue is read-only, so Jira offers it no transitions."""
    raw = parse_json(
        sh(
            [
                "twg",
                "-o",
                "json",
                "--output-summary",
                "none",
                "jira",
                "workitem",
                "transitions",
                "query",
                "--id",
                key,
            ]
        ),
        f"jira workitem transitions {key}",
    )
    return not ((raw.get("data") or {}).get("transitions") or [])


def fetch_archived_ticket_keys(
    tickets: dict[str, dict[str, Any]], warnings: list[str]
) -> set[str]:
    """Tickets archived in Jira: out of scope, never reported, never re-dispatched.

    Two signals are required, because either alone lies. Jira search misses a
    recently created ticket for a few minutes (index lag, the reason every
    ticket read goes through the issue API), and a live ticket can offer no
    transitions if this account may not move it. Archived means *both* "search
    cannot see it" and "Jira offers it no transitions".
    """
    keys = sorted(tickets)
    if not keys:
        return set()
    try:
        searchable = searchable_ticket_keys(keys)
    except (CommandError, OSError) as exc:
        warnings.append(
            f"archive check skipped ({str(exc)[:120]}); archived tickets may be reported"
        )
        return set()

    archived: set[str] = set()
    for key in keys:
        if key in searchable:
            continue
        try:
            if ticket_is_archived(key):
                archived.add(key)
            else:
                # Newer than the search index, not archived. Keep it: dropping a
                # fresh ticket is exactly the failure this check must not cause.
                warnings.append(
                    f"{key}: absent from Jira search but still transitionable; kept"
                )
        except (CommandError, OSError) as exc:
            warnings.append(
                f"{key}: archive state unverified ({str(exc)[:100]}); reported as usual"
            )
    return archived


def ticket_key_of(item: dict[str, Any]) -> str | None:
    ref = (item.get("origin") or {}).get("reference") or {}
    return ref.get("display_key")


def last_activity(item: dict[str, Any]) -> datetime | None:
    return (
        parse_ts((item.get("latest_result") or {}).get("completed_at"))
        or parse_ts((item.get("primary_run") or {}).get("created_at"))
        or parse_ts(item.get("created_at"))
    )


def excerpt(summary: str, limit: int = 1400) -> str:
    """Pull the human-actionable part of a turn summary.

    Stokowski writes long narratives; the blocker sits under a heading or, when
    there is no heading, at the end where the conclusion is.
    """
    if not summary:
        return ""
    text = summary.strip()
    lowered = text.lower()
    hits = [lowered.find(marker) for marker in BLOCKER_MARKERS]
    hits = [hit for hit in hits if hit >= 0]
    if hits:
        start = min(hits)
        line_start = text.rfind("\n", 0, start)
        start = line_start + 1 if line_start >= 0 else start
        piece = text[start : start + limit]
    else:
        piece = text[-limit:]
    return piece.strip()


def resolve_mr_url(
    item: dict[str, Any], summaries: list[str]
) -> tuple[str | None, str | None]:
    """Return (url, bare_ref).

    Prefers the URL the run itself printed. Falls back to the MR artifact,
    which carries only `!<iid>` plus GitLab's numeric project id, so the project
    path has to be resolved before a URL can be built.
    """
    for text in summaries:
        found = MR_URL_RE.findall(text or "")
        if found:
            return found[-1], None

    for artifact in item.get("artifacts") or []:
        if artifact.get("entity_type") != "merge_request":
            continue
        iid = artifact.get("entity_id")
        if not iid:
            continue
        bare = f"!{iid}"
        project_id = artifact.get("external_project_id")
        if project_id:
            try:
                path = sh(
                    ["glab", "api", f"projects/{project_id}", "--jq", ".path_with_namespace"]
                ).strip()
            except (CommandError, OSError):
                path = ""
            if path:
                return f"https://gitlab.com/{path}/-/merge_requests/{iid}", bare
        return None, bare
    return None, None


def gitlab_json(path: str) -> Any:
    """GET a GitLab API path. Tolerates banner lines before the JSON body."""
    out = sh(["glab", "api", path])
    starts = [index for index in (out.find("["), out.find("{")) if index >= 0]
    if not starts:
        raise CommandError(f"glab api {path} returned no JSON: {out.strip()[:200]}")
    return parse_json(out[min(starts) :], f"glab api {path}")


def pipeline_job_failures(
    encoded_project: str, pipeline_id: int, fallback_url: str | None, depth: int = 0
) -> list[dict[str, Any]]:
    """Name the jobs behind a red pipeline when commit statuses named none.

    A pipeline can read `failed` with every job green when the failure sits in a
    bridge job's downstream child pipeline: on 2026-11-05 !13849 was `failed`
    with 37 of 37 jobs green and no Percy status. The head commit's statuses are
    the cheap, exact read; this is the fallback that still tells the reader which
    job broke, one child pipeline deep. `depth` is capped so a self-referencing
    chain cannot loop.
    """
    try:
        jobs = gitlab_json(f"projects/{encoded_project}/pipelines/{pipeline_id}/jobs?per_page=100")
    except (CommandError, OSError):
        jobs = []
    found = [
        {
            "name": job.get("name"),
            "stage": job.get("stage"),
            "url": job.get("web_url") or fallback_url,
        }
        for job in jobs or []
        if job.get("status") in PIPELINE_BAD and not job.get("allow_failure")
    ]
    if found or depth >= 1:
        return found
    try:
        bridges = gitlab_json(
            f"projects/{encoded_project}/pipelines/{pipeline_id}/bridges?per_page=100"
        )
    except (CommandError, OSError):
        bridges = []
    for bridge in bridges or []:
        downstream = (bridge.get("downstream_pipeline") or {}).get("id")
        if bridge.get("status") in PIPELINE_BAD and downstream:
            found.extend(pipeline_job_failures(encoded_project, downstream, fallback_url, depth + 1))
    return found


def mr_record(mr: dict[str, Any], source: str) -> dict[str, Any]:
    web_url = mr.get("web_url") or ""
    return {
        "iid": mr.get("iid"),
        "project_path": web_url.split("gitlab.com/", 1)[-1].split("/-/", 1)[0] or None,
        "state": mr.get("state"),
        "draft": bool(mr.get("draft") or mr.get("work_in_progress")),
        "merged_at": mr.get("merged_at"),
        "closed_at": mr.get("closed_at"),
        "url": mr.get("web_url"),
        "source_branch": mr.get("source_branch"),
        "title": mr.get("title"),
        "source": source,
    }


def find_ticket_mrs(
    ticket: dict[str, Any], item: dict[str, Any] | None
) -> tuple[list[dict[str, Any]], str]:
    """Resolve the merge requests that actually carry this ticket's work.

    Returns (mrs, check) where check is `found`, `none`, `unknown`,
    `not_applicable`, `no_repo_mapping`, or `disabled`.

    Only two sources count as a link, and both are structural:
    - a `merge_request` artifact the run recorded (project id + iid), and
    - a branch in the ticket's repo whose name contains the ticket key.

    A free-text mention of the key in some other MR is NOT a match. On
    2026-10-30 a prompt-fix MR in `stokowski-configs` mentioned ERICRULEZ-347
    while that ticket's coverage run was still blocked; treating mention as
    link would have reported five lost commits as merged.
    """
    key = ticket["key"]
    found: dict[tuple[Any, Any], dict[str, Any]] = {}
    queried = False
    failed = False

    for artifact in (item or {}).get("artifacts") or []:
        if artifact.get("entity_type") != "merge_request":
            continue
        iid = artifact.get("entity_id")
        project_id = artifact.get("external_project_id")
        if not iid or not project_id:
            continue
        try:
            mr = gitlab_json(f"projects/{project_id}/merge_requests/{iid}")
            queried = True
        except (CommandError, OSError):
            failed = True
            continue
        # `entity_id` arrives as a string while the API returns an integer iid,
        # so normalize before keying or the same MR is recorded twice.
        found[(str(mr.get("iid")), mr.get("source_branch"))] = mr_record(mr, "artifact")

    paths = []
    for label in ticket.get("labels") or []:
        if label.startswith("repo:"):
            path = REPO_PATHS.get(label[len("repo:") :])
            if path:
                paths.append(path)

    for path in paths:
        encoded = quote(path, safe="")
        try:
            branches = gitlab_json(
                f"projects/{encoded}/repository/branches"
                f"?search={quote(key)}&per_page=20"
            )
            queried = True
        except (CommandError, OSError):
            failed = True
            continue
        for branch in branches or []:
            name = branch.get("name") or ""
            if key not in name:
                continue
            try:
                mrs = gitlab_json(
                    f"projects/{encoded}/merge_requests"
                    f"?source_branch={quote(name, safe='')}&per_page=5"
                )
            except (CommandError, OSError):
                failed = True
                continue
            for mr in mrs or []:
                # The same MR arrives once from the run's artifact (keyed by
                # numeric project id) and once from the branch search (keyed by
                # project path), so identity here must not be the project key.
                found[(str(mr.get("iid")), mr.get("source_branch"))] = mr_record(mr, "branch")

    if found:
        return list(found.values()), "found"
    if not paths:
        return [], "no_repo_mapping"
    # `none` is a claim that nothing was pushed. A failed lookup cannot support
    # it, so any failure degrades the answer to `unknown`.
    if failed or not queried:
        return [], "unknown"
    return [], "none"


def mr_check_applies(stage: str) -> bool:
    return not any(marker in stage for marker in NO_MR_STAGE_MARKERS)


def flatten_adf(body: Any) -> str:
    """Flatten an Atlassian document body to plain text."""
    if isinstance(body, str):
        return body
    chunks: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "text":
                chunks.append(node.get("text") or "")
            for child in node.get("content") or []:
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(body)
    return "\n".join(chunks)


def fetch_jira_comments(key: str) -> list[dict[str, Any]]:
    raw = parse_json(
        sh(
            [
                "twg",
                "-o",
                "json",
                "--output-summary",
                "none",
                "jira",
                "workitem",
                "comment",
                "query",
                "--issue-id",
                key,
                "--first",
                "100",
            ]
        ),
        f"jira comment query {key}",
    )
    data = raw.get("data")
    if isinstance(data, dict):
        data = data.get("comments") or data.get("items") or []
    comments = []
    for entry in data or []:
        node = entry.get("node", entry)
        author = node.get("author")
        comments.append(
            {
                "created": node.get("created"),
                "author": author.get("displayName") if isinstance(author, dict) else None,
                "text": flatten_adf(node.get("body")),
            }
        )
    return comments


def plan_status(
    comments: list[dict[str, Any]], gate_opened_at: datetime | None
) -> tuple[str, datetime | None]:
    """Did this gate's plan comment reach Jira?

    Returns (status, newest_plan_comment_at) where status is `posted`,
    `missing`, or `unknown` (the thread could not be read).
    """
    newest: datetime | None = None
    for comment in comments:
        created = parse_ts(comment.get("created"))
        if not created:
            continue
        lowered = (comment.get("text") or "").lower()
        if not any(marker in lowered for marker in PLAN_MARKERS):
            continue
        if newest is None or created > newest:
            newest = created
    if newest is None:
        return "missing", None
    if gate_opened_at and newest < gate_opened_at - PLAN_GRACE:
        # A plan from an earlier round says nothing about this gate.
        return "missing", newest
    return "posted", newest


def is_bot(username: str | None) -> bool:
    name = (username or "").lower()
    return name.startswith(BOT_AUTHOR_PREFIXES) or "bot" in name


def first_line(text: str, limit: int = 160) -> str:
    for line in (text or "").splitlines():
        stripped = line.strip().strip("*").strip()
        if stripped and not stripped.startswith("<!--"):
            return stripped[:limit]
    return ""


def parse_ai_review(body: str) -> dict[str, Any]:
    """Split an AI review note into its verdict and finding titles per section."""
    verdict = "changes_requested" if "changes requested" in body.lower() else "approved"
    findings: dict[str, list[str]] = {"must_fix": [], "suggestions": []}
    # The sections verbatim, heading included, so a rework request can quote
    # the reviewer's own file paths, snippets, and proposed fixes.
    sections_md: dict[str, list[str]] = {"must_fix": [], "suggestions": []}
    section = None
    for line in body.splitlines():
        if line.startswith("## "):
            section = None
            continue
        if line.startswith("### "):
            heading = line.lower()
            section = (
                "must_fix" if "must fix" in heading
                else "suggestions" if "suggestion" in heading
                else None
            )
            if section:
                sections_md[section].append(line)
            continue
        if section:
            sections_md[section].append(line)
        # Each finding opens with a bold conventional-comment label, e.g.
        # "**suggestion: Distribute click tests ...** `info`".
        if section and line.startswith("**") and ":" in line[:40]:
            findings[section].append(line.strip().strip("`").replace("**", "")[:160])
    markdown = {
        f"{name}_md": "\n".join(lines).strip().removesuffix("---").strip()
        for name, lines in sections_md.items()
    }
    return {"verdict": verdict, **findings, **markdown}


def parse_rework_request(body: str) -> dict[str, Any]:
    """Fingerprint what a past `@stokowski-native` comment already asked for.

    Mirrors `request_rework.py`'s `build_comment` in reverse: job names from
    its `[name](.../-/jobs/<id>)` links, the rebase section's marker emoji,
    the generic "no specific job" pipeline phrase, and thread URLs from its
    `([thread](url#note_<id>))` links. Matching on content, not timestamps,
    is what lets a later push -- which only clears `rework_pending` -- be told
    apart from an actual fix: if the same job name fails again, nothing new
    was learned, and asking again would just repeat the last request.
    """
    return {
        "job_names": set(re.findall(r"-\s*\[([^\]]+)\]\(https://[^)]*?/-/jobs/\d+\)", body)),
        "rebase": "🔀" in body,
        "generic_pipeline": GENERIC_PIPELINE_PHRASE in body.lower(),
        # The thread link sits inside its own `[thread](url)` markdown link,
        # itself inside a note's `(... ):` wrapper, so the match must anchor
        # on `](` -- a bare `(` would instead capture from the wrapper's
        # opening paren through the link's first `)`, truncating the URL.
        "thread_urls": set(re.findall(r"\]\(([^)]+#note_\d+)\)", body)),
    }


def triage_mr(mr: dict[str, Any], me: str | None, now: datetime) -> dict[str, Any]:
    """Read one open MR closely enough to say what the author has to do next.

    Returns a record whose `category` is `draft`, `ready_to_merge`,
    `has_feedback`, or `awaiting_review`, plus the evidence behind it.
    """
    encoded = quote(mr["project_path"], safe="")
    base = f"projects/{encoded}/merge_requests/{mr['iid']}"
    detail = gitlab_json(f"{base}?include_diverged_commits_count=true")
    approvals = gitlab_json(f"{base}/approvals")
    discussions = gitlab_json(f"{base}/discussions?per_page=100")
    commits = gitlab_json(f"{base}/commits?per_page=1")

    head_at = parse_ts((commits[0] if commits else {}).get("committed_date"))
    pipeline = (detail.get("head_pipeline") or {}).get("status")
    merge_status = detail.get("detailed_merge_status")
    web_url = detail.get("web_url") or mr.get("url")

    def newest(current: datetime | None, candidate: datetime | None) -> datetime | None:
        if candidate is None:
            return current
        return candidate if current is None or candidate > current else current

    ai_review: dict[str, Any] | None = None
    unresolved: list[dict[str, Any]] = []
    plain_comments: list[tuple[datetime | None, dict[str, Any]]] = []
    rework_requested_at: datetime | None = None
    stokowski_push_at: datetime | None = None
    any_push_at: datetime | None = None
    rework_failed: dict[str, Any] | None = None
    blocking: list[dict[str, Any]] = []
    answered: list[dict[str, Any]] = []
    ready_at: datetime | None = None
    requested_job_names: set[str] = set()
    requested_rebase = False
    requested_generic_pipeline = False
    requested_thread_urls: set[str] = set()
    for discussion in discussions or []:
        all_notes = discussion.get("notes") or []
        for note in all_notes:
            body_text = note.get("body") or ""
            if not note.get("system"):
                continue
            if READY_FOR_REVIEW_PHRASE in body_text.lower().replace("*", ""):
                ready_at = newest(ready_at, parse_ts(note.get("created_at")))
            if not (body_text.startswith("added ") and "commit" in body_text):
                continue
            pushed = parse_ts(note.get("created_at"))
            any_push_at = newest(any_push_at, pushed)
            # A push by the bot is Stokowski reworking on its own. A push under
            # a human account alone addresses no feedback: it is often just a
            # rebase.
            if is_bot((note.get("author") or {}).get("username")):
                stokowski_push_at = newest(stokowski_push_at, pushed)
        notes = [note for note in all_notes if not note.get("system")]
        for note in notes:
            # Stokowski answers a rework it could not start (a pod that never
            # came up, on !13850 and !13846 on 2026-11-04) with this note and
            # pushes nothing, so without it the request would read as pending
            # forever.
            note_body = (note.get("body") or "").lstrip()
            if is_bot((note.get("author") or {}).get("username")) and note_body.startswith(
                REWORK_FAILED_PREFIX
            ):
                failed_at = parse_ts(note.get("created_at"))
                if rework_failed is None or (failed_at and failed_at > rework_failed["_at"]):
                    quoted = next(
                        (line[1:].strip() for line in note_body.splitlines() if line.startswith(">")),
                        "",
                    )
                    rework_failed = {
                        "_at": failed_at,
                        "reason": quoted[:200],
                        "url": f"{web_url}#note_{note.get('id')}",
                    }
        if not notes:
            continue
        opener = notes[0]
        body = opener.get("body") or ""
        author = (opener.get("author") or {}).get("username")
        created = parse_ts(opener.get("created_at"))
        open_thread = bool(opener.get("resolvable") and not opener.get("resolved"))
        if open_thread and (author == me or is_bot(author)):
            # Threads nobody else will resolve: your own rework requests and
            # bot notes. Any open thread blocks the merge button.
            blocking.append(
                {
                    "author": author,
                    "excerpt": (
                        "your rework request" if REWORK_MENTION in body
                        else "AI review" if AI_REVIEW_MARKER in body
                        else first_line(body)
                    ),
                    "url": f"{web_url}#note_{opener.get('id')}",
                }
            )
        # The rework check runs first: a rework comment quotes the AI review,
        # and on 2026-11-04 the quote carried the review's hidden marker, so
        # the requests read as fresh reviews and were offered again.
        if author == me and REWORK_MENTION in body:
            rework_requested_at = newest(rework_requested_at, created)
            fingerprint = parse_rework_request(body)
            requested_job_names |= fingerprint["job_names"]
            requested_rebase = requested_rebase or fingerprint["rebase"]
            requested_generic_pipeline = requested_generic_pipeline or fingerprint["generic_pipeline"]
            requested_thread_urls |= fingerprint["thread_urls"]
            continue
        if AI_REVIEW_MARKER in body:
            # The reviewer rewrites the newest note carrying its marker in
            # place, so `updated_at` dates the review. It also rewrote the
            # rework comments that carried the marker by mistake (!13912,
            # !13919), which is why the author can be you, not the bot.
            reviewed = parse_ts(opener.get("updated_at")) or created
            if ai_review is None or (reviewed and reviewed > ai_review["_at"]):
                ai_review = {"_at": reviewed, **parse_ai_review(body)}
            continue
        if is_bot(author) or author == me:
            continue
        entry = {
            "author": author,
            "excerpt": first_line(body),
            "body": body.strip()[:2000],
            "url": f"{web_url}#note_{opener.get('id')}",
        }
        if open_thread and is_bot((notes[-1].get("author") or {}).get("username")):
            # Stokowski has replied; the thread waits on its reviewer to
            # resolve it, and another rework would repeat the answer (!13915).
            answered.append(entry)
        elif open_thread:
            unresolved.append(entry)
        else:
            plain_comments.append((created, entry))

    # Feedback counts as handed off once it was sent to Stokowski or Stokowski
    # pushed after it. Commit dates cannot say this: on 2026-11-03 a batch
    # rebase made every AI review look older than the head commit, which hid
    # findings nobody had acted on.
    handled_at = newest(rework_requested_at, stokowski_push_at)
    new_comments = [
        entry for created, entry in plain_comments
        if handled_at is None or (created and created > handled_at)
    ]

    ai_out = None
    if ai_review:
        reviewed_at = ai_review.pop("_at")
        stale = bool(handled_at and reviewed_at and handled_at > reviewed_at)
        ai_out = {
            **ai_review,
            "reviewed_at": reviewed_at.isoformat() if reviewed_at else None,
            "stale": stale,
        }

    # Read failures from the commit's statuses, not the pipeline's jobs. On
    # 2026-11-04, 13 of 15 red studio pipelines had every job green: the only
    # failure was Percy's external "N visual changes need review" status,
    # which never appears as a job. Percy needs a person to approve snapshots
    # in Percy, so it is kept apart from failures a rework can fix.
    failed_jobs: list[dict[str, Any]] = []
    visual_review: dict[str, Any] | None = None
    head_pipeline = detail.get("head_pipeline") or {}
    pipeline_id = head_pipeline.get("id")
    if pipeline in PIPELINE_BAD and head_pipeline.get("sha"):
        try:
            statuses = gitlab_json(
                f"projects/{encoded}/repository/commits/{head_pipeline['sha']}/statuses?per_page=100"
            )
        except (CommandError, OSError):
            statuses = []
        latest: dict[str, dict[str, Any]] = {}
        for status in sorted(statuses or [], key=lambda s: s.get("id") or 0):
            if status.get("pipeline_id") in (pipeline_id, None):
                latest[status.get("name") or ""] = status
        for name, status in latest.items():
            if status.get("status") not in PIPELINE_BAD or status.get("allow_failure"):
                continue
            entry = {
                "name": name,
                "description": status.get("description"),
                # CI jobs carry no target_url here; the pipeline page is the
                # nearest link that still shows the failing job.
                "url": status.get("target_url") or head_pipeline.get("web_url"),
            }
            if name.lower().startswith(VISUAL_REVIEW_PREFIX):
                visual_review = entry
            else:
                failed_jobs.append(entry)

    if pipeline in PIPELINE_BAD and pipeline_id and not failed_jobs:
        failed_jobs = pipeline_job_failures(encoded, pipeline_id, head_pipeline.get("web_url"))

    # A rework request stays pending until anything is pushed after it; until
    # then a second request would only queue a duplicate rework. Any account
    # counts here: Stokowski's rework pushes on studio MRs are attributed to
    # the MR's human assignee (!13915, !13906 on 2026-11-03).
    rework_pending = bool(
        rework_requested_at and (any_push_at is None or rework_requested_at > any_push_at)
    )
    failed_at = rework_failed.pop("_at") if rework_failed else None
    if rework_failed and rework_requested_at and failed_at and failed_at > rework_requested_at:
        # Stokowski gave up on the request; it can be offered again.
        rework_pending = False
        rework_failed["at"] = failed_at.isoformat()
    else:
        rework_failed = None

    # Split every live issue into "new" (never asked about) and "repeat"
    # (a past `@stokowski-native` comment already named this exact job,
    # rebase, or thread, and it is still unresolved). A push that clears
    # `rework_pending` without actually fixing anything must not look like
    # fresh ground: without this split the same failing job gets asked about
    # on every scan the push doesn't fix it.
    generic_pipeline_bad = pipeline in PIPELINE_BAD and not failed_jobs
    new_failed_jobs = [job for job in failed_jobs if job.get("name") not in requested_job_names]
    repeat_failed_jobs = [job for job in failed_jobs if job.get("name") in requested_job_names]
    new_generic_pipeline = generic_pipeline_bad and not requested_generic_pipeline
    repeat_generic_pipeline = generic_pipeline_bad and requested_generic_pipeline
    rebase_needed = merge_status in REBASE_STATUSES or bool(detail.get("has_conflicts"))
    new_rebase = rebase_needed and not requested_rebase
    repeat_rebase = rebase_needed and requested_rebase
    new_unresolved = [entry for entry in unresolved if entry["url"] not in requested_thread_urls]
    repeat_unresolved = [entry for entry in unresolved if entry["url"] in requested_thread_urls]

    feedback: list[str] = []
    if failed_jobs:
        names = [job["name"] for job in failed_jobs]
        shown = ", ".join(names[:4])
        if len(names) > 4:
            shown += f" +{len(names) - 4} more"
        feedback.append(f"pipeline {pipeline} ({shown})")
    elif pipeline in PIPELINE_BAD and not visual_review:
        # Nothing named the failure, so say that much: a bare "pipeline failed"
        # reads as if there were a job to go and read.
        feedback.append(f"pipeline {pipeline} (no failing job listed)")
    if merge_status in REBASE_STATUSES or detail.get("has_conflicts"):
        feedback.append("needs rebase" if merge_status == "need_rebase" else "merge conflicts")
    if ai_out and not ai_out["stale"]:
        if ai_out["verdict"] == "changes_requested":
            feedback.append("AI review requested changes")
        if ai_out["must_fix"]:
            feedback.append(f"{len(ai_out['must_fix'])} AI must-fix")
        if ai_out["suggestions"]:
            feedback.append(f"{len(ai_out['suggestions'])} AI suggestion(s)")
    if unresolved:
        feedback.append(f"{len(unresolved)} unresolved thread(s)")
    if new_comments:
        feedback.append(f"{len(new_comments)} reviewer comment(s) not yet sent to Stokowski")
    # Everything above is work a rework can do. The Percy approval is the
    # user's, so it is feedback but never a reason to offer a rework.
    rework_feedback = list(feedback)
    if visual_review:
        feedback.append(f"Percy: {visual_review['description'] or 'visual review failed'}")
    if blocking:
        feedback.append(f"{len(blocking)} open thread(s) from you or a bot to resolve")
    if answered:
        feedback.append(f"{len(answered)} answered thread(s) awaiting the reviewer")

    # AI findings and `comments_since_handoff` are already deduped by
    # `handled_at` (a past rework request counts as handoff even with no
    # push), so only the pipeline/rebase/thread checks above need the
    # explicit fingerprint. This is what gates a *fresh* ask, as opposed to
    # `feedback`, which still reports every live issue so the row stays
    # honest about what is actually broken.
    has_new_feedback = bool(
        new_failed_jobs
        or new_generic_pipeline
        or new_rebase
        or (ai_out and not ai_out["stale"] and (ai_out["must_fix"] or ai_out["suggestions"]))
        or new_unresolved
        or new_comments
    )
    already_requested = bool(feedback) and not has_new_feedback

    ready_for_review_at = ready_at or parse_ts(detail.get("created_at"))
    review_wait_hours = (
        round((now - ready_for_review_at).total_seconds() / 3600, 1)
        if ready_for_review_at
        else None
    )

    approved = bool(approvals.get("approved"))
    # Who was actually asked to approve, and whether they have. GitLab keeps the
    # reviewer list and the approval list apart: a reviewer may approve without
    # being listed (an approver from a rule), and a listed reviewer may never
    # have looked. The report needs both halves, so the union is built here
    # rather than inferred from `approvals_left`.
    approved_by = [
        (entry.get("user") or {}).get("username") for entry in approvals.get("approved_by") or []
    ]
    approvers: list[dict[str, Any]] = []
    seen_approvers: set[str] = set()
    for reviewer in detail.get("reviewers") or []:
        username = (reviewer.get("username") or "").lstrip("@")
        if not username or username in seen_approvers:
            continue
        seen_approvers.add(username)
        approvers.append(
            {"username": username, "name": reviewer.get("name"), "approved": username in approved_by}
        )
    for username in approved_by:
        if not username or username in seen_approvers:
            continue
        seen_approvers.add(username)
        approvers.append({"username": username, "name": None, "approved": True})

    if detail.get("draft"):
        category = "draft"
    elif approved and merge_status == "mergeable":
        category = "ready_to_merge"
    elif feedback:
        category = "has_feedback"
    else:
        category = "awaiting_review"

    return {
        "iid": mr["iid"],
        "url": web_url,
        "title": detail.get("title"),
        "category": category,
        "draft": bool(detail.get("draft")),
        "pipeline": pipeline,
        "merge_status": merge_status,
        "behind_by": detail.get("diverged_commits_count"),
        "approved": approved,
        "approved_by": approved_by,
        "approvers": approvers,
        "approvals_required": approvals.get("approvals_required"),
        "approvals_left": approvals.get("approvals_left"),
        "head_commit_at": head_at.isoformat() if head_at else None,
        "ready_for_review_at": ready_for_review_at.isoformat() if ready_for_review_at else None,
        "review_wait_hours": review_wait_hours,
        "failed_jobs": failed_jobs,
        "visual_review": visual_review,
        "rework_feedback": rework_feedback,
        "new_failed_jobs": new_failed_jobs,
        "repeat_failed_jobs": repeat_failed_jobs,
        "new_generic_pipeline": new_generic_pipeline,
        "repeat_generic_pipeline": repeat_generic_pipeline,
        "new_rebase": new_rebase,
        "repeat_rebase": repeat_rebase,
        "rework_requested_at": rework_requested_at.isoformat() if rework_requested_at else None,
        "rework_pending": rework_pending,
        "rework_failed": rework_failed,
        "blocking_threads": blocking,
        "answered_threads": answered,
        "ai_review": ai_out,
        "unresolved_threads": unresolved,
        "new_unresolved_threads": new_unresolved,
        "repeat_unresolved_threads": repeat_unresolved,
        "comments_since_handoff": new_comments,
        "feedback": feedback,
        "has_new_feedback": has_new_feedback,
        "already_requested": already_requested,
    }


def redispatch(
    record: dict[str, Any], item: dict[str, Any], max_redispatches: int
) -> dict[str, Any]:
    """Start a fresh run of the failed workflow on the same work item.

    This is the dashboard's re-dispatch. The idempotency key is derived from
    the failed attempt, so re-running the scan never dispatches the same
    failure twice; the run count caps how often one item is retried, so a
    deterministic failure cannot burn a run on every scheduled scan.
    """
    if item.get("lifecycle") != "open":
        return {"status": "skipped", "why": "work item is closed"}
    workflow = record.get("workflow")
    project = record["stok_project"]
    raw = parse_json(
        sh(["stok", "status", item["id"], "-p", project, "--runs", "--json"]),
        f"stok status --runs {item['id']}",
    )
    runs = (raw.get("data") or {}).get("runs") or []
    if isinstance(runs, dict):
        runs = runs.get("items") or []
    primaries = [r for r in runs if r.get("role") == "primary" and r.get("workflow_id") == workflow]
    prior = max(len(primaries) - 1, 0)
    if prior >= max_redispatches:
        return {
            "status": "skipped",
            "why": f"already re-dispatched {prior} time(s); limit is {max_redispatches}",
            "prior_redispatches": prior,
        }

    run = item.get("primary_run") or {}
    outcome = run.get("outcome") or {}
    attempt = (item.get("latest_result") or {}).get("attempt_id") or run.get("id")
    cause = outcome.get("cause") or (item.get("latest_result") or {}).get("summary") or "unknown"
    text = (
        f"Re-dispatched by stokowski-stuck-check: the previous run failed at "
        f"{record.get('stage') or 'an unknown stage'} (cause: {cause}). Resume from "
        "the progress comment and the existing branch."
    )
    raw = parse_json(
        sh(
            [
                "stok", "run", item["id"], "-p", project, "-w", workflow,
                "--input", text,
                "--idempotency-key", f"stuck-check-{item['id']}-{attempt}",
                "--json",
            ]
        ),
        f"stok run {item['id']}",
    )
    if not raw.get("ok"):
        return {"status": "error", "why": str(raw.get("error"))[:300]}
    data = raw.get("data") or {}
    return {
        "status": "dispatched",
        "request_id": data.get("id"),
        "run_id": (data.get("result") or {}).get("run_id"),
        "cause": cause,
        "prior_redispatches": prior,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Find testing-uplift work waiting on a human.")
    parser.add_argument(
        "--board",
        action="append",
        choices=sorted(STOK_PROJECTS),
        help="limit to one Jira board (repeatable; default both)",
    )
    parser.add_argument(
        "--idle-days",
        type=float,
        default=3.0,
        help="age at which a wait counts as stale (default 3)",
    )
    parser.add_argument(
        "--stall-hours",
        type=float,
        default=6.0,
        help="quiet hours before a running item counts as stalled (default 6)",
    )
    parser.add_argument(
        "--review-wait-hours",
        type=float,
        default=24.0,
        help="hours an MR must sit ready for review before it is worth reporting (default 24)",
    )
    parser.add_argument(
        "--no-mr-check",
        action="store_true",
        help="skip GitLab verification of merge-request state (faster, but a "
        "merge-review row can then be a merged or closed MR, and open MRs "
        "are not triaged)",
    )
    parser.add_argument(
        "--redispatch-failed",
        action="store_true",
        help="start a fresh run on every work item whose run failed (the one write)",
    )
    parser.add_argument(
        "--max-redispatches",
        type=int,
        default=2,
        help="stop re-dispatching an item after this many earlier re-dispatches (default 2)",
    )
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    boards = args.board or sorted(STOK_PROJECTS)
    errors: list[str] = []
    truncated: dict[str, bool] = {}

    labeled_keys, labeled_truncated = fetch_labeled_ticket_keys(boards)
    truncated["labeled_query"] = labeled_truncated
    if labeled_truncated:
        errors.append("label query hit the 200-row page limit; it may be incomplete")

    items_by_project: dict[str, list[dict[str, Any]]] = {}
    for board in boards:
        stok_project = STOK_PROJECTS[board]
        try:
            items, hit_limit = fetch_work_items(stok_project)
            items_by_project[stok_project] = items
            truncated[stok_project] = hit_limit
            if hit_limit:
                errors.append(f"stok list {stok_project} hit the 500-row limit; it may be incomplete")
        except (CommandError, OSError) as exc:
            errors.append(str(exc))
            items_by_project[stok_project] = []

    # Newest work item per ticket wins: a re-dispatch supersedes the earlier run.
    latest_by_ticket: dict[str, dict[str, Any]] = {}
    for stok_project, items in items_by_project.items():
        for item in items:
            key = ticket_key_of(item)
            if not key:
                continue
            board = key.split("-")[0]
            if board not in boards:
                continue
            workflow = (item.get("primary_run") or {}).get("workflow_id")
            if workflow not in WORKFLOW_IDS and key not in labeled_keys:
                continue
            current = latest_by_ticket.get(key)
            if current is None or (parse_ts(item.get("created_at")) or now) > (
                parse_ts(current.get("created_at")) or now
            ):
                item = {**item, "_project": stok_project}
                latest_by_ticket[key] = item

    candidates = sorted(set(latest_by_ticket) | set(labeled_keys))
    try:
        tickets = hydrate_tickets(candidates, errors) if candidates else {}
    except (CommandError, OSError) as exc:
        print(json.dumps({"errors": [str(exc)], "generated_at": now.isoformat()}, indent=2))
        return 1

    # Archived tickets read like live ones through the issue API, so they have to
    # be identified before anything is reported: an archived ticket's idle run is
    # not work waiting on a human, and it must never be re-dispatched.
    warnings: list[str] = []
    archived_keys = fetch_archived_ticket_keys(tickets, warnings)

    detail_cache: dict[tuple[str, str], dict[str, Any]] = {}

    def detail_for(stok_project: str, item_id: str) -> dict[str, Any]:
        cache_key = (stok_project, item_id)
        if cache_key not in detail_cache:
            try:
                raw = parse_json(
                    sh(
                        [
                            "stok",
                            "status",
                            item_id,
                            "-p",
                            stok_project,
                            "--events",
                            "30",
                            "--json",
                        ]
                    ),
                    f"stok status {item_id}",
                )
                if not raw.get("ok"):
                    raise CommandError(f"stok status {item_id}: {raw.get('error')}")
                data = raw["data"]
                work_item = data.get("workItem") or {}
                events = []
                last_event_at = None
                for event in data.get("events") or []:
                    # Any event is evidence the run did something, including the
                    # `turn.started` that a rework emits. Ageing a running item
                    # from its last *completed* turn makes a fresh rework look
                    # abandoned: on 2026-11-02 three reworks started within the
                    # minute were reported 62.9h quiet.
                    occurred = parse_ts(event.get("occurred_at"))
                    if occurred and (last_event_at is None or occurred > last_event_at):
                        last_event_at = occurred
                    payload = event.get("payload") or {}
                    if event.get("type") not in REPORTABLE_EVENTS:
                        continue
                    events.append(
                        {
                            "at": event.get("occurred_at"),
                            "type": event.get("type"),
                            "state": payload.get("state"),
                            "summary": payload.get("summary") or payload.get("detail"),
                        }
                    )
                detail_cache[cache_key] = {
                    "events": events,
                    "last_event_at": last_event_at,
                    "required_action": work_item.get("required_action"),
                    "summary": (work_item.get("latest_result") or {}).get("summary") or "",
                }
            except (CommandError, OSError) as exc:
                errors.append(str(exc))
                detail_cache[cache_key] = {}
        return detail_cache[cache_key]

    buckets: dict[str, list[dict[str, Any]]] = {
        "code_review": [],
        "needs_human": [],
        "idle": [],
        "healthy": [],
    }

    mr_cache: dict[str, tuple[list[dict[str, Any]], str]] = {}

    def mrs_for(
        ticket: dict[str, Any], item: dict[str, Any], stage: str
    ) -> tuple[list[dict[str, Any]], str]:
        if args.no_mr_check:
            return [], "disabled"
        if not mr_check_applies(stage):
            return [], "not_applicable"
        key = ticket["key"]
        if key not in mr_cache:
            mr_cache[key] = find_ticket_mrs(ticket, item)
        return mr_cache[key]

    for key in candidates:
        if key in archived_keys:
            # Archived in Jira: out of scope, not work waiting on a human, and
            # not a re-dispatch target. Its run can still look idle or blocked.
            continue
        ticket = tickets.get(key)
        if ticket is None or ticket["status_category"] == "done":
            continue
        board = key.split("-")[0]
        stok_project = STOK_PROJECTS[board]
        item = latest_by_ticket.get(key)

        record: dict[str, Any] = {
            "ticket": key,
            "summary": ticket["summary"],
            "ticket_status": ticket["status"],
            "ticket_url": ticket["url"] or f"https://vistaprint.atlassian.net/browse/{key}",
            "ticket_labels": [l for l in ticket["labels"] if l.startswith("workflow:")],
            "scope_label": any(label in LABELS for label in ticket["labels"]),
            "stokowski_label": any("stokowski" in label for label in ticket["labels"]),
            "ticket_updated": ticket["updated"],
            "ticket_created": ticket["created"],
            # Creation, not `updated`: another cron touching the ticket moves
            # `updated` without the work moving, which would report a
            # three-week-old backlog item as fresh.
            "ticket_age_days": days_between(now, parse_ts(ticket["created"])),
        }

        if item is None:
            record["kind"] = "never_picked_up"
            record["stale"] = (record["ticket_age_days"] or 0) >= args.idle_days
            buckets["idle"].append(record)
            continue

        run = item.get("primary_run") or {}
        state = (item.get("progress") or {}).get("state") or "unknown"
        stage = run.get("stage") or ""
        result = item.get("latest_result") or {}
        since = last_activity(item)
        age_days = days_between(now, since)

        record.update(
            work_item_id=item["id"],
            stok_project=item["_project"],
            workflow=run.get("workflow_id"),
            state=state,
            stage=stage,
            lifecycle=item.get("lifecycle"),
            waiting_since=since.isoformat() if since else None,
            age_days=age_days,
            stale=age_days is not None and age_days >= args.idle_days,
            dashboard_url=DASHBOARD.format(project=item["_project"], item=item["id"]),
        )

        if state == "awaiting_review" and stage.endswith(MERGE_REVIEW_STAGE):
            url, bare = resolve_mr_url(item, [result.get("summary") or ""])
            mrs, mr_check = mrs_for(ticket, item, stage)
            open_mrs = [mr for mr in mrs if mr.get("state") == "opened"]
            record.update(
                kind="merge_review",
                mr_url=url or (open_mrs[0]["url"] if open_mrs else None),
                mr_ref=bare,
                mrs=mrs,
                mr_check=mr_check,
            )
            # The stage string says "handoff to a reviewer". Only the MR itself
            # can confirm one is waiting. Verified not-open means the reviewer
            # handoff is over: either the work landed and the ticket is stale,
            # or the MR was closed and nothing reviewable survives.
            if mr_check == "found" and not open_mrs:
                merged = any(mr.get("state") in {"merged", "locked"} for mr in mrs)
                record["kind"] = (
                    "mr_merged_ticket_open" if merged else "mr_closed_unmerged"
                )
                record["mr_state"] = "merged" if merged else "closed"
                buckets["idle" if merged else "needs_human"].append(record)
                continue
            if mr_check == "none":
                # A merge-review gate with no MR at all: the branch was never
                # pushed, so there is nothing for a reviewer to open.
                record["kind"] = "merge_review_without_mr"
                buckets["needs_human"].append(record)
                continue
            buckets["code_review"].append(record)
            continue

        if state in {"escalated", "failed", "cancelled"} or state == "awaiting_review":
            detail = detail_for(item["_project"], item["id"])
            gate = detail.get("required_action") or item.get("required_action") or {}
            primary = detail.get("summary") or result.get("summary") or ""
            mrs, mr_check = mrs_for(ticket, item, stage)
            record.update(
                kind=state if state != "awaiting_review" else "blocked_gate",
                choices=gate.get("choices"),
                reason=excerpt(primary),
                reason_tail=primary.strip()[-700:],
                events=detail.get("events", []),
                mr_url=resolve_mr_url(item, [primary, result.get("summary") or ""])[0],
                mrs=mrs,
                mr_check=mr_check,
            )
            # Merging an MR cancels the run parked at its merge review, so a
            # cancelled run with a merged MR is landed work, not a decision.
            # ERICRULEZ-352 and 399 on 2026-11-03: merged 21:47Z, cancelled 22:06Z.
            if (
                state == "cancelled"
                and not any(mr.get("state") == "opened" for mr in mrs)
                and any(mr.get("state") in {"merged", "locked"} for mr in mrs)
            ):
                record.update(kind="mr_merged_ticket_open", mr_state="merged")
                buckets["idle"].append(record)
                continue
            buckets["needs_human"].append(record)
            record["plan_check"] = "not_applicable"
            if any(marker in stage for marker in PLAN_STAGE_MARKERS):
                gate_opened_at = None
                for event in record.get("events") or []:
                    if event.get("type") == "gate.waiting":
                        gate_opened_at = parse_ts(event.get("at")) or gate_opened_at
                try:
                    p_status, p_at = plan_status(
                        fetch_jira_comments(ticket["key"]), gate_opened_at
                    )
                except (CommandError, OSError):
                    p_status, p_at = "unknown", None
                record["plan_check"] = p_status
                record["plan_comment_at"] = p_at.isoformat() if p_at else None
                if p_status == "missing":
                    # The gate is open but the plan never reached the ticket.
                    # Telling the reader to approve here sends them looking for
                    # something that does not exist yet.
                    record["kind"] = "gate_without_plan"
                    buckets["needs_human"].pop()
                    buckets["idle"].append(record)
                    continue
            continue

        if state == "completed":
            record["kind"] = "finished_not_closed"
            buckets["idle"].append(record)
            continue

        if item.get("lifecycle") == "closed":
            record["kind"] = "closed_without_success"
            buckets["needs_human"].append(record)
            continue

        quiet_hours = (now - since).total_seconds() / 3600 if since else None
        if quiet_hours is not None and quiet_hours >= args.stall_hours:
            # `since` comes from the work item row, which only knows about
            # finished turns. Ask the event log before calling a live turn dead.
            detail = detail_for(item["_project"], item["id"])
            last_event = detail.get("last_event_at")
            if last_event and since and last_event > since:
                since = last_event
                quiet_hours = (now - since).total_seconds() / 3600
                age_days = days_between(now, since)
                record.update(
                    waiting_since=since.isoformat(),
                    age_days=age_days,
                    stale=age_days is not None and age_days >= args.idle_days,
                )
            if quiet_hours >= args.stall_hours:
                record.update(kind="stalled_running", quiet_hours=round(quiet_hours, 1))
                buckets["idle"].append(record)
                continue

        record["kind"] = "running"
        # A running item can be a rework of an open MR; its MR still belongs
        # in the MR triage, marked as already being addressed.
        mrs, mr_check = mrs_for(ticket, item, stage)
        record.update(mrs=mrs, mr_check=mr_check)
        buckets["healthy"].append(record)

    redispatched: list[dict[str, Any]] = []
    if args.redispatch_failed:
        for record in list(buckets["needs_human"]):
            if record.get("kind") != "failed":
                continue
            item = latest_by_ticket[record["ticket"]]
            try:
                outcome = redispatch(record, item, args.max_redispatches)
            except (CommandError, OSError) as exc:
                outcome = {"status": "error", "why": str(exc)[:300]}
            record["redispatch"] = outcome
            if outcome["status"] == "dispatched":
                # The failure is handled; it no longer needs the human.
                buckets["needs_human"].remove(record)
                redispatched.append(record)

    mr_triage: dict[str, list[dict[str, Any]]] = {
        "draft": [],
        "has_feedback": [],
        "ready_to_merge": [],
        "awaiting_review": [],
    }
    if not args.no_mr_check:
        try:
            me = gitlab_json("user").get("username")
        except (CommandError, OSError):
            me = None
        seen: set[str] = set()
        # A re-dispatched run is reworking its MR right now, the same as a
        # healthy one; leaving it out dropped !13919 from the 2026-11-04 triage.
        sources = {name: buckets[name] for name in ("code_review", "needs_human", "idle", "healthy")}
        sources["redispatched"] = redispatched
        for name, records in sources.items():
            for record in records:
                for mr in record.get("mrs") or []:
                    if mr.get("state") != "opened" or not mr.get("project_path"):
                        continue
                    if mr["url"] in seen:
                        continue
                    seen.add(mr["url"])
                    try:
                        triaged = triage_mr(mr, me, now)
                    except (CommandError, OSError) as exc:
                        errors.append(f"MR triage {mr['url']}: {str(exc)[:200]}")
                        continue
                    triaged.update(
                        ticket=record["ticket"],
                        ticket_summary=record["summary"],
                        ticket_url=record["ticket_url"],
                        ticket_kind=record.get("kind"),
                        rework_running=name in {"healthy", "redispatched"},
                    )
                    triaged["review_wait_long"] = bool(
                        triaged["review_wait_hours"] is not None
                        and triaged["review_wait_hours"] >= args.review_wait_hours
                    )
                    # Offer a rework only where the comment can do something:
                    # the run is parked at its merge review (so the comment
                    # becomes a rework, not a side conversation), nothing is
                    # already running or requested, and there is feedback the
                    # MR hasn't already been asked to fix. `has_new_feedback`
                    # (not `feedback`) is the gate: a push that doesn't fix
                    # anything clears `rework_pending` without teaching
                    # Stokowski anything new, so asking again would just repeat
                    # the last request. Approved, mergeable MRs are left to
                    # the user's merge.
                    # `rework_feedback` (main) excludes the Percy approval, which
                    # no rework can clear; `has_new_feedback` is narrower still, so
                    # it implies that check and adds "nobody has asked for this yet".
                    triaged["rework_eligible"] = bool(
                        triaged["category"] in {"draft", "has_feedback"}
                        and triaged["has_new_feedback"]
                        and record.get("kind") == "merge_review"
                        and not triaged["rework_running"]
                        and not triaged["rework_pending"]
                    )
                    mr_triage[triaged["category"]].append(triaged)

    for records in buckets.values():
        records.sort(key=lambda r: (-(r.get("age_days") or r.get("ticket_age_days") or 0), r["ticket"]))

    # A row whose MR state could not be verified must not read like a verified
    # one. These are gaps in the check, not failures of the scan.
    for name in ("code_review", "needs_human", "idle"):
        for record in buckets[name]:
            check = record.get("mr_check")
            if check == "unknown":
                warnings.append(f"{record['ticket']}: merge-request state unreadable (glab)")
            elif check == "no_repo_mapping":
                warnings.append(
                    f"{record['ticket']}: no repo: label mapped to a GitLab project; "
                    "merge-request state not checked"
                )
            if record.get("plan_check") == "unknown":
                warnings.append(f"{record['ticket']}: Jira comment thread unreadable; plan not verified")

    report = {
        "generated_at": now.isoformat(),
        "scope": {
            "boards": boards,
            "labels": list(LABELS),
            "workflow_ids": sorted(WORKFLOW_IDS),
            "tickets": len(tickets) - len(archived_keys),
            "archived_excluded": len(archived_keys),
            "archived_tickets": sorted(archived_keys),
            "work_items_listed": sum(len(v) for v in items_by_project.values()),
            "work_items_in_scope": sum(
                1 for key in latest_by_ticket if key not in archived_keys
            ),
            "mr_check_enabled": not args.no_mr_check,
            "truncated": truncated,
        },
        "thresholds": {
            "idle_days": args.idle_days,
            "stall_hours": args.stall_hours,
            "review_wait_hours": args.review_wait_hours,
        },
        "counts": {
            **{name: len(records) for name, records in buckets.items()},
            "redispatched": len(redispatched),
            "mr_triage": {name: len(rows) for name, rows in mr_triage.items()},
        },
        "code_review": buckets["code_review"],
        "needs_human": buckets["needs_human"],
        "idle": buckets["idle"],
        "healthy": buckets["healthy"],
        "redispatched": redispatched,
        "mr_triage": mr_triage,
        "warnings": warnings,
        "errors": errors,
    }
    print(json.dumps(report, indent=2))
    # Non-zero only when something is actually wrong with the scan itself.
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
