# Mutation Tool Troubleshooting

Read this file when focused mutation planning is correct in principle but tool execution or interpretation breaks down.

## Tool Not Found

Symptoms:

- `stryker`, `mutmut`, `dotnet stryker`, or `go-mutesting` is unavailable

Check:

- whether the tool should be project-local or environment-level for this platform
- whether you are in the correct project root
- whether the verification command succeeds before planning a real run

Common fixes:

- install the platform-standard tool in the expected scope
- activate the right environment first, especially for Python
- confirm the tool version explicitly

## Mutation Runs Too Long Or Times Out

Symptoms:

- the run hangs or becomes too expensive for a small change

Check:

- the mutate list or target scope is too broad
- unrelated tests are running
- the tool cannot isolate the changed production area cleanly

Common fixes:

- narrow mutation to the changed file or smallest meaningful module
- use test filtering where supported
- start with one file or function-adjacent scope and widen only if necessary

## Mutation Score Below The Gate

Symptoms:

- the run completes but falls below the `85%` threshold

Check:

- surviving mutants for assertion gaps
- edge cases or failure modes that are still untested
- whether any survivors are actually equivalent mutants

Common fixes:

- classify each survivor as `test gap`, `equivalent mutant`, or `deferred`
- add tests for missing boundaries, side effects, or failure paths
- avoid claiming the gate passed until triage is explicit

## Invalid Or Non-Compiling Mutants

Symptoms:

- the tool reports invalid mutants or compile failures during mutation

Interpretation:

- some amount of invalid mutation is normal on strongly typed or syntax-sensitive platforms

Common fixes:

- confirm the tool already skips invalid mutants automatically
- disable noisy operators only when the platform and repo conventions justify it
- focus interpretation on valid mutant outcomes rather than attempted total count

## No Tests Found

Symptoms:

- the mutation tool reports zero discovered tests or no matching tests

Check:

- test runner selection matches the repo
- test path patterns align with the repository layout
- tests pass without mutation first

Common fixes:

- point the tool at the correct runner or project
- align test patterns with the repo's real structure
- verify the command is executed from project root

## Local And CI Results Differ

Symptoms:

- focused mutation behaves differently locally and in CI

Check:

- tool versions
- timeout settings
- environment variables
- the exact test command used in both places

Common fixes:

- pin tool versions
- keep timeout configuration explicit
- use the same command and working directory in CI and local runs
