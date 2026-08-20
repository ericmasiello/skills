# Hook Integration Testing — Reference

Situational patterns for hook integration tests. For core setup and patterns,
see [SKILL.md](./SKILL.md).

## Type-Narrowing Item References with `asserts`

When asserting against `.model.data` on item reference items, use a TypeScript
assertion function instead of `as` casts. It validates at runtime AND narrows the
type for the compiler:

```typescript
import type { ItemReference } from "@vp/types-ddif";
import type { ItemState, SubpanelState } from "@internal/design-core";

function assertItemReference(item: ItemState | SubpanelState): asserts item is ItemState<ItemReference> {
    expect(item.isItemReference()).toBe(true);
}
```

Usage:

```typescript
const wordArtItem = designEngine.cimDocStore.panels.at(0)?.items.at(0)!;
assertItemReference(wordArtItem);
// TypeScript now knows wordArtItem is ItemState<ItemReference>
expect(wordArtItem.model.data.color).toBe("#00FF00");
```

**Don't** use `as` casts — they silently lie to the compiler:

```typescript
// ❌ Bad — no runtime validation, hides type mismatches
const item = designEngine.cimDocStore.panels.at(0)?.items.at(0) as ItemState<ItemReference>;
```

## Partial Assertions with `toMatchObject`

When asserting against item models with generated values (IDs, computed
positions), use `toMatchObject` with `expect.any()` to assert the shape without
pinning dynamic values:

```typescript
const item = designEngine.cimDocStore.panels.at(0)?.items.at(0)!;
assertItemReference(item);

expect(item.model).toMatchObject({
    type: "Calendar Grid",
    data: {
        cultureName: "en-us",
        month: 10
    },
    id: expect.any(String),
    position: expect.objectContaining({
        height: expect.any(String),
        width: expect.any(String),
        x: expect.any(String),
        y: expect.any(String)
    }),
    zIndex: expect.any(Number)
});
```

- `toMatchObject` — asserts a subset of properties (extra properties are ignored)
- `expect.any(String)` — asserts the value exists and is the correct type
- `expect.objectContaining()` — same as `toMatchObject` but usable inline as a matcher

**Don't** use `toMatchInlineSnapshot` for objects with generated values — the
snapshot will break on every run.

## Testing Command Execution

Spy on `executeCommand` to verify it was called:

```typescript
const executeCommandSpy = vi.spyOn(designEngine, "executeCommand");

const { result } = renderHook(() => useMyHook(), {
    wrapper: createWrapper(designEngine)
});

result.current.onChange("#00FF00");

expect(executeCommandSpy).toHaveBeenCalledTimes(1);
expect(executeCommandSpy).toHaveBeenCalledWith(expect.any(Function), {});

// Verify the command function itself
const capturedCommandFunction = executeCommandSpy.mock.calls[0][0];
expect(typeof capturedCommandFunction).toBe("function");
```

## Testing Hooks That Throw Errors

When a hook throws during render (not in a returned callback), wrap `renderHook`
itself in `expect`:

```typescript
it("should throw an error if there is no active panel", () => {
    const cimDoc = new DocumentBuilder().build(); // no panels

    using designEngineWrapper = createDesignEngine(cimDoc);
    const designEngine = designEngineWrapper.value;

    expect(() =>
        renderHook(() => useMyHook(), {
            wrapper: createWrapper(designEngine)
        })
    ).toThrowErrorMatchingInlineSnapshot(`[Error: No active panel found.]`);
});
```

If the error happens in a **callback** returned by the hook, assert on the
callback instead:

```typescript
const { result } = renderHook(() => useMyHook(), {
    wrapper: createWrapper(designEngine)
});

expect(() => result.current.doSomething()).toThrowErrorMatchingInlineSnapshot(`[Error: Invalid input.]`);
```

**Tip**: Run tests in watch mode (`pnpm go <lib> test:watch`) and press `u` to
auto-fill the inline snapshot after the first run.

## Async Hook Patterns

### Debounced or Throttled Hooks

Use fake timers when the hook debounces or throttles operations:

```typescript
describe("useDebouncedSearch", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should debounce the search callback", () => {
        const cimDoc = new DocumentBuilder().addPanel({ id: "panel-1" }).build();

        using designEngineWrapper = createDesignEngine(cimDoc);
        const designEngine = designEngineWrapper.value;

        const { result } = renderHook(() => useDebouncedSearch(), {
            wrapper: createWrapper(designEngine)
        });

        result.current.search("a");
        result.current.search("ab");
        result.current.search("abc");

        expect(mockCallback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(300);

        expect(mockCallback).toHaveBeenCalledTimes(1);
        expect(mockCallback).toHaveBeenCalledWith("abc");
    });
});
```

### Hooks with Async Effects

Use `waitFor` when the hook triggers async work (data fetching, async reactions):

```typescript
import { waitFor } from "@testing-library/react";

it("should update after async effect", async () => {
    const { result } = renderHook(() => useAsyncHook(), {
        wrapper: createWrapper(designEngine)
    });

    await waitFor(() => {
        expect(result.current.data).toBeDefined();
    });
});
```

**Don't** use `setTimeout` or arbitrary delays to wait for async work.

## Mocking `@vp/i18n-helper`

Use this pattern when the hook under test (or its dependencies) uses `useTranslationSSR`:

```typescript
import { messages } from "../messages.ts";

// useTranslationSSR depends on a runtime i18n provider initialized at app boot — unavailable in test env
vi.mock("@vp/i18n-helper", () => ({
    useTranslationSSR: () => ({
        t: (messageId: string) =>
            Object.values(messages).find((message: { id: string; defaultMessage: string }) => message.id === messageId)
                ?.defaultMessage || messageId
    }),
    defineMessages: <T extends Record<string, { id: string; defaultMessage: string }>>(msgs: T) => msgs
}));
```

## Coverage Analysis

Run coverage to identify untested code paths:

```bash
pnpm go ./apps/studio test:coverage
```

Coverage reports are generated in `@build/studio`. Use this to:

- Identify branches not covered by tests
- Reach close to 100% coverage when desired
- Find edge cases you may have missed
