# Agent Skills Repo

This repo is the source-of-truth collection of agent skills and Opencode runtime configuration. Some skills are synced from upstream package sources (tracked in `.skill-lock.json`); others are self-authored or reconciled in from other machines. The contents are symlinked into `~/.agents` and `~/.config/opencode` — see `docs/adr/0002-*` and `0003-*`.

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

**User-scope skill**:
A skill installed at `~/.agents/skills/` (this repo). Available to every opencode session on this machine, regardless of which project it's run from.
_Avoid_: personal skill, global skill

**Opencode-scope skill**:
A skill installed at opencode's own global skill directory, `~/.config/opencode/skills/`. Distinct from a User-scope skill even though both are machine-wide — this repo deliberately uses the User-scope convention instead.

**Project-scope skill**:
A skill that lives inside a specific project's own repo (e.g. a `.opencode/skill/` directory inside `~/Sites/studio/`). Only available when opencode is run from within that project.
_Avoid_: local skill, repo skill

**Companion agent**:
A subagent persona under `opencode/agents/` that a skill dispatches by name via `task(subagent_type="<name>", ...)`. The skill is broken without it — it's a required part of the skill's implementation, not an optional helper, even though the two files live in different directories and are installed by different mechanisms.
_Avoid_: sub-skill, helper agent

## Relationships

- A **Legacy skill** and a **Needs-review skill** are both evaluated against a specific skill already present in this repo (the "successor").
- A **Work-context skill** is evaluated on its own terms, not against a successor, unless a generic equivalent happens to exist in this repo.
- Scope (**User-scope** / **Opencode-scope** / **Project-scope**) is orthogonal to the Legacy/Needs-review/Work-context/External-only categories — it answers "where does this live and who can see it," not "should this exist here at all."
- A **Companion agent** is discovered by reading the skill that depends on it, never assumed from a filename match — the pairing is only visible in the `task(subagent_type=...)` call.
