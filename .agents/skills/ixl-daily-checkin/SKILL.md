---
name: ixl-daily-checkin
description: "Check whether each kid cleared the daily IXL time floor (Mon-Fri same-morning, Sat/Sun treated as one 15-minute weekend unit), and if not, drop a Skylight catch-up chore on their day plus an Apple Reminder so Eric follows up. Use when the user says 'run my IXL daily check-in', 'did the kids do their IXL today', or as the scheduled daily/weekend prompt."
---

# IXL Daily Check-In

A same-day pulse check, distinct from `ixl-weekly-checkin`'s Sunday rollup: did each kid actually spend enough time in IXL today, and if not, (a) give them a dated Skylight chore to close the gap and (b) put a durable reminder in front of Eric to talk to them about it. First run ever? See [SETUP.md](SETUP.md) first — don't attempt the steps below cold, especially the macOS Reminders permission gotcha.

## Config

Read `config.local.json` in this skill's directory. Missing? Copy `config.local.json.example` to `config.local.json`, ask the user to fill in real values, then continue — this file is gitignored (`*.local.json`) and must never be committed. It carries `children` (names, matching their IXL display name exactly, same list `ixl-weekly-checkin` uses).

## Step 1: Collect each child's decision

```bash
nvm use   # picks up the .nvmrc here if your shell isn't already on Node 24+
node --env-file=../_ixl-shared/.env collect-daily-data.ts <child>
```

Run once per name in `config.local.json`, in parallel. No `--date` flag in normal use — the script reads today's real date and derives everything from it:

- **Mon-Fri**: checks today alone against a 15-minute target.
- **Sat**: checks today alone against 15 minutes too, **except** if literally zero minutes are logged, which reports `action: "skip"` instead of a shortfall. The weekend is treated as one unit (we don't know which day the kids will practice), so no practice yet on Saturday isn't a miss. If they did *some* practice but under 15, it's a real shortfall, handled exactly like a weekday.
- **Sun**: checks Saturday + Sunday **summed together** against the same 15-minute target (the weekend is one day's worth of practice, not two). A Saturday that already cleared 15 passes; a partial Saturday only needs the remainder; a skipped Saturday means Sunday owes the full 15. No skip-if-zero exception here — Sunday is the last chance before the week moves on.

The script prints one JSON `Decision` object per call: `mode`, `dateRange`, `totalMinutes`, `target` (`null` on a skip), `shortfallMinutes` (already rounded up to the nearest 5 — e.g. a 3-minute or 4-minute gap both round up to 5), and `action` (`"ok"` | `"shortfall"` | `"skip"`).

If the script throws instead of printing JSON — wrong secret word, IXL demands a CAPTCHA/2FA challenge, or `/signin`'s page markup changed — stop here and report the error plainly, same as `ixl-weekly-checkin`'s Step 1. No UI fallback; a human needs to check the account directly.

## Step 2: Act on each child's decision

**`action: "ok"`** — nothing to do. Note it in the final report and move on.

**`action: "skip"`** — no Skylight chore and no Apple Reminder (the weekend's 15 minutes may still land on Sunday), but say so explicitly in the report (e.g. "Hunter: Saturday, 0 minutes logged yet — skipped per the flexible-Saturday rule") so a quiet report isn't mistaken for "checked and fine."

**`action: "shortfall"`** — attempt **a**, then always do **b** regardless of how **a** went, then **c** only if **a** failed:

**a. Skylight catch-up chore**, dated today, for this child only:

```
skylight_resolve_member(name=<child>) -> category_id
skylight_create_chore(summary="Do <shortfallMinutes> more minutes of IXL", category_id=<category_id>, start=<today's date>)
```

Same per-kid dated-chore primitive `skylight-homework` uses (not `skylight_create_task` — that's the undated, unassigned task-box item). "Today" is the actual run date, not the date `collect-daily-data.ts` checked against for Sunday's combined window — the chore always lands on today, not Saturday.

**`skylight_resolve_member` can return more than one match for a single first name** — confirmed live: resolving "Hunter" returned both his own category and a shared "Avery & Hunter" category (the name is a substring of both labels). Use the member whose `label` **exactly** matches the child's name (case-insensitive) — never the shared/combined one, even if it sorts first. If no returned member is an exact label match, that's genuinely ambiguous — treat it as a Step 2a failure (see below) rather than guessing which one to use.

**Treat any failure here as data for Step 2c, not a reason to stop** — a thrown error, a tool that isn't available at all, `skylight_resolve_member` returning no match for this child, or any response shape that doesn't carry back a usable chore. Capture which call failed and its exact error/output before moving on; Eric only ever sees that detail through Step 2c, so losing it here means the failure is invisible.

**b. Apple Reminder for Eric**, due today, so there's a durable follow-up outside this chat (a desktop push notification was explicitly ruled out — too easy to miss or swipe away):

```bash
osascript -e '
set targetDate to (current date)
set hours of targetDate to 16
set minutes of targetDate to 0
set seconds of targetDate to 0
tell application "Reminders"
    make new reminder with properties {name:"Talk to <child> about short IXL time (<totalMinutes> of <target> min)", body:"<mode> check, <dateRange.start> to <dateRange.end>. Catch-up chore for <shortfallMinutes> more minutes already added to Skylight for today.", due date:targetDate}
end tell'
```

Substitute the child's actual name and this call's real numbers — **never leave the placeholders literal**. 4pm is a sane default landing time (after school, before the evening gets away); adjust the `hours`/`minutes` lines if Eric asks for a different time, but don't ask by default.

**Only `make new reminder` is proven reliable here** — confirmed live during this skill's own build. Never add a `get`/`delete`/`whose`-filtered AppleScript call against Reminders to this flow (not even to "verify it worked" or clean up a mistake): any filtered query against the Reminders app hung indefinitely in testing, even scoped to one list and one exact name, while plain creation returned in under a second every time. If a reminder genuinely needs fixing, that's a manual edit in the Reminders app, not a scripted follow-up call.

**c. Only if Step 2a failed** — a second, separate Apple Reminder, also due today, so a broken Skylight integration gets its own durable follow-up instead of silently riding along inside the "talk to the kid" one above:

```bash
osascript -e '
set targetDate to (current date)
set hours of targetDate to 16
set minutes of targetDate to 0
set seconds of targetDate to 0
tell application "Reminders"
    make new reminder with properties {name:"IXL daily check-in: Skylight chore failed for <child>", body:"Attempted at <ISO timestamp of this run>. Failed call: <skylight_resolve_member or skylight_create_chore>. Error/output: <exact error text or tool response>. Chore that never got created: \"Do <shortfallMinutes> more minutes of IXL\" for <child>, dated <today's date>.", due date:targetDate}
end tell'
```

This is deliberately a second reminder, not a longer body appended to Step 2b's — Eric asked for a distinct action item to go investigate the integration, separate from the one about talking to the kid, so the two stay separable (and markable-done independently) in his Reminders list. Fill in the real error text verbatim, not a paraphrase — the whole point is to hand back enough to debug without re-running anything.

## Step 3: Report

One line per child: the mode checked, minutes logged vs. target (or "skipped — 0 logged" for a Saturday skip), and whether a chore + reminder went out — and if the chore failed, say so plainly here too, not just in the Step 2c reminder. Keep it scannable — this is a daily routine, not a weekly deep-dive like `ixl-weekly-checkin`'s report.

## Open gaps this skill surfaces, never silently resolves

- **A snow day, sick day, or any other day with no school isn't detected** — the weekday path has no concept of "there was nothing to practice for," so an absence reads identically to a missed check-in. If this fires on a day that shouldn't count, that's a manual skip for now.
- **The Reminder's due time (4pm) is a fixed guess, not derived from anything** — it assumes "after school" without actually knowing the school's dismissal time or either kid's actual schedule.
- **Reminders.app's AppleScript dictionary cannot be read or filtered reliably from this skill** (see Step 2b) — there is no scripted way to confirm a reminder was actually created, re-fetch it, or clean one up; "the `osascript` call didn't throw" is the only signal available. This applies to Step 2c's diagnostic reminder too — if creating *that* reminder also fails, there's no further fallback behind it; say so plainly in Step 3's report instead.
- **Step 2c's diagnostic detail is only as good as whatever the failed Skylight call actually returned** — a tool that's entirely unavailable (e.g. the `skylight` MCP server not running) gives much less to go on than a tool that ran and returned a real error, so some Step 2c reminders will be more useful than others. Not something this skill can improve on its own; it reports whatever surfaced.
- **Sunday's combined window assumes Saturday's own shortfall (if any) already got its own separate chore/reminder on Saturday** — this skill doesn't suppress or merge that; a kid who logged a partial Saturday and still falls short on Sunday can see two separate chores (one from Saturday's run, one from Sunday's) and two reminders. Not treated as a bug, since each is accurate to its own run (Sunday's counts the Saturday minutes, so its shortfall is only what's still missing) — but worth knowing if the overlap ever looks confusing in practice.
