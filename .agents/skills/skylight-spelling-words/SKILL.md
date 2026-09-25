---
name: skylight-spelling-words
description: "Replace every item in a Skylight shared list (default: 'Spelling Words') with a freshly pasted word list. Use when the user pastes this week's spelling words, says 'update the spelling words list', 'replace the spelling list on skylight', 'add this week's spelling words to skylight', or names a Skylight list and gives the words that should replace its contents."
---

# Skylight Spelling Words

Replace every item in a Skylight shared list with a pasted word list — defaults to the "Spelling Words" list, but works against any shared list name the user names instead.

## Step 1: Parse the target list name and the words

- **List name**: whatever list the user names (e.g. "vocab words"); default to **"Spelling Words"** when they don't say one.
- **Words**: one per line, comma-separated, or numbered/bulleted ("1. cat", "- cat") — strip any numbering/bullet prefix and surrounding punctuation. Keep the user's original spelling and casing; you are a courier, not a proofreader. Preserve duplicates verbatim — don't dedupe — a repeated word can be intentional (extra practice).
- **Tricky Word: prefix**: a line starting with "Tricky Word:" (e.g. "Tricky Word: should") stays intact as one item — the prefix is content, not a bullet, so don't strip it or split it into a bare "should".

## Step 2: Resolve the target list

Call `skylight_list_lists()`. Match `label` case-insensitively against the target list name from Step 1.

- **Exactly one match** → use its `id`. Continue to Step 3.
- **No match** → stop and ask the user: create a new list under that name (`skylight_create_list`, `kind: "to_do"`, pick any color), or did they mean one of the lists that do exist? Show those labels so a typo is easy to spot.
- **More than one match** (two lists share a label) → stop and ask the user which `id` to use.

## Step 3: Replace the contents

1. `skylight_clear_list(listId)` — removes every existing item in one bulk call. Its response's `removed` count is the old item total; a `0` when you expected items means the wrong list.
2. `skylight_add_list_item(listId, label=<word>)` for each word from Step 1, in parallel, in the order the user gave them.

## Step 4: Confirm

Report: the list name and id, how many old items were cleared, and the new word count plus the words themselves — so the user can eyeball them against what they pasted.
