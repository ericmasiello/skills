# Skip Classification Taxonomy And Detection

This reference expands the classification buckets, detection mechanics, and edge cases used by `test-evaluate-skipped-files`. Keep the main `SKILL.md` for the rubric; use this file when a verdict is not obvious.

## Guiding Question

For each skipped file ask: **"If a test ran against this file, is there any behavior a test could meaningfully assert?"**

- No → the skip is likely legitimate.
- Yes → the skip is a masked gap regardless of why it was excluded.

Behavior worth asserting = a branch, a computed value, a transformation, a validated rule, an error path, or an observable side effect.

## Legitimate Skip — Definitions And Examples

### Generated / vendored code

Emitted by a tool (protobuf, OpenAPI clients, ORM scaffolds, source generators) or copied from a third party. The generator is the source of truth; a test would assert the generator, not the app.

- ✅ Legitimate when the file is reproducible and unedited by hand.
- ⚠️ Becomes a masked gap once someone hand-edits generated output to add logic (see Edge Cases).

### Pure declarations

Interfaces, abstract method signatures, enums, constant tables, attribute/marker types. No executable decisions.

```csharp
public interface IThemeRepository
{
    Task<Result<BackgroundTheme, DomainError>> Save(BackgroundTheme theme);
}
```

Nothing to assert — no body executes.

### Plain data carriers

DTOs, records, POCOs, entity models with only auto-properties and no logic.

```csharp
public class MyFeatureEntity
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}
```

✅ Legitimate — until a property getter/setter, constructor, or method introduces a rule.

### Framework wiring with no branching

DI registration, route maps, plain bootstrap. If it is a flat list of registrations with no conditionals, there is no behavior to protect.

### Trivial pass-through

One-line delegation with no transformation, mapping, or branching.

```csharp
public Task<Result<Theme, DomainError>> Get(ThemeId id) => _inner.Get(id);
```

### Test-support / fixtures

Object mothers, builders, fakes. They exist to serve tests; excluding them from production coverage is expected.

## Masked Gap — Definitions And Examples

Any of the following means the skip hides real, assertable behavior:

- **Branching**: `if`/`switch`/ternaries/guard clauses/loops with decisions.
- **Calculation / transformation**: mapping with rules, parsing, formatting, arithmetic, aspect-ratio or locale logic.
- **Error handling**: `try/catch`, `Result` failure branches, retries, fallbacks, tombstones.
- **Validation**: value-object `Create()` rules — these are the exact domain rules the codebase relies on.
- **Side effects**: persistence, SQS publish, HTTP calls, Cloudinary/SmartAssets writes with observable outcomes.
- **Quarantined behavior**: a skipped/`xfail` test that used to protect real logic.

```csharp
public static Result<ThemeName, DomainError> Create(string value)
{
    if (string.IsNullOrWhiteSpace(value))       // branch + validation
        return DomainError.ValidationError("Theme name cannot be empty");
    if (value.Length > 100)                     // branch + validation
        return DomainError.ValidationError("Theme name too long");
    return new ThemeName(value);
}
```

Excluding this file is a masked gap: the validation rules are precisely what tests must lock.

## Platform-Specific Skip Detection

### TypeScript / JavaScript (Vitest / Jest)

- Config: `coverage.exclude`, `coveragePathIgnorePatterns`, negated `collectCoverageFrom`.
- Inline: `/* istanbul ignore file */`, `/* istanbul ignore next */`.
- Skipped tests: `describe.skip`, `it.skip`, `it.todo`, `xit`.

### Python (pytest / coverage.py)

- Config: `.coveragerc` `[run] omit`, `[report] exclude_lines`.
- Inline: `# pragma: no cover`.
- Skipped tests: `@pytest.mark.skip`, `@pytest.mark.xfail`, `pytest.skip()`.

### C# / .NET (coverlet / Stryker)

- Attribute: `[ExcludeFromCodeCoverage]` on class/method.
- Config: coverlet `Exclude`/`ExcludeByFile`, `<Exclude>` in `.runsettings`.
- Mutation: Stryker `mutate` negations in `stryker-config`.
- Skipped tests: `[Fact(Skip = "...")]`, `[Theory(Skip = "...")]`, `[Trait("Category","Flaky")]` filters.

### Go

- Coverage scope: `-coverpkg` omissions, build tags excluding files.
- Skipped tests: `t.Skip()`, `t.Skipf()`, build-tag-gated test files.

Always record _where_ the skip lives — an attribute is owned by the file's author, a config glob by whoever maintains the pipeline, a skipped test by whoever quarantined it. The owner differs, so the fix path differs.

## Edge Cases

- **Generated-then-edited**: a file starts generated but gains hand-written logic. The hand-written behavior is a masked gap even though the header says "generated". Verdict: Masked gap for the edited region.
- **DTO with a computed member**: mostly data, but one property/method computes or validates. Verdict: Masked gap scoped to that member.
- **Flaky quarantine**: "we skipped it because it's flaky." Flakiness is a separate defect; the underlying behavior is still unprotected. Verdict: Masked gap + note the flakiness as its own issue.
- **Whole-file ignore on a mixed file**: `ignore file` over a file that has both wiring and logic hides the logic. Verdict: Masked gap; recommend narrowing the ignore to the declarative region.
- **Excluded to make a gate green**: any skip added to pass a failing coverage/mutation gate is a red flag. Verdict: Masked gap unless the file independently proves no behavior.

## False Justifications To Reject

Do not accept these as reasons a skip is legitimate:

- "It's in a `Dto`/`Models`/`Config` folder." → Read the file; folders lie.
- "It was already excluded." → Prior exclusion is not evidence.
- "It's simple." → Simple branching is still branching.
- "It's hard to test." → That is a seam problem, route to `test-analyze-testability-blockers`, not a skip justification.
- "Coverage tool can't reach it." → Non-instrumentation is a mechanism, not a behavior verdict.

## Handoff Guidance

- Masked gap + untestable as written → `test-analyze-testability-blockers`.
- Masked gap + testable → `test-generate-missing-coverage-tests` or `test-generate-unit-characterization-tests`.
- After a skip is removed and tests added → `test-evaluate-targeted-coverage` to remeasure.
