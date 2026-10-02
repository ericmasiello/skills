# `setup.sh` also symlinks each skill into `~/.claude/skills` for Claude Code

Claude Code loads user-level skills from `~/.claude/skills/<name>/SKILL.md`, not from `~/.agents/skills`. Until now `setup.sh` didn't touch that directory, so Claude Code only saw the skills someone had linked there by hand (27 relative links of the form `~/.claude/skills/tdd -> ../../.agents/skills/tdd`), and every skill added since was invisible to it.

Decided on: `setup.sh` treats `~/.claude/skills` the way `docs/adr/0009-*.md` treats `~/.agents/skills` — a real directory with each skill symlinked in individually, pointing straight at `<repo>/.agents/skills/<name>`. Symlinks rather than copies, for the same reasons as the rest of `setup.sh`: edits in the repo are live immediately, and a re-run is only needed when a skill is added or removed. Per-entry rather than whole-directory, because the Claude desktop app keeps its own `synced/` folder in `~/.claude/skills` and other tools may install skills there too; none of that should ever land in this repo's working tree.

Details that differ from `~/.agents/skills`:

- Only directories are linked, so stray files like `.DS_Store` stay out. `_studio-shared` has no `SKILL.md` but is linked anyway, because `studio-*` skills read `../_studio-shared/` relative to their own directory.
- `link()` now accepts an existing symlink that resolves to the same place by a different route, so the hand-made relative links are reported `ok` and left alone instead of `SKIP`ped.
- Dangling symlinks in `~/.claude/skills` that point into this repo (directly or via `~/.agents/skills`) are removed, so a deleted or renamed skill stops showing up in Claude Code. Only broken links are removed; real files and links pointing anywhere else are never touched.
- Anything else already at a skill's destination is backed up per `docs/adr/0005-*.md`. A backed-up skill directory still sits inside `~/.claude/skills` and still contains a `SKILL.md`, so Claude Code may list it alongside the new link until it's deleted.

`scripts/verify-setup-symlinks.sh` seeds its scratch `HOME` with a hand-made relative link, a dangling link and a `synced/` folder, then checks that `setup.sh` accepts the first, prunes the second, leaves the third alone and links every skill directory.
