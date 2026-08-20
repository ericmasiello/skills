---
name: studio-integration-testing
description: Write integration tests for hooks and components in the Studio monorepo that depend on DesignEngine, providers, and complex runtime state. Uses minimal mocking with real InteractiveDesignEngine, DocumentBuilder, and provider wrappers. Use when testing hooks or components that interact with DesignEngine, RichTextManager, ColorPalette, TextLikeAdaptersContext, or other Studio-specific providers.
---

# Studio Integration Testing

Integration tests for hooks and components that depend on DesignEngine and other Studio providers. Uses real infrastructure by avoiding mocking. Only apply targeted mocking for aspects that are impractical to set up.

<when-to-use>

## When to Use This Pattern

Use this pattern when testing hooks or components that:

- Depend on `useDesignEngine` or other DesignEngine-related hooks
- Need provider context (ColorPaletteProvider, TextLikeAdaptersContext, etc.)
- Interact with CimDoc/document state via DocumentBuilder
- Call `designEngine.executeCommand` or similar methods
- Render conditionally based on selected item type (text, word art, table)
- Are wrapped in MobX `observer` and react to observable state changes

**Don't use this for**: Pure logic hooks/components that don't need providers
(use unit testing instead). For general component testing patterns (selectors,
user-event, assertions), see the `automated-testing` skill.

</when-to-use>

<core-loop>

## Core Loop (MANDATORY)

Follow this loop end-to-end. Do not skip phases or exit early.

### Phase 1 — Test Writing Loop (repeat until coverage ≥ 90%)

1. **Read** the source file under test — understand every branch, early return, and conditional
2. **Identify** untested code paths by running `pnpm go <package> test:coverage` and inspecting the report in `@build/studio`
3. **Negotiate mocks** with the user (see Mock Negotiation Protocol below)
4. **Write / extend** integration tests targeting uncovered paths — use patterns from the Core Pattern section
5. **Run** `pnpm go <package> test:coverage` — check coverage on the module under test
6. **If coverage < 90%** → go back to step 2. Identify the specific uncovered branches and write tests for them.

### Phase 2 — Validation Loop (repeat until all green)

Run all three checks:

```bash
pnpm go <package> typecheck
pnpm go <package> lint
pnpm go <package> test
```

If any fail → fix → rerun **all three** from the top.

**Before each rerun**, also audit the test file for these code quality rules:

| Rule | What to check | Fix |
|---|---|---|
| **Import hoisting** | All `import` statements MUST appear above all `vi.mock()` calls. No imports between or after mocks. | Move imports to the top of the file. `vi.mock` is hoisted by Vitest regardless of source position. |
| **Typed partial mocks** | Every partial mock value MUST use `fromPartial<ExplicitType>()` from `@internal/tools-consolidated/vitest`. | Replace `{ foo: 'bar' } as SomeType` with `fromPartial<SomeType>({ foo: 'bar' })`. |
| **Typed mock functions** | Every `vi.fn()` and `vi.mocked()` call MUST have explicit types — no untyped mock return values. | Add type parameters: `vi.fn<() => ReturnType>()`, `vi.mocked(hook).mockReturnValue(typedValue)`. |
| **No `as` casts** | Zero `as SomeType` casts in test files. Use type assertion guard functions instead. | Write an `asserts item is T` function (see REFERENCE.md) and call it before accessing typed properties. |
| **ESLint disables** | Only approved patterns allowed: `testing-library/no-container` (CSS variable verification) and `jsx-a11y/click-events-have-key-events` + `jsx-a11y/no-static-element-interactions` (test event propagation wrappers). Every disable MUST have a `--` reason suffix. See Approved ESLint Disable Patterns for usage examples. | Remove unapproved disables. Fix the underlying lint issue instead. |

### Exit Condition

The loop is **done** when ALL of these are true simultaneously:

- [ ] `typecheck` passes
- [ ] `lint` passes
- [ ] `test` passes
- [ ] Coverage ≥ 90% on the module under test
- [ ] All 5 code quality rules pass

If you fix a lint/typecheck error and it breaks tests, you're back in the loop.

</core-loop>

<mock-negotiation>

## Mock Negotiation Protocol (MANDATORY)

Before writing any `vi.mock()` call, you MUST negotiate mocks with the user.

### Step 1: Propose Mocks

Present a table of every dependency you intend to mock:

| Dependency | Justification |
|---|---|
| `useColorPaletteForSelectedItems` | Requires product-level color palette data loaded from full app context — no test-friendly factory exists |
| `IntersectionObserver` | Browser API unavailable in Node's JSDOM environment |

Each justification must explain **why the real implementation is impractical** — not what the mock does.

### Step 2: Reach Agreement

Wait for explicit user approval before writing mock code. If the user says:

- **Approved** → Proceed with mocking using patterns in the Core Pattern section. Add an inline comment above each mocked value explaining **WHY** it's mocked (not what it does).
- **Do not mock X** → Implement without mocking X. Use real implementations, test helpers, or alternative setup strategies.

#### Mock Comment Examples

```typescript
// ✅ WHY — explains the infrastructure gap that forces the mock
vi.mock("@internal/feature-color-palette", async () => {
    const actual = await vi.importActual<typeof import("@internal/feature-color-palette")>(
        "@internal/feature-color-palette"
    );
    return {
        ...actual,
        // Color palette data is injected by the product shell at app boot — no test-level provider exists
        useColorPaletteForSelectedItems: vi.fn()
    };
});

// ❌ WHAT — restates the code; tells you nothing about the decision
vi.mock("@internal/feature-color-palette", async () => {
    const actual = await vi.importActual<typeof import("@internal/feature-color-palette")>(
        "@internal/feature-color-palette"
    );
    return {
        ...actual,
        // Mock the color palette hook
        useColorPaletteForSelectedItems: vi.fn()
    };
});
```

### Step 3: Escalate if Stuck

If you cannot implement without a rejected mock after a genuine attempt:

1. Show the specific error or infrastructure gap blocking you
2. Ask: *"I'm struggling to test this without mocking X because [concrete reason]. Would you like to help me find an alternative, or should we revisit mocking X?"*

**Never silently re-introduce a rejected mock.**

</mock-negotiation>

<patterns>

## Core Pattern

### 1. Minimal Mocking Strategy

Mock **only** dependencies approved through the Mock Negotiation Protocol. Every mock MUST have an inline comment explaining **WHY** the value is mocked (not what it does):

```typescript
import { useColorPaletteForSelectedItems } from "@internal/feature-color-palette";

vi.mock("@internal/feature-color-palette", async () => {
    const actual = await vi.importActual<typeof import("@internal/feature-color-palette")>(
        "@internal/feature-color-palette"
    );
    return {
        ...actual,
        // Depends on product-level color palette data requiring full app context — impractical in tests
        useColorPaletteForSelectedItems: vi.fn()
    };
});
```

**What to mock**: Browser APIs unavailable in Node (e.g., `IntersectionObserver`, `ResizeObserver`), network-bound hooks best handled by MSW (see `msw-network-testing` skill), and product-level state requiring full application context.

**What NOT to mock**: Everything else — prefer real implementations.

### 2. Reusable Helpers

Create helpers at module level. This canonical `createDesignEngine` includes
`ItemSelectionExtension` + `setVisiblePanelIds` so `useSelectedItems` works
without mocking. Remove those lines if the hook doesn't use `useSelectedItems`.

```typescript
const createDesignEngine = (cimDoc: CimDoc) => {
    const designEngine = new InteractiveDesignEngine({
        authProvider: vi.fn().mockResolvedValue({ Authorization: "Bearer mock-access-token" }),
        cimDoc
    });

    designEngine.designExtensionSystem.injector.provide("designRequirements", { panels: [] });

    // useSelectedItems wiring — resolves items from idaStore.selectedIds
    designEngine.designExtensionSystem.addExtension(ItemSelectionExtension);
    const panelIds = designEngine.cimDocStore.panels.map(p => p.id);
    designEngine.layoutStore.setVisiblePanelIds(panelIds);

    return {
        value: designEngine,
        [Symbol.dispose]() {
            designEngine.dispose();
        }
    };
};
```

### 3. Wrapper — Hooks vs Components

**For hooks** — pass wrapper to `renderHook`:

```typescript
function createWrapper(designEngine: InteractiveDesignEngine) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <DesignEngineProvider designEngine={designEngine}>
                {children}
            </DesignEngineProvider>
        );
    };
}

const { result } = renderHook(() => useMyHook(), {
    wrapper: createWrapper(designEngine)
});
```

**For components** — use a `renderWithProviders` helper:

```tsx
function renderWithProviders(ui: React.ReactElement, config: { designEngine: InteractiveDesignEngine }) {
    return render(
        <DesignEngineProvider designEngine={config.designEngine}>
            {ui}
        </DesignEngineProvider>
    );
}

renderWithProviders(<MyComponent panel={panel} />, { designEngine });
```

Add additional providers as needed (see Section 9 for TextLikeAdaptersContext).

### 4. Registering DesignEngine Extensions

Studio registers extensions at runtime; tests must do it manually inside
`createDesignEngine` — AFTER `injector.provide` (some extensions need injected
dependencies). Add lines to the helper from Section 2:

```typescript
designEngine.designExtensionSystem.addExtension(PanelChromesExtension);
designEngine.designExtensionSystem.addExtension(ItemPermissionsExtension);
```

`ItemPermissionsExtension` computes real permission flags (`fontColorChange`,
`move`, `resize`) by item type — test permission-dependent behavior without
mocking `getOptionalExtension`.

If you see `Error: Could not find an extension of type XExtension`, you're
missing an `addExtension` call. Trace-level warnings about missing _optional_
extension dependencies (e.g., `ItemLocksExtension`) are safe to ignore.

### 5. `useSelectedItems` Wiring

The `ItemSelectionExtension` + `setVisiblePanelIds` lines in the canonical
`createDesignEngine` (Section 2) wire up `useSelectedItems` without mocking.
Without them, `useSelectedItems` returns an empty array even when
`idaStore.selectedIds` has items. If the hook doesn't use `useSelectedItems`,
you can remove those lines.

### 6. Resource Cleanup with `using`

```typescript
it("should test something", () => {
    const cimDoc = new DocumentBuilder().addPanel({ id: "front-panel" }).addTextAreaItem({ id: "text-item-1" }).build();

    using designEngineWrapper = createDesignEngine(cimDoc);
    const designEngine = designEngineWrapper.value;
    designEngine.idaStore.setActiveDesignPanelId("front-panel");

    // ... rest of test
});
```

Most hooks and components require an active panel — call
`setActiveDesignPanelId` before rendering. `using` ensures disposal happens
after the test completes.

### 7. Setting Up Mock Defaults

```typescript
describe("useMyHook", () => {
    beforeEach(() => {
        vi.mocked(useColorPaletteForSelectedItems).mockReturnValue(undefined);
    });

    it("should override defaults per test", () => {
        vi.mocked(useColorPaletteForSelectedItems).mockReturnValue(colorPalettes[0]);
    });
});
```

### 8. Partial Test Data with `fromPartial<T>()`

Use `fromPartial<T>()` from `@internal/tools-consolidated/vitest` instead of
`as` casts for type-safe partial mocks:

```typescript
import { fromPartial } from "@internal/tools-consolidated/vitest";

// ✅ Good — type-safe partial with explicit type passed to generic
vi.mocked(useRichTextManager).mockReturnValue(fromPartial<SomeExplicitTypeGoesHere>({ selectedTextItems: [] }));

// ❌ Bad — as cast suppresses missing fields
vi.mocked(useRichTextManager).mockReturnValue({ selectedTextItems: [] } as RichTextManager);
```

### 9. TextLikeAdaptersContext in Test Wrappers

When testing components or hooks that consume `useTextLikeAdapters` or
`getAdapterForItem`, provide adapters via context. Use real adapter
implementations when possible; create minimal test adapters when the real
adapter has heavy dependencies.

```typescript
import { TextLikeAdaptersContext, type TextLikeAdaptersContextValue } from "@internal/sim-framework";

// Option A: Real adapters (preferred when dependencies are available)
import { wordArtTextLikeAdapter } from "@six/features/editorUI/wordArtEditing/wordArtTextLikeAdapter";
import { tableTextLikeAdapter } from "@six/features/editorUI/tableEditing/tableTextLikeAdapter";

const adaptersValue: TextLikeAdaptersContextValue = {
    adapters: [wordArtTextLikeAdapter, tableTextLikeAdapter]
};

// Option B: Minimal test adapter (when real adapter has impractical deps)
const testAdapter: TextLikeItemAdapter = {
    isApplicable: (item) => item.isItemReference() && item.model.type === "Word Art",
    getFontFamily: (item) => item.model.data?.fontFamily,
    applyFontFamily: vi.fn(),
    getFontStyle: (item) => item.model.data?.fontStyle,
    applyFontStyle: vi.fn(),
    getFontSize: () => undefined,
    applyFontSize: vi.fn(),
    getFontColor: (item) => item.model.data?.color,
    applyFontColor: vi.fn(),
};

// Add to wrapper
function renderWithProviders(ui: React.ReactElement, config: { designEngine: InteractiveDesignEngine }) {
    return render(
        <DesignEngineProvider designEngine={config.designEngine}>
            <TextLikeAdaptersContext.Provider value={adaptersValue}>
                {ui}
            </TextLikeAdaptersContext.Provider>
        </DesignEngineProvider>
    );
}
```

### 10. Selecting Items

When you set explicit IDs in DocumentBuilder, pass them directly:

```typescript
designEngine.idaStore.setSelectedIds(["text-item-1"]);

// Multi-item selection
designEngine.idaStore.setSelectedIds(["wordart-1", "wordart-2"]);
```

When the ID isn't known upfront, look it up by index:

```typescript
const textItem = designEngine.cimDocStore.panels.at(0)?.items.at(0)!;
designEngine.idaStore.setSelectedIds([textItem.iid]);
```

### 11. Testing Components That Branch on Item Type

Many components render different UI for text, word art, and table items. Test
each branch by building the right document and selecting the right item:

```tsx
it("should render word art input for word art items", () => {
    const cimDoc = new DocumentBuilder()
        .addPanel({ id: "panel-1" })
        .addItemReference({ id: "wordart-1", type: "Word Art", data: {
            fontFamily: "Arial", fontStyle: "Normal,Normal",
            content: "Hello", focus: "center",
            stroke: { color: "#fff", thickness: 0 },
            shadow: { color: "#000", xoffset: 0, yoffset: 0 },
            curve: { radius: 0, height: 0, angle: 0 }
        }})
        .build();

    using designEngineWrapper = createDesignEngine(cimDoc);
    const designEngine = designEngineWrapper.value;
    designEngine.idaStore.setActiveDesignPanelId("panel-1");
    designEngine.idaStore.setSelectedIds(["wordart-1"]);

    renderWithProviders(<MyComponent />, { designEngine });

    expect(screen.getByRole("textbox")).toBeVisible();
});

it("should render rich text editor for text items", () => {
    const cimDoc = new DocumentBuilder()
        .addPanel({ id: "panel-1" })
        .addTextAreaItem({ id: "text-1" })
        .build();

    using designEngineWrapper = createDesignEngine(cimDoc);
    const designEngine = designEngineWrapper.value;
    designEngine.idaStore.setActiveDesignPanelId("panel-1");
    designEngine.idaStore.setSelectedIds(["text-1"]);

    renderWithProviders(<MyComponent />, { designEngine });

    // Assert the text-specific UI renders
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // ... assert rich text editor
});
```

### 12. Observer Components and MobX State Changes

Components wrapped in `observer` re-render when observables change. Trigger
re-renders by mutating observable state in `act()`:

```typescript
import { act } from "@testing-library/react";

it("should hide when item is deselected", () => {
    // ... setup with selected item
    renderWithProviders(<MyComponent />, { designEngine });

    expect(screen.getByTestId("editor-position")).toBeVisible();

    act(() => {
        designEngine.idaStore.setSelectedIds([]);
    });

    expect(screen.queryByTestId("editor-position")).not.toBeInTheDocument();
});
```

</patterns>

<eslint-exceptions>

## Approved ESLint Disable Patterns

These are the **only** `eslint-disable` patterns approved for integration tests. Do not introduce new ones without user approval. Every `eslint-disable` comment MUST include a `--` reason suffix.

### `testing-library/no-container` — CSS Variable Verification

**Use when**: Verifying CSS custom properties (e.g., `--y-offset`) on internal wrapper elements unreachable via semantic queries.

```tsx
const { container } = renderWithProviders(
    <ItemEditorPosition item={textItem} distanceToItemInPx={50}>
        <div>Test Content</div>
    </ItemEditorPosition>,
    { designEngine }
);

// eslint-disable-next-line testing-library/no-container -- CSS variables on internal wrappers aren't accessible via screen queries
const wrapper = container.querySelector('[style*="--y-offset"]');
expect(wrapper).toHaveStyle({ "--y-offset": "50px" });
```

### `jsx-a11y/click-events-have-key-events`, `jsx-a11y/no-static-element-interactions` — Test Event Propagation Wrappers

**Use when**: Wrapping a component in a test-only `<div onClick>` to verify `stopPropagation` behavior.

```tsx
const onContainerClick = vi.fn();

renderWithProviders(
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- test-only wrapper to verify stopPropagation
    <div onClick={onContainerClick}>
        <WordArtTextArea item={item} isFloating={true} />
    </div>,
    { designEngine }
);

await user.click(screen.getByRole("textbox"));
expect(onContainerClick).not.toHaveBeenCalled();
```

</eslint-exceptions>

<pitfalls>

## Common Pitfalls

- **Conditionals in test blocks**: Use `!` non-null assertions, not `if (!item) throw`. No `if`/`switch` in test bodies.
- **Conditionals in assertions**: Assert directly, don't wrap in `if`.
- **Testing uncontrollable state**: Mock the input, assert the output you control.
- **Missing extension errors**: Add `addExtension()` calls in `createDesignEngine`.
- **Empty `useSelectedItems`**: Ensure `ItemSelectionExtension` + `setVisiblePanelIds` are set up.
- **Observer not re-rendering**: Wrap state mutations in `act()`.

</pitfalls>

<checklist>

## Verification Checklist

### Core Loop Completion
- [ ] Phase 1 complete — coverage ≥ 90% on module under test
- [ ] Phase 2 complete — `typecheck` + `lint` + `test` all green

### Code Quality Rules
- [ ] All `import` statements appear above all `vi.mock()` calls
- [ ] All partial mock data uses `fromPartial<ExplicitType>()` — zero `as` casts
- [ ] All `vi.fn()` / `vi.mocked()` calls have explicit types
- [ ] Type assertion guards used instead of `as` casts for narrowing
- [ ] Only approved `eslint-disable` rules used (`testing-library/no-container`, `jsx-a11y/click-events-have-key-events`, `jsx-a11y/no-static-element-interactions`), each with a `--` reason suffix

### Mock Discipline
- [ ] All mocks proposed to and approved by user before implementation
- [ ] Mock inline comments explain WHY the value is mocked, not WHAT it does
- [ ] `beforeEach` sets default mock values

### Test Infrastructure
- [ ] Real DesignEngine with `using` keyword
- [ ] Real DocumentBuilder for CimDocs
- [ ] Real providers (not mocked)
- [ ] No conditionals in test blocks or assertions
- [ ] Module-level helpers reduce repetition
- [ ] Components use `render` + DOM assertions; hooks use `renderHook`
- [ ] TextLikeAdaptersContext provided when testing adapter-dependent code
- [ ] Each item-type branch tested (text, word art, table as applicable)

</checklist>

<references>

## Item Reference Examples

See [item-reference-testing.md](./item-reference-testing.md) for `addItemReference()` examples and data shapes (Word Art, Table, Teams Name).

## More

- [complete-example.md](./complete-example.md) — Copy-paste starter for hook tests
- [component-example.md](./component-example.md) — Copy-paste starter for component tests
- [REFERENCE.md](./REFERENCE.md) — Type-narrowing asserts, partial assertions, command execution spying, error-throwing hooks, async patterns, i18n mocking, coverage analysis

</references>
