#!/usr/bin/env python3
"""Stokowski stuck-check driver.

Answers one question: across the testing-uplift work Stokowski is doing, which
work items are waiting on a human, and why?

Encapsulates the deterministic part -- scope, join, classify, age, MR link
resolution -- so every scheduled run classifies identically. The invoking agent
writes the prose report from this JSON; it never re-derives the join by hand.

Usage:
  python3 scan.py [--idle-days 3] [--stall-hours 6] [--board ERICRULEZ]

Read-only: no Jira writes, no Stokowski writes.

Why the join is work-item-first: a work item carries `origin.reference
.display_key` back to its Jira ticket, so `stok list` alone names every ticket
Stokowski has ever touched. JQL discovery is added on top for the opposite
case -- a ticket carrying the label that Stokowski has never picked up -- but
it cannot be the primary source: Jira's search index can omit tickets that the
issue API still returns (observed on ERICRULEZ-228/229/230, 2026-11-02), which
would silently drop exactly the stuck work this check exists to find. Every
ticket read goes through `twg jira workitem get`, which hits the issue API.
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


def mr_record(mr: dict[str, Any], source: str) -> dict[str, Any]:
    return {
        "iid": mr.get("iid"),
        "state": mr.get("state"),
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
        "--no-mr-check",
        action="store_true",
        help="skip GitLab verification of merge-request state (faster, but a "
        "merge-review row can then be a merged or closed MR)",
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
        buckets["healthy"].append(record)

    for records in buckets.values():
        records.sort(key=lambda r: (-(r.get("age_days") or r.get("ticket_age_days") or 0), r["ticket"]))

    # A row whose MR state could not be verified must not read like a verified
    # one. These are gaps in the check, not failures of the scan.
    warnings: list[str] = []
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
            "tickets": len(tickets),
            "work_items_listed": sum(len(v) for v in items_by_project.values()),
            "work_items_in_scope": len(latest_by_ticket),
            "mr_check_enabled": not args.no_mr_check,
            "truncated": truncated,
        },
        "thresholds": {"idle_days": args.idle_days, "stall_hours": args.stall_hours},
        "counts": {name: len(records) for name, records in buckets.items()},
        "code_review": buckets["code_review"],
        "needs_human": buckets["needs_human"],
        "idle": buckets["idle"],
        "healthy": buckets["healthy"],
        "warnings": warnings,
        "errors": errors,
    }
    print(json.dumps(report, indent=2))
    # Non-zero only when something is actually wrong with the scan itself.
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
