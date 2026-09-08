---
name: ixl-weekly-checkin
description: "Run the kids' Sunday IXL check-in: pull each child's weekly Math and ELA questions/time and Diagnostic levels from IXL's Usage Details and Diagnostic pages, scan the Score Chart for pacing/effort anomalies, and write the result into that child's own tab in the family's tracker sheet. Use when the user says 'run my Sunday IXL check-in', 'check the kids IXL progress', or as the prompt for a scheduled weekly IXL check."
---

# IXL Weekly Check-In

Runs the family's IXL growth-mindset routine end to end: pull this week's numbers for each child, compare to last week, flag what needs a human look, and write the row. Read config, never the plan doc's rules — those are settled; this skill only automates collecting and recording data against them. First run ever, or session gone stale? See [SETUP.md](SETUP.md) — don't attempt any of the steps below cold.

## A known, accepted risk

IXL's ToS prohibits automated extraction of Service content, full stop — there is no personal-use carve-out and no public API. This skill reads the Usage Details, Score Chart, and Diagnostic pages directly off the rendered page rather than through any export. That was a deliberate choice: the Score Chart's own export control only produces a PDF, and scripting around it failed outright the one time this skill tried (see git history on this file). Reading the small, already-filtered views below was judged the more reliable path, in exchange for sitting closer to what the ToS clause is written against. If IXL's export ever becomes reliably scriptable, revisit this.

## Config

Read `config.local.json` in this skill's directory. Missing? Copy `config.local.json.example` to `config.local.json`, ask the user to fill in real values, then continue — this file is gitignored (`*.local.json`) and must never be committed. It carries `children` (names, in report order) and `sheetId`. **Each child has their own tab, named exactly after them** — there is no shared "Weekly Log" tab. Columns on every tab: `Week Of | Math Level | ELA Level | Math Questions | Math Time (hr) | Math Pace (sec/q) | ELA Questions | ELA Time (hr) | ELA Pace (sec/q) | Anomalies | Notes`. **Both Pace columns are live sheet formulas** (`=IFERROR(<time col>*3600/<questions col>,"")`) — this skill writes the raw Questions/Time columns; it never writes a Pace value directly (see Step 3).

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

**a. Math/ELA questions and time — from the "Sessions and skills" log, not the headline widget.** Navigate to `https://www.ixl.com/analytics/student-usage`. Select this child. Its filter bar defaults to `Subject: All subjects`, `SKILL GRADES: Pre-K - 12`, and `DATE RANGE: Last 7 days` — leave all three as-is; this is deliberately the broadest view, not a mistake to narrow down. If the page loads with an empty body, click the `DATE RANGE` button once (re-selecting the same value) to force the render — a known quirk on first load. The page-top "In the last 7 days, `<child>` has..." block is **all-subjects only** — confirmed live, switching its Subject filter doesn't change those numbers at all — so it can't give a Math/ELA split; ignore it for this step.

Scroll to the **"Sessions and skills"** section instead: every practice session for the week, grouped by day, each showing its own header (`"N skills practiced: M questions"`, or a `Diagnostic:` line, or both combined on one line), then per skill: a grade/strand code, a skill name, `Active practice: <time>`, `Questions answered: N`. For each entry:

- **Classify Math vs ELA mostly from the skill name** — usually unambiguous from the content ("Find the area of rectangles" is Math, "Form compound words" is ELA). **When a name is ambiguous — anything reasoning/logic-flavored, e.g. "Identify hypotheses and conclusions"** — don't guess from the title alone: open the "QUESTIONS LOG PREVIEW" shown right under that entry (or its "View details"/"View all N questions" link) and read one actual question. A skill about solving `2x + 1 = 7` is Math no matter how ELA-ish its name reads. Live-verified: this exact skill got misclassified once already — see git history on this file.
- **The grade/strand code prefix is itself a classification signal, not just decoration.** Numbered grades and `PK`/`K` (`2nd (T.2)`, `PK (E.5)`) say nothing about subject on their own. But a **course-name prefix** — `G` (Geometry), `Alg 1`, `Alg 2`, `Precalc`, `Calc` — only ever appears on Math skills; treat it as a strong Math signal, especially useful for exactly the reasoning/logic skills the previous bullet flags.
- **Real-Time Diagnostic entries** (labeled `Diagnostic: N questions`, tagged `subjects=["math","ELA"]` in their link) are a different activity — assessment, not practice — and don't cleanly split by subject. Exclude them from both subject totals; if diagnostic time was substantial this week, mention it in Notes rather than silently dropping it.
- **`<1 min` entries**: no finer precision is available from IXL. Treat as 0.5 minutes for summing. If a large share of a subject's total time is made up of `<1 min` entries, say so in Notes — the resulting hours figure is a rough approximation, not exact.
- **Check your own sum against the session's own header before moving to the next day.** Each header states its own total (`"6 skills practiced: 86 questions"`) — your Math count plus your ELA count for that same session must equal it exactly. If it doesn't, you've missed or double-counted an entry in *that* session specifically — go recount it right there rather than trusting a mismatched running total and hoping it comes out even later. This one check is what catches both a missed entry and a misclassified one before they reach the sheet.

Sum per subject: `Math Questions` / `Math Time (hr)` (total minutes ÷ 60) and the same for ELA. These are the two raw numbers this skill writes — **never compute or write a pace value**; `Math Pace (sec/q)` / `ELA Pace (sec/q)` are live formulas already in the sheet (see Config) that derive it from these two numbers automatically.

**b. Anomaly scan — from the Score Chart, best-effort, not exhaustive.** Navigate to `https://www.ixl.com/analytics/score-grid#grades=<this child's official grade, e.g. 2>`. Click `DATE RANGE:...` then **"Last 7 days"** in the panel that appears (a real click-through, not a native `<select>` — a snapshot right after confirms it). The nested `Subject:`/`Grade:` selector inside the Score Chart panel and the **"Practiced skills"** checkbox both **reset on every fresh page load** and are frequently intercepted by a stray overlay when clicked normally — use `playwright-cli eval "(el) => el.click()" <ref>` for both instead of a plain `click`, which reliably bypasses it. Leave **"Currently suggested skills"** unchecked — that only shows skills a parent starred, unrelated to what was actually practiced. With `Subject: Math`, "Last 7 days", and "Practiced skills" checked, `playwright-cli snapshot` shows a small table grouped by strand heading, columns **Skill | Smartscore | Questions answered | Time Spent | Last practiced**. Repeat once with `Subject: English language arts` at the same grade. **This only covers one grade level per subject — it is not exhaustive** (a child working ahead may have practiced skills at other grades this check won't see); say so plainly in Notes rather than implying full coverage.

**c. Scan for the two flag patterns** across whatever rows step 2b found (judgment call, same as a human doing this by hand — there's no fixed numeric threshold, the plan deliberately leaves this to read-in-context):
   - High SmartScore + very few questions + almost no time → likely **gaming** (blitzing something already mastered).
   - Low SmartScore + normal pace → likely **genuine struggle**, a signal, not a problem — don't word this like a failure.
   - Low SmartScore + also low effort (a couple of questions, under a minute) fits neither cleanly — call it out as its own pattern (rushed/low-focus) rather than forcing it into one of the two above.

**d. Diagnostic levels.** Navigate to `https://www.ixl.com/diagnostic`, confirm it lands on `/diagnostic/student-stats` for this child (switch the `Child` selector if it's showing the wrong one). **The two level numbers render as chart labels, not accessible text** — a `snapshot` won't surface them. Instead: `playwright-cli screenshot --filename <path> --full-page`, then read that image (a multimodal look, not OCR-by-hand) for **"Overall math level"** and **"Overall language arts level"**. Compare each to this child's most recent prior values in their tab. A level dropping two weeks running is itself a flag — surface it, but say explicitly it may be one strand catching up rather than a real regression (see "Open gaps" below).

## Step 3: Write the row

`Week Of` is today's actual date (not a normalized "Monday of the week") — that's how both existing rows in the real sheet were entered, so match the established convention rather than the plan doc's literal wording. One call per child, via the bundled script (see its own header comment for env vars):

```bash
node update-weekly-log.ts '{"child":"<name>","row":{"Week Of":"<M/D/YYYY>","Math Level":<n>,"ELA Level":<n or range>,"Math Questions":<n>,"Math Time (hr)":<n>,"ELA Questions":<n>,"ELA Time (hr)":<n>,"Anomalies":"<text>","Notes":"<text>"}}'
```

Node 24 strips the TypeScript syntax itself before running — no build step, no `ts-node`. `.nvmrc` in this directory pins Node 24; run `nvm use` here first if your shell isn't already on it.

Never include `"Math Pace (sec/q)"` or `"ELA Pace (sec/q)"` in the payload — the script ignores them if present (they're formulas, not values) and logs that it did. It writes the formula itself automatically the first time it creates a row, and never touches a Pace cell that already has one.

The script only fills cells that are currently blank in a matching-date row (or appends a fresh row if none exists) — it never overwrites a value already there, whether Eric typed it by hand or a prior run wrote it. **No prior week's data for a subject at all** (first-ever run) → still write this week's Questions/Time; just note in Notes that the resulting pace is a new baseline, nothing to compare yet.

## Step 4: Report

Per child: this week's math/ELA levels with the delta from last week, this week's Math and ELA pace (read the computed value straight off the sheet's formula cells, don't recompute it) each with the delta from last week's same-subject pace — or "new baseline" where a subject has no prior week's data yet — and any flags from step 2c/2d in plain language — read like the plan's own "when to actually step in" section, not a data dump. Then list open items below that still need Eric's attention, only when they actually apply this run.

## Open gaps this skill surfaces, never silently resolves

- **The Score Chart anomaly scan only covers one grade per subject** (step 2b) — always name which grade(s) were actually checked in Notes, so a clean-looking report isn't mistaken for a full sweep.
- **Whether a child is actually working the Recommended queue** (vs. free-browsing) is not visible in Analytics — it needs a human watching a live session. Always mention this as a standing to-do until Eric confirms it's been checked; never claim to have verified it.
- **Diagnostic still resolving** (e.g. a firm number replacing an earlier range) → note when a value that was previously a range now has a definite number, worth flagging even outside the usual week-over-week delta.
- **Dreading sessions / daily conflict** is explicitly out of scope for this skill's metrics per the family's plan — if the user raises it, say so plainly (pause tracking, address it directly) rather than trying to infer it from the numbers.
