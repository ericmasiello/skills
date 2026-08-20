# Object Mother Usage And Anti-Patterns

Preserved usage examples and detailed anti-pattern guidance extracted from the earlier inline skill.
Use this file when generation needs concrete test examples or tradeoff reminders.

## Test Usage Examples

### Unit Test Example

```typescript
it('should calculate total correctly', () => {
  const order = OrderMother.withLineItems([
    { productId: 'P1', quantity: 2, unitPrice: 100 },
    { productId: 'P2', quantity: 1, unitPrice: 50 },
  ]);

  expect(order.totalAmount).toBe(250);
});
```

### Acceptance Test Example

```typescript
it('should create order', async () => {
  const product = ProductMother.create();
  await fakeProductRepo.save(product);

  const command = {
    customerId: CustomerMother.create().id.value,
    items: [{ productId: product.id.value, quantity: 2 }],
  };

  const result = await useCase.execute(command);

  expect(result.isSuccess).toBe(true);
});
```

### Integration Test Example

```typescript
it('should persist aggregate', async () => {
  const order = OrderMother.withLineItems([{ productId: 'P1', quantity: 2 }]);

  await repository.save(order);
  const retrieved = await repository.findById(order.id);

  expect(retrieved).toEqual(order);
});
```

## Detailed Anti-Patterns

- Hardcoded test data repeated in every test instead of using a reusable fixture API
- Constructor-heavy arrange blocks that hide the scenario under setup noise
- Mothers with invalid defaults that force every test to repair the object before use
- Scenario names that do not express domain meaning
- Giant fixture helpers that encode unrelated object graphs and become hard to trust

## Output Checklist Ideas

- Static or default `create()` entry point with sensible defaults
- Named scenarios such as pending, confirmed, expired, or rejected when the domain needs them
- Helper for child collections or aggregate members when common in tests
- Fluent builder only when customization pressure justifies it
- Supporting value-object or event mothers only where reused
