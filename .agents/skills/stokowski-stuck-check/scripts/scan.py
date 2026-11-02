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
from datetime import datetime, timezone
from typing import Any

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
                for event in data.get("events") or []:
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
            record.update(kind="merge_review", mr_url=url, mr_ref=bare)
            buckets["code_review"].append(record)
            continue

        if state in {"escalated", "failed", "cancelled"} or state == "awaiting_review":
            detail = detail_for(item["_project"], item["id"])
            gate = detail.get("required_action") or item.get("required_action") or {}
            primary = detail.get("summary") or result.get("summary") or ""
            record.update(
                kind=state if state != "awaiting_review" else "blocked_gate",
                choices=gate.get("choices"),
                reason=excerpt(primary),
                reason_tail=primary.strip()[-700:],
                events=detail.get("events", []),
                mr_url=resolve_mr_url(item, [primary, result.get("summary") or ""])[0],
            )
            buckets["needs_human"].append(record)
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
            record.update(kind="stalled_running", quiet_hours=round(quiet_hours, 1))
            buckets["idle"].append(record)
            continue

        record["kind"] = "running"
        buckets["healthy"].append(record)

    for records in buckets.values():
        records.sort(key=lambda r: (-(r.get("age_days") or r.get("ticket_age_days") or 0), r["ticket"]))

    report = {
        "generated_at": now.isoformat(),
        "scope": {
            "boards": boards,
            "labels": list(LABELS),
            "workflow_ids": sorted(WORKFLOW_IDS),
            "tickets": len(tickets),
            "work_items_listed": sum(len(v) for v in items_by_project.values()),
            "work_items_in_scope": len(latest_by_ticket),
            "truncated": truncated,
        },
        "thresholds": {"idle_days": args.idle_days, "stall_hours": args.stall_hours},
        "counts": {name: len(records) for name, records in buckets.items()},
        "code_review": buckets["code_review"],
        "needs_human": buckets["needs_human"],
        "idle": buckets["idle"],
        "healthy": buckets["healthy"],
        "errors": errors,
    }
    print(json.dumps(report, indent=2))
    # Non-zero only when something is actually wrong with the scan itself.
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
