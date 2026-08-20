---
name: studio-improve-codebase-architecture
description: Run a parallel architecture review of the Studio monorepo. Discovers packages, fires batched sub-agents per package to find deepening opportunities, synthesizes cross-cutting findings into an HTML report, then drills into specific candidates via grilling loop. Use when the user says 'architecture review', 'deep module review', 'sweep studio', 'find deepening opportunities', 'improve architecture', 'monorepo audit', or wants to find refactoring opportunities across Studio packages.
---

# Studio Improve Codebase Architecture

Surface architectural friction across the Studio monorepo and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This is a monorepo-scaled specialization of `/improve-codebase-architecture`: same vocabulary and grilling loop, but package-aware discovery and memory-safe batched sub-agent exploration instead of a single agent walking the whole tree.

## Operating principle — you are a coordinator, not an explorer

**Never read application code directly.** Your context window is for orientation, synthesis, and conversation — not for holding source files. Delegate ALL code reading to parallel `studio-arch-explorer` sub-agents, each scoped to a single package. This multiplies available context by the number of sub-agents while keeping your window clean for high-fidelity synthesis.

Call the Skill tool with "codebase-design" for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion.

Informed by the project's domain model (`CONTEXT.md`) and recorded decisions (`docs/adr/`).

## Process

### 1. Orient (lightweight — no code reading)

Read ONLY high-level orientation files:

- Top-level directory listing (2 levels deep max)
- `CONTEXT.md`, `AGENTS.md`, or equivalent domain glossary
- ADRs in `docs/adr/` relevant to the user's area of interest
- Build/config files (`package.json`, `tsconfig.json`) for dependency signals

From this, identify packages to explore.

### 2. Discover packages

Read the top-level directories under `~/Sites/studio/`:

- `apps/*/`
- `libs/*/*` (libs are `libs/<category>/<package>/`)
- `core/*/` (if present)

A directory is a **package** if it contains a `package.json`.

**Scoping**: If the user specifies packages (e.g. "just libs/ui and apps/studio"), only include those. Otherwise default to all discovered packages.

Skip: `node_modules`, `.DS_Store`, dotfiles, `@tools` (build tooling — include only if user explicitly asks).

### 3. Batched exploration (memory-safe)

Fire `studio-arch-explorer` sub-agents in **batches of 3–4** to stay within memory limits. Each agent explores one package.

```
task(
  subagent_type="studio-arch-explorer",
  run_in_background=true,
  load_skills=["studio-improve-codebase-architecture"],
  description="Architecture: {package-name}",
  prompt="Explore ~/Sites/studio/{package-path}/ for deepening opportunities."
)
```

**Batch discipline:**
- Fire batch of 3–4 agents
- **Wait for the entire batch to complete** before firing the next
- End your response between batches — the system notifies on completion
- Continue until all packages are explored

See [EXPLORATION.md](EXPLORATION.md) for the sub-agent prompt template and output format.

### 4. Synthesize and present as HTML report

Collect all sub-agent findings. **Cross-reference across packages** — coupling that spans packages is the most valuable signal.

Write a self-contained HTML report to the OS temp directory: `$TMPDIR/architecture-review-<timestamp>.html`. Open it for the user (`open <path>` on macOS). See `improve-codebase-architecture`'s [HTML-REPORT.md](../improve-codebase-architecture/HTML-REPORT.md) for the scaffold, candidate-card structure, diagram patterns, and styling guidance — this skill only adds a package-scoped section structure and one extra diagram pattern, both in [HTML-REPORT.md](HTML-REPORT.md).

**Report structure** (Studio-specific ranking, on top of the generic candidate-card format):

1. **Cross-package coupling** (highest value) — opportunities that span multiple packages. Group by coupling cluster.
2. **Per-package highlights** — top 2–3 opportunities per package, ranked by impact. Skip packages where agents found nothing significant.
3. **Patterns** — recurring architectural smells across packages (e.g. "5 of 11 libs have shallow wrapper modules around a single external dependency").

End with a **Top recommendation** section. Then ask: "Which of these would you like to explore?"

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting. Mark clearly. Don't list every theoretical refactor an ADR forbids.

Do NOT propose interfaces yet.

### 5. Grilling loop

Once the user picks a candidate, call the Skill tool with "grilling" to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

**When you need deeper understanding**, fire a focused `studio-arch-explorer` sub-agent scoped to the specific files involved. Do not read all the code yourself.

Side effects happen inline as decisions crystallize; call the Skill tool with "domain-modeling" to keep the domain model current as you go:

- **New concept not in `CONTEXT.md`?** Add it. Create the file lazily if needed.
- **Sharpening a fuzzy term?** Update `CONTEXT.md` right there.
- **User rejects with a load-bearing reason?** Offer an ADR: _"Want me to record this so future reviews don't re-suggest it?"_ Only when the reason would actually prevent re-suggestion. See [domain-modeling/ADR-FORMAT.md](../domain-modeling/ADR-FORMAT.md).
- **Exploring alternative interfaces?** Call the Skill tool with "codebase-design" and use its [DESIGN-IT-TWICE.md](../codebase-design/DESIGN-IT-TWICE.md) parallel sub-agent pattern.
