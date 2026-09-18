---
description: Run the unslop Editor Agent audit-and-patch pipeline on the supplied text.
---

Run the `unslop` skill in Editor Agent mode. Do not rewrite the input in one
pass. Pass the raw file path directly without pre-numbering (the read tool numbers
lines automatically). Run `.agents/skills/unslop/scripts/mechanical_audit.py`, then
dispatch the four hidden auditors `unslop-content-auditor`, `unslop-language-auditor`,
`unslop-structure-auditor`, and `unslop-soul-auditor` in parallel, instructing them
to emit their coverage summary first and use canonical rule names `Rule: <number> (<name>)`.
Merge their structured findings into a 33-row coverage ledger, apply only accepted minimal
patches, run a diff regression check on added lines, and repeat the mechanical and
specialist audits. Finish with the ledger and explicit exceptions. A rule that is absent
from the ledger is a failed run.
