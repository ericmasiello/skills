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
    (13, "em dash", re.compile(r"—")),
    (14, "mid-sentence colon", re.compile(r"\w:\s+\w")),
    (15, "boldface", re.compile(r"\*\*[^*]+\*\*")),
    (17, "title-case heading", re.compile(r"^#{1,6}\s+(?:[A-Z][a-z]+\s+){1,}[A-Z][a-z]+\s*$")),
    (18, "decorative emoji", re.compile(r"[\U0001F300-\U0001FAFF]")),
    (19, "curly quote", re.compile(r"[“”‘’]")),
    (20, "chatbot phrase", re.compile(r"\b(I hope this helps|Let me know if|Of course!|Certainly!|Found the smoking gun!)\b", re.I)),
    (21, "cutoff disclaimer", re.compile(r"\b(while specific details are limited|details are limited)\b", re.I)),
    (22, "sycophancy", re.compile(r"\b(great question|you're absolutely right)\b", re.I)),
    (23, "filler phrase", re.compile(r"\b(in order to|due to the fact that|it is important to note that)\b", re.I)),
    (24, "hedging stack", re.compile(r"\b(could potentially|possibly be argued|might possibly)\b", re.I)),
    (31, "fancy synonym", re.compile(r"\b(utilize|leverage|facilitate|numerous|in the event that)\b", re.I)),
)


def findings(text: str) -> list[dict[str, object]]:
    output: list[dict[str, object]] = []
    for line_number, line in enumerate(text.splitlines(), 1):
        for rule, label, pattern in CHECKS:
            match = pattern.search(line)
            if match:
                output.append(
                    {
                        "rule": rule,
                        "kind": label,
                        "line": line_number,
                        "evidence": match.group(0),
                    }
                )
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
