# Property-Based Testing (PBT) Strategy

Read this file when the main skill has already decided that a property-based test may fit the observed behavior and you need value domains, patterns, tooling, or tuning detail.

Property-based testing writes properties ("for all valid inputs, condition Z holds") instead of examples ("given X, expect Y"). The framework generates hundreds or thousands of inputs to check the property, dramatically expanding test coverage.

## When PBT Adds Value

**HIGH value domains**:

- Algorithms and data structures
- Serialization/deserialization (roundtrip properties)
- Business rules (validation, calculations)
- Protocols and state machines
- Mathematical operations

**LOW value domains**:

- Simple CRUD operations
- UI interaction logic
- External API integrations with fixed responses

PBT **complements** example-based testing, doesn't replace it. Use examples to drive detailed design, then add properties to generalize.

## Property Patterns

Choose the pattern that matches observed behavior:

1. **Invariants**: "For all inputs, condition holds"
   - Examples: sorted list is ordered, balance >= 0, list length unchanged after sort
   - Use when behavior has a universal rule

2. **Roundtrip**: "Encode then decode = original"
   - Examples: serialize/deserialize, compress/decompress, hash consistency
   - Use for reversible transformations

3. **Oracle**: "Compare against reference implementation"
   - Examples: optimized algorithm vs correct-but-slow version
   - Use when you have a trusted reference

4. **Metamorphic**: "Different operations, same result"
   - Examples: add(a,b) == add(b,a), filter can't increase size
   - Use for algebraic properties

## PBT Tools by Language

| Language              | Framework  | Notes                            |
| --------------------- | ---------- | -------------------------------- |
| Python                | Hypothesis | Most mature, excellent shrinking |
| JavaScript/TypeScript | fast-check | Integrates with Jest/Vitest      |
| C#                    | FsCheck    | F#-based, works with xUnit/NUnit |
| Go                    | rapid      | Lightweight API, good shrinking  |

Adopted by Amazon, Volvo, Stripe, Jane Street (ICSE 2024 study).

## PBT + TDD Integration

Integrate property-based testing into the characterization workflow:

1. **Start with example-based tests** for specific observed cases - drives detailed design
2. **Once behavior is understood**, write properties to generalize the pattern
3. **If property fails**: you found a bug or need to refine the implementation
4. **Refactor freely** - properties verify behavior preservation better than examples

Properties act as higher-level specifications that survive refactoring better than individual examples.

## PBT Performance Guidance

Configure example count based on context:

- **Fast feedback loop**: ~100 examples (local development)
- **CI/CD pipeline**: ~1000 examples (pull request validation)
- **Nightly builds**: ~10,000+ examples (comprehensive verification)

Modern PBT frameworks allow configuring example count per test or environment.

## Shrinking

When a property fails, the framework automatically finds the **minimal failing input**. This dramatically accelerates debugging.

**Shrinking algorithm**:

1. Find a failing input
2. Try simpler variants (smaller numbers, shorter strings, fewer elements)
3. If variant still fails, use it as new candidate
4. Repeat until no simpler failing input exists

**Example**: Property fails on `[1, 2, 3, 4, 5]` → shrinks to `[1, 2]` → reveals bug only needs two elements to trigger.
