---
name: skylight-homework
description: "Parse a pasted homework schedule or a teacher's weekly lesson-range email and create Skylight chores for each school day. Use when the user pastes homework in Day/Lesson/Pages format, forwards a 'for the following week ... Lessons X-Y' style email, mentions 'homework', 'add homework to skylight', 'homework chores', or wants to create weekly homework chores."
---

# Skylight Homework

Create weekly homework chores on Skylight from a pasted schedule or a teacher's lesson-range email.

## Step 1: Parse the input into (date, summary) pairs

Two input shapes reach this skill. Detect which one you're looking at and follow that branch. Both branches end at the same shape: a list of `(date, summary)` pairs, one pair per homework-bearing day. Once you have that list, move to **Step 2** -- everything after is shared between both formats.

### Table format

Repeating Day/Lesson/Pages triplets, optionally preceded by a header row:

```
Day
Lesson
Pages
Monday
23
271-272
Tuesday
24
275-276
Wednesday
NO HW
NO HW
Thursday
25
279-280
Friday
26
283-284
```

**Parsing rules:**
- Skip the first 3 lines if they are the headers (Day, Lesson, Pages).
- Read remaining lines as triplets: (day_name, lesson_number, pages).
- **Ignore** the lesson number -- it is informational only.
- **Skip** any day where pages is "NO HW".
- Each remaining day becomes `summary = "Homework: {pages}"` (e.g. "Homework: 271-272").

Resolve each day name to a date in the **current week**:

```bash
python3 -c "
from datetime import date, timedelta
today = date.today()
monday = today - timedelta(days=today.weekday())
days = {'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4}
for name, offset in days.items():
    print(f'{name}: {monday + timedelta(days=offset)}')
"
```

Example result: Monday -> 271-272, Tuesday -> 275-276, Thursday -> 279-280, Friday -> 283-284 (Wednesday skipped -- NO HW).

### Range format

One lesson range spanning a stated week of dates, e.g.:

```
Math Homework:
For the following week (9/14-9/18) the lesson pages to complete are: Lessons 1.06 -1.08
```

**Parsing rules:**
- Extract the date range from the parenthetical (`M/D-M/D`, e.g. `9/14-9/18`) -- every calendar date in it, in order, including weekends if the email lists any.
- Extract the lesson range (`major.minor-major.minor`, e.g. `1.06-1.08`). If the two bounds don't share the same major number (e.g. `1.09` to `2.01`), don't auto-increment across the boundary -- list the in-between lessons explicitly and confirm with the user instead.
- **Back-load by lesson count**: one lesson per day, in date order, on consecutive days. Where the run starts depends on how many lessons there are, so lighter weeks start later instead of crowding Monday:

  | Lessons | First day | Days used (5-day week) |
  |---------|-----------|------------------------|
  | 5 | Monday | Mon-Fri |
  | 4 | Tuesday | Tue-Fri |
  | 3 | Tuesday | Tue-Thu |
  | 2 | Wednesday | Wed-Thu |
  | 1 | Thursday | Thu |

  The first day is an index into the date list (0 = Monday, 1 = Tuesday, ...). If there are *more* than 5 lessons, or fewer than 5 dates in the range, stop and ask the user how to place them instead of guessing.
- Each pair becomes `summary = "Homework {lesson}"` (e.g. "Homework 1.06").

Resolve dates and enumerate lessons together:

```bash
python3 -c "
from datetime import date, timedelta

# Fill in from the email:
year = date.today().year
start_month, start_day, end_month, end_day = 9, 14, 9, 18
lesson_major, minor_start, minor_end = 1, '06', '08'

d = date(year, start_month, start_day)
end = date(year, end_month, end_day)
dates = []
while d <= end:
    dates.append(d.isoformat())
    d += timedelta(days=1)

width = len(minor_start)
lessons = [f'{lesson_major}.{i:0{width}d}' for i in range(int(minor_start), int(minor_end) + 1)]

first_day = {5: 0, 4: 1, 3: 1, 2: 2, 1: 3}  # lesson count -> index into dates
if len(lessons) not in first_day or len(dates) < 5:
    print('ASK THE USER -- lessons:', len(lessons), 'dates:', len(dates))
else:
    start = first_day[len(lessons)]
    for pair in zip(dates[start:], lessons):
        print(pair)
"
```

If the computed start date lands more than ~2 weeks in the past, the email is for next year -- rerun with `year = date.today().year + 1`.

Example result: `('2026-09-15', '1.06')`, `('2026-09-16', '1.07')`, `('2026-09-17', '1.08')` -- three lessons start on Tuesday, so Monday 9/14 and Friday 9/18 get no homework.

## Step 2: Resolve family members

Read family member names from `family.local.json` in this skill's directory. If the file doesn't exist yet, copy `family.local.json.example` to `family.local.json` and ask the user to fill in real names before continuing -- this file is gitignored and must never be committed.

Resolve each listed member's Skylight ID in parallel:

`skylight_resolve_member(name=<name from config>)` -> category_id

## Step 3: Create chores

For each `(date, summary)` pair from Step 1, create **one chore per family member** listed in the config:

- **summary**: the string computed in Step 1
- **category_id**: each member's resolved category_id
- **start**: the date from Step 1

Use `skylight_create_chore` for each -- Skylight's per-kid, dated to-do primitive is the chore, not the undated, unassigned task-box item (`skylight_create_task`). Total chores = (number of members) x (number of homework-bearing days).

Create all chores in parallel where possible.

## Step 4: Confirm

Report:
- Days with homework added (with dates and the lesson/pages label)
- Days skipped (no homework, or -- for range format -- past the last lesson)
- Total chores created
