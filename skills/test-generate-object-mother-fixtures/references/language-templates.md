# Object Mother Language Templates

Preserved language-specific Object Mother and builder examples extracted from the earlier inline skill.
Use this file when generation needs concrete code shapes instead of only the compact rules.

## TypeScript

```typescript
export class OrderMother {
  static create(
    overrides?: Partial<{
      id: OrderId;
      customerId: CustomerId;
      status: OrderStatus;
      createdAt: Date;
    }>,
  ): Order {
    return Order.reconstitute(
      overrides?.id ?? OrderId.generate(),
      overrides?.customerId ?? CustomerId.from('CUST-DEFAULT'),
      overrides?.status ?? OrderStatus.PENDING,
      overrides?.createdAt ?? new Date('2024-01-01'),
    );
  }

  static createPending(): Order {
    return this.create({ status: OrderStatus.PENDING });
  }

  static createConfirmed(): Order {
    return this.create({ status: OrderStatus.CONFIRMED });
  }

  static withLineItems(
    items: Array<{ productId: string; quantity: number; unitPrice?: number }>,
  ): Order {
    const order = this.create();
    for (const item of items) {
      order.addLineItem(
        ProductId.from(item.productId),
        item.quantity,
        Money.from(item.unitPrice ?? 100),
      );
    }
    return order;
  }

  static builder(): OrderBuilder {
    return new OrderBuilder();
  }
}
```

## Python

```python
class OrderMother:
    @staticmethod
    def create(
        id: Optional[OrderId] = None,
        customer_id: Optional[CustomerId] = None,
        status: Optional[OrderStatus] = None,
        created_at: Optional[datetime] = None,
    ) -> Order:
        return Order.reconstitute(
            id=id or OrderId.generate(),
            customer_id=customer_id or CustomerId.from_string('CUST-DEFAULT'),
            status=status or OrderStatus.PENDING,
            created_at=created_at or datetime(2024, 1, 1),
        )

    @staticmethod
    def create_pending() -> Order:
        return OrderMother.create(status=OrderStatus.PENDING)

    @staticmethod
    def create_confirmed() -> Order:
        return OrderMother.create(status=OrderStatus.CONFIRMED)
```

## C#

```csharp
public static class OrderMother
{
    public static Order Create(
        OrderId? id = null,
        CustomerId? customerId = null,
        OrderStatus? status = null,
        DateTime? createdAt = null)
    {
        return Order.Reconstitute(
            id ?? OrderId.Generate(),
            customerId ?? CustomerId.From("CUST-DEFAULT"),
            status ?? OrderStatus.Pending,
            createdAt ?? new DateTime(2024, 1, 1)
        );
    }

    public static Order CreatePending() => Create(status: OrderStatus.Pending);
    public static Order CreateConfirmed() => Create(status: OrderStatus.Confirmed);
}
```

## Go

```go
type OrderMother struct{}

func (m OrderMother) Create(opts ...OrderOption) *Order {
    o := &orderOptions{
        id:         GenerateOrderID(),
        customerID: CustomerID("CUST-DEFAULT"),
        status:     OrderStatusPending,
        createdAt:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
    }

    for _, opt := range opts {
        opt(o)
    }

    return ReConstituteOrder(o.id, o.customerID, o.status, o.createdAt)
}

func (m OrderMother) CreatePending() *Order {
    return m.Create(WithOrderStatus(OrderStatusPending))
}
```
