# Scoring And Report Examples

Use these examples when a testability review needs a concrete scoring walkthrough or report shape.

## Testability Reality

```txt
Code with legacy smells -> untestable -> seams first
Code with seams applied -> testable -> tests can be written
```

## Example Coverage Inventory

| Test File              | Test Type  | What It Tests        | Coverage                        |
| ---------------------- | ---------- | -------------------- | ------------------------------- |
| `order.spec.ts`        | Unit       | Order aggregate      | `Order.create`, `Order.addItem` |
| `create-order.spec.ts` | Acceptance | CreateOrder use case | Happy path only                 |

## Example Code-To-Test Map

```txt
ProductionFile          Tests                     Coverage
-----------------------------------------------------------
Order.ts                order.spec.ts             70%
  - create()            tested
  - addItem()           tested
  - removeItem()        untested
  - calculateTotal()    partial

OrderProcessor.ts       NONE                      0%
  - process()           untested (has smells)
  - validate()          untested (has smells)
```

## Example Analysis

```markdown
## Testability Gap Report: OrderModule

### Coverage Summary

| Area           | Current | Target | Gap |
| -------------- | ------- | ------ | --- |
| Domain         | 70%     | 90%    | 20% |
| Application    | 30%     | 80%    | 50% |
| Infrastructure | 50%     | 70%    | 20% |

### Gaps by Priority

| Priority | Component                | Score | Calculation  | Reason Untested                  |
| -------- | ------------------------ | ----- | ------------ | -------------------------------- |
| #1       | OrderProcessor.process() | 20.0  | (10 x 8) / 4 | Has smells: Singleton, Hardcoded |
| #2       | PaymentGateway.charge()  | 15.0  | (9 x 10) / 6 | Has smells: Static method        |
| #3       | Order.removeItem()       | 8.0   | (8 x 4) / 4  | Missing tests                    |
| #4       | Logger.format()          | 2.0   | (2 x 2) / 2  | Low priority                     |
```

## Example Seam Order

| Order | Seam                         | Target          | Unblocks | Risk   |
| ----- | ---------------------------- | --------------- | -------- | ------ |
| 1     | Parameterize Constructor     | OrderProcessor  | 5 tests  | LOW    |
| 2     | Introduce Static Setter      | ConfigManager   | 8 tests  | LOW    |
| 3     | Extract and Override Call    | Time handling   | 3 tests  | LOW    |
| 4     | Introduce Instance Delegator | PaymentProvider | 5 tests  | MEDIUM |

## Example Coverage Visualization

```txt
Domain Layer         70%
Application Layer    30%
Infrastructure       50%

ProcessPayment        0%  <- critical
PaymentGateway        0%  <- high
```
