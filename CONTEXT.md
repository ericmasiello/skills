# Agent Skills Repo

This repo is the source-of-truth collection of agent skills for Eric's personal machine. Some skills are synced from upstream package sources (tracked in `.skill-lock.json`); others are self-authored or reconciled in from other machines.

## Language

**Legacy skill**:
A skill fully superseded by an equivalent already in this repo — the newer version covers everything it did, sometimes more. Safe to delete outright, no porting needed.
_Avoid_: duplicate, old skill

**Needs-review skill**:
A skill that overlaps with an equivalent in this repo but contains at least one concept, feature, or behavior the newer version dropped or never had. Requires a decision on whether to port the missing piece before the older skill can be discarded.
_Avoid_: partial duplicate

**Work-context skill**:
A skill whose content is coupled to a specific employer's infrastructure (a GitLab project, a Jira project, an internal tool). May legitimately live in this personal repo — being employer-coupled doesn't make a skill legacy — but is tracked separately because it can't be evaluated by the same "does A already cover this" logic used for generic skills.
_Avoid_: studio skill (too narrow — names the current employer's project, not the category)

**External-only skill**:
A skill intentionally left in its original location rather than ported here, because it depends on something (a binary, a script, a project-specific setup) that only exists there.

## Relationships

- A **Legacy skill** and a **Needs-review skill** are both evaluated against a specific skill already present in this repo (the "successor").
- A **Work-context skill** is evaluated on its own terms, not against a successor, unless a generic equivalent happens to exist in this repo.
