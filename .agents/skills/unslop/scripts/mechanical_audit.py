#!/usr/bin/env python3
"""Report deterministic unslop findings as JSON lines.

This is deliberately a linter, not a rewriter. The Editor Agent owns all
changes and must reconcile these findings with the specialist audits.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

CHECKS: tuple[tuple[int, str, re.Pattern[str]], ...] = (
    (7, "AI vocabulary", re.compile(r"\b(additionally|crucial|delve|enduring|enhance|fostering|garner|interplay|intricate|landscape|pivotal|showcase|tapestry|testament|underscore|vibrant)\b", re.I)),
    (8, "fancy ways to say 'is'", re.compile(r"\b(serves as|stands as|boasts|features|sits with|translate into)\b", re.I)),
    (9, "false contrast", re.compile(r"\b(not just|not merely|not only|rather than just|rather than only)\b", re.I)),
    (13, "em/en dash", re.compile(r"[—–‒―]")),
    (14, "mid-sentence colon", re.compile(r"\w:\s+\w")),
    (15, "boldface overuse", re.compile(r"\*\*[^*]+\*\*")),
    (18, "decorative emoji", re.compile(r"[\U0001F300-\U0001FAFF]")),
    (19, "curly quote", re.compile(r"[“”‘’]")),
    (20, "chatbot phrase", re.compile(r"\b(I hope this helps|Let me know if|Of course!|Certainly!|Found the smoking gun!)\b", re.I)),
    (21, "cutoff disclaimer", re.compile(r"\b(while specific details are limited|details are limited)\b", re.I)),
    (22, "sycophancy", re.compile(r"\b(great question|you're absolutely right)\b", re.I)),
    (23, "filler phrase", re.compile(r"\b(in order to|due to the fact that|it is important to note that)\b", re.I)),
    (24, "hedging stack", re.compile(r"\b(could potentially|possibly be argued|might possibly)\b", re.I)),
    (26, "abstract metaphor noun", re.compile(r"\b(substrate|wedge|vector|locus|vantage|nexus|primitive|harness|surface|bedrock|scaffolding|modality|paradigm|gold-plating|ratchet|evacuate|endgame|north star|flywheel)\b", re.I)),
    (31, "fancy synonym", re.compile(r"\b(utilize|leverage|facilitate|numerous|in the event that)\b", re.I)),
)


def _check_title_case_heading(line: str) -> list[tuple[int, str]]:
    if not line.startswith("#"):
        return []
    heading_match = re.match(r"^#{1,6}\s+(.*)$", line)
    if not heading_match:
        return []
    raw_title = heading_match.group(1).strip()

    prefix_pattern = r"^(?:\d+(?:\.\d+)*\.?|Appendix\s+[A-Za-z0-9]+:?|Chapter\s+\d+:?|Section\s+\d+:?)\s*"
    trimmed_title = re.sub(prefix_pattern, "", raw_title, flags=re.I).strip()
    if not trimmed_title:
        return []

    segments = re.split(r"[:\-\u2014\u2013]\s+", trimmed_title)
    for seg in segments:
        seg = seg.strip()
        words = [w for w in re.findall(r"[A-Za-z0-9]+(?:'[a-z]+)?", seg) if w]
        if len(words) >= 2:
            capped = [w for w in words if w[0].isupper() and any(c.islower() for c in w)]
            if len(capped) >= 2 and len(capped) >= len(words) - 1:
                col = line.find(raw_title) + 1
                return [(col, raw_title)]
    return []


def findings(text: str) -> list[dict[str, object]]:
    output: list[dict[str, object]] = []
    in_code_block = False

    for line_number, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            continue
        if in_code_block:
            continue

        is_heading = stripped.startswith("#")
        is_table = stripped.startswith("|")

        for col, evidence in _check_title_case_heading(line):
            output.append({
                "rule": 17,
                "kind": "title-case heading",
                "line": line_number,
                "column": col,
                "evidence": evidence,
            })

        for rule, label, pattern in CHECKS:
            if rule == 15:
                if is_table:
                    continue
                for match in pattern.finditer(line):
                    span_start, span_end = match.span()
                    evidence_text = match.group(0)[2:-2]
                    after = line[span_end:].lstrip()
                    prefix = line[:span_start].strip()
                    is_lead_in = (span_start == 0 or prefix in ("-", "*", "+") or re.match(r"^\d+\.$", prefix))
                    if is_lead_in and (after.startswith((".", ":")) or evidence_text.endswith((".", ":"))):
                        continue
                    output.append({
                        "rule": rule,
                        "kind": label,
                        "line": line_number,
                        "column": match.start() + 1,
                        "evidence": match.group(0),
                    })
                continue

            if rule == 14:
                if is_heading:
                    continue
                sanitized = re.sub(r"\[(?:PLACEHOLDER|CONFIRM):[^\]]*\]", lambda m: " " * len(m.group(0)), line, flags=re.I)
                sanitized = re.sub(r"https?://\S+", lambda m: " " * len(m.group(0)), sanitized)
                for match in pattern.finditer(sanitized):
                    output.append({
                        "rule": rule,
                        "kind": label,
                        "line": line_number,
                        "column": match.start() + 1,
                        "evidence": match.group(0),
                    })
                continue

            for match in pattern.finditer(line):
                output.append({
                    "rule": rule,
                    "kind": label,
                    "line": line_number,
                    "column": match.start() + 1,
                    "evidence": match.group(0),
                })

    return output


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {Path(sys.argv[0]).name} FILE", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    try:
        text = path.read_text()
    except OSError as error:
        print(f"cannot read {path}: {error}", file=sys.stderr)
        return 2
    results = findings(text)
    for finding in results:
        print(json.dumps(finding, ensure_ascii=False))
    return 1 if results else 0


if __name__ == "__main__":
    raise SystemExit(main())
