# IXL Weekly Check-In — one-time setup

Run every step below once, before the first real check-in. Nothing here recurs.

## 1. Config

```bash
cp config.local.json.example config.local.json
```

Fill in `children` (must match each child's tab name in the sheet exactly — there's no shared "Weekly Log" tab, each kid has their own) and `sheetId` (from the tracker sheet's URL). `config.local.json` is gitignored (`*.local.json`) — never commit it.

## 2. Bootstrap the IXL login

Real browser, headed, so a human (Eric) completes the actual login:

```bash
playwright-cli open https://www.ixl.com/login --browser=chrome --persistent --headed
```

Log in in the window that opens. Once it lands on the signed-in dashboard (not still on a login/signin URL):

```bash
playwright-cli state-save ixl-auth.local.json
```

This file is gitignored (`*.local.json`) — it holds session cookies, not a password, but treat it as a credential regardless: never commit it, never paste its contents anywhere.

## 3. Self-heal login (optional but recommended)

Only needed for the scheduled/unattended path — an on-demand run where Eric is present can just re-run step 2 if the session ever goes stale.

```bash
cp .env.example .env
```

Fill in `IXL_EMAIL`, `IXL_PASSWORD`, and `IXL_PARENT_PASSWORD` in `.env` (gitignored — add it to the repo's root `.gitignore` if it isn't already there; check first). All three are needed, not just the first two — logging in as the parent is a two-stage flow: the regular username/password form, then a "Who are you? → Parent" modal that asks for a separate **secret word** (`IXL_PARENT_PASSWORD`). With all three set, [SKILL.md](SKILL.md)'s Step 1 can re-log-in automatically when the saved session expires, and re-save a fresh one. Leave all three blank to disable this — an expired session then just stops with an actionable message instead of guessing.

## 4. Google Sheets service account

The update script needs write access to the tracker sheet without ever holding your personal Google login:

1. In Google Cloud Console: create (or reuse) a project, enable the **Google Sheets API**, then create a **service account** and download its JSON key.
2. Store that JSON key file **outside this repo entirely** — e.g. `~/.secrets/ixl-sheets-sa.json`. It never gets a `.local.json` name or a place inside this skill's directory; the `*.local.json` gitignore rule is a safety net, not the actual boundary here.
3. Open the tracker sheet, click **Share**, and add the service account's `client_email` (visible in the JSON key, looks like `<name>@<project>.iam.gserviceaccount.com`) as an **Editor**. This step is the one people forget — without it, every write call fails with a permissions error no matter how correct the credentials are.
4. In `.env`, set `GOOGLE_SHEETS_CREDENTIALS` to the **path** from step 2 — never the JSON contents.

## 5. Install the update script's dependencies

The script is TypeScript (`update-weekly-log.ts`), run directly by Node's own type-stripping — no `ts-node`, no build step, no compiled output to keep in sync. It needs Node 24+; a `.nvmrc` pins that in this directory:

```bash
nvm use   # picks up the .nvmrc here; skip if your shell is already on Node 24+
npm install
```

(run inside this skill's directory — `package.json` here is scoped to this one script, not the whole repo). `npm run typecheck` runs `tsc --noEmit` if you want to verify types after editing the script — it's a real check, `erasableSyntaxOnly` in `tsconfig.json` keeps the source honest about what Node can actually strip.

## 6. Trigger it

**On demand:** just ask — "run my Sunday IXL check-in."

**Scheduled (Sunday, automatic):** paste this into an OpenChamber session (it has the `openchamber` tool and will call `schedule.create` for you) — substitute `<path-to-your-clone>`:

> Create an OpenChamber scheduled task named "IXL Weekly Check-In" with prompt "Run the ixl-weekly-checkin skill and report results.", weekly on Sunday, time 09:00, timezone America/New_York, model cimpress-ai-gateway/eu.anthropic.claude-sonnet-5, directory `<path-to-your-clone>`.

No routed/persistent-thread mode needed here (unlike `gitlab-ci-watch`) — each Sunday's run is a fresh, self-contained session with nothing to carry over from the prior week; the tracker sheet is the continuity, not a chat thread. Confirm it landed with `schedule.list`, then run it once manually with `schedule.run` before trusting the cron — the very first scheduled run is also your test of the self-heal login path from step 3, since it's fully unattended.
