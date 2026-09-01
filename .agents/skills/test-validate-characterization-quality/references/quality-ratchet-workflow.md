# Combined PBT + Mutation Quality Ratchet Workflow

Read this file when validating critical paths or complex algorithms and you want a systematic way to strengthen characterization tests. This gate validates test quality through a **quality ratchet**: each validation technique exposes gaps the others miss.

## Quality Workflow Stages

1. **Example-Based Tests (TDD)**
   - Write explicit characterization tests for known scenarios
   - Cover happy path, edge cases, failure modes
   - Use single-case or parameterized tests
   - **Validates**: Specific observed behaviors are documented

2. **Mutation Testing (First Pass)**
   - Run `test-evaluate-focused-mutation` on characterized code
   - Target: ≥85% mutation score
   - Identify assertion gaps revealed by survivors
   - **Validates**: Tests actually verify behavior, not just execute code

3. **Property-Based Tests (Generalization)**
   - For complex logic with stable invariants, add PBT
   - Use property patterns: invariants, roundtrip, oracle, metamorphic
   - See `test-generate-unit-characterization-tests` for PBT strategy
   - **Validates**: Behavior holds across broad input space

4. **Mutation Testing (Second Pass)**
   - Run mutation testing again after adding properties
   - Verify properties are comprehensive enough to kill mutants
   - Target: Maintain or exceed ≥85% mutation score
   - **Validates**: Properties check meaningful conditions

## When to Apply Full Workflow

Use all 4 stages for:

- Critical business logic (calculations, validation, state transitions)
- Algorithms and data structures
- Serialization/parsing logic
- Protocol implementations

Use stages 1-2 only for:

- Simple CRUD operations
- Straightforward conditional logic
- Well-understood legacy code with clear behavior

## Quality Ratchet Benefits

Each technique catches different gaps:

- **Example tests**: Find specific case failures
- **Mutation testing**: Reveals missing assertions (tests run but don't verify)
- **Property tests**: Expose edge cases in input space
- **Mutation + PBT**: Validates properties actually constrain behavior

**Result**: Systematic coverage of both test completeness (mutation) and input space completeness (PBT).

## Mutation Testing Phase Rule

> **Timing rule**: Run mutation testing after a coherent behavior slice is green and its focused tests exist. Do not run it inside every red-green-refactor micro-cycle.

This skill validates characterization work, which occurs outside the TDD inner loop. For new TDD features, mutation testing happens only at the final quality gate, not during red-green-refactor cycles.
