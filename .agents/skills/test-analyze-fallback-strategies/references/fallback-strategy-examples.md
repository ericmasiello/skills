# Fallback Strategy Examples

Use these examples when the task needs literal strategy definitions, mini examples, or anti-pattern contrasts.

## Sprout Method

Add a new method next to fragile legacy code and call it only for targeted paths.

```txt
before: processOrder() has 200 lines and side effects
after:  processOrder() calls calculateDiscountSprout() for new discount rule
```

Anti-pattern:

```txt
rewrite the entire processOrder() body and delete old logic in one change
```

## Sprout Class

Add a new class for a cohesive slice and delegate to it incrementally.

```txt
before: InvoiceService handles parsing + billing + notification
after:  InvoiceService delegates notification logic to NotificationSprout
```

Anti-pattern:

```txt
create a new class and move all unrelated responsibilities into it at once
```

## Wrap Method

Keep the method contract stable and wrap the risky call behind a seam.

```txt
before: charge() directly calls LegacyGateway.charge()
after:  charge() calls doChargeWrapper(); wrapper can be substituted in tests
```

Anti-pattern:

```txt
change business rules while introducing the wrapper
```

## Higher-level Integration Test

Test behavior through a stable system boundary when low-level seams are not practical yet.

```txt
before: no safe seam to unit-test retry logic
after:  integration test validates retry behavior through service endpoint
```

Anti-pattern:

```txt
use integration tests as a permanent substitute for all seam work
```

## Strangler Fig

Route traffic through a new boundary or facade and expand coverage incrementally.

```txt
before: all requests go to LegacyPricingEngine
after:  facade routes 10% to NewPricingEngine, then expands gradually
```

Anti-pattern:

```txt
single-release full cutover that removes the legacy path immediately
```
