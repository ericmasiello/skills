# Testing Theater Review Guide

Read this file when the main skill has already flagged possible Testing Theater and you need the full sub-pattern catalog or examples.

Testing Theater is the most dangerous test smell because it creates false confidence. A suite with Theater can be worse than no tests because it encourages teams to trust broken feedback.

## Sub-Patterns

| Pattern                   | Detection                                                             | Severity |
| ------------------------- | --------------------------------------------------------------------- | -------- |
| Zero-assertion test       | no meaningful assertion exists                                        | Blocker  |
| Tautological assertion    | existence, type, or self-equality checks as the primary assertion     | Blocker  |
| Mock-dominated test       | mocked returns prove the behavior without exercising production logic | Blocker  |
| Circular verification     | expected value is recomputed with the same logic as production        | Blocker  |
| Always-green test         | assertion failures can be swallowed or skipped                        | Blocker  |
| Fully-mocked SUT          | every dependency is mocked and only wiring is verified                | Blocker  |
| Implementation-mirroring  | call-count and call-argument assertions replace outcome checks        | High     |
| Assertion-free smoke test | test only verifies that no exception was thrown                       | Blocker  |
| Misleading test name      | name claims one behavior but assertion checks another                 | High     |
| Hardcoded magic oracle    | expected values cannot be traced to business rules                    | High     |

## Review Checklist

Apply these checks to every new or modified suspicious test:

1. Delete the production code under test and see whether the test still passes.
2. Introduce a realistic logic bug and see whether the test catches it.
3. Trace every expected value to an acceptance criterion or business rule.
4. Check that assertions target observable behavior rather than types, existence, or internal call choreography.

## Severity Guidance

- treat zero-assertion, tautological, mock-dominated, circular, always-green, fully-mocked, and assertion-free patterns as blockers
- treat implementation-mirroring, misleading names, and hardcoded-oracle patterns as high severity

## Representative Examples

### Zero-Assertion Test

```python
def test_process_order():
    order = Order(...)
    processor.process(order)
    # No assertions
```

### Tautological Assertion

```typescript
test('should return user', () => {
  const user = service.getUser(123);
  expect(user).toBeDefined();
  expect(user).toBeInstanceOf(User);
});
```

### Mock-Dominated Test

```csharp
[Fact]
public void Calculate_total()
{
  var mockOrder = new Mock<IOrder>();
  mockOrder.Setup(order => order.GetTotal()).Returns(100.00m);
  Assert.Equal(100.00m, mockOrder.Object.GetTotal());
}
```

### Circular Verification

```python
def test_calculate_discount():
    price = 100
    discount_rate = 0.1
    result = calculator.calculate_discount(price, discount_rate)
    expected = price * discount_rate
    assert result == expected
```

### Always-Green Test

```typescript
test('should validate input', () => {
  try {
    validator.validate(invalidInput);
    expect(true).toBe(true);
  } catch (e) {}
});
```

### Fully-Mocked SUT

```python
def test_user_registration():
    mock_validator = Mock()
    mock_hasher = Mock()
    mock_repo = Mock()
    mock_emailer = Mock()
    service = UserService(mock_validator, mock_hasher, mock_repo, mock_emailer)
    service.register(user_data)
    mock_repo.save.assert_called_once()
```
