---
name: test-evaluate-hotspot-priority
description: Compute a deterministic hotspot score (change frequency × complexity × uncovered fraction) per module from real git history, source files, and measured coverage, then rank modules for test-coverage-uplift prioritization. Use when you say 'rank modules to test', 'compute hotspot score', 'prioritize coverage work', 'what should we test first', or need a reproducible replacement for eyeballing which files are riskiest.
metadata:
  category: 'Test Evaluation'
  tags: ['hotspot', 'prioritization', 'change-frequency', 'complexity', 'coverage-ranking']
  author: DOM-0080
  revision: 4
  status: experimental
---

# Hotspot Priority Ranking Specialist

## Shared Policy

Gate thresholds, verdict mapping, evidence requirements, and the retry budget are
defined once in [`../test-quality-policy.md`](../test-quality-policy.md). Do not
restate a threshold or a verdict mapping here — link there instead, so a policy
change takes effect in one edit.

## Purpose

Turn the hotspot heuristic `hotspot = change_frequency × complexity × (1 − line_coverage)` into a
**deterministic, scriptable calculation** instead of an agent estimating it in its head. Given a set
of module paths and their measured line coverage, this skill computes change frequency from real git
history and a complexity value (an explicit cyclomatic number if supplied, else a LOC proxy), then
ranks modules highest-hotspot-first.

This skill exists so coverage-uplift prioritization (e.g. by `coverage-auditor`) is reproducible:
same repo state + same inputs → same ranking, every time — not a plausible-sounding number invented
in a response.

## Deterministic Helpers

This skill bundles its executable helpers inside its own `scripts/` folder. Prefer these over
computing the formula by hand:

- `node .skills/test-evaluate-hotspot-priority/scripts/hotspot-rank.mjs --paths <csv> --lineCoverages <csv> [--branchCoverages <csv>] [--complexities <csv>] [--repoPath <path>] [--since "<git date expr>"]`
- `computeChangeFrequency(repoPath, targetPath, { since })` — `.skills/test-evaluate-hotspot-priority/scripts/change-frequency.mjs`
- `computeComplexityProxy(filePath, { explicitComplexity })` — `.skills/test-evaluate-hotspot-priority/scripts/complexity-proxy.mjs`; accepts a source file or module directory and sums recognized source-file LOC for directories
- `computeHotspotScore(...)` / `rankModules(...)` — `.skills/test-evaluate-hotspot-priority/scripts/hotspot-rank.mjs`

`--paths`, `--lineCoverages`, and (if provided) `--complexities`/`--branchCoverages` are parallel CSV
lists — one entry per module, in the same order. Leave a `--complexities` entry empty to fall back to
the LOC proxy for just that module. Leave a `--branchCoverages` entry empty (or omit the flag
entirely) to score that module on line coverage alone — but **always supply it when you have it**:
a module that is 100% line-covered with a real uncovered branch (an untested early-return, error
path, or conditional) must not silently score 0 just because only line coverage was passed in.

Git is invoked with `execFileSync('git', [...argsArray])` (no shell), so path and `--since` values are
passed as discrete argv entries and can never be interpreted as shell metacharacters. Do not
reimplement this by string-concatenating a shell command.

## When to Use

Use this skill when:

- you have a list of candidate modules and their measured line coverage (and, ideally, branch
  coverage) and need a reproducible priority order
- `coverage-auditor` (or any prioritization step) needs the hotspot factor computed from real repo
  data instead of an eyeballed estimate
- you want to re-rank after new coverage evidence lands, and expect the same inputs to always
  produce the same order

## When NOT to Use

Do not use this skill when:

- you do not yet have measured line coverage for the modules in question — get that first from
  `test-evaluate-targeted-coverage` (or `test-evaluate-skipped-files` if a 0%/excluded file's gap
  status is unclear). This skill never invents a coverage number.
- you need the blocker/weak-test detection that feeds _which_ modules are candidates —
  `test-analyze-testability-blockers` and `test-analyze-test-smells` own that
- you need a true cyclomatic complexity metric and a language-specific tool is available — run that
  tool and pass its number via `--complexities`; only fall back to the bundled LOC proxy when no
  such tool exists

## Ownership Boundary

- **Owns**: deterministic computation of change frequency, the complexity fallback proxy, the
  hotspot formula, and stable ranking of already-identified candidate modules
- **Does not own**: identifying which modules are candidates (blockers/weak-tests detection),
  measuring coverage, or classifying a module into a risk tier/gate
- **Hands off to**: `coverage-auditor` (or the caller) to fuse this ranking with gap kind
  (`no-tests` | `blocked` | `weak-tests`) and gate tier before selecting the per-cycle backlog

## Prerequisite Gate

Before ranking, require:

1. a concrete list of candidate module paths
2. measured line coverage for every module in that list (no defaults, no guesses)
3. a git repository at `--repoPath` (defaults to the current directory) with history for those paths
4. measured branch coverage for every module, **when available** — always pass it via
   `--branchCoverages` rather than omitting it; only skip it for a module where branch coverage
   genuinely was not measured (e.g. a pure line-only report)

If any prerequisite is missing, stop and request it explicitly rather than substituting a value.

## Required Decision Output

Report the shared fields defined in `test-skills-decision-contract.md`, with these
skill-specific values:

- `Missing Evidence`: any module that could not be scored (see `unresolved` in the script output),
  and any module scored on line coverage alone because branch coverage was not supplied
- `Next Owner`: `coverage-auditor` (fuse ranking with gap kind + gate) or the requesting caller

## The Formula

```txt
uncovered_fraction = branchCoveragePercent supplied?
  ? max(1 − line_coverage_fraction, 1 − branch_coverage_fraction)
  : (1 − line_coverage_fraction)

hotspot = change_frequency × complexity × uncovered_fraction
```

| Factor             | How it's computed here                                                                 |
| ------------------ | -------------------------------------------------------------------------------------- |
| `change_frequency` | commit count touching the path (`git log --format=%H -- <path>`, optionally `--since`) |
| `complexity`       | explicit cyclomatic number if supplied, else non-blank line count (LOC proxy)          |
| `line_coverage`    | caller-supplied measured percentage (0-100), converted to a 0-1 fraction               |
| `branch_coverage`  | **optional** caller-supplied measured percentage (0-100); when present, the uncovered fraction used for scoring is the *max* of the line-gap and branch-gap, not line alone |

Taking the **max**, not an average, is deliberate: a module can be 100% line-covered yet have a real,
uncovered branch (an untested early-return, error path, or conditional arm). Averaging would dilute
that gap toward zero whenever the line number is high; `max` guarantees a branch-only gap is never
scored lower than its own severity. Omitting `--branchCoverages` entirely falls back to the original
line-only formula (backward compatible) — but omission is a caller choice to make explicitly, not a
silent default that should be preferred when branch data is actually available.

The score is **relative, not calibrated** — it ranks modules against each other in one run of one
repo. It is not comparable across repos or across runs with a different `--since` window. See
`references/hotspot-formula-notes.md` for the full rationale and known limitations.

## Approach

1. Collect the candidate module paths and their measured line coverage, **and branch coverage when
   available**, (from `test-evaluate-targeted-coverage` output or an equivalent report). Do not
   proceed without real numbers.
2. If a language-specific cyclomatic complexity tool is available, run it and pass the values via
   `--complexities`; otherwise omit it and accept the LOC proxy.
3. Run `hotspot-rank.mjs` with the parallel `--paths` / `--lineCoverages` / `--branchCoverages` /
   `--complexities` lists. Always pass `--branchCoverages` when you have the numbers — see "The
   Formula" above for why line-only scoring under-ranks branch-only gaps.
4. Read `ranked` (highest score first) — check each entry's `bindingFactor` (`"line"` or `"branch"`)
   to see which gap actually drove the score — and `unresolved` (modules that could not be scored —
   report these as `Missing Evidence`, never drop them silently).
5. Hand the ranked list to the caller (typically `coverage-auditor`) to fuse with gap kind and gate
   tier before applying the per-cycle capacity cap.

## Output Format

Return the script's JSON as-is, or summarize it:

```markdown
# Hotspot Ranking — {repoPath}

## Ranked

| Rank | Module | Change Freq | Complexity (source)           | Line % | Branch % | Binding Factor | Score   |
| ---- | ------ | ----------- | ----------------------------- | ------ | -------- | -------------- | ------- |
| 1    | {path} | {n}         | {n} ({loc-proxy\|cyclomatic}) | {pct}% | {pct}%\|— | {line\|branch} | {score} |

## Unresolved (Missing Evidence)

- {path}: {reason}

## Decision Contract

- Result: COMPLETE | COMPLETE_WITH_WARNINGS | BLOCKED
- Missing Evidence: {list or none}
- Blocking Issues: {list or none}
- Next Owner: caller/orchestrator
```
