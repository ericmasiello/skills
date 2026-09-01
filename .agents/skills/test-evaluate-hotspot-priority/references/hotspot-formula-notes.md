# Hotspot Formula — Rationale and Known Limitations

## Why this replaces "the agent computes it in its head"

The `coverage-auditor` agent originally documented `hotspot = change_frequency × complexity × (1 −
line_coverage)` as a ranking heuristic, sourcing `change_frequency` from external history analysis and
leaving the multiplication itself as an instruction for the LLM to carry out manually when building
the ranking table. That is not reproducible: two runs (or two models) could compute slightly
different numbers from the same inputs, and there was no bundled script anyone could point at.

This skill makes the calculation itself real: a plain, pure, testable function
(`computeHotspotScore`) fed by two deterministic data-gathering helpers
(`computeChangeFrequency`, `computeComplexityProxy`), all runnable with `node` and no dependencies
beyond Node's standard library.

## Why the max of line-gap and branch-gap, not line alone

The first cycle this skill was used in production (a coverage-uplift audit against a real C#/.NET
codebase), the auditor found that the line-only formula scored **exactly 0** for four modules that
were 100% line-covered but only 50–62.5% branch-covered — each had a real, untested conditional arm
(an error path, an early return, a default case). Left as-is, those modules would have silently sunk
to the bottom of the ranking despite being genuine `weak-tests` gaps, arguably a worse outcome than
not having the deterministic script at all. The auditor worked around it by hand that cycle
(re-running the script substituting branch coverage as the input for just the affected modules,
disclosed in its output) — this skill now does that fusion natively via an optional
`--branchCoverages` parameter.

The fusion uses `max(uncovered_line_fraction, uncovered_branch_fraction)`, not an average or a sum:

- **Average** would dilute a real branch-only gap toward zero on any module with a high line count,
  understating exactly the case that motivated the fix.
- **Sum** would double-count modules that are weak on both dimensions, distorting the relative
  ordering the formula is meant to produce.
- **Max** guarantees the score is never lower than either individual gap's own severity, while still
  rewarding a module that is weak on both dimensions with a score at least as high as being weak on
  one.

`--branchCoverages` is optional and backward compatible — omitting it (or leaving a per-module CSV
entry empty) falls back to the original line-only formula for that module, matched to whatever
coverage data the caller actually has. Prefer supplying it whenever branch coverage was already
measured; the resulting per-module `bindingFactor` field (`"line"` or `"branch"`) tells you which
gap actually drove the score.

## Why `execFileSync` and not a shell string

`change-frequency.mjs` calls `execFileSync('git', [...args])` — the args array is passed directly to
the `git` process, bypassing any shell. A module path or `--since` value can therefore never be
interpreted as a shell metacharacter (`;`, `` ` ``, `$()`, `|`, etc.), which is the standard mitigation
for OWASP-class command injection when shelling out with user- or repo-derived strings. Never
refactor this into `exec('git log ' + path)`-style string concatenation.

## Why complexity defaults to a LOC proxy

True cyclomatic complexity requires a language-aware parser per stack (C#, TS, Python, ...), which
this skill does not bundle. Rather than silently under-computing or guessing, `computeComplexityProxy`
takes an explicit override (`--complexities`) when a real complexity tool's output is available, and
otherwise falls back to counting non-blank lines — the same fallback the `coverage-auditor` prompt
already documented ("complexity proxy = cyclomatic if available, else LOC"). LOC is a weak proxy (it
does not distinguish a long straight-line method from a deeply branching one), so prefer wiring in a
real complexity tool per stack when one exists.

## Why the score is relative, not calibrated

The formula multiplies three differently-scaled quantities: an unbounded commit count, an unbounded
LOC/complexity number, and a 0-1 fraction. The result is a **valid ordering** of the modules given as
input — it is not a calibrated severity score comparable across repositories, across time windows, or
against some universal "hotspot > 50 is bad" threshold. Two consequences:

- Always rank modules from the _same_ run (same repo, same `--since` window, same complexity source)
  against each other. Do not compare a score computed with `--since "90 days ago"` to one computed
  over full history.
- If you need comparability across repos, add a normalization step (e.g. min-max per input list)
  before comparing — this skill intentionally ships the raw documented formula, not a normalized
  variant, so it stays traceable to the original heuristic.

## Worked example

For a module with 12 commits touching it, a LOC proxy of 340, and 20% measured line coverage:

```txt
uncovered_fraction = 1 - 0.20 = 0.80
score = 12 × 340 × 0.80 = 3264
```

Compare that to a module with 2 commits, LOC 50, 90% coverage:

```txt
uncovered_fraction = 1 - 0.90 = 0.10
score = 2 × 50 × 0.10 = 10
```

The first module ranks far higher — it changes often, is large, and is mostly uncovered — exactly the
"defects concentrate here" signal the formula is meant to surface.

Now the branch-fusion case that motivated the fix above: a module with 3 commits, LOC proxy 18, 100%
line coverage, but only 50% branch coverage:

```txt
uncovered_line_fraction = 1 - 1.00 = 0.00
uncovered_branch_fraction = 1 - 0.50 = 0.50
uncovered_fraction = max(0.00, 0.50) = 0.50   (bindingFactor: "branch")
score = 3 × 18 × 0.50 = 27
```

Without `--branchCoverages`, this same module would score `3 × 18 × 0.00 = 0` and rank last —
invisible despite a real, untested conditional branch.

## Known limitations

- LOC is a coarse complexity proxy; wire in a real cyclomatic tool per stack when available.
- Change frequency counts commits, not lines changed or authors — a single large refactor commit
  counts the same as a one-line fix.
- The score is a relative ranking tool for one audit cycle, not a stored/tracked KPI.
- This skill does not classify gap kind (`no-tests` | `blocked` | `weak-tests`) or risk tier/gate —
  `coverage-auditor` fuses those in after receiving the ranking.
- Branch fusion is still coverage-percentage-based, not per-branch: a module with many independent
  branches, only one of which is genuinely uncovered, gets the same `uncoveredBranchFraction` as a
  module with the same aggregate percentage but a more evenly distributed gap. If finer-grained
  branch identification is needed, that belongs in `test-analyze-test-smells`/the coverage report
  itself, not in this ranking formula.
- Supplying `--branchCoverages` is a caller responsibility, not automatic — this skill has no way to
  detect "you have branch coverage data but didn't pass it," so a caller (typically
   `coverage-auditor`) must remember to always pass it through when available. This parameter was
   added after benchmark validation exposed a line-only ranking blind spot.
