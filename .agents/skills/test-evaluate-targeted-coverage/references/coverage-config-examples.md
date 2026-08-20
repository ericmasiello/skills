# Coverage Config Examples

Read this file when the main skill has already selected a coverage tool and you need a minimal platform-specific setup example.

## TypeScript / JavaScript

Prefer the repo's configured runner first, usually `Vitest` or `Jest`.

Use this guidance when coverage is missing or only partially configured:

- install a coverage provider only if one is absent
- add the smallest possible include/exclude configuration
- prefer text + JSON + HTML or lcov reporters when downstream tooling needs them

Typical config focus:

- coverage provider
- include / exclude globs
- reporter selection
- targeted test file filter

Minimal example:

```javascript
export default {
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts', 'node_modules/**'],
      reporter: ['text', 'json', 'html'],
    },
  },
};
```

Focused execution example:

```bash
npx vitest run src/services/UserService.spec.ts --coverage
```

## Python

Prefer `pytest` with `pytest-cov`.

Typical config focus:

- `--cov` target
- test path filter
- branch coverage flag if used

Focused execution examples:

```bash
pytest tests/test_user_service.py --cov=src.user_service --cov-report=term
pytest tests/test_user_service.py --cov=src.user_service --cov-report=xml
```

If imports are path-sensitive, ensure the project root or `src` path is discoverable before running coverage.

## CSharp

Prefer `dotnet test` with a built-in collector or `coverlet`.

Typical config focus:

- collector package or flags
- output format
- test project selection

Focused execution example:

```bash
dotnet test tests/MyProject.Tests/MyProject.Tests.csproj /p:CollectCoverage=true
```

If the collector is missing, add the minimal package or project configuration already used elsewhere in the repo rather than inventing a second pattern.

## Go

Prefer `go test -cover` or `go test -coverprofile`.

Typical config focus:

- package path
- coverprofile output

Focused execution example:

```bash
go test -coverprofile=coverage.out ./internal/userservice
go tool cover -html=coverage.out
```

## Reporter Guidance

Choose the smallest reporter set that satisfies the downstream consumer:

- `text` for quick local confirmation
- `json` for normalization or scripts
- `html` for interactive inspection
- `lcov` or XML when CI or external tools require them

When the repo already has a reporting convention, reuse it.
