# Legacy Characterization Playbook

Use this file when the primer is not enough and a task needs canonical examples, technique selection detail, or non-determinism handling guidance.

Consult these related skills for the detailed runtime rules:

- `test-generate-golden-master-tests`
- `test-generate-unit-characterization-tests`
- `test-generate-object-mother-fixtures`

## Characterization vs Standard Testing

Characterization is about **timing and discovery**:

- tests are written after code already exists
- behavior is captured from real execution
- the result becomes a regression baseline for safe refactoring

Characterization is **not** a separate test type. The resulting tests still belong to the normal taxonomy: acceptance, unit, integration, or contract.

## Technique Selection Matrix

| Target Shape                      | Preferred Technique                         | Why                                                                              |
| --------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| Complex structured or text output | Golden Master                               | Explicit assertions would be brittle                                             |
| Clear input to output mapping     | Unit characterization                       | Behavior can be asserted directly                                                |
| Several parameter combinations    | Unit characterization with parameter tables | Observed cases scale cleanly                                                     |
| Boundary side effects             | Unit characterization with boundary doubles | Events, writes, and calls can be observed                                        |
| Mixed behavior                    | Mixed                                       | Use Golden Master for wide outputs and unit assertions for critical side effects |

## Representative Examples

### Golden Master for Complex Output

```typescript
describe('OrderPriceCalculator (Characterization)', () => {
  it('captures pricing behavior as approved output', () => {
    const calculator = new OrderPriceCalculator();
    const order = OrderMother.withComplexDiscounts();

    const result = calculator.calculate(order);

    expect(result).toMatchSnapshot();
  });
});
```

### Unit Characterization for Explicit I/O

```typescript
describe('TaxCalculator (Characterization)', () => {
  const cases = [
    { amount: 100, region: 'US-CA', expected: 108.25 },
    { amount: 100, region: 'US-NY', expected: 104.0 },
    { amount: 100, region: 'UK', expected: 120.0 },
  ];

  test.each(cases)('characterizes tax for $region', ({ amount, region, expected }) => {
    const calculator = new TaxCalculator();

    const result = calculator.calculate(amount, region);

    expect(result).toBe(expected);
  });
});
```

### Unit Characterization for Side Effects

```typescript
describe('OrderService (Characterization)', () => {
  it('captures published events at the boundary', () => {
    const eventBus = new FakeEventBus();
    const service = new OrderService(eventBus);

    service.createOrder(orderData);

    expect(eventBus.published).toContainEqual(expect.objectContaining({ type: 'OrderCreated' }));
  });
});
```

## Non-Determinism Handling

Before locking assertions, control or normalize the following:

- time via injected clock, override, or fixed test subclass
- random values via seeded generator or fake source
- GUIDs and UUIDs via injected ID generator
- external APIs via seam-enabled fakes or stubs
- unstable ordering via normalization before assertion or approval

### Example: Time Control

```typescript
class TestableOrderProcessor extends OrderProcessor {
  constructor(private readonly fixedTime: Date) {
    super();
  }

  protected getCurrentTime(): Date {
    return this.fixedTime;
  }
}

it('uses a deterministic timestamp', () => {
  const fixedTime = new Date('2024-01-01T00:00:00Z');
  const processor = new TestableOrderProcessor(fixedTime);

  const result = processor.process(order);

  expect(result.timestamp).toEqual(fixedTime);
});
```

## Test Infrastructure Detection Checklist

Before generating files, detect and follow the existing project conventions:

- framework: `jest`, `vitest`, `pytest`, `xunit`, `go test`, and similar
- naming pattern: `*.test.ts`, `*.spec.ts`, `*Tests.cs`, `test_*.py`, `*_test.go`, and similar
- location: `tests/`, `__tests__/`, `src/tests/`, package-adjacent `*_test.go`, and similar
- assertion style: `expect`, `assert`, `assertThat`, fluent assertions, and similar

Do not introduce a new convention if the repository already has one.

## Test Data Strategy

Every Stage 3 plan should include an explicit test data decision:

- `Object Mother` when a few named defaults communicate intent well
- `Fluent Builder` when tests need many orthogonal variations
- `Fixture File` when payload size or shape is the behavior under test

### Good Examples

```typescript
const order = OrderMother.createPending();
```

```typescript
const order = OrderMother.builder()
  .withCustomerTier('gold')
  .withLineCount(3)
  .withTotal(1200)
  .build();
```

```typescript
const payload = loadFixture('invoice-with-adjustments.json');
```

### Anti-Patterns

- Do not generate large inline object graphs when an Object Mother, builder, or fixture file would make the test intent clearer.
- Do not duplicate arrange blocks across tests when the repeated setup does not express a different behavior.
- Do not create fixture files without clear ownership, naming, and cleanup expectations.
- Do not invent expected values; run the code, observe the actual output, and lock that observed behavior.

## Common Mistakes

1. Guessing behavior instead of running the code and observing the result.
2. Generating tests before seams actually make the target testable.
3. Mocking domain objects instead of using real entities and value objects.
4. Leaving non-determinism uncontrolled and calling the result a flaky test problem.

## Recommended Output Addendum

When a task asks for a legacy test plan, include these fields even before code is generated:

- `Seams Verified`
- `Characterization Strategy`
- `Non-Determinism Controls`
- `Test Data Plan`
- `Rejected Alternatives`
- `Anti-Patterns to Avoid`
