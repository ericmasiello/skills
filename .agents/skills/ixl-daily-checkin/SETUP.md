# IXL Daily Check-In — one-time setup

Run every step below once, before the first real check-in. Nothing here recurs.

## 1. Config

```bash
cp config.local.json.example config.local.json
```

Fill in `children` — must match each child's IXL display name exactly (same names `ixl-weekly-checkin` already uses, if that skill is set up). `config.local.json` is gitignored (`*.local.json`) — never commit it.

## 2. IXL login credentials

```bash
cp ../_ixl-shared/.env.example ../_ixl-shared/.env
```

**Skip this step if `ixl-weekly-checkin` is already set up** — `_ixl-shared/.env` is shared between both skills; one login, not two. Otherwise fill in `IXL_EMAIL`, `IXL_PASSWORD`, and `IXL_PARENT_PASSWORD` (gitignored). See `ixl-weekly-checkin/SETUP.md` step 2 for what each value means — same login flow, same two-stage auth (regular password, then a separate parent "secret word").

## 3. Skylight

This skill calls `skylight_resolve_member` and `skylight_create_chore` — the same MCP tools `skylight-homework` already uses. `opencode/opencode.json`'s `skylight` MCP server is enabled by default in this repo, so no action needed here unless you've disabled it locally. A session started before that server was enabled (or before any config change to it) won't pick up the new tools — restart the session rather than assuming the tools are missing for some other reason. If Skylight is unreachable or errors out when this skill actually runs, that's not a setup failure to chase down here — see SKILL.md Step 2c, which turns that into its own diagnostic reminder for you rather than failing silently.

## 4. macOS Reminders automation permission

The first time this skill's `osascript` call tries to control Reminders.app, macOS may prompt for an Automation permission grant (System Settings → Privacy & Security → Automation) for whatever process is running it. Grant it — without it, `make new reminder` fails silently or hangs instead of creating anything. Confirmed during this skill's own build that **creating** a reminder this way is fast and reliable once that permission is granted; reading or filtering reminders via AppleScript is not (see SKILL.md Step 2b) — if setup ever needs to double-check a reminder landed, open Reminders.app and look, don't script it.

## 5. Install dependencies

```bash
nvm use   # picks up the .nvmrc here; skip if your shell is already on Node 24+
npm install
```

(run inside this skill's directory). `npm run typecheck` runs `tsc --noEmit` afterward if you want to verify types after editing.

## 6. Trigger it

**On demand:** just ask — "run my IXL daily check-in."

**Scheduled (automatic):** this skill runs on three different schedules, since Saturday and Sunday both need a later time and different per-day logic than the Monday-Friday morning check (see SKILL.md's Step 1 for why). Paste each of these into an OpenChamber session (it has the `openchamber` tool and will call `schedule.create` for you) — substitute `<path-to-your-clone>`:

> Create an OpenChamber scheduled task named "IXL Daily Check-In (weekdays)" with prompt "Run the ixl-daily-checkin skill and report results.", weekly on Monday,Tuesday,Wednesday,Thursday,Friday, time 08:20, timezone America/New_York, model cimpress-ai-gateway/eu.anthropic.claude-sonnet-5, directory `<path-to-your-clone>`.

> Create an OpenChamber scheduled task named "IXL Daily Check-In (Saturday)" with prompt "Run the ixl-daily-checkin skill and report results.", weekly on Saturday, time 12:00, timezone America/New_York, model cimpress-ai-gateway/eu.anthropic.claude-sonnet-5, directory `<path-to-your-clone>`.

> Create an OpenChamber scheduled task named "IXL Daily Check-In (Sunday)" with prompt "Run the ixl-daily-checkin skill and report results.", weekly on Sunday, time 12:00, timezone America/New_York, model cimpress-ai-gateway/eu.anthropic.claude-sonnet-5, directory `<path-to-your-clone>`.

Three separate tasks rather than one with internal day-branching — each one's own `schedule.list` entry, run history, and on/off toggle stays independent, and the weekday one can run at a completely different time than the weekend two without any conditional logic needed inside the skill itself (`collect-daily-data.ts` already derives the right mode from the day it's actually run on, so there's no "which schedule am I" flag to pass through).

Confirm all three landed with `schedule.list`, then run each once manually with `schedule.run` before trusting the cron — the very first scheduled run of each is also your test of the fully-unattended path (IXL login, Skylight chore creation, and the Reminders automation permission from step 4) for that day's logic specifically.
