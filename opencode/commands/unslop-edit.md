---
description: Run the unslop Editor Agent audit-and-patch pipeline on the supplied text.
---

Run the `unslop` skill in Editor Agent mode. Do not rewrite the input in one
pass. Freeze and line-number the draft, run
`.agents/skills/unslop/scripts/mechanical_audit.py`, then dispatch the four
hidden auditors `unslop-content-auditor`, `unslop-language-auditor`,
`unslop-structure-auditor`, and `unslop-soul-auditor` in parallel. Merge their
structured findings into a 33-row coverage ledger, apply only accepted minimal
patches, and repeat the mechanical and specialist audits. Finish with the
ledger and explicit exceptions. A rule that is absent from the ledger is a
failed run.
