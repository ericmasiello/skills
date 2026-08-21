# _config

Sidecar storage for `setup-ericmasiello-skills`. When that skill runs against a repo whose root file or `docs/` is restricted (CODEOWNERS-gated, shared with coworkers who don't use these skills), it writes `setup-matt-pocock-skills`' usual output here instead of into the target repo, under `projects/<key>/`, and links it back in via local-only symlinks. See `docs/adr/0006-*.md` for why, and `.agents/skills/setup-ericmasiello-skills/SKILL.md` for the mechanics.

`projects/` doesn't exist until the first restricted repo is set up — created lazily, one directory per repo, never pre-scaffolded.

```
_config/
└── projects/
    └── <key>/                # normalized git remote, or a path slug when there's none
        ├── project.json       # {"key", "remote", "worktree", "restricted", "createdAt", "updatedAt"}
        ├── agents/
        │   ├── issue-tracker.md
        │   ├── domain.md
        │   └── triage-labels.md
        ├── CONTEXT.md
        └── adr/
            └── 0001-....md
```
