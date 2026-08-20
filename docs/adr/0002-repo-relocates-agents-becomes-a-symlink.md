# Repo relocates to ~/Sites/ericmasiello-skills; ~/.agents becomes a symlink, not the repo

This repo used to be checked out directly at `~/.agents`, so "installing" skills required no step at all — the repo simply *was* the target location. Adding opencode-specific config (`opencode/agents`, `opencode/commands`, `opencode/opencode.json`) that must also land under `~/.config/opencode/` broke that assumption: one checkout path can't simultaneously be `~/.agents` and `~/.config/opencode`.

Decided to move the checkout to `~/Sites/ericmasiello-skills` (alongside Eric's other project checkouts) and have `setup.sh` symlink `~/.agents` → `<repo>/.agents` and each `~/.config/opencode/*` target → `<repo>/opencode/*`. Rejected keeping the repo at `~/.agents` and symlinking outward only to `~/.config/opencode`, since that special-cases one target over the other for no reason once a second target exists.

Consequence: `~/.agents` is a symlink on this machine, not the git working tree. Run `git` from `~/Sites/ericmasiello-skills`, not `~/.agents`.
