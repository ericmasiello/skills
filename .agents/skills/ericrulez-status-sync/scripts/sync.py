#!/usr/bin/env python3
"""ericrulez-status-sync driver.

Encapsulates SKILL.md steps 1-5 (load, learn vocabulary, discover linked work,
exact-key gate, classify, apply low-risk + high-confidence transitions) as a
single rerun-able command, so each scheduled run is "run this, then handle the
question/report tail" instead of re-deriving pagination/batching/gating logic
from scratch. Steps 6-7 (asking the user, posting the decision comment, final
report prose) stay with the invoking agent -- they need the `question` tool
and a human-readable narrative, which a script can't produce.

Usage:
  python3 sync.py run [--dry-run] [--since 365d]
      Full pipeline. Applies forward in-progress/in-review moves and
      high-confidence Done moves directly; prints a JSON report on stdout
      ending with a `needs_question` array for anything still ambiguous.

  python3 sync.py resolve-done --key ERICRULEZ-56 --pr-url <url> \\
      --confidence medium --decision moved
      Records the user's answer from step 6: posts the tracking comment, and
      if decision=moved, applies the Done transition and re-reads to confirm.

BOT_MARKER below must match what `resolve-done` posts, so `run`'s "already
answered" check (searching each candidate's own comments) keeps working.

Types are intentionally loose (`dict[str, Any]`) wherever a value is `twg`'s
raw JSON response -- that shape lives in an external CLI's output, not in
this file, so pretending to model it precisely would be a lie the moment
`twg` changes it. `TypedDict`s are used only for shapes this script itself
defines and owns (`Candidate`, `ClassifyResult`).
"""

import argparse
import json
import subprocess
import sys
import time
from collections.abc import Iterator
from typing import Any, Literal, Optional, TypedDict

BOT_MARKER: str = "\U0001F916 ericrulez-status-sync:"
PROJECT_JQL: str = "project = ERICRULEZ AND statusCategory != Done AND issuetype != Epic"

RANK_NO_EVIDENCE = 0
RANK_IN_PROGRESS = 1
RANK_IN_REVIEW = 2
RANK_DONE = 3

Confidence = Literal["high", "low"]
Decision = Literal["moved", "left"]


class Candidate(TypedDict):
    key: str
    status: str
    status_category: str
    status_category_key: str
    summary: Optional[str]
    assignee: Optional[str]


class ClassifyResult(TypedDict):
    matched_prs: list[dict[str, Any]]
    matched_commits: list[dict[str, Any]]
    unmatched_pr_count: int
    target_rank: int
    evidence: list[dict[str, Any]]


def run_twg(args: list[str], timeout: int = 180) -> dict[str, Any]:
    """Run `twg <args> -o json`, return the parsed JSON body.

    For larger payloads (e.g. `workitem query`), twg writes the JSON to a temp
    file and prints that file's path on a `stdout: "<path>"` line inside a
    diagnostic YAML block -- so this reads the pointer and loads the file.
    For small payloads (confirmed for `workitem transition --id` discovery,
    the read-only "list available transitions" mode) twg instead prints the
    JSON body directly to stdout with no wrapper at all. Both are handled
    here rather than assuming one shape per SKILL.md's "fix the script"
    guidance -- if a third shape shows up, extend this, don't work around it
    in a single call site.
    """
    cmd = ["twg"] + args
    if "-o" not in args:
        cmd += ["-o", "json"]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"twg {' '.join(args)} failed:\n{proc.stdout}\n{proc.stderr}")
    stdout_path: Optional[str] = None
    for line in proc.stdout.splitlines():
        line = line.strip()
        if line.startswith("stdout:"):
            stdout_path = line.split("stdout:", 1)[1].strip().strip('"')
            break
    if stdout_path:
        with open(stdout_path) as f:
            return json.load(f)
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(
            f"twg {' '.join(args)}: no stdout path and body isn't plain JSON either:\n{proc.stdout[:1000]}"
        )


def chunk(lst: list[str], n: int) -> Iterator[list[str]]:
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def key_lower_in(key: str, *texts: str) -> bool:
    key_lower = key.lower()
    return any(t and key_lower in t.lower() for t in texts)


def load_candidates(jql: str = PROJECT_JQL, first: int = 200) -> list[Candidate]:
    data = run_twg(["jira", "workitem", "query", "--jql", jql, "--first", str(first)])
    issues: list[dict[str, Any]] = data["data"]["issues"]
    if data.get("pageInfo", {}).get("hasNextPage"):
        raise RuntimeError(
            f"More than {first} candidates -- twg query --cursor pagination isn't "
            "wired up here; raise --first or add cursor support before trusting this run."
        )
    out: list[Candidate] = []
    for i in issues:
        raw_assignee = i.get("assignee")
        out.append(
            Candidate(
                key=i["key"],
                status=i["status"]["name"],
                status_category=i["status"]["statusCategory"]["name"],
                status_category_key=i["status"]["statusCategory"]["key"],
                summary=i.get("summary"),
                assignee=raw_assignee.get("displayName") if isinstance(raw_assignee, dict) else raw_assignee,
            )
        )
    return out


def rank_of(status_name: str, status_category_key: str) -> int:
    """Forward-only ordinal for a status, derived from the vocabulary actually
    present on the board -- never hardcode literal "To Do"/"In Progress"/
    "In Review" strings, per SKILL.md step 2. `statusCategory` alone can't
    separate In Progress from In Review (both are Jira's "indeterminate"
    category in this workspace), so break the tie on the status *name*
    containing "review".
    """
    if status_category_key == "done":
        return RANK_DONE
    if "review" in status_name.lower():
        return RANK_IN_REVIEW
    if status_category_key == "indeterminate":
        return RANK_IN_PROGRESS
    return RANK_NO_EVIDENCE  # to-do-equivalent, including custom statuses like "Blocked"


def check_vocabulary(candidates: list[Candidate]) -> Optional[str]:
    """Returns None if the board's vocabulary matches this skill's assumptions
    (something ranks as in-progress-equivalent, something ranks as
    in-review-equivalent). Otherwise returns a message the agent should show
    the user via the `question` tool before proceeding -- see SKILL.md step 2.
    """
    names = {c["status"] for c in candidates}
    ranks = {rank_of(name, next(c["status_category_key"] for c in candidates if c["status"] == name)) for name in names}
    if RANK_IN_PROGRESS in ranks and RANK_IN_REVIEW in ranks:
        return None
    return (
        f"Board statuses found: {sorted(names)}. None maps to an in-progress-equivalent "
        "and/or in-review-equivalent rank under the 'review' substring heuristic -- "
        "ask the user which status names mean 'work started' and 'in code review'."
    )


def _context_items(data: dict[str, Any], keys: list[str]) -> list[tuple[str, dict[str, Any]]]:
    """`twg context jira workitem` returns a DIFFERENT shape for a single key
    (data.object/data.relationships, command "context.jira.workitem") than for
    a batch of 2+ (data.items[], command "context.jira.workitem.batch"). A
    batch of exactly 1 -- which happens whenever len(keys) % batch_size == 1 --
    would silently parse as empty under the batch-only shape. Normalize both
    into the same (identifier, item_data) pairs.
    """
    items: Optional[list[dict[str, Any]]] = data.get("data", {}).get("items")
    if items is not None:
        return [(item["identifier"], item.get("data", {})) for item in items]
    return [(keys[0], data.get("data", {}))]


def fetch_context_summary(keys: list[str], since: str, batch_size: int = 10) -> dict[str, list[dict[str, Any]]]:
    """Step 3, cheap pass: which candidates have ANY linked PR/commit at all."""
    results: dict[str, list[dict[str, Any]]] = {}
    for batch in chunk(keys, batch_size):
        cmd = ["context", "jira", "workitem"] + batch + [
            "--detail", "summary",
            "--relationships", "jira_work_item_links_external_pull_request,jira_work_item_links_external_commit",
            "--since", since,
        ]
        data = run_twg(cmd)
        for identifier, item_data in _context_items(data, batch):
            results[identifier] = item_data.get("relationshipSummary", [])
        time.sleep(0.2)
    return results


def fetch_context_full(keys: list[str], since: str, batch_size: int = 8) -> dict[str, dict[str, Any]]:
    """Step 3, expensive pass: real PR status/title/branches for the narrowed set."""
    results: dict[str, dict[str, Any]] = {}
    for batch in chunk(keys, batch_size):
        cmd = ["context", "jira", "workitem"] + batch + [
            "--detail", "full",
            "--relationships", "jira_work_item_links_external_pull_request,jira_work_item_links_external_commit",
            "--since", since,
        ]
        data = run_twg(cmd)
        for identifier, item_data in _context_items(data, batch):
            results[identifier] = item_data
        time.sleep(0.2)
    return results


def classify(key: str, relationships: list[dict[str, Any]]) -> ClassifyResult:
    """Exact-key gate + classification (SKILL.md step 3's table), with two
    false-positive fixes confirmed live against this board and not yet
    reflected in the skill's prose -- see SKILL.md's "Known false positives"
    note for the worked examples (ERICRULEZ-139, -56, -145):

    1. destinationBranch is EXCLUDED from the PR match. A PR whose
       destinationBranch happens to be named after this ticket (because a
       *different* ticket's work was stacked on top of it) is not evidence
       this ticket's own PR merged/opened -- only the PR's own identity
       (title or sourceBranch) proves that.
    2. A commit-message-only match is trusted as "branch/commit, no PR yet"
       evidence ONLY when the ticket has zero linked PRs at all. If any PR is
       linked (even one that failed the match above), the commit almost
       certainly belongs to *that* PR and is merely citing this ticket's key
       in passing (e.g. "parent PRD ERICRULEZ-56", "benefits ERICRULEZ-145's
       benchmark step") rather than being this ticket's own work.
    """
    pr_targets: list[dict[str, Any]] = []
    commit_targets: list[dict[str, Any]] = []
    for r in relationships:
        if r.get("relationshipName") == "jira_work_item_links_external_pull_request":
            pr_targets.extend(r.get("targets", []))
        elif r.get("relationshipName") == "jira_work_item_links_external_commit":
            commit_targets.extend(r.get("targets", []))

    matched_prs = [
        p for p in pr_targets
        if key_lower_in(key, p.get("title", ""), (p.get("sourceBranch") or {}).get("name", ""))
    ]
    matched_commits = [
        c for c in commit_targets
        if key_lower_in(key, c.get("message", "") or c.get("description", ""))
    ]

    merged = [p for p in matched_prs if p.get("status") == "MERGED"]
    open_prs = [p for p in matched_prs if p.get("status") == "OPEN"]

    target_rank: int
    evidence: list[dict[str, Any]]
    if merged:
        target_rank, evidence = RANK_DONE, merged
    elif open_prs:
        target_rank, evidence = RANK_IN_REVIEW, open_prs
    elif matched_commits and len(pr_targets) == len(matched_prs):
        target_rank, evidence = RANK_IN_PROGRESS, matched_commits
    else:
        target_rank, evidence = RANK_NO_EVIDENCE, []

    return ClassifyResult(
        matched_prs=matched_prs,
        matched_commits=matched_commits,
        unmatched_pr_count=len(pr_targets) - len(matched_prs),
        target_rank=target_rank,
        evidence=evidence,
    )


def score_done_confidence(matched_prs: list[dict[str, Any]]) -> Confidence:
    """SKILL.md step 4 rubric, High tier only -- Medium vs Low both route to
    the same 'ask instead of guessing' bucket (step 6), so this only needs to
    separate "apply directly" from "ask", not fully rank Medium against Low.
    A human re-reads the evidence at question time to pick the exact label
    for the tracking comment.
    """
    merged = [p for p in matched_prs if p.get("status") == "MERGED"]
    open_same_key = [p for p in matched_prs if p.get("status") == "OPEN"]
    if merged and not open_same_key:
        return "high"
    return "low"


def find_transition_id(key: str, target_rank: int) -> tuple[Optional[str], Optional[str]]:
    data = run_twg(["jira", "workitem", "transition", "--id", key])
    transitions: list[dict[str, Any]] = data["data"]["transitions"]
    for t in transitions:
        name: str = t.get("toName") or t.get("name") or ""
        category = (t.get("category") or "").lower()
        if target_rank == RANK_DONE and category == "done":
            return t["id"], name
        if target_rank == RANK_IN_REVIEW and "review" in name.lower():
            return t["id"], name
        if target_rank == RANK_IN_PROGRESS and "progress" in name.lower() and "review" not in name.lower():
            return t["id"], name
    return None, None


def apply_transition(key: str, transition_id: str) -> bool:
    data = run_twg(["jira", "workitem", "transition", "--id", key, "--transition-id", str(transition_id)])
    return bool(data.get("data", {}).get("success", False))


def reread_status(key: str) -> Optional[str]:
    data = run_twg(["jira", "workitem", "query", "--jql", f"key = {key}"])
    issues: list[dict[str, Any]] = data["data"]["issues"]
    return issues[0]["status"]["name"] if issues else None


def find_all_strings(obj: Any) -> Iterator[str]:
    """Flatten every string value out of an arbitrary JSON blob (ADF comment
    bodies are deeply nested doc/paragraph/text trees) so a substring search
    doesn't need to know that schema.
    """
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from find_all_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from find_all_strings(v)


def has_prior_leave_as_is(key: str, pr_url: str) -> bool:
    """SKILL.md step 6: don't re-ask if this exact PR URL already got a
    'left as is' answer from a prior run.
    """
    try:
        data = run_twg(["jira", "workitem", "comment", "query", "--issue-id", key, "--first", "50"])
    except RuntimeError:
        return False
    for comment in data.get("data", []):
        blob = " ".join(find_all_strings(comment.get("body", {})))
        if BOT_MARKER in blob and pr_url in blob and "left as is" in blob.lower():
            return True
    return False


def cmd_run(args: argparse.Namespace) -> int:
    candidates = load_candidates(first=args.first)
    vocab_issue = check_vocabulary(candidates)
    if vocab_issue:
        print(json.dumps({"error": "vocabulary_mismatch", "message": vocab_issue}, indent=2))
        return 1

    cand_by_key: dict[str, Candidate] = {c["key"]: c for c in candidates}
    keys = list(cand_by_key.keys())

    summary = fetch_context_summary(keys, args.since)
    narrowed = [k for k, rels in summary.items() if any(r.get("count", 0) > 0 for r in rels)]
    full = fetch_context_full(narrowed, args.since) if narrowed else {}

    report: dict[str, list[dict[str, Any]]] = {
        "transitioned": [],
        "needs_question": [],
        "no_change": [],
        "errors": [],
    }

    for key in keys:
        current = cand_by_key[key]
        current_rank = rank_of(current["status"], current["status_category_key"])
        rels: list[dict[str, Any]] = full.get(key, {}).get("relationships", [])
        if not rels:
            continue

        result = classify(key, rels)
        if result["target_rank"] <= current_rank:
            continue

        target_rank = result["target_rank"]
        row: dict[str, Any] = {
            "key": key,
            "old_status": current["status"],
            "evidence_url": (result["evidence"][0].get("url") or result["evidence"][0].get("message", "")[:100])
            if result["evidence"]
            else None,
        }

        if target_rank in (RANK_IN_PROGRESS, RANK_IN_REVIEW):
            if args.dry_run:
                row["would_move_to_rank"] = target_rank
                report["transitioned"].append(row)
                continue
            transition_id, _new_name = find_transition_id(key, target_rank)
            if not transition_id:
                report["errors"].append({**row, "error": "no matching transition found"})
                continue
            ok = apply_transition(key, transition_id)
            if not ok:
                report["errors"].append({**row, "error": "transition call did not report success"})
                continue
            row["new_status"] = reread_status(key)
            report["transitioned"].append(row)

        else:
            confidence = score_done_confidence(result["matched_prs"])
            row["confidence"] = confidence
            if confidence == "high":
                if args.dry_run:
                    row["would_move_to"] = "Done"
                    report["transitioned"].append(row)
                    continue
                transition_id, _new_name = find_transition_id(key, RANK_DONE)
                if not transition_id:
                    report["errors"].append({**row, "error": "no Done transition found"})
                    continue
                ok = apply_transition(key, transition_id)
                if not ok:
                    report["errors"].append({**row, "error": "transition call did not report success"})
                    continue
                row["new_status"] = reread_status(key)
                report["transitioned"].append(row)
            else:
                if has_prior_leave_as_is(key, row["evidence_url"] or ""):
                    row["skipped_reason"] = "already answered 'leave as is' for this PR"
                    report["no_change"].append(row)
                else:
                    report["needs_question"].append(row)

    print(json.dumps(report, indent=2))
    return 0


def cmd_resolve_done(args: argparse.Namespace) -> int:
    decision: Decision = args.decision
    decision_text = "moved to Done" if decision == "moved" else "left as is"
    comment = (
        f"{BOT_MARKER} proposed moving to Done based on {args.pr_url} "
        f"(confidence: {args.confidence}). Decision: {decision_text}."
    )
    run_twg(
        [
            "jira", "workitem", "comment", "create",
            "--issue-id", args.key,
            "--body-format", "markdown",
            "--body", comment,
        ]
    )
    result: dict[str, Any] = {"key": args.key, "decision": decision, "commented": True}
    if decision == "moved":
        transition_id, _ = find_transition_id(args.key, RANK_DONE)
        if not transition_id:
            result["error"] = "no Done transition found"
        else:
            apply_transition(args.key, transition_id)
            result["new_status"] = reread_status(args.key)
    print(json.dumps(result, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_run = sub.add_parser("run", help="Full pipeline: query, gate, classify, apply low-risk + high-confidence moves")
    p_run.add_argument("--dry-run", action="store_true", help="Compute everything, apply nothing")
    p_run.add_argument("--since", default="365d", help="Context lookback window (default: 365d)")
    p_run.add_argument("--first", type=int, default=200, help="Max candidates to load (default: 200)")

    p_resolve = sub.add_parser("resolve-done", help="Record a user answer from step 6 and apply it")
    p_resolve.add_argument("--key", required=True)
    p_resolve.add_argument("--pr-url", required=True)
    p_resolve.add_argument("--confidence", required=True, choices=["medium", "low"])
    p_resolve.add_argument("--decision", required=True, choices=["moved", "left"])

    args = parser.parse_args()
    if args.command == "run":
        return cmd_run(args)
    return cmd_resolve_done(args)


if __name__ == "__main__":
    sys.exit(main())
