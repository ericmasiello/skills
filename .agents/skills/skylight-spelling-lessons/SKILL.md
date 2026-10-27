---
name: skylight-spelling-lessons
description: "Replace every item in a Skylight shared list (default: 'Spelling Words') with a freshly pasted word list, or advance it to the next lesson in a bundled spelling-lesson sequence. Use when the user pastes this week's spelling words, says 'update the spelling words list', 'replace the spelling list on skylight', 'add this week's spelling words to skylight', names a Skylight list and gives the words that should replace its contents, or says 'update to next list', 'advance to the next spelling list', or 'move to the next lesson'."
---

# Skylight Spelling Words

Two ways to update a Skylight shared list of spelling words — both default to the "Spelling Words" list, but work against any shared list name the user names instead:

- **Flow A — replace with a pasted list**: the user gives you the words directly.
- **Flow B — advance to the next list**: the user wants the next lesson's words; you look them up.

## Flow A: Replace with a pasted word list

### Step 1: Parse the target list name and the words

- **List name**: whatever list the user names (e.g. "vocab words"); default to **"Spelling Words"** when they don't say one.
- **Words**: one per line, comma-separated, or numbered/bulleted ("1. cat", "- cat") — strip any numbering/bullet prefix and surrounding punctuation. Keep the user's original spelling and casing; you are a courier, not a proofreader. Preserve duplicates verbatim — don't dedupe — a repeated word can be intentional (extra practice).
- **Tricky Word: prefix**: a line starting with "Tricky Word:" (e.g. "Tricky Word: should") stays intact as one item — the prefix is content, not a bullet, so don't strip it or split it into a bare "should".

### Step 2: Resolve the target list

Call `skylight_list_lists()`. Match `label` case-insensitively against the target list name from Step 1.

- **Exactly one match** → use its `id`. Continue to Step 3.
- **No match** → stop and ask the user: create a new list under that name (`skylight_create_list`, `kind: "to_do"`, pick any color), or did they mean one of the lists that do exist? Show those labels so a typo is easy to spot.
- **More than one match** (two lists share a label) → stop and ask the user which `id` to use.

### Step 3: Replace the contents

Three separate `execute` calls, in this order. Each starts only after the previous one's result is in hand.

1. **Request the clear.** `skylight_clear_list(listId)` is a destructive call, so it answers `status: "confirmation-required"` with a preview of the items to delete and a `confirmToken`. Nothing is deleted yet. The list is untouched, and the old items stay until step 2 completes.
2. **Gate on the user.** Show the preview, end your turn, and wait for an explicit yes in chat. Then call `skylight_clear_list(listId, confirmToken)`. Done means the response carries a `removed` count equal to the old item total (a `0` when you expected items means the wrong list), then `skylight_get_list_items` returns an empty list.
3. **Add the words.** Only now call `skylight_add_list_item(listId, label=<word>)` for each word from Step 1, in parallel, in the order the user gave them.

The `confirmToken` is bound to the exact items on the list when it was issued. Adding words first changes that payload, and the clear is then rejected with `DRAFT_CHANGED` (or would delete the new words too). If the list changed after the preview, request a fresh preview, and if the user already approved deleting specific old items, remove just those with `skylight_delete_list_items(listId, item_ids)`.

### Step 4: Confirm

Read the list back with `skylight_get_list_items` (sorted by `position`) and report: the list name and id, how many old items were cleared, and the new word count plus the words themselves — so the user can eyeball them against what they pasted.

## Flow B: Advance to the next list in the lesson sequence

Trigger: the user says "update to next list", "advance to the next spelling list", "move to the next lesson", or similar — they want the *next* lesson's words from the canonical sequence, not words they're pasting.

The full ordered `{skill, lesson, words[]}` sequence lives in `lessons.json` next to this file (`[skill-dir]/lessons.json`). The array order IS lesson order (Skill ascending, then Lesson ascending within each Skill) — don't re-derive or re-sort it. Two words intentionally repeat across lessons ("yelled" in Skill 2/Lesson 5 and Skill 5/Lesson 20; "think" twice within Skill 1) — that's correct per the source material, not a parsing bug.

### Step 1: Resolve the target list

Same as Flow A Step 2 — resolve by label via `skylight_list_lists()`. Default list name is still "Spelling Words" unless the user names another.

### Step 2: Read its current contents

`skylight_get_list_items(listId)`.

### Step 3: Match against the sequence

Find the `lessons.json` entry whose `words` match the list's current contents exactly — same words, **same order**, including any `Tricky Word: X` line. Order matters here: Skylight's list order round-trips from its own `position` field, and the user cares about fidelity enough to eyeball it.

- **No exact match** → stop and ask which `{skill, lesson}` to set explicitly. Don't guess — the list may have been hand-edited and drifted from the sequence.
- **Exact match** → continue.

### Step 4: Advance

Take the next entry in the sequence (array index + 1).

- If the matched entry is the **last** one (Skill 6 / Lesson 30) → stop and tell the user there is no next list; the sequence is exhausted.

### Step 5: Replace the contents

Reuse Flow A's Step 3 in full, including the user-approval gate between the clear and the adds, with the next entry's words in order. In the confirmation preview, name the lesson transition (`Skill {a} Lesson {b} → Skill {c} Lesson {d}`) and the incoming words, so a single yes covers the whole change.

### Step 6: Confirm

Report in the form `"Moved from Skill {a} Lesson {b} → Skill {c} Lesson {d}"`, plus the new word list — mirroring Flow A's confirmation style.
