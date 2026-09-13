---
name: ixl-weekly-checkin
description: "Run the kids' Sunday IXL check-in: pull each child's weekly practice log and Diagnostic levels from IXL's Usage Details and Diagnostic pages, scan the Score Chart for pacing/effort anomalies, and write the result into that child's own raw-log tab plus the shared Weekly Summary tab in the family's tracker sheet. Use when the user says 'run my Sunday IXL check-in', 'check the kids IXL progress', or as the prompt for a scheduled weekly IXL check."
---

# IXL Weekly Check-In

Runs the family's IXL growth-mindset routine end to end: pull this week's numbers for each child, compare to last week, flag what needs a human look, and write the row. Read config, never the plan doc's rules — those are settled; this skill only automates collecting and recording data against them. First run ever, or session gone stale? See [SETUP.md](SETUP.md) — don't attempt any of the steps below cold.

## A known, accepted risk

IXL's ToS prohibits automated extraction of Service content, full stop — there is no personal-use carve-out and no public API. This skill reads the Usage Details, Score Chart, and Diagnostic pages directly off the rendered page rather than through any export. That was a deliberate choice: the Score Chart's own export control only produces a PDF, and scripting around it failed outright the one time this skill tried (see git history on this file). Reading the small, already-filtered views below was judged the more reliable path, in exchange for sitting closer to what the ToS clause is written against. If IXL's export ever becomes reliably scriptable, revisit this.

## Config

Read `config.local.json` in this skill's directory. Missing? Copy `config.local.json.example` to `config.local.json`, ask the user to fill in real values, then continue — this file is gitignored (`*.local.json`) and must never be committed. It carries `children` (names, in report order) and `sheetId`.

The tracker sheet has two kinds of tab, both already created — this skill never creates a tab itself:

- **Each child has their own raw log tab, named exactly after them** (e.g. `Hunter`, `Avery`) — there is no shared "Weekly Log" tab for this part. One row per skill practiced per day: `Date | Subject | Questions Answered | Questions Missed | Time Spent | Category (Math/ELA)`. `Subject` is the exact skill-entry title as IXL shows it, grade/strand code included (e.g. `PK (D.6) Choose the letter that you hear`). `Time Spent` is a plain number of minutes, no unit suffix. This tab is a raw log, not a weekly rollup — a busy week means many rows.
- **One shared `Weekly Summary` tab**, not per-child — a `Child` column distinguishes rows. One row per child per week: `Week Of | Child | Math Level | ELA Level | Anomalies | Notes`. This is where Diagnostic levels and the anomaly/pattern narrative live now; the raw log tabs never carry them.

## Step 1: Load the session

```bash
playwright-cli state-load ixl-auth.local.json
playwright-cli open https://www.ixl.com/analytics/child-summary --browser=chrome --persistent --headed
```

If that lands on a login/signin page instead of Analytics:

- `IXL_EMAIL`, `IXL_PASSWORD`, and `IXL_PARENT_PASSWORD` all set (see `.env`) → log in fully, three steps, not one:
  1. Fill and submit the username/password form (use `playwright-cli snapshot` first — don't guess selectors).
  2. A "Welcome — Who are you?" modal appears next — this is expected, not an error. Select the **Parent** option (the radio input itself is usually intercepted by its own avatar overlay; `playwright-cli eval "(el) => el.click()" <ref>` on the avatar element reliably gets past that, a plain `click` often won't).
  3. That reveals an **"Enter secret word"** field — IXL's term for the separate parent passphrase, distinct from the account password. Fill it from `IXL_PARENT_PASSWORD` and submit. Landing on `/dashboard` confirms success.
  Then `playwright-cli state-save ixl-auth.local.json` to refresh the stored session, and continue.
- Any of the three is unset, or the flow demands 2FA/a challenge the fill can't clear → stop here. Report: "IXL session expired and no auto-login is configured — run the bootstrap login in SETUP.md, then re-run this check." Don't retry blindly and don't guess at a workaround.

## Step 2: Per child (repeat for every name in `config.local.json`)

**a. One row per skill entry — from the "Sessions and skills" log, not the headline widget.** Navigate to `https://www.ixl.com/analytics/student-usage`. Select this child. Its filter bar defaults to `Subject: All subjects`, `SKILL GRADES: Pre-K - 12`, and `DATE RANGE: Last 7 days` — leave all three as-is; this is deliberately the broadest view, not a mistake to narrow down. If the page loads with an empty body, click the `DATE RANGE` button once (re-selecting the same value) to force the render — a known quirk on first load. The page-top "In the last 7 days, `<child>` has..." block is **all-subjects only** — confirmed live, switching its Subject filter doesn't change those numbers at all — so it's not a source for anything below; ignore it.

Scroll to the **"Sessions and skills"** section instead: every practice session for the week, grouped by day, each showing its own header (`"N skills practiced: M questions"`, or a `Diagnostic:` line, or both combined on one line), then per skill, its own titled block: a grade/strand code + skill name as the title (this exact title string is what goes in `Subject`, code included — e.g. `PK (D.6) Choose the letter that you hear`), then a row of stats: `Active practice: <time>`, `Questions answered: N`, `Questions missed: N`, `SmartScore progress: X→Y`. Every field this tab needs is on that stats row directly — no separate lookup required. For each entry, write one row (`update-weekly-log.ts` "entries" call, see Step 3) with:

- `Date`: the day-group header this entry sits under (not today's date — the actual date the skill was practiced).
- `Subject`: the entry's title exactly as shown, code and name together.
- `Questions Answered` / `Questions Missed`: read straight off the stats row.
- `Time Spent`: `Active practice: <time>` converted to a plain number of minutes (e.g. `Active practice: 7 min` → `7`). **`<1 min` entries**: no finer precision is available from IXL — write `0.5`.
- `Category (Math/ELA)`: classified per the rules below.

Classification rules (unchanged regardless of the sheet format):

- **Classify Math vs ELA mostly from the skill name** — usually unambiguous from the content ("Find the area of rectangles" is Math, "Form compound words" is ELA). **When a name is ambiguous — anything reasoning/logic-flavored, e.g. "Identify hypotheses and conclusions"** — don't guess from the title alone: open the "QUESTIONS LOG PREVIEW" shown right under that entry (or its "View details"/"View all N questions" link) and read one actual question. A skill about solving `2x + 1 = 7` is Math no matter how ELA-ish its name reads. Live-verified: this exact skill got misclassified once already — see git history on this file.
- **The grade/strand code prefix is itself a classification signal, not just decoration.** Numbered grades and `PK`/`K` (`2nd (T.2)`, `PK (E.5)`) say nothing about subject on their own. But a **course-name prefix** — `G` (Geometry), `Alg 1`, `Alg 2`, `Precalc`, `Calc` — only ever appears on Math skills; treat it as a strong Math signal, especially useful for exactly the reasoning/logic skills the previous bullet flags.
- **Real-Time Diagnostic entries** (labeled `Diagnostic: N questions`, tagged `subjects=["math","ELA"]` in their link) are a different activity — assessment, not practice — and don't cleanly split by subject or fit this tab's one-`Category`-per-row shape. Exclude them from the raw log entirely; if diagnostic time was substantial this week, mention it in this child's `Weekly Summary` Notes instead of silently dropping it.
- **Check your own tally against the session's own header before moving to the next day.** Each header states its own total (`"6 skills practiced: 86 questions"`) — the entries you're about to write for that day must sum to it exactly (excluding any Diagnostic line, which is separate). If it doesn't, you've missed or double-counted an entry in *that* session specifically — go recount it right there rather than trusting a mismatched running total and hoping it comes out even later. This one check is what catches both a missed entry and a misclassified one before they reach the sheet.
- **Same skill practiced twice on the same day, in two different session groups → merge into one row before writing.** `(Date, Subject)` is the row's identity in the raw log; the sheet has no session/time-of-day column to keep two same-day sessions apart. Sum `Questions Answered`, `Questions Missed`, and `Time Spent` across the sessions for that skill. Live-verified: hit this exact case (a letter-recognition skill practiced in two separate morning/afternoon sessions the same day).

**b. Anomaly scan — from the Score Chart, best-effort, not exhaustive.** Navigate to `https://www.ixl.com/analytics/score-grid#grades=<this child's official grade, e.g. 2>`. Click `DATE RANGE:...` then **"Last 7 days"** in the panel that appears (a real click-through, not a native `<select>` — a snapshot right after confirms it). The nested `Subject:`/`Grade:` selector inside the Score Chart panel and the **"Practiced skills"** checkbox both **reset on every fresh page load** and are frequently intercepted by a stray overlay when clicked normally — use `playwright-cli eval "(el) => el.click()" <ref>` for both instead of a plain `click`, which reliably bypasses it. Leave **"Currently suggested skills"** unchecked — that only shows skills a parent starred, unrelated to what was actually practiced. With `Subject: Math`, "Last 7 days", and "Practiced skills" checked, `playwright-cli snapshot` shows a small table grouped by strand heading, columns **Skill | Smartscore | Questions answered | Time Spent | Last practiced**. Repeat once with `Subject: English language arts` at the same grade. **This only covers one grade level per subject — it is not exhaustive** (a child working ahead may have practiced skills at other grades this check won't see); say so plainly in this child's `Weekly Summary` Notes rather than implying full coverage.

**c. Scan for the two flag patterns** across whatever rows step 2b found (judgment call, same as a human doing this by hand — there's no fixed numeric threshold, the plan deliberately leaves this to read-in-context). Write the result into this child's `Weekly Summary` `Anomalies` cell for this week.
   - High SmartScore + very few questions + almost no time → likely **gaming** (blitzing something already mastered).
   - Low SmartScore + normal pace → likely **genuine struggle**, a signal, not a problem — don't word this like a failure.
   - Low SmartScore + also low effort (a couple of questions, under a minute) fits neither cleanly — call it out as its own pattern (rushed/low-focus) rather than forcing it into one of the two above.

**d. Diagnostic levels.** Navigate to `https://www.ixl.com/diagnostic`, confirm it lands on `/diagnostic/student-stats` for this child (switch the `Child` selector if it's showing the wrong one). **The two level numbers render as chart labels, not accessible text** — a `snapshot` won't surface them. Instead: `playwright-cli screenshot --filename <path> --full-page`, then read that image (a multimodal look, not OCR-by-hand) for **"Overall math level"** and **"Overall language arts level"**. These go into this child's `Weekly Summary` `Math Level` / `ELA Level` cells for this week. Compare each to this child's most recent prior row in `Weekly Summary` (filter that tab by `Child`). A level dropping two weeks running is itself a flag — surface it, but say explicitly it may be one strand catching up rather than a real regression (see "Open gaps" below).

## Step 3: Write the rows

Two independent calls per child, via the bundled script (see its own header comment for env vars and full payload shapes). Node 24 strips the TypeScript syntax itself before running — no build step, no `ts-node`. `.nvmrc` in this directory pins Node 24; run `nvm use` here first if your shell isn't already on it.

**a. Raw log — one "entries" call per child, all of that child's rows from step 2a in a single array:**

```bash
node update-weekly-log.ts '{"child":"<name>","entries":[{"Date":"<M/D/YYYY>","Subject":"<exact title>","Category (Math/ELA)":"<Math|ELA>","Questions Answered":<n>,"Questions Missed":<n>,"Time Spent":<minutes>}, ...]}'
```

Each entry is matched against that child's tab by `(Date, Subject)` — a matching row already there has only its currently-blank cells filled in (never overwritten), otherwise a new row is appended. Safe to re-run: re-checking the same week twice never duplicates or clobbers a row.

**b. Weekly Summary — one "summary" call per child.** `Week Of` is today's actual date (not a normalized "Monday of the week") — that's the established convention from the old per-child tabs, carried forward:

```bash
node update-weekly-log.ts '{"summary":{"Week Of":"<M/D/YYYY>","Child":"<name>","Math Level":<n>,"ELA Level":<n or range>,"Anomalies":"<text>","Notes":"<text>"}}'
```

Matched against the shared `Weekly Summary` tab by `(Week Of, Child)`, same fill-blanks-only, never-overwrite semantics.

## Step 4: Report

There's no live pace formula in the sheet anymore — the raw log tabs are per-entry, not per-week — so compute each subject's pace for the report by aggregating rows directly: sum `Questions Answered` and `Time Spent` across this week's entries (already in hand from step 2a) for `Math` and for `ELA` separately, then `pace (sec/q) = Time Spent (min) × 60 ÷ Questions Answered`. Do the same over last week's date range by reading that child's raw tab (filter `Date` to the prior 7-day window) to get a comparison pace. **No prior week's rows for a subject at all** (first-ever run, or a subject with zero practice last week) → report this week's pace as a new baseline, nothing to compare yet, rather than a delta.

Per child: this week's math/ELA levels with the delta from last week (both from `Weekly Summary`), this week's Math and ELA pace each with the delta from last week's same-subject pace (computed as above) — or "new baseline" where there's nothing to compare — and any flags from step 2c/2d in plain language — read like the plan's own "when to actually step in" section, not a data dump. Then list open items below that still need Eric's attention, only when they actually apply this run.

## Open gaps this skill surfaces, never silently resolves

- **The Score Chart anomaly scan only covers one grade per subject** (step 2b) — always name which grade(s) were actually checked in this child's `Weekly Summary` Notes, so a clean-looking report isn't mistaken for a full sweep.
- **Whether a child is actually working the Recommended queue** (vs. free-browsing) is not visible in Analytics — it needs a human watching a live session. Always mention this as a standing to-do until Eric confirms it's been checked; never claim to have verified it.
- **Diagnostic still resolving** (e.g. a firm number replacing an earlier range) → note when a value that was previously a range now has a definite number, worth flagging even outside the usual week-over-week delta.
- **Dreading sessions / daily conflict** is explicitly out of scope for this skill's metrics per the family's plan — if the user raises it, say so plainly (pause tracking, address it directly) rather than trying to infer it from the numbers.
- **Pace is now computed at report time from the raw log, not stored** — if the raw log for a prior week is ever edited or deleted by hand, that week's pace comparison silently changes too; there's no independent record of what pace was reported at the time.
