# Coverage Validation Examples

Use this reference when you need a concrete structure for reporting coverage improvement or validating that the new tests materially strengthened the suite.

## Example Coverage Improvement Report

```markdown
## Coverage Improvement Report

### Before

- Line Coverage: 68%
- Branch Coverage: 55%
- Uncovered Lines: 127
- Uncovered Branches: 45

### After

- Line Coverage: 83% (+15%)
- Branch Coverage: 78% (+23%)
- Uncovered Lines: 68 (-59)
- Uncovered Branches: 22 (-23)

### Tests Added

- test_order_caps_discount_at_total: Lines 20-21
- test_negative_total_raises_error: Lines 12-13
- test_payment_error_marks_order_failed: Lines 50-51

### Remaining Gaps

- Lines 105-108: Logging code (LOW priority, acceptable)
- Line 250: Defensive null check (LOW priority, acceptable)
```

## Focused Validation Commands

```bash
# Example: run a single test with focused coverage
pytest tests/test_order.py::test_order_caps_discount -v --cov=src.order

# Example: run focused mutation against changed code
stryker run --mutate "src/order_processor.py" --testFilter "test_order*"

# Example: review only the newly added test file for smells
/analyze tests/test_order_additions.py
```

Adjust the commands to the project toolchain, but keep the same sequence: verify the exact gap is covered, verify the suite-level delta, then verify assertion quality.
