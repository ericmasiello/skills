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

## Prerequisites

Some skills and `opencode/oh-my-openagent.json` settings shell out to external CLIs. Install these before relying on the corresponding skill:

| CLI | Used by | Install |
|-----|---------|---------|
| [`gh`](https://cli.github.com) | Issue tracker (`docs/agents/issue-tracker.md`), `/triage`, `/to-spec`, `/to-tickets` | `brew install gh` |
| [`td`](https://github.com/Doist/todoist-cli) (`@doist/todoist-cli`) | `todoist-cli` skill | `brew install todoist-cli` |
| [`twg`](https://developer.atlassian.com/cloud/twg-cli/) (Teamwork Graph CLI) | `vista-atlassian` skill (Vistaprint work-context) | `curl -fsSL --retry 2 https://teamwork-graph.atlassian.com/cli/install \| bash` then `twg setup` (interactive OAuth login — can't be scripted headlessly) |
| [`playwright-cli`](https://github.com/microsoft/playwright-cli) (`@playwright/cli`) | Browser automation — `browser_automation_engine.provider` in `opencode/oh-my-openagent.json` is set to `playwright-cli` | `npm install -g @playwright/cli@latest` |
| [`glab`](https://gitlab.com/gitlab-org/cli) | GitLab work — `gitlab-ci-watch`, `studio-*` skills, `address-pr-feedback` | `brew install glab` |

## Setup

```sh
./setup.sh
```

Symlinks `~/.agents` → this repo's `.agents`, and each `~/.config/opencode/*` target → the matching `opencode/*` file here. Safe to re-run; existing correct symlinks are left alone, and a file or directory already at the destination is backed up (moved aside with a timestamped `.bak.<UTC-timestamp>` suffix, never deleted) before the symlink replaces it — see `docs/adr/0005-*.md`. `opencode.json` references `${STITCH_API_KEY}` via `{env:STITCH_API_KEY}` — export that in your shell profile first (see `docs/adr/0004-*.md`).

## Restricted repos & worktrees

`setup-ericmasiello-skills` can configure a repo whose root file or `docs/` is restricted (CODEOWNERS-gated, shared with coworkers who don't use these skills) by writing its usual output to a personal sidecar instead, linked in via local-only symlinks — see [`docs/adr/0006-*.md`](docs/adr/0006-setup-ericmasiello-skills-sidecar-for-restricted-repos.md). Those symlinks are untracked filesystem state, so **every new worktree or clone of an already-configured restricted repo needs one run of [`relink.sh`](.agents/skills/setup-ericmasiello-skills/relink.sh)** before its `docs/agents`, `docs/adr`, or root context doc will resolve there — no arguments needed if your working directory is already inside that worktree.

## Scheduled tasks

Most skills are invoked directly — this repo's setup ends at `./setup.sh`. A few are built to run on a recurring cadence instead, and for those, adding the `SKILL.md` isn't enough: they also need an [OpenChamber](https://docs.openchamber.dev) scheduled task pointed at them. Scheduled tasks are OpenChamber runtime state, not files in this repo, so each machine running OpenChamber needs its own set up once — `setup.sh` can't do this part for you.

| Skill | Needs |
|-------|-------|
| [`gitlab-ci-watch`](.agents/skills/gitlab-ci-watch/SKILL.md) | A recurring OpenChamber scheduled task — see prompt below |

### Setting up `gitlab-ci-watch`

OpenChamber always starts a brand-new session per scheduled run — there's no setting to reuse one. The skill's **routed mode** works around this: each run checks `~/.cache/gitlab-ci-watch/session.json` for a still-active thread and sends into it, only starting a fresh one if that thread was archived — see [`gitlab-ci-watch/SKILL.md`](.agents/skills/gitlab-ci-watch/SKILL.md#running-as-a-persistent-thread-routed-mode) for the exact procedure. Tradeoff: you still get two "session finished" notifications per run — one from the outer routing session, one from the actual report shortly after.

Paste this into an OpenChamber session (it has the `openchamber` tool and will call `schedule.create` for you) — substitute `<path-to-your-clone>` with the absolute path to your local checkout of this repo:

> Create an OpenChamber scheduled task named "GitLab CI Watch" with prompt "Route the gitlab-ci-watch check into the persistent thread.", cron schedule `*/15 9-19 * * 1-5`, timezone `America/New_York`, model `cimpress-ai-gateway/eu.anthropic.claude-sonnet-5`, directory `<path-to-your-clone>`.

Adjust the cron expression, timezone, or model to taste — the cadence above is every 15 minutes, weekdays 9am–7pm ET, which was this skill's own POC default. Confirm it landed with `schedule.list`, then trigger it once manually with `schedule.run` before trusting the cron.

Prefer a fresh session every run instead? Swap the prompt for `"Run the gitlab-ci-watch skill and report results."` — that's direct mode, no persistent thread, no double notification.

## Finding a skill

Start at [`.agents/README.md`](.agents/README.md) — a full catalog grouped by purpose (planning & delivery, principles, testing & characterization, code quality & review, productivity & docs, work-context, personal). Each skill's own `SKILL.md` is the source of truth for how to use it.

## Contributing to this repo

Issues and specs live in GitHub Issues on this repo (`gh` CLI) — see `docs/agents/issue-tracker.md`. Triage uses a five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) — see `docs/agents/triage-labels.md`. Domain decisions go in `CONTEXT.md` and `docs/adr/` — see `docs/agents/domain.md`. Changes ship on a branch and go through a PR, never directly on `main` — one branch per task, not per skill — see `docs/agents/branching.md`.
