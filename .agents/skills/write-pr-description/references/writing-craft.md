# Compose the PR/MR title and description

Loaded once by `write-pr-description` at Step 3. Assumes Steps 1-2 already resolved the platform, the mode (create/update), and whether a template applies.

---

## A. Resolve the diff and commit range

- **Create mode**: describe `HEAD` vs the repo's default base (`git rev-parse --abbrev-ref origin/HEAD`, stripped of `origin/`; fall back to `main` if that fails).
- **Update mode**: describe the full PR/MR range, not just the latest push — `gh pr view --json body,baseRefName` / `glab mr view --output json` gives the base and current body; diff against that base, not against the last push alone.

Prefer local git for the diff and commit log (`git log --oneline <base>..HEAD`, `git diff <base>...HEAD`). Only fall back to the platform CLI (`gh pr diff`, `glab mr diff`) when local git fails — offline, a fork-based PR with no matching remote, or a shallow clone where `git merge-base` can't resolve.

If the resulting commit list is empty, report "no commits to describe" and stop — don't invent one.

## B. Classify commits

- **Feature commits** — implement the change's purpose (new functionality, intentional refactors, design changes). These drive the description.
- **Fix-up commits** — iteration work (review fixes, lint fixes, rebase resolutions). Invisible to the reader.

Mentally subtract fix-ups when sizing: a branch with 12 commits but 9 fix-ups is a 3-commit change.

## C. Decide on evidence

If the current body (update mode) already has a `## Demo` or `## Screenshots` block, preserve it verbatim unless asked to refresh or remove it. If no evidence block exists, omit the section — don't fabricate a placeholder or force a capture step.

## D. Frame the narrative

One sentence each:

1. **Before** — what was broken, limited, or impossible?
2. **After** — what's now possible or fixed?
3. **Scope rationale** (only with 2+ separable-looking concerns) — why do these ship together?

This becomes the opening. For small, simple changes the "after" sentence alone may be the entire description.

## E. Size the change

| Change profile | Approach |
|---|---|
| Small + simple (typo, config, dep bump) | 1-2 sentences, no headers. Under ~300 characters. |
| Small + non-trivial (bugfix, behavioral change) | Short narrative, 3-5 sentences. No headers unless two distinct concerns. |
| Medium feature or refactor | Narrative frame, then what changed and why. Call out design decisions. |
| Large or architecturally significant | Narrative frame + up to 3-5 design-decision callouts + a short test summary. Target ~100 lines, cap ~150. Ten-plus subsections means consolidate into a table instead — reviewers scrutinize decisions, not inventories. |

When in doubt, shorter. Large changes need more selectivity, not more content.

## F. Reviewer test guidance

Include a section telling a **human reviewer** what to check manually against a running instance of the change — a deployment preview, a local dev server, a staging environment. Never instructions a CI pipeline already runs (`pnpm test`, `npm run lint`, "run the suite") — that section is for what CI cannot verify by itself.

- **Application/UI changes** — describe what to look for in the running environment (e.g. "Open the color picker and verify the new swatch renders correctly"). Name the specific environment only when the repo has more than one deployable target and the change affects a non-default one.
- **Docs changes** — name the docs deployment and what content to verify.
- **No observable runtime surface** (docs-only markdown, config, internal refactor with no behavior change, test-only) — omit this section entirely.

## G. Structural / architecture section

Include a `## Architecture` section when the change involves structural modifications: new providers or boundaries, hook extractions, data-flow changes, API/interface changes, or significant call-site migrations. Skip it for pure bug fixes, isolated style tweaks, or renames obvious from the diff.

Use text-based code diagrams (no Mermaid here — Mermaid is for the topology cases in Step H) annotated with a file-path comment on every block:

```tsx
// Before — path/to/File.tsx
<OldStructure />

// After — path/to/File.tsx
<NewStructure />
```

Use `// NEW` instead of a before/after pair for anything purely additive. Omit the before entirely for bug fixes (the before state was broken) or obvious renames. Cover two levels, in this order: the API/call-site level first (how consumers interact with the changed code), then the internals level (what changed inside the implementation) if it adds insight beyond the diff.

## H. Visual aid for everything else

Reach for a visual aid only when prose would leave the reviewer unable to reconstruct the mental model. Choose by shape:

- **Mermaid** — the change has topology: components with directed relationships (calls, flows, dependencies, state transitions). A table cannot show edges; don't substitute one for an architecture diagram with 3+ interacting components.
- **Markdown table** — the change has parallel variation of one shape: N things sharing attributes but differing in values (before/after measurements, option trade-offs, flag matrices).

Ask: does the information have edges (A → B) or rows (attribute × variant)? Edges → Mermaid. Rows → table. Skip any visual when the sizing table above already routed to 1-2 sentences, or the diagram would just restate the diff.

## I. Writing voice and principles

- Active voice. No em dashes; use periods, commas, colons, or parentheses.
- Lead with value: open with what's now possible or fixed, not the mechanism ("Evidence capture now works for CLI tools, not just web apps" — not "Replace the hardcoded capture block with a tiered dispatch").
- If any `##` heading appears anywhere in the body, the opening paragraph gets one too (e.g. `## Summary`). A bare opening paragraph is fine only when the body has no headings at all.
- Describe the end state, not the journey — no iteration history, intermediate failures, or bugs found and fixed along the way, in create mode or update mode alike.
- When commits disagree with each other, trust the final diff, not an earlier commit's framing.
- No empty sections. Omit anything that doesn't apply — never "N/A" or "None."
- No numbered-list items starting with `#` — GitHub reads `#1`, `#2` as issue links and auto-links them. Reference real issues as `org/repo#123` or a full URL, never a bare `#123` unless it's actually that issue.
- No commits section (the platform already shows the commit list in its own tab) and no reviewer-process checklist (a list of "things to look at" doesn't help evaluate code — fold any genuinely non-obvious thing to scrutinize inline with the change that warrants it).

## J. Compose the title

`type(scope): description` (conventional commits), matching recent commit-message style in this repo if one exists.

- **Type** by intent: `feat` for new capability, `fix` for a bug fix (default here when `fix` and `feat` both seem to fit — a change that remedies broken or missing behavior is a fix even when it adds code), `refactor`, `docs`, `chore`, `perf`, `test`.
- **Scope** (optional) — the narrowest useful label. Omit when nothing adds clarity.
- **Description** — imperative, lowercase, under 72 characters, no trailing period.

Breaking changes need explicit user confirmation before applying a `!` marker or `BREAKING CHANGE:` footer — some release tooling triggers a major-version bump off either.

## K. Assemble the body

**Template found (Step 2):** fill each of the template's own sections with the corresponding content from Steps D-H — narrative into the summary-shaped section, test guidance into a testing-shaped section, architecture/visual aids into whichever section fits, and so on. Leave a section the template provides but this change has nothing for entirely empty rather than writing "N/A." Preserve every section heading the template defines; don't rename, reorder, or drop one.

**No template:** assemble free-form, in this order — opening (Step D, at the depth from Step E), body sections that earn their keep (only the ones with real content), reviewer test guidance (Step F), architecture section (Step G) and other visual aids (Step H), evidence block (Step C) if one exists.

**Either way, append the issue-closing footer** listing every issue this change addresses:

```
Closes #<iid1>
Closes #<iid2>
```

(GitHub also recognizes `Fixes`/`Resolves`; GitLab recognizes `Closes`. `Closes` alone works on both.)

## L. Compression pass

Before handing off to `write-pr-description` Step 3's `unslop` call, apply these cuts:

- Any section restating content already in the opening — remove it.
- A "Testing" section longer than 2 paragraphs — compress to bullets.
- 5+ subsections that each describe one mechanism — consolidate into one table, one row per mechanism.
- Body exceeding the Step E sizing target by more than 30% — compress the longest non-opening section by half.

Re-read the opening's first sentence. If it describes what moved, was renamed, or was added rather than what's now possible or fixed, rewrite it.
