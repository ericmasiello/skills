# Coverage Gap Patterns

Read this file when the main skill has already classified a gap and you want a concrete example of how that gap is commonly covered.

## Error Handling Gap

```python
try:
    result = external_api.call()
except ConnectionError:
    return None
```

Typical fix:

```python
def test_returns_none_when_api_connection_fails():
    mock_api = Mock(side_effect=ConnectionError())
    result = service.fetch_data(mock_api)
    assert result is None
```

## Edge Case Gap

```python
def calculate_discount(amount):
    if amount > 100:
        return 0.1 * amount
    elif amount > 50:
        return 0.05 * amount
    else:
        return 0
```

Typical fix:

```python
@pytest.mark.parametrize('amount,expected', [
    (101, 10.1),
    (100, 5.0),
    (75, 3.75),
    (50, 0),
    (25, 0),
])
def test_calculate_discount_tiers(amount, expected):
    assert calculate_discount(amount) == expected
```

## Conditional Branch Gap

```python
if user.is_admin:
    return admin_view()
else:
    return user_view()
```

Typical fix:

```python
def test_admin_sees_admin_view():
    user = User(role='admin')
    assert get_view(user) == admin_view()

def test_regular_user_sees_user_view():
    user = User(role='user')
    assert get_view(user) == user_view()
```

## Early Return Gap

```python
def process_payment(amount):
    if amount <= 0:
        return None
    return payment_id
```

Typical fix:

```python
def test_payment_returns_none_for_zero_amount():
    assert process_payment(0) is None

def test_payment_returns_none_for_negative_amount():
    assert process_payment(-10) is None
```

## Nested Condition Gap

```python
if user:
    if user.is_active:
        if user.has_permission('delete'):
            return True
return False
```

Typical fix:

```python
def test_active_user_with_delete_permission_can_delete():
    user = User(active=True, permissions=['delete'])
    assert can_delete(user) is True

def test_active_user_without_delete_permission_cannot_delete():
    user = User(active=True, permissions=['read'])
    assert can_delete(user) is False
```
