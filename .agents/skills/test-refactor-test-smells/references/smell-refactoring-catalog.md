# Smell Refactoring Catalog

Read this file when the main skill has already classified the smell family and you need a more detailed remediation pattern.

## Implementation Coupling

Symptoms:

- tests break after harmless internal refactors
- spies are attached to the system under test
- assertions target private state, call order, or internal data structures

Preferred remediation:

- rewrite tests around public behavior and externally visible outcomes
- stop spying on the system under test
- make private internals irrelevant to the test contract

## Shared Mutable State

Symptoms:

- tests pass alone but fail in suite
- order dependence or CI flakiness
- static or global test state

Preferred remediation:

- fresh state per test
- cleanup in teardown when needed
- fixture or factory setup instead of class-level mutable storage

## Port-Boundary Violations

Symptoms:

- domain entities, value objects, or application services are mocked
- business logic is stubbed instead of exercised

Preferred remediation:

- keep domain and application layers real
- place doubles only at infrastructure ports
- introduce a port or seam if the current design makes isolation impossible

## Conditional Test Logic

Symptoms:

- if or else or loop logic controls assertions

Preferred remediation:

- use parameterized tests
- split into focused cases
- move setup branching into named helpers only when that improves clarity

## Duplicate Test Code

Symptoms:

- repeated setup or assertion scaffolding across tests

Preferred remediation:

- extract fixtures, builders, mothers, or helper methods
- keep data setup reusable but explicit

## Slow Test

Symptoms:

- waits, real I/O, sleeps, or oversized integration behavior inside a unit boundary

Preferred remediation:

- replace real time with controllable clocks
- use in-memory substitutes where appropriate
- move the test to an integration layer if the behavior is inherently integration-heavy

## Eager Or Over-Broad Test

Symptoms:

- one test verifies too many unrelated behaviors

Preferred remediation:

- split by behavior
- keep one intention per test or per parameterized family

## Other Medium Or Low Smells

Use the same decision model:

- make the test more explicit
- reduce hidden state or hidden data
- remove duplication
- prefer observable behavior over implementation trivia
