# Exploration — Batched Sub-Agent Delegation

How to explore the Studio monorepo without filling your context window or exhausting memory. You are a **coordinator** — sub-agents do all code reading.

## Sub-agent prompt template

Fire one `studio-arch-explorer` sub-agent per package. Each prompt should follow this structure:

```
Explore ~/Sites/studio/{package-path}/ for deepening opportunities.

Context: I'm running a monorepo-wide architecture review looking for places where
modules are shallow, pass-through, tightly coupled, or hard to test.

Look for these friction signals:
1. SHALLOW MODULES — interface nearly as complex as the implementation.
   Apply the deletion test: if you deleted the module, would complexity
   vanish (pass-through) or reappear across N callers (earning its keep)?
2. BROKEN LOCALITY — understanding one concept requires bouncing between
   many small files. Changes to one behaviour touch 3+ files.
3. COUPLING LEAKS — modules that share internal state, reach into each
   other's internals, or have circular dependencies.
4. TESTABILITY GAPS — code that's untested, or tested only via mocks that
   mirror the implementation (brittle tests).
5. EXTRACTED-FOR-TESTING — pure functions pulled out solely for unit tests,
   but the real bugs hide in how they're called (wiring, ordering, state).

Return a structured brief — NOT raw code. Use this format:

Package: {package-name}
Files examined: [approximate count]

Findings:
1. [Finding title]
   - Files: [file paths involved]
   - Problem: [1-2 sentences describing the friction]
   - Friction type: shallow | pass-through | broken-locality | coupling-leak | untestable | extracted-for-testing
   - Severity: high | medium | low
   - Evidence: [1-2 concrete observations]
   - Cross-package coupling: [any imports from outside this package — @internal/*, ../*, shared types]

If you find nothing significant, say so explicitly — don't manufacture findings.
Do NOT paste large code blocks. Summarize what you observed.
```

## Batch discipline

Studio has many packages. Firing all at once exhausts memory. Follow this protocol:

1. **Sort packages** by estimated complexity (apps first, then feature libs, then util/ui libs)
2. **Batch size: 3–4 agents** per batch
3. **Fire a batch** — all with `run_in_background=true`
4. **End your response** after firing — wait for `<system-reminder>` notifications
5. **Collect results** via `background_output(task_id="...")`
6. **Fire next batch** — repeat until all packages explored
7. **Report progress** between batches: "Batch 2/5 complete. Found 7 friction points so far. Firing batch 3..."

### Invocation pattern

```
task(
  subagent_type="studio-arch-explorer",
  run_in_background=true,
  load_skills=["studio-architecture-review"],
  description="Architecture: {package-name}",
  prompt="[prompt from template above, with package path filled in]"
)
```

### Scoping hints

- **Large packages** (apps/studio, feature libs with 50+ files): give the sub-agent extra guidance — "Focus on the top-level module structure, not individual utility files."
- **Small packages** (util libs with <10 files): the sub-agent may find nothing — that's fine. Don't force findings.
- **Packages the user mentioned specifically**: include these in batch 1 so results arrive early.

## Cross-package synthesis

After collecting all sub-agent results, look for:

1. **Cross-package coupling** — the same files or concepts appearing in findings from multiple packages. This is the highest-value signal.
2. **Repeated patterns** — the same friction type (e.g. "shallow wrapper") appearing across packages suggests a systemic habit, not a local problem.
3. **Package boundaries that don't match domain boundaries** — if a domain concept is split across packages, the package boundary itself might be the problem. These are candidates for consolidation.
4. **Asymmetric packages** — one package that looks nothing like the others in structure or style. May indicate drift or a package that should be split/merged.

## During the grilling loop

When the user picks a candidate and you need deeper understanding:

- Fire a **focused** `studio-arch-explorer` sub-agent scoped to just the files in that candidate.
- Give it the specific question: "How do callers use X? What would break if we merged X and Y? What tests exist for this module?"
- Do NOT re-explore the whole package. Stay narrow.
