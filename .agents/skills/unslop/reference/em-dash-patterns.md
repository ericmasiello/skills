# Em Dash Rewrite Patterns

Rule 13 bans em dashes with no parenthesis escape hatch. Most instances require sentence restructuring rather than punctuation swapping. Use these eight patterns to resolve em dashes safely.

## 1. Heading subtitle
- **Pattern:** `Title — Subtitle`
- **Fix:** Restructure with a colon or comma.
- **Example:** `# Project Charter — Earned, Not Assumed` → `# Project charter: earned, not assumed`

## 2. List introduction
- **Pattern:** Prose clause introducing a bullet or numbered list using an em dash.
- **Fix:** Convert to a colon (Rule 14 explicitly permits pre-list colons).
- **Example:** `The service provides three capabilities —` → `The service provides three capabilities:`

## 3. Paired aside
- **Pattern:** Mid-sentence parenthetical set off by paired em dashes (`... — aside — ...`).
- **Fix:** Replace both dashes with commas, or split into two sentences if the aside is an independent thought.
- **Example:** `The deployment — which took three hours — completed safely.` → `The deployment, which took three hours, completed safely.`

## 4. Period split
- **Pattern:** Two related thoughts joined by an em dash where both sides can stand alone.
- **Fix:** Replace the dash with a period and capitalize the following word.
- **Example:** `Latency dropped by half — throughput doubled under load.` → `Latency dropped by half. Throughput doubled under load.`

## 5. Trailing qualifier
- **Pattern:** A clause followed by a concluding or qualifying fragment (`... — especially during peak hours`).
- **Fix:** Replace the dash with a comma.
- **Example:** `Cache invalidation remains difficult — especially during cluster reboots.` → `Cache invalidation remains difficult, especially during cluster reboots.`

## 6. Parenthetical aside
- **Pattern:** An explanatory note or consequence tacked onto the sentence.
- **Fix:** Replace with a comma, or use a semicolon if both halves form complete independent clauses.
- **Guard:** Ensure both clauses have explicit subjects when using a semicolon; do not leave a subject-less verb clause.
- **Example:** `We chose SQLite — it requires zero operational setup.` → `We chose SQLite; it requires zero operational setup.`

## 7. Bold label lead
- **Pattern:** Bold lead-in item connected to its explanation via an em dash.
- **Fix:** Replace the dash with a period or colon. The bold item becomes its own short label or sentence.
- **Example:** `- **Storage** — RocksDB stores key-value pairs.` → `- **Storage.** RocksDB stores key-value pairs.`

## 8. Elliptical verb
- **Pattern:** An em dash standing in for an omitted verb or copula.
- **Fix:** Supply the missing verb ("is", "are", "has") and delete the dash.
- **Example:** `Our priority — lower latency.` → `Our priority is lower latency.`
