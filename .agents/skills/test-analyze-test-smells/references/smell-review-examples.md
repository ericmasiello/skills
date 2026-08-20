# Smell Review Examples

Read this file when the main skill has already identified the smell and you want a representative before-and-after example to support the recommendation.

## Logic In Test

### Logic In Test Before

```typescript
describe('DiscountCalculator', () => {
  it('should calculate correct discount', () => {
    const testCases = [
      { amount: 100, tier: 'bronze', expected: 5 },
      { amount: 100, tier: 'silver', expected: 10 },
      { amount: 100, tier: 'gold', expected: 15 },
    ];

    for (const tc of testCases) {
      if (tc.tier === 'gold') {
        expect(calculator.calculate(tc.amount, tc.tier)).toBe(tc.expected);
      } else {
        expect(calculator.calculate(tc.amount, tc.tier)).toBeGreaterThanOrEqual(tc.expected);
      }
    }
  });
});
```

### Logic In Test After

```typescript
describe('DiscountCalculator', () => {
  it.each([
    { amount: 100, tier: 'bronze', expectedDiscount: 5 },
    { amount: 100, tier: 'silver', expectedDiscount: 10 },
    { amount: 100, tier: 'gold', expectedDiscount: 15 },
  ])(
    'should calculate $expectedDiscount% discount for $tier tier with $amount amount',
    ({ amount, tier, expectedDiscount }) => {
      const discount = calculator.calculate(amount, tier);
      expect(discount).toBe(expectedDiscount);
    },
  );
});
```

## Over-Mocking

### Over-Mocking Before

```csharp
[Fact]
public void Order_total_uses_mocked_domain_objects()
{
  var mockOrder = new Mock<IOrder>();
  var mockItem1 = new Mock<ILineItem>();
  var mockItem2 = new Mock<ILineItem>();
  mockItem1.Setup(item => item.GetPrice()).Returns(new Money(10.00m));
  mockItem2.Setup(item => item.GetPrice()).Returns(new Money(20.00m));
  mockOrder.Setup(order => order.GetLineItems()).Returns(new[] { mockItem1.Object, mockItem2.Object });
  mockOrder.Setup(order => order.CalculateTotal()).CallBase();
  var total = mockOrder.Object.CalculateTotal();
  Assert.Equal(new Money(30.00m), total);
}
```

### Over-Mocking After

```csharp
[Fact]
public void Order_total_uses_real_domain_objects()
{
  var order = OrderMother.Create();
  order.AddLineItem(LineItemMother.Create(price: new Money(10.00m)));
  order.AddLineItem(LineItemMother.Create(price: new Money(20.00m)));
  var total = order.CalculateTotal();
  Assert.Equal(new Money(30.00m), total);
}
```

## Duplication And Object Mother Extraction

### Duplication Before

```python
class TestUserService(unittest.TestCase):
    def test_user_registration(self):
        user = User(name='Alice', email='alice@example.com', age=25, country='US', preferences={'newsletter': True, 'notifications': True})
        service.register(user)

    def test_user_login(self):
        user = User(name='Alice', email='alice@example.com', age=25, country='US', preferences={'newsletter': True, 'notifications': True})
        service.authenticate(user.email, 'password')
```

### Duplication After

```python
class UserMother:
    @staticmethod
    def create(name='Alice', email='alice@example.com', **overrides):
        defaults = {
            'name': name,
            'email': email,
            'age': 25,
            'country': 'US',
            'preferences': {'newsletter': True, 'notifications': True},
        }
        return User(**{**defaults, **overrides})
```

## Fragile Interaction Verification

### Fragile Interaction Before

```javascript
describe('OrderProcessor', () => {
  it('should process order', () => {
    const mockRepo = jest.fn();
    const mockNotifier = jest.fn();
    const processor = new OrderProcessor(mockRepo, mockNotifier);

    processor.processOrder(testOrder);

    expect(mockRepo).toHaveBeenCalledTimes(1);
    expect(mockRepo).toHaveBeenNthCalledWith(1, testOrder);
    expect(mockNotifier).toHaveBeenCalledTimes(1);
    expect(mockNotifier).toHaveBeenCalledAfter(mockRepo);
  });
});
```

### Fragile Interaction After

```javascript
describe('OrderProcessor', () => {
  it('should save order to repository', () => {
    const fakeRepo = new FakeOrderRepository();
    const processor = new OrderProcessor(fakeRepo, new NoOpNotifier());

    processor.processOrder(testOrder);

    expect(fakeRepo.findById(testOrder.id)).toEqual(testOrder);
  });
});
```
