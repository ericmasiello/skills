---
name: unslop
description: Audit and edit drafted markdown documents, Proof docs, Confluence pages, ADRs, specs, PR descriptions, and long-form prose to remove AI tells using the 4-auditor pipeline. Use as the required second pass after drafting before publishing or saving.
---

# Unslop

Edit text to remove AI patterns and add human voice. This is an **audit-and-patch
pipeline**, not a one-shot rewrite. The numbered rules below are the source of
truth. Every run must account for all 33 rules.

## Editor Agent protocol

The Editor Agent owns the document and orchestrates four read-only auditors.
Auditors find violations; only the Editor Agent changes prose. This separation
prevents an editor from silently skipping rules while it is also inventing
replacement text.

### 1. Freeze the input

Keep the original text available. Do not pre-number the file; the `read` tool numbers lines automatically. Pass the raw file path. Preserve the author's meaning, facts, links, code, and requested tone. Do not rewrite yet.

### 2. Run the mechanical gate

Run the deterministic checker before asking an LLM to interpret prose:

```sh
python3 .agents/skills/unslop/scripts/mechanical_audit.py path/to/draft.md
```

It reports machine-detectable violations with rule IDs, line numbers, and column offsets. A non-empty report is a patch queue, not a suggestion to remember later.

### 3. Dispatch the specialist auditors in parallel

Give each auditor the raw input path and instruct it to report **every** violation it can find, not a rewritten document. Instruct auditors to **emit the coverage summary first** before detailed findings to ensure load-bearing coverage data survives output length limits.

Each finding must follow this exact format:

```text
Rule: <number> (<canonical rule name>)
Location: line or sentence number
Evidence: exact quoted span
Why: which rule it breaks
Patch: minimal replacement, or DELETE
Confidence: high | medium | low
```

Use these explicit assignments with canonical rule names:

- `unslop-content-auditor`:
  - rule 1 (puffery)
  - rule 2 (name-dropping)
  - rule 3 (superficial -ing phrases)
  - rule 4 (promotional language)
  - rule 5 (vague attributions)
  - rule 6 (formulaic challenges)

- `unslop-language-auditor`:
  - rule 7 (AI vocabulary)
  - rule 8 (fancy ways to say "is")
  - rule 9 ("not just X, but Y")
  - rule 10 (rule of three)
  - rule 11 (synonym cycling)
  - rule 12 (false ranges)
  - rule 26 (abstract metaphor nouns)
  - rule 31 (prefer the plain word)
  - rule 32 (cut nominalizations)

- `unslop-structure-auditor`:
  - rule 13 (em dash overuse — consult `reference/em-dash-patterns.md`)
  - rule 14 (colon overuse)
  - rule 15 (boldface overuse)
  - rule 16 (inline-header lists)
  - rule 17 (title case headings)
  - rule 18 (decorative emojis)
  - rule 19 (curly quotes)
  - rule 23 (filler phrases)
  - rule 24 (excessive hedging)
  - rule 25 (generic conclusions)
  - rule 27 (say what it does, not how it feels)
  - rule 28 (shorten or split dense sentences)
  - rule 29 (active voice)
  - rule 30 (cut adverbs, or use a stronger verb)
  - rule 33 (lead with the point)

- `unslop-soul-auditor`: the **Adding soul** checklist and an overlapping recall pass over:
  - rule 1 (puffery)
  - rule 6 (formulaic challenges)
  - rule 22 (sycophantic tone)
  - rule 27 (say what it does, not how it feels)
  - rule 28 (shorten or split dense sentences)
  - rule 29 (active voice)
  - rule 30 (cut adverbs, or use a stronger verb)
  - rule 33 (lead with the point)
  It must identify sterile passages and missed structural rules, without manufacturing personal opinions or facts the author did not provide.

The auditors must read the numbered rules in this file. The Editor Agent must validate that every reported finding's rule name matches its number, rejecting misnumbered entries.

### 4. Merge findings into a coverage ledger

The Editor Agent merges mechanical and specialist findings by location. Create one ledger row for every rule, even when the result is `clear`:

```text
Rule 01 (puffery) | status: clear | findings: 0
Rule 02 (name-dropping) | status: patch | findings: 1 | lines: 14
...
Rule 33 (lead with the point) | status: clear | findings: 0
```

Do not proceed while a rule is missing from the ledger. Conflicting patches are resolved by preserving meaning, then choosing the smallest change. Low-confidence findings are reviewed by the Editor Agent rather than blindly applied.

### 5. Apply patches, verify regressions, then re-audit

Apply accepted patches from the ledger in one editing pass.

**Step 5b (Regression diff check):**
Diff the patched text against the pre-patch text. Run the mechanical gate on the diff's added/changed lines. If any new finding appears in added lines (e.g. accidentally introducing a rule 9 "not just" contrast or dangling clause while fixing boldface/em dashes), fix the regression immediately before initiating specialist re-audits.

**Step 5c (Specialist re-audit):**
Re-run the mechanical gate and all specialist audits against the edited text. Stop only when every rule is `clear` or has an explicit, justified exception:

```text
Rule: 29 (active voice)
Status: exception
Text: "The file was deleted by the user."
Reason: actor is intentionally unknown and the passive is materially clearer.
```

The final response reports the coverage ledger, exceptions, and any meaning or fact the Editor Agent declined to change. Never claim "unslopped" based only on the rewritten output.

## Adding soul

Removing patterns is half the job. Sterile, voiceless writing is just as obvious.

- **Have opinions.** React to facts instead of neutrally listing pros and cons.
- **Vary rhythm.** Short sentences. Then longer ones that take their time. Mix it up.
- **Acknowledge complexity.** "Impressive but also kind of unsettling" beats "impressive."
- **Use "I" when it fits.** First person isn't unprofessional.
- **Let some mess in.** Perfect structure looks machine-made.
- **Be specific.** Not "this is concerning" but "there's something unsettling about agents churning away at 3am."

## Patterns to detect and fix

### Content

1. **Puffery.** "pivotal moment", "testament to", "evolving landscape", "setting the stage for", "indelible mark", "deeply rooted". Cut puffery, state what happened.
2. **Name-dropping.** Listing media outlets without context. Pick one, say what was said.
3. **Superficial -ing phrases.** "highlighting...", "ensuring...", "reflecting...", "showcasing...", "fostering...". Delete or expand with real sources.
4. **Promotional language.** "nestled", "vibrant", "breathtaking", "groundbreaking", "renowned", "stunning", "must-visit". Use neutral descriptions.
5. **Vague attributions.** "Experts believe", "Industry reports suggest", "Some critics argue". Name the source or delete.
6. **Formulaic challenges.** "Despite challenges... continues to thrive." Replace with specific facts.

### Language

7. **AI vocabulary.** Additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore, vibrant. Replace with plain words.
8. **Fancy ways to say "is".** "serves as", "stands as", "boasts", "features". Just say "is" or "has".
9. **"Not just X, but Y."** State the point directly instead.
10. **Rule of three.** Forcing ideas into groups of three. Use the natural number.
11. **Synonym cycling.** Protagonist, main character, central figure, hero all in one paragraph. Pick one, repeat it.
12. **False ranges.** "from X to Y" where X and Y aren't on a meaningful scale. List topics directly.

### Style

13. **Em dash overuse.** Avoid em dashes entirely. Use periods or commas only (no parentheses, no en dashes, no hyphen-as-dash substitutes). Em dashes are an AI tell, and reaching for parentheses instead just trades one tell for another. If a thought needs separation, end the sentence or use a comma.
14. **Colon overuse.** Colons are fine before a list or example. Not as mid-sentence connectors. "If you're coming from traditional automation: instead of registering event handlers, you describe conditions" adds nothing with the colon. Rewrite to let the point stand on its own without comparison framing. "Describing when the scheduler should fire works best as plain English." Same meaning, no crutch punctuation.
15. **Boldface overuse.** Don't bold every proper noun or acronym.
16. **Inline-header lists.** The tell is a bold label and colon that restates the line: "**Performance:** Performance improved...". Convert those to prose. A bold lead-in that ends in a period, names the item, and is followed by genuinely new detail ("**Schema in TypeScript.** Tables live in one file.") is fine, not a tell.
17. **Title case headings.** Use sentence case.
18. **Decorative emojis.** Remove from headings and bullets.
19. **Curly quotes.** Replace with straight quotes.

### Communication artifacts

20. **Chatbot phrases.** "I hope this helps!", "Let me know if...", "Of course!", "Certainly!", "Found the smoking gun!" Remove.
21. **Cutoff disclaimers.** "While specific details are limited..." Find sources or remove.
22. **Sycophantic tone.** "Great question! You're absolutely right!" Respond directly.

### Filler

23. **Filler phrases.** "In order to" becomes "To". "Due to the fact that" becomes "Because". "It is important to note that" gets deleted.
24. **Excessive hedging.** "could potentially possibly be argued that it might" becomes "may".
25. **Generic conclusions.** "The future looks bright." State specific plans or facts.

### Jargon

26. **Abstract metaphor nouns.** Substrate, wedge, vector, locus, vantage, nexus, primitive (as noun), harness (as metaphor), surface (as in "API surface"), bedrock, scaffolding (as metaphor), modality, paradigm, gold-plating, ratchet (as metaphor), evacuate (for moving code), endgame, north star, flywheel. These read as technical but usually have a plainer concrete word. "Substrate" becomes "base". "Wedge in" becomes "add". "Vector" becomes "way" or "method". "Gold-plating" becomes "more than the job needs". "Ratchet" becomes the mechanism's real name or "a limit that only tightens". "Evacuate" becomes "move out". "Endgame" becomes "the last phase". Pick the concrete word.

### Plain speech

27. **Say what it does, not how it feels.** "the database stays close at hand", "SQL you can read", "types that follow your schema" name a feeling. The fix names the mechanism or a number: "`.toSQL()` returns the exact string sent to the database", "a column rename fails the build". Ask what the sentence tells the reader to do or know, then write that. If you can't restate it as a concrete instruction, fact, or number, cut it. If it does convey something, keep only the non-obvious part: a tradeoff, a constraint, or why this approach beat an obvious alternative. One more check: if the sentence could appear unchanged in another project's docs, it says nothing about this one. Cut it.
28. **Shorten or split dense sentences.** If the reader has to backtrack to parse a sentence, break it in two or drop clauses. One idea per sentence.
29. **Active voice.** Prefer it. Catch "is/are/was/were + past participle" and name the actor: "queries are validated" becomes "the compiler validates queries", "the file is parsed by the loader" becomes "the loader parses the file". Passive is fine only when the actor is unknown or genuinely doesn't matter.
30. **Cut adverbs, or use a stronger verb.** "runs quickly" becomes "is fast" or the number. "significantly improves" becomes the measured delta. An adverb propping up a weak verb means the verb is wrong.
31. **Prefer the plain word.** "utilize" becomes "use", "leverage" becomes "use", "facilitate" becomes "help", "numerous" becomes "many", "in the event that" becomes "if". The fancier synonym is rarely clearer.
32. **Cut nominalizations.** A nominalization turns a verb into a noun and props it up with a weak verb: "performs validation of", "makes a determination about", "there was an increase in error rates". Find the verb buried in the noun and use it directly: "validates", "determines", "error rates increased".
33. **Lead with the point.** Put the key fact in the first clause, not after several subordinate clauses of setup. "Because the cache was stale and the retry path never checked for that, the job failed" buries the point. "The job failed: a stale cache broke the retry path" states it first, then explains.
