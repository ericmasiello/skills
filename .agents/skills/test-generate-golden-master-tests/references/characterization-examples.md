# Golden Master Characterization Examples

Read this file when you need worked examples of approval/snapshot characterization. Use only after you have already chosen Golden Master and controlled non-determinism.

## Example 1: Characterizing a Legacy Invoice Generator

**Scenario**: Legacy `InvoiceFormatter.generate()` produces complex HTML/PDF output with calculations, formatting, and conditional sections.

**Problem**: 50+ interacting branches make hand-written assertions brittle. Output structure is complex.

**Golden Master Approach**:

```python
# Step 1: Install approval framework
# pip install approvaltests

# Step 2: Control non-determinism
class TestableInvoiceFormatter(InvoiceFormatter):
    def __init__(self, fixed_date=None):
        super().__init__()
        self.fixed_date = fixed_date or datetime(2024, 1, 15)

    def get_current_date(self):
        return self.fixed_date  # Seam: override for determinism

# Step 3: Create approval test with Cartesian product
from approvaltests import verify
import pytest

# Input dimensions: customer_type × payment_status × line_item_count
test_cases = [
    ("premium", "paid", 1),
    ("premium", "paid", 5),
    ("premium", "unpaid", 1),
    ("premium", "unpaid", 5),
    ("standard", "paid", 1),
    ("standard", "paid", 5),
    ("standard", "unpaid", 1),
    ("standard", "unpaid", 5),
]

@pytest.mark.parametrize("customer_type,payment_status,item_count", test_cases)
def test_invoice_generation_captures_current_behavior(customer_type, payment_status, item_count):
    # Arrange
    formatter = TestableInvoiceFormatter(fixed_date=datetime(2024, 1, 15))
    invoice = InvoiceMother.create(
        customer_type=customer_type,
        payment_status=payment_status,
        line_items=LineItemMother.create_list(item_count)
    )

    # Act: capture actual output
    output = formatter.generate(invoice)

    # Assert: approve actual behavior
    verify(output, options={"namer": f"invoice_{customer_type}_{payment_status}_{item_count}"})
```

**Workflow**:

1. First run fails with "received" file showing actual output
2. Review output to confirm it matches current production behavior
3. Approve by copying received → approved
4. Future runs detect any drift from approved baseline

**Result**: 8 test cases cover major behavioral combinations. Any change to calculations, formatting, or conditional logic triggers approval diff.

## Example 2: Approval Test for Legacy Report with Normalization

**Scenario**: Legacy report generator includes timestamps, GUIDs, and random order.

**Challenge**: Non-determinism causes false failures.

**Solution**: Normalize before approval

```typescript
import { verify } from 'approvals';

describe('LegacyReportGenerator', () => {
  it('should capture report structure and content', () => {
    // Arrange: inject fixed dependencies
    const generator = new ReportGenerator(
      new FixedClock('2024-01-15T10:00:00Z'),
      new SequentialIdGenerator(), // replaces UUID
    );

    // Act: generate report
    const report = generator.generateMonthlyReport(testData);

    // Normalize non-deterministic fields
    const normalized = normalizeReport(report);

    // Assert: approve normalized output
    verify(JSON.stringify(normalized, null, 2));
  });
});

function normalizeReport(report) {
  return {
    ...report,
    generatedAt: '<TIMESTAMP>',
    reportId: '<ID>',
    items: sortBy(report.items, 'id'), // stable order
  };
}
```

**Key Practices**:

- Control time and IDs through seams
- Normalize remaining non-determinism in output
- Sort collections for stable comparison
- Approve normalized structure, not raw output
