---
name: skylight-homework
description: "Parse pasted homework schedules and create Skylight chores for each school day. Use when the user pastes homework in Day/Lesson/Pages format, mentions 'homework', 'add homework to skylight', 'homework chores', or wants to create weekly homework chores."
---

# Skylight Homework

Create weekly homework chores on Skylight from a pasted schedule.

## Input Format

User pastes homework as repeating triplets after optional headers:

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
- Skip the first 3 lines if they are headers (Day, Lesson, Pages)
- Read remaining lines as triplets: (day_name, lesson_number, pages)
- **Ignore** the lesson number -- it is informational only
- **Skip** any day where pages is "NO HW"
- Extract: **day name** + **page numbers**

## Workflow

### Step 1: Parse homework

Extract (day, pages) pairs from the pasted text. Example result:
- Monday: 271-272
- Tuesday: 275-276
- Thursday: 279-280
- Friday: 283-284
(Wednesday skipped -- NO HW)

### Step 2: Calculate current week dates

Determine the YYYY-MM-DD date for each homework day in the **current week**.

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

### Step 3: Resolve family members

Read family member names from `family.local.json` in this skill's directory. If the file doesn't exist yet, copy `family.local.json.example` to `family.local.json` and ask the user to fill in real names before continuing — this file is gitignored and must never be committed.

Resolve each listed member's Skylight ID in parallel:

`skylight_resolve_member(name=<name from config>)` -> category_id

### Step 4: Create chores

For each (day, pages) pair, create **one chore per family member** listed in the config:

- **summary**: `Homework: {pages}` (e.g., "Homework: 271-272")
- **category_id**: Each member's resolved category_id
- **start**: The YYYY-MM-DD date calculated in Step 2

Use `skylight_create_chore` for each. Total chores = (number of members) x number of homework days.

Create all chores in parallel where possible.

### Step 5: Confirm

Report:
- Days with homework added (with dates and page numbers)
- Days skipped (NO HW)
- Total chores created
