# Mutation Config Examples

Read this file when the main skill has already chosen a mutation tool and you need the smallest practical setup example for that platform.

## TypeScript / JavaScript With Stryker

Prefer the repository's existing Stryker setup if one exists.

Typical config focus:

- mutated file globs
- test runner selection
- coverage analysis mode

Minimal example:

```json
{
  "mutate": ["src/services/UserService.ts"],
  "testRunner": "jest",
  "coverageAnalysis": "perTest"
}
```

Focused execution example:

```bash
npx stryker run
```

If the repo supports test filtering, pair the focused mutate list with the narrowest matching test selection.

## Python With mutmut

Prefer `mutmut` for pytest-based projects when it works cleanly in the environment.

Typical config focus:

- target module or package
- test command
- runner arguments

Focused execution example:

```bash
mutmut run --paths-to-mutate src/user_service.py
```

If the environment needs more explicit operator or execution control, fall back to `cosmic-ray` only when justified.

## C# With Stryker.NET

Prefer project-level scope first, then narrow by project or filters already supported by the repo.

Typical config focus:

- project under mutation
- related test project
- path or mutation filters

Focused execution example:

```bash
dotnet stryker --project src/MyProject/MyProject.csproj
```

### Known limitation: cross-project acceptance tests (`-tp`/`--test-project`)

When the tests that exercise the mutated class live in a **different** test project than the one conventionally paired with it (e.g. an HTTP-level acceptance test in an `Api.Tests` project exercising a class in `Application.csproj`, rather than `Application.Tests`), Stryker.NET's `-tp`/`--test-project` flag only resolves **direct** project references of the test project you point it at — it does not follow transitive references. If the test project only transitively depends on the mutated project (via another project reference), Stryker will fail to find/attribute coverage correctly.

Before spending multiple attempts on flag combinations, check quickly whether the test project has a **direct** `ProjectReference` to the project under mutation. If it doesn't:

- confirm the exact behavior with `dotnet-stryker --help` and the installed version (this limitation may differ by version; newer Stryker.NET releases may resolve transitive references),
- if still blocked, do not keep guessing at `-tp` combinations — record mutation evidence as Missing Evidence and route to a human with the setup limitation, and
- record the finding (tool version + exact blocked combination) so the next run on this repo doesn't repeat the same failed attempts.

## Go With go-mutesting

Prefer package-level targeting for the smallest package that owns the changed behavior.

Typical config focus:

- package path
- any required test wrapper command or flags

Focused execution example:

```bash
go-mutesting ./internal/userservice/...
```

## Configuration Rule

Reuse existing repository config whenever possible. Add only the minimum extra configuration needed for the focused run instead of introducing a second mutation pattern.
