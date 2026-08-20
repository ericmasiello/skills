# Matching Existing Test Style

Read this file when the main skill has already decided to add tests and you need to mirror the existing suite rather than inventing a new test style.

## What To Inspect

- test framework
- assertion style
- naming convention
- suite organization
- double strategy
- fixtures or setup conventions

## Worked Example

### Existing Suite Pattern

```python
@pytest.fixture
def order():
    return Order(items=[Item('book', 10.0)])

def test_order_calculates_total_correctly(order):
    assert order.total == 10.0

def test_order_applies_tax_when_taxable(order):
    order.apply_tax(0.08)
    assert order.total == 10.8
```

Observed patterns:

- pytest fixtures
- plain `assert`
- names shaped like `test_{action}_{result}_{condition}`
- fixture-based test data instead of inline construction everywhere

### Matching New Test

```python
def test_order_caps_discount_at_total_when_discount_exceeds(order):
    order.discount = 15.0

    order.apply_discount()

    assert order.discount == 10.0
    assert order.total == 0.0
```

The point is not to copy syntax mechanically. The point is to preserve the suite's established readability and maintenance model.
