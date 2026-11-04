#!/usr/bin/env python3
"""Ask Stokowski to rework MRs by posting the feedback the scan collected.

Usage:
  python3 request_rework.py --scan scan.json --mr <mr-url> [--mr <mr-url> ...]
  python3 request_rework.py --scan scan.json --mr <mr-url> --dry-run

Reads the `mr_triage` section of a scan.py JSON document, builds one
`@stokowski-native fix the following:` comment per MR from its open feedback,
and posts it as an MR note. The comment is the whole action: Stokowski answers
it, sends its merge review back for rework, and pushes the fix.

Refuses any MR the scan did not mark `rework_eligible`, so a click can never
land on an MR whose run is busy, already has a pending request, or is approved
and waiting on the merge button.
"""

import argparse
import json
import re
import subprocess
import sys
from typing import Any
from urllib.parse import quote

THREAD_LIMIT = 1500


def build_comment(mr: dict[str, Any]) -> str:
    parts = ["@stokowski-native fix the following:"]

    if mr.get("failed_jobs"):
        jobs = "\n".join(
            f"- [{job['name']}]({job['url']}) ({job['stage']})" for job in mr["failed_jobs"]
        )
        parts.append(
            "### ❌ Failing pipeline\n\n"
            "The pipeline on the latest commit failed. Read each job log, fix the cause, "
            f"and push:\n\n{jobs}"
        )
    elif mr.get("pipeline") in {"failed", "canceled"}:
        parts.append(
            f"### ❌ Failing pipeline\n\nThe pipeline on the latest commit is `{mr['pipeline']}`. "
            "Find the failing job, fix the cause, and push."
        )

    if mr.get("merge_status") in {"need_rebase", "conflict"}:
        parts.append(
            "### 🔀 Rebase\n\nThe branch can't merge as it stands. Rebase onto `master` and "
            "resolve any conflicts."
        )

    review = mr.get("ai_review") or {}
    if review and not review.get("stale"):
        for key in ("must_fix_md", "suggestions_md"):
            if review.get(key):
                # Drop the reviewer's hidden HTML markers so the posted
                # comment is never mistaken for an AI review of its own.
                section = re.sub(r"<!--.*?-->", "", review[key], flags=re.S).strip()
                if section:
                    parts.append(section)

    threads = (mr.get("unresolved_threads") or []) + (mr.get("comments_since_handoff") or [])
    if threads:
        lines = ["### 💬 Reviewer comments", ""]
        for thread in threads:
            body = (thread.get("body") or thread.get("excerpt") or "")[:THREAD_LIMIT]
            quoted = "\n".join(f"> {line}" for line in body.splitlines())
            lines.append(f"**{thread['author']}** ([thread]({thread['url']})):\n\n{quoted}\n")
        lines.append("Reply on each thread with what you changed.")
        parts.append("\n".join(lines))

    return "\n\n".join(parts).strip() + "\n"


def post_note(mr: dict[str, Any], body: str) -> str:
    project_path = mr["url"].split("gitlab.com/", 1)[1].split("/-/", 1)[0]
    path = f"projects/{quote(project_path, safe='')}/merge_requests/{mr['iid']}/notes"
    proc = subprocess.run(
        ["glab", "api", "-X", "POST", path, "-f", f"body={body}"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout).strip()[:300])
    out = proc.stdout
    note = json.loads(out[out.find("{") :])
    return f"{mr['url']}#note_{note.get('id')}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Request Stokowski reworks for MRs with feedback.")
    parser.add_argument("--scan", required=True, help="path to a scan.py JSON document")
    parser.add_argument("--mr", action="append", required=True, help="MR web URL (repeatable)")
    parser.add_argument("--dry-run", action="store_true", help="print the comments, post nothing")
    args = parser.parse_args()

    with open(args.scan) as handle:
        scan = json.load(handle)
    by_url = {
        mr["url"]: mr for rows in (scan.get("mr_triage") or {}).values() for mr in rows
    }

    results = []
    for url in args.mr:
        mr = by_url.get(url)
        if mr is None:
            results.append({"mr": url, "status": "skipped", "why": "not in this scan's MR triage"})
            continue
        if not mr.get("rework_eligible"):
            results.append(
                {"mr": url, "ticket": mr.get("ticket"), "status": "skipped", "why": "not rework_eligible"}
            )
            continue
        body = build_comment(mr)
        if args.dry_run:
            results.append({"mr": url, "ticket": mr["ticket"], "status": "dry_run", "comment": body})
            continue
        try:
            note_url = post_note(mr, body)
            results.append({"mr": url, "ticket": mr["ticket"], "status": "posted", "note": note_url})
        except (RuntimeError, OSError, json.JSONDecodeError) as exc:
            results.append({"mr": url, "ticket": mr["ticket"], "status": "error", "why": str(exc)})

    print(json.dumps(results, indent=2))
    return 1 if any(result["status"] == "error" for result in results) else 0


if __name__ == "__main__":
    sys.exit(main())
