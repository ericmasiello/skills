---
name: ixl-weekly-checkin
description: "Run the kids' Sunday IXL check-in: pull each child's weekly practice log and Diagnostic levels from IXL's Usage Details and Diagnostic pages, scan the Score Chart for pacing/effort anomalies, and write the result into that child's own raw-log tab plus the shared Weekly Summary tab in the family's tracker sheet. Use when the user says 'run my Sunday IXL check-in', 'check the kids IXL progress', or as the prompt for a scheduled weekly IXL check."
---

# IXL Weekly Check-In

Runs the family's IXL growth-mindset routine end to end: pull this week's numbers for each child, compare to last week, flag what needs a human look, and write the row. Read config, never the plan doc's rules — those are settled; this skill only automates collecting and recording data against them. First run ever? See [SETUP.md](SETUP.md) — don't attempt any of the steps below cold.

## Config

Read `config.local.json` in this skill's directory. Missing? Copy `config.local.json.example` to `config.local.json`, ask the user to fill in real values, then continue — this file is gitignored (`*.local.json`) and must never be committed. It carries `children` (names, in report order) and `sheetId`.

The tracker sheet has two kinds of tab, both already created — this skill never creates a tab itself:

- **Each child has their own raw log tab, named exactly after them** (e.g. `Hunter`, `Avery`) — there is no shared "Weekly Log" tab for this part. One row per skill practiced per day: `Date | Subject | Questions Answered | Questions Missed | Time Spent | Category (Math/ELA) | Week Of`. `Subject` is the exact skill-entry title as IXL shows it, grade/strand code included (e.g. `PK (D.6) Choose the letter that you hear`). `Time Spent` is a plain number of minutes, no unit suffix. This tab is a raw log, not a weekly rollup — a busy week means many rows. `update-weekly-log.ts` keeps this tab sorted by `Date` ascending automatically (a full re-sort on every write, so out-of-order historical rows self-heal too) and appends one extra row per week — `Subject` = `— Week Total —`, `Questions Answered`/`Questions Missed`/`Time Spent` summed across every real entry that week (Math + ELA combined), `Week Of` set to that week's ending date so it's easy to find/filter. That row is always fully recomputed on write, never fill-blanks-only, since it's a derived total that must match what's actually in the tab, not a human-editable record.
- **One shared `Weekly Summary` tab**, not per-child — a `Child` column distinguishes rows. One row per child per week: `Week Of | Child | Math Level | ELA Level | Anomalies | Notes`. This is where Diagnostic levels and the anomaly/pattern narrative live now; the raw log tabs never carry them.

## Step 1: Collect this week's data

```bash
nvm use   # picks up the .nvmrc here if your shell isn't already on Node 24+
node --env-file=.env collect-weekly-data.ts <child>
```

Run once per name in `config.local.json`. No browser, no saved session to load — the script logs into IXL fresh every run (the 3-request flow documented in `ixl-client.ts`) using `IXL_EMAIL`, `IXL_PASSWORD`, and `IXL_PARENT_PASSWORD` from `.env`, all three required. Default window is the trailing 7 days ending today; pass `--start=YYYY-MM-DD --end=YYYY-MM-DD` to cover a different range (e.g. catching up on a missed week).

The script prints one JSON object: `entries` (one row per skill practiced, Math/ELA already split by the server, same-day duplicate sessions already merged, Diagnostic sessions already excluded — this is Step 3a's payload, ready as-is) and `diagnostic` (this week's `Math`/`ELA` overall levels, either a firm number or an `"min-max"` range string if the diagnostic is still resolving).

If the script throws instead of printing JSON — wrong secret word, IXL demands a CAPTCHA/2FA challenge, or `/signin`'s page markup changed — stop here and report the error message plainly. Don't retry blindly and don't guess at a workaround; there's no UI fallback anymore, so a login failure means a human needs to check the account directly.

## Step 2: Per child — anomaly scan and classification

**a. Decide which grade(s) to check**, same judgment call as always: read the `diagnostic` levels Step 1 just returned and infer the right grade per subject (e.g. a Math level around 230 reads as roughly 2nd grade). This is still a best-effort, one-grade-per-subject check, not exhaustive — say so in this child's `Weekly Summary` Notes.

**b. Re-run the collector with `--grades`** to pull the Score Chart data for those grades:

```bash
node --env-file=.env collect-weekly-data.ts <child> --grades=math:<N>,ela:<M>
```

This adds a `scoreChart` object to the output: `scoreChart.math.skills` / `scoreChart.ela.skills`, each an array of every skill at that grade actually practiced in the window (`skillName`, `smartScore`, `questionsAnswered`, `timeSpentMinutes`, `lastPracticed`) — the live equivalent of the Score Chart's own `Skill | Smartscore | Questions answered | Time Spent | Last practiced` table, already filtered to "Practiced skills" by the script.

**c. Scan for the two flag patterns** across those arrays (judgment call, same as a human doing this by hand — there's no fixed numeric threshold, the plan deliberately leaves this to read-in-context). Write the result into this child's `Weekly Summary` `Anomalies` cell for this week.
   - High SmartScore + very few questions + almost no time → likely **gaming** (blitzing something already mastered).
   - Low SmartScore + normal pace → likely **genuine struggle**, a signal, not a problem — don't word this like a failure.
   - Low SmartScore + also low effort (a couple of questions, under a minute) fits neither cleanly — call it out as its own pattern (rushed/low-focus) rather than forcing it into one of the two above.

**d. Diagnostic levels** are already in hand from Step 1's `diagnostic` field — no separate lookup. Compare each to this child's most recent prior row in `Weekly Summary` (filter that tab by `Child`). A level dropping two weeks running is itself a flag — surface it, but say explicitly it may be one strand catching up rather than a real regression (see "Open gaps" below). A value that was a `"min-max"` range last week and is now a firm number (or a range whose bounds moved) is also worth naming, even outside the usual week-over-week delta.

## Step 3: Write the rows

Two independent calls per child, via the bundled script (see its own header comment for env vars and full payload shapes).

**a. Raw log — one "entries" call per child, Step 1's `entries` array as-is, plus `weekOf` set to today's date (same value used in the summary call below):**

```bash
node --env-file=.env update-weekly-log.ts '{"child":"<name>","weekOf":"<M/D/YYYY, today>","entries":<Step 1's entries array>}'
```

Each entry is matched against that child's tab by `(Date, Subject)` — a matching row already there has only its currently-blank cells filled in (never overwritten), otherwise a new row is appended. Safe to re-run: re-checking the same week twice never duplicates or clobbers a row. Passing `weekOf` also (re)writes that week's `— Week Total —` rollup row and re-sorts the whole tab by `Date` ascending — always include it, not just on a first run. `.env` isn't auto-loaded by Node, so every invocation needs `--env-file=.env` (or the run fails with "Missing GOOGLE_SHEETS_CREDENTIALS").

**b. Weekly Summary — one "summary" call per child.** `Week Of` is today's actual date (not a normalized "Monday of the week") — that's the established convention from the old per-child tabs, carried forward:

```bash
node --env-file=.env update-weekly-log.ts '{"summary":{"Week Of":"<M/D/YYYY>","Child":"<name>","Math Level":<from Step 1's diagnostic.math>,"ELA Level":<from Step 1's diagnostic.ela>,"Anomalies":"<text from Step 2c>","Notes":"<text>"}}'
```

Matched against the shared `Weekly Summary` tab by `(Week Of, Child)`, same fill-blanks-only, never-overwrite semantics.

## Step 4: Report

There's no live per-subject pace formula in the sheet — the `— Week Total —` rollup row (Step 3a) combines Math + ELA into one number, so pace still needs computing by aggregating rows directly: sum `Questions Answered` and `Time Spent` across this week's entries (already in hand from Step 1) for `Math` and for `ELA` separately, then `pace (sec/q) = Time Spent (min) × 60 ÷ Questions Answered`. Do the same over last week's date range by reading that child's raw tab (filter `Date` to the prior 7-day window) to get a comparison pace. **No prior week's rows for a subject at all** (first-ever run, or a subject with zero practice last week) → report this week's pace as a new baseline, nothing to compare yet, rather than a delta. The rollup row's combined total is still useful as a sanity check — Math sum + ELA sum should equal it exactly.

Per child: this week's math/ELA levels with the delta from last week (both from `Weekly Summary`), this week's Math and ELA pace each with the delta from last week's same-subject pace (computed as above) — or "new baseline" where there's nothing to compare — and any flags from Step 2c/2d in plain language — read like the plan's own "when to actually step in" section, not a data dump. Then list open items below that still need Eric's attention, only when they actually apply this run.

## Validating this skill's own accuracy

`validate-against-sheet.ts` (no args, same `.env`) re-derives every raw-log row from IXL going back to the earliest Date already in each child's tab and diffs it against what's actually recorded — a standing self-check, not part of the weekly flow itself. Last run: 146/146 historical rows matched exactly across both kids.

## Open gaps this skill surfaces, never silently resolves

- **The Score Chart anomaly scan only covers one grade per subject** (Step 2b) — always name which grade(s) were actually checked in this child's `Weekly Summary` Notes, so a clean-looking report isn't mistaken for a full sweep.
- **Whether a child is actually working the Recommended queue** (vs. free-browsing) is not visible in Analytics — it needs a human watching a live session. Always mention this as a standing to-do until Eric confirms it's been checked; never claim to have verified it.
- **Diagnostic still resolving** — a `"min-max"` range narrowing to a firm number, or its bounds simply moving week to week, is worth flagging even outside the usual week-over-week delta.
- **Dreading sessions / daily conflict** is explicitly out of scope for this skill's metrics per the family's plan — if the user raises it, say so plainly (pause tracking, address it directly) rather than trying to infer it from the numbers.
- **`Time Spent` in the raw log will always undercount IXL's own "Spent … Learning" total** on the child-summary/usage pages (confirmed live: same week, same child, `Questions Answered` matched IXL's own count exactly, but summed `Active practice` minutes ran 15-18% under IXL's aggregate, with no missing Diagnostic session and no missing skill to explain it — session wall-clock windows overshoot instead, by hours in one case, so that's not the fix either). IXL's per-skill "Active practice" stat (via `secondsSpent` on the usage endpoint) is the only subject-attributable time number exposed anywhere in Analytics, which is why this skill uses it, but it excludes time IXL still counts toward the aggregate (page transitions between skills, idle-but-not-timed-out gaps). If Eric compares this sheet's minutes against the child-summary widget and they don't match, that's expected — say so plainly rather than treating it as a data bug.
- **Pace is now computed at report time from the raw log, not stored** — if the raw log for a prior week is ever edited or deleted by hand, that week's pace comparison silently changes too; there's no independent record of what pace was reported at the time.
- **No UI fallback if the fetch-only login breaks** (IXL changes its login page, adds a CAPTCHA, etc.) — Step 1 stops with an actionable error instead of guessing; a human needs to check the account directly until the script is updated.
