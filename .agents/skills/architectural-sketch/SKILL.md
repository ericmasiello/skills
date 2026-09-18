---
name: architectural-sketch
description: "Describe architectural changes, structural modifications, or implementation phases using before/after code diagrams and structural sketches. Use when asked to describe an architectural change, sketch an architecture, illustrate structural diffs, or define phase outcomes with before/after code sketches."
---

# Architectural Sketch

Describe structural code changes and phase outcomes using concrete, text-based code diagrams. A sketch illustrates changes that are hard to reconstruct from a raw diff alone: new boundaries, provider trees, hook extractions, API transitions, or data flow shifts.

## When to sketch

Produce an architectural sketch when a change or planned phase involves **structural modifications**:

- New providers, context boundaries, or wrapper hierarchies
- Hook extractions, composition shifts, or state lift/push
- API or interface signature changes and call-site migrations
- Data flow rerouting or module boundary realignments
- Multi-phase implementation plans where each phase lands a concrete structural milestone

**Skip sketching** for changes obvious from the diff alone:
- Isolated bug fixes where the old behavior was simply broken
- Style/CSS tweaks or isolated prop updates
- Straightforward renames without signature or topological shifts
- Test-only changes

---

## Diagram conventions

### 1. File path annotations
Annotate every block with a file-path comment on the first line:

```tsx
// Before — path/to/File.tsx
<OldStructure />

// After — path/to/File.tsx
<NewStructure />
```

For diagrams spanning multiple files or representing conceptual components, use clear file paths or component annotations (e.g. `// path/to/File.tsx (simplified)`).

### 2. Before / after rules
- **Structural modifications**: Provide explicit `// Before` and `// After` blocks. Highlight the key transition points with inline comments (e.g. `/* NEW */` or `// relocated`).
- **Purely additive additions**: For new files, exports, or components with no prior equivalent, omit `// Before` and annotate with `// NEW — path/to/NewFile.tsx`.
- **Bug fixes and pure renames**: Omit the `// Before` block if showing the broken or obsolete state introduces noise without clarifying the design.

### 3. Layering order
When diagramming a structural shift, present two levels in sequence:

1. **API / Call-site level first**: How consumers or callers interact with the changed boundary (props, exported hook signatures, function arguments, import paths). Ground the reader in the external surface first.
2. **Internals level second**: What changed inside the implementation (internal component tree, extracted sub-hooks, restructured state).

---

## Choosing the visual medium

Match the visual shape to the nature of the change:

| Shape of Information | Chosen Medium | Format |
|---|---|---|
| **Structural code change** (providers, hooks, API signatures, JSX tree) | **Text-based code sketch** | Fenced code blocks (`tsx`, `ts`, etc.) annotated with `// Before` and `// After` file paths. |
| **Component topology / directed edges** (service calls, 3+ interacting modules, state machine transitions) | **Mermaid diagram** | Directed graph (`graph TD` or `sequenceDiagram`) showing edges and message flow. |
| **Parallel variant comparison** (matrix of flags, trade-offs, bundle/perf measurements) | **Markdown table** | Table comparing attributes across variants or phases. |

Avoid mixing formats unnecessarily: do not use Mermaid for JSX provider hierarchies or signature diffs where code speaks more accurately.

---

## Examples

### Provider hierarchy shift

```tsx
// Before — apps/studio/src/studioSix/defaultExperience/DefaultExperience.tsx
<DesignEngineProvider>
  <ErrorBoundaryWithSave>
    <FeatureTree />
  </ErrorBoundaryWithSave>
</DesignEngineProvider>

// After — apps/studio/src/studioSix/defaultExperience/DefaultExperience.tsx
<DesignEngineProvider>
  <StudioSaveIntegrationProvider>  {/* NEW */}
    <ErrorBoundaryWithSave>
      <FeatureTree />
    </ErrorBoundaryWithSave>
  </StudioSaveIntegrationProvider>
</DesignEngineProvider>
```

### Hook / API extraction

```ts
// Before — src/features/save/useSave.ts
// Integration parameters mixed with caller options
const save = useSave({
  allowAnonymousUser: true,
  showSaveToast: false,
  getDocumentForSave: useGetDocumentForSave(),
  tenantId,
  authToken,
});

// After — src/features/save/useSave.ts
// Scope bound by provider; call-site receives pre-configured functions
const { configureSave, getDocumentForSave } = useSaveFunctions();
const save = configureSave({
  allowAnonymousUser: true,
  getDocumentForSave,
});
```

### Phase outcome sketch

When planning multi-phase work, define each phase's target structural outcome with an architectural sketch:

```ts
// Phase 1 outcome — src/domain/pipeline.ts (NEW boundary)
export interface DataPipeline<TInput, TOutput> {
  process(input: TInput): Promise<TOutput>;
}

// Phase 2 outcome — src/services/consumer.ts (Call-site migration)
// Before:
legacyProcessor.run(payload);

// After:
await pipeline.process(payload);
```
