# Test Naming Guidance Reference

Use this file when generation needs concrete naming examples by ecosystem rather than only the compact naming rules in `SKILL.md`.

## Core Principle

Name tests as executable behavior documentation.

- Prefer a **domain behavior verb** + **observable outcome** + **context**.
- Use business language and externally visible behavior, not production method names.
- Avoid generic technical verbs such as `returns`, `handles`, `processes`, or `works` when a better domain verb exists.
- Avoid implementation-coupled names such as `CalculateDiscount_returns_zero_when_customer_has_no_tier` when the behavior can be expressed in domain terms.

Choose the strongest verb the observed behavior supports:

- `Applies...` for policy/rule enforcement
- `Calculates...` for business computations
- `Emits...` for events/messages
- `Persists...` for stored state
- `Rejects...`, `Accepts...`, `Rounds...`, `Schedules...`, `Retries...` when those are the true domain actions

## Cross-Ecosystem Examples

### Good Cross-Ecosystem Names

- `Applies_zero_discount_when_customer_has_no_tier`
- `Calculates_zero_discount_when_customer_has_no_tier`
- `Emits_rejection_event_when_credit_limit_is_exceeded`
- `Persists_invoice_with_legacy_rounding_rule_when_total_has_three_decimals`

### Poor Cross-Ecosystem Names

- `works`
- `handles input`
- `test discount`
- `Returns_zero_discount_when_customer_has_no_tier`
- `CalculateDiscount_returns_zero_when_customer_has_no_tier`

## TypeScript / Vitest / Jest

Keep `describe(...)` on the business subject and `it/test(...)` on the behavior.

### Good TypeScript Names

```typescript
describe('discount rules', () => {
  it('applies zero discount when customer has no tier', () => {
    // ...
  });
});
```

```typescript
describe('invoice persistence', () => {
  it('persists invoice with legacy rounding rule when total has three decimals', () => {
    // ...
  });
});
```

### Poor TypeScript Names

```typescript
describe('calculateDiscount', () => {
  it('calls calculateDiscount', () => {
    // implementation-coupled
  });
});
```

```typescript
describe('discount', () => {
  it('works', () => {
    // vague
  });
});
```

## Python / pytest

Keep the `test_` prefix for discovery, but make the remainder behavior-first.

### Good Python Names

```python
def test_applies_zero_discount_when_customer_has_no_tier():
    ...
```

```python
def test_emits_rejection_event_when_credit_limit_is_exceeded():
    ...
```

### Poor Python Names

```python
def test_discount():
    ...
```

```python
def test_calculate_discount():
    ...
```

## C# / xUnit

Prefer readable method names with domain verbs and underscores between words.

### Good C# Names

```csharp
[Fact]
public void Applies_zero_discount_when_customer_has_no_tier()
{
    // ...
}
```

```csharp
[Fact]
public void Persists_invoice_with_legacy_rounding_rule_when_total_has_three_decimals()
{
    // ...
}
```

### Poor C# Names

```csharp
[Fact]
public void CalculateDiscount_returns_zero_when_customer_has_no_tier()
{
    // method-name coupled
}
```

```csharp
[Fact]
public void TestDiscount()
{
    // vague and technical
}
```

## Go / testing

Keep `TestXxx` for discovery and move the detailed behavior into the function name or subtest name with `t.Run(...)`.

### Good Go Names

```go
func TestDiscountRules(t *testing.T) {
    t.Run("applies zero discount when customer has no tier", func(t *testing.T) {
        // ...
    })
}
```

```go
func TestInvoicePersistence(t *testing.T) {
    t.Run("persists invoice with legacy rounding rule when total has three decimals", func(t *testing.T) {
        // ...
    })
}
```

### Poor Go Names

```go
func TestCalculateDiscount(t *testing.T) {
    // too technical if the real behavior is a discount rule
}
```

```go
func TestDiscount(t *testing.T) {
    // too vague
}
```
