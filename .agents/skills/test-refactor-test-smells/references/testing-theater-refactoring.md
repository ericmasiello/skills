# Testing Theater Refactoring

Read this file when the main skill has already classified a smell as Testing Theater and you need the full remediation catalog.

Testing Theater is the highest-priority family because it makes teams trust tests that do not actually prove behavior.

## Sub-Patterns To Check

- zero-assertion test
- tautological assertion
- mock-dominated test
- circular verification
- always-green test
- fully-mocked system under test
- implementation-mirroring assertions
- assertion-free smoke test
- misleading test name
- hardcoded magic oracle

## Shared Refactoring Loop

1. identify the observable behavior the test is supposed to protect
2. run the test and inspect what actually changes or returns
3. replace indirect checks with assertions on outcomes or boundary side effects
4. introduce a realistic logic bug and make sure the test fails
5. keep only infrastructure doubles; do not let mocks manufacture the result being asserted

## Example: Zero-Assertion Test

Before:

```python
def test_process_order():
    order = Order(items=[Item('book', 10)])
    order_service.process(order)
```

After:

```python
def test_process_order_saves_to_repository():
    order = Order(items=[Item('book', 10)])
    order_service.process(order)

    saved_order = repository.find_by_id(order.id)
    assert saved_order is not None
    assert saved_order.status == OrderStatus.PROCESSED
    assert saved_order.total == 10
```

## Example: Tautological Assertion

Before:

```typescript
it('should calculate discount', () => {
  const result = discountService.calculate(100, 'GOLD');
  expect(result).not.toBeNull();
});
```

After:

```typescript
it('should calculate 20% discount for GOLD tier', () => {
  const result = discountService.calculate(100, 'GOLD');
  expect(result).toBe(20);
});
```

## Example: Fully-Mocked SUT

Before:

```typescript
it('should process payment', () => {
  const mockValidator = jest.fn(() => true);
  const mockRepository = jest.fn();
  const mockNotifier = jest.fn();

  const service = new PaymentService(mockValidator, mockRepository, mockNotifier);
  service.processPayment(payment);

  expect(mockRepository).toHaveBeenCalled();
  expect(mockNotifier).toHaveBeenCalled();
});
```

After:

```typescript
it('should reject payment if validation fails', () => {
  const validator = new PaymentValidator();
  const mockRepository = jest.fn();
  const mockNotifier = jest.fn();
  const service = new PaymentService(validator, mockRepository, mockNotifier);

  expect(() => service.processPayment({ amount: -100 })).toThrow('Payment amount must be positive');
  expect(mockRepository).not.toHaveBeenCalled();
  expect(mockNotifier).not.toHaveBeenCalled();
});
```
