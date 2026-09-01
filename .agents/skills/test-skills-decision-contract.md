# Test Skills Decision Contract

This is the one place that counts for the ownership scaffold and decision-output
fields shared by every `test-*` skill. Do not restate the field definitions below in
another `SKILL.md` — link here instead.

Shared gates, routing thresholds, retry budget, and verdict mapping are defined
in `test-quality-policy.md`.

`coverage-executor/AGENT.md` and `coverage-auditor/AGENT.md` parse the `Result` and
`Next Owner` fields from skill output. Do not rename a field or change its allowed
values without updating both agents in `.agents/`.

## Ownership Boundary (per skill)

Each skill states, in its own file, only what is specific to it:

- **Owns**: the one thing this skill decides or produces.
- **Does not own**: work that belongs to a named upstream or downstream skill.

## Prerequisite Gate (per skill)

Each skill states, in its own file, only the specific conditions it requires before
it starts. If a prerequisite is missing, stop and request it explicitly rather than
proceeding on an assumption.

## Required Decision Output (shared fields)

Every `test-*` skill reports these fields at the end of its work, in this order.
A skill may add fields specific to itself (for example, ranked candidates) before
these, but must not omit or rename the shared ones:

- `Result`: `COMPLETE` | `COMPLETE_WITH_WARNINGS` | `BLOCKED`
- `Missing Evidence`: explicit list (empty if none)
- `Blocking Issues`: explicit list (empty if none)
- `Next Owner`: one downstream owner skill, a host/caller, a human, or `self` for iteration

## Mutation Evidence (when reported)

Include the target, source revision, exact command, report location, eligible-mutant denominator, exclusions, and timeout status. A zero denominator or unavailable mutation tool is `Missing Evidence`, not a passing result.

Also report, per named scope item, whether at least one eligible mutant landed on the code implementing it: an aggregate cannot vouch for behavior the mutant set never reached. If an item has none because the tests miss it, that is `Missing Evidence` and executor-actionable. If it has none because no mutator applies or every candidate is type-invalid, discharge it with a targeted fault injection naming the test that fails, and record the tool limitation.

## Completeness Gate (when a skill produces coverage evidence)

Report each dimension as one of:

- `Detected` — the case family was found and evidenced.
- `Considered-Not-Found` — the case family was actively checked for and is absent.
- `Not-Applicable` — the case family does not apply to this target.

Provide one evidence line (test name, assertion, or boundary observation) per row.
