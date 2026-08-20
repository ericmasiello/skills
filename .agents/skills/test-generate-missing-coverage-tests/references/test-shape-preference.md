# Test Shape Preference

Use the smallest test shape that covers the gap clearly while matching the existing suite.

## Selection Order

1. Property-based: choose this when the behavior is best described as an invariant.
2. Parameterized: choose this when multiple cases share one execution shape.
3. Single test: choose this when the gap is narrow, local, or exception-driven.

## Property-Based Example

```python
from hypothesis import given, strategies as st

@given(st.floats(min_value=0), st.floats(min_value=0))
def test_discount_never_exceeds_total(total, discount):
    order = Order(total=total)
    order.discount = discount

    order.apply_discount()

    assert order.discount <= order.total
```

Use this shape when the new test needs to prove a rule holds across many inputs, not just a handful of examples.

## Parameterized Example

```python
@pytest.mark.parametrize("total,discount,expected_discount,expected_total", [
    (100, 150, 100, 0),
    (100, 100, 100, 0),
    (100, 50, 50, 50),
    (0, 10, 0, 0),
])
def test_discount_capping(total, discount, expected_discount, expected_total):
    order = Order(total=total)
    order.discount = discount

    order.apply_discount()

    assert order.discount == expected_discount
    assert order.total == expected_total
```

Use this shape when several edge cases exercise the same branch structure and can be read as one behavior family.

## Single-Test Example

```python
def test_negative_total_raises_value_error():
    with pytest.raises(ValueError, match="Negative total"):
        Order(total=-100)
```

Use this shape when the gap is one isolated condition, exception path, or boundary check.

## Duplication Checks

Before adding a test, check whether the behavior is already protected.

### Same Behavior, Different Name

```python
# Existing test
def test_order_validates_items():
    order = Order(items=[])
    assert order.is_valid() is False

# Avoid adding this duplicate
def test_empty_order_is_invalid():
    order = Order(items=[])
    assert order.is_valid() is False
```

### Already Covered Higher Up

If an integration test already exercises the path, a new unit test may add little value unless the behavior is critical business logic and deserves direct protection.

### Already Present In A Parameter Table

Check existing parameterized cases before creating a separate test for a value that is already represented.
