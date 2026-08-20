# HTML Report Format — Studio addendum

See `improve-codebase-architecture`'s [HTML-REPORT.md](../improve-codebase-architecture/HTML-REPORT.md) for the scaffold, header, candidate-card structure, diagram patterns, style guidance, and tone. This file only adds what's unique to the Studio monorepo review.

## Section structure

Unlike the generic single `#candidates` section, this skill's report has three top-level sections instead of one, per the ranking in [SKILL.md](SKILL.md) step 4:

```html
<section id="cross-package" class="space-y-10">...</section>
<section id="per-package" class="space-y-10">...</section>
<section id="patterns" class="space-y-6">...</section>
```

## Cross-package section (unique to Studio monorepo review)

For cross-package coupling findings, use a Mermaid graph that shows the package-level dependency:

```html
<div class="rounded-lg border border-slate-200 bg-white p-4">
  <pre class="mermaid">
    flowchart TD
      A["@internal/feature-previews"] --> B["@internal/data-access-designs"]
      A --> C["@internal/util-canvas"]
      B --> C
      C -.leak.-> D["@internal/feature-editor"]
      classDef leak stroke:#dc2626,stroke-width:2px;
      class C,D leak
  </pre>
</div>
```
