# Refactoring Examples

Read this file when the main skill has already chosen the smell and you want a representative before-and-after example rather than the full workflow.

## Assertion Roulette To Focused Tests

Before:

```csharp
[Test]
public void TestOrder()
{
    var order = CreateTestOrder();
    Assert.AreEqual(100, order.Total);
    Assert.AreEqual("USD", order.Currency);
    Assert.AreEqual(2, order.Items.Count);
    Assert.AreEqual("PENDING", order.Status);
}
```

After:

```csharp
[Test]
public void NewOrder_ShouldCalculateTotalFromItems()
{
    var order = CreateTestOrder();
    Assert.AreEqual(100, order.Total);
}
```

## Order Dependence To Isolated Setup

Before:

```python
class TestUserWorkflow:
    user_id = None

    def test_1_create_user(self):
        self.user_id = user_service.create('alice')

    def test_2_update_user(self):
        user_service.update(self.user_id, age=30)
```

After:

```python
def test_update_user(created_user):
    user_service.update(created_user, age=30)
    user = user_service.get(created_user)
    assert user.age == 30
```

## Conditional Test Logic To Parameterized Coverage

Before:

```python
def test_calculate_discount():
    for tier, expected_discount in [('GOLD', 20), ('SILVER', 10), ('BRONZE', 5)]:
        result = calculate_discount(100, tier)
        if tier == 'GOLD':
            assert result == expected_discount
        else:
            assert result >= 0
```

After:

```python
@pytest.mark.parametrize('tier,expected_discount', [
    ('GOLD', 20),
    ('SILVER', 10),
    ('BRONZE', 5),
])
def test_calculate_discount(tier, expected_discount):
    assert calculate_discount(100, tier) == expected_discount
```
