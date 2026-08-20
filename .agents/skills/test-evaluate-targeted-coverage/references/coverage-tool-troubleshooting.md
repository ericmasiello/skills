# Coverage Tool Troubleshooting

Read this file when coverage planning is correct in principle but execution or reporting fails.

## Coverage Tool Missing Or Coverage Not Generated

Symptoms:

- tests run but no coverage report is produced
- command-not-found errors
- coverage provider package missing

Check:

- the selected tool is installed in the active environment
- the repository already has a preferred provider or collector
- the verification command succeeds before you claim coverage evidence

Common fixes:

- install the missing coverage provider or collector
- verify config from project root
- rerun with the smallest focused command first

## Coverage Shows 0% Or Empty Report

Symptoms:

- coverage completes but reports `0%`
- the report exists but contains no meaningful data

Check:

- include / exclude patterns match the real source layout
- tests are actually executing before coverage is enabled
- Python coverage is instrumenting the test run, not being invoked afterward without data

Common fixes:

- narrow `include` to the changed production file or module
- run tests without coverage first, then add coverage back
- ensure paths are relative to the configuration file in use

## Import Or Module Resolution Failures During Coverage

Symptoms:

- tests pass normally but fail once coverage is enabled
- module aliases stop resolving
- environment setup differs under instrumentation

Check:

- TypeScript / JavaScript alias configuration
- selected test environment such as `node` versus `jsdom`
- Python import path setup

Common fixes:

- mirror the repo's existing alias setup in the coverage-aware config
- verify the correct test environment is selected
- ensure the project root or `src` path is on `PYTHONPATH` where needed

## Coverage Lower Than Expected

Symptoms:

- the report looks plausible but is far below expectations

Check:

- whether coverage is accidentally measuring the entire codebase
- whether the targeted tests actually execute the intended code path
- whether uncovered lines are error handling, edge cases, or helper methods that the current tests never hit

Common fixes:

- focus coverage on changed files only
- execute a narrower test slice tied to the target behavior
- inspect the HTML report to identify the missed lines instead of relying on the aggregate percentage

## Branch Coverage High, Line Coverage Low

Symptoms:

- branch coverage looks healthy but many lines remain uncovered

Interpretation:

- tests may enter the right conditional structures while still skipping substantive code inside those branches

Common fixes:

- inspect uncovered lines in the HTML report
- add edge-case or failure-mode tests that reach the skipped statements
- remove dead code if the lines are genuinely obsolete

## Coverage Report Not Readable By CI Or External Tools

Symptoms:

- CI, SonarQube, Codecov, or similar tooling cannot parse the report

Check:

- reporter format matches the downstream expectation
- output path is predictable
- the report is generated in the working directory used by CI

Common fixes:

- add the required reporter such as `lcov`, JSON, HTML, or XML
- use an explicit output directory
- keep local and CI commands aligned

## Local And CI Coverage Differ

Symptoms:

- coverage differs materially between local execution and CI

Check:

- tool versions
- working directory
- environment variables
- test selection commands
- CI-only code paths

Common fixes:

- pin tool versions
- use the same command locally and in CI
- verify the same config file and working directory are used in both environments
