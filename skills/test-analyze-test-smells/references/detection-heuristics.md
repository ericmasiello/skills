# Detection Heuristics

Read this file when the main skill has already chosen smell-review scope and you need fast triage patterns before manual confirmation.

These patterns are intentionally heuristic. They can produce false positives from comments, strings, test names, or framework setup code. Always confirm manually before reporting a smell.

## Grep-Style Triage Patterns

```bash
# Logic in tests
Grep: "\b(if|for|while|foreach)\b|\bmatch\b" --glob "**/*test*.*"

# Logic in tests with comment filtering for line-comment languages
Grep: "\b(if|for|while|foreach)\b" --glob "**/*test*.*" | grep -v "^\s*//" | grep -v "^\s*#" | grep -v "^\s*\*"

# Mock overuse
Grep: "createMock|createStub|mock\(|stub\(|spy\(|fake\(" --glob "**/*test*.*"

# Shared state and interdependence
Grep: "@depends|beforeAll|beforeClass|global|static\s+\$|shared\s+state" --glob "**/*test*.*"

# Testing internals directly
Grep: "setAccessible\(|Reflection|PrivateObject|private\s+method|internals?" --glob "**/*test*.*"

# Mystery guest
Grep: "getenv|process\.env|System\.getenv|os\.environ" --glob "**/*test*.*"

# Fragile interaction choreography
Grep: "expects\(.*(exactly|times)|toHaveBeenNthCalled|verify\(.*times|InOrder|ordered" --glob "**/*test*.*"
```

## Limitations

- comments and strings often contain legitimate keyword matches
- test names can trigger false positives
- parameterized frameworks sometimes use loops or setup helpers that are not smell evidence by themselves
- file or environment access may be valid when the fixture strategy is explicit and deterministic

## Stack-Specific Markers

- TypeScript or Jest: `jest.fn`, `toHaveBeenNthCalledWith`, `beforeAll`
- Python or pytest: `unittest.mock`, `monkeypatch`, module-level shared fixtures
- C# or xUnit or Moq or NSubstitute: `Substitute.For`, `Mock<>`, ordered or verifiable interaction chains
- Go or gomock or testify: `mock.Anything`, `gomock.InOrder`, package-level mutable fixtures

## Manual-First Rule

This skill remains manual-first on purpose. Use heuristics to narrow the search area, not to replace judgment.
