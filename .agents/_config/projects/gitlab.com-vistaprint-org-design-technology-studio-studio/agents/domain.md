# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root: it points at one `CONTEXT.md` per context. Read each one
  relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. Also check
  `<package>/docs/adr/` for context-scoped decisions (e.g. `libs/feature/previews/docs/adr/`).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a multi-context repo (Studio monorepo — `apps/`, `libs/<type>/<name>`, `core/`):

```
/
├── CONTEXT-MAP.md                     ← symlink, see "Restricted-repo note" below
├── docs/adr/                          ← system-wide decisions (symlink)
└── libs/<type>/<name>/
    ├── CONTEXT.md                     ← context-specific glossary
    └── docs/adr/                      ← context-specific decisions
```

Contexts map to package boundaries: each `apps/<app>` or `libs/<type>/<name>` package (identified by
its own `package.json`) is a candidate context. Not every package needs a `CONTEXT.md` — only ones
where `/domain-modeling` has actually resolved terminology or decisions.

## Restricted-repo note (this repo only)

This repo's root files and `docs/` are CODEOWNERS-gated and shared with coworkers who don't use these
skills (see `setup-ericmasiello-skills`). `CONTEXT-MAP.md`, `docs/adr/`, and this `docs/agents/`
directory are **local-only symlinks** into a personal sidecar at:

```
~/Sites/ericmasiello-skills/.agents/_config/projects/gitlab.com-vistaprint-org-design-technology-studio-studio/
```

registered in `.git/info/exclude` (never `.gitignore`) so they never show up in `git status` or get
committed.

**When `/domain-modeling` creates its first per-context `CONTEXT.md`** (e.g.
`libs/feature/previews/CONTEXT.md`), don't write it directly into the tracked package folder. Instead:

1. Create the real file under the sidecar, mirroring the package path:
   `<sidecar>/contexts/libs-feature-previews/CONTEXT.md`.
2. Symlink it into place: `libs/feature/previews/CONTEXT.md` → `<sidecar>/contexts/libs-feature-previews/CONTEXT.md`.
3. Append the tracked-repo path (e.g. `/libs/feature/previews/CONTEXT.md`) to `.git/info/exclude`.

Same pattern for any context-scoped `docs/adr/` that appears outside the root.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test
name), use the term as defined in the relevant context's `CONTEXT.md`. Don't drift to synonyms the
glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language
the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
