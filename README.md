# ericmasiello-skills

Eric's personal agent skills collection and Opencode runtime configuration. The folders are symlinked into `~/.agents` and `~/.config/opencode`. See `CONTEXT.md` for the vocabulary this repo uses (Legacy / Needs-review / Work-context / External-only / User-scope / Companion agent) and `docs/adr/` for why it's laid out this way.

## Layout

```
.
├── .agents/
│   ├── skills/          # the skills themselves (one dir per skill, SKILL.md inside)
│   ├── README.md        # full catalog of skills, grouped by purpose
│   └── .skill-lock.json # tracks which skills sync from upstream vs. self-authored
├── opencode/
│   ├── agents/          # custom opencode agent personas
│   ├── commands/        # custom opencode slash commands
│   ├── opencode.json
│   └── oh-my-openagent.json
├── docs/
│   ├── adr/             # architecture decision records for this repo
│   └── agents/          # how skills should use this repo's issue tracker, labels, domain docs
├── CONTEXT.md           # glossary for this repo's own domain
├── AGENTS.md            # pointers agents read before acting in this repo
└── setup.sh             # idempotent installer — symlinks .agents/ and opencode/ into place
```

## Setup

```sh
./setup.sh
```

Symlinks `.agents` → `~/.agents` and each `opencode/*` target → `~/.config/opencode/*`. Safe to re-run; existing correct symlinks are left alone, anything else in the way is reported and skipped rather than clobbered. `opencode.json` references `${STITCH_API_KEY}` via `{env:STITCH_API_KEY}` — export that in your shell profile first (see `docs/adr/0004-*.md`).

## Finding a skill

Start at [`.agents/README.md`](.agents/README.md) — a full catalog grouped by purpose (planning & delivery, principles, testing & characterization, code quality & review, productivity & docs, work-context, personal). Each skill's own `SKILL.md` is the source of truth for how to use it.

## Contributing to this repo

Issues and specs live in GitHub Issues on this repo (`gh` CLI) — see `docs/agents/issue-tracker.md`. Triage uses a five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) — see `docs/agents/triage-labels.md`. Domain decisions go in `CONTEXT.md` and `docs/adr/` — see `docs/agents/domain.md`.
