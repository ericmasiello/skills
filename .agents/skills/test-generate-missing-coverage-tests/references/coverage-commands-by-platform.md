# Coverage Commands By Platform

Read this file when the main skill has already selected a coverage strategy and you need concrete commands for the platform in front of you.

## Python

```bash
pytest --cov=src --cov-report=html --cov-report=term
```

Use focused module targets when possible rather than broad package-wide measurement.

## JavaScript Or TypeScript

```bash
npm test -- --coverage
```

Reuse the repository's configured runner and coverage provider if already present.

## CSharp

```bash
dotnet test /p:CollectCoverage=true
```

Prefer the collector or package pattern the repository already uses.

## Go

```bash
go test -cover -coverprofile=coverage.out
go tool cover -html=coverage.out
```

Keep the scope at the smallest owning package or package set that still represents the behavior under test.
