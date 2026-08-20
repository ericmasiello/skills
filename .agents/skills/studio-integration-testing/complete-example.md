# Complete Hook Integration Test Example

Copy-paste starter template for a new hook integration test file.

```typescript
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import {
    DocumentBuilder,
    DesignEngineProvider,
    InteractiveDesignEngine,
    ItemSelectionExtension
} from "@internal/design-core";
import type { CimDoc } from "@vp/types-ddif";
import { useColorPaletteForSelectedItems } from "@internal/feature-color-palette";
import { useMyHook } from "../useMyHook";

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

const createDesignEngine = (cimDoc: CimDoc) => {
    const designEngine = new InteractiveDesignEngine({
        authProvider: vi.fn().mockResolvedValue({ Authorization: "Bearer mock-access-token" }),
        cimDoc
    });

    designEngine.designExtensionSystem.injector.provide("designRequirements", {
        panels: []
    });

    // useSelectedItems wiring — remove if hook doesn't use it
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

function createWrapper(designEngine: InteractiveDesignEngine) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <DesignEngineProvider designEngine={designEngine}>
                {/* Add other providers as needed */}
                {children}
            </DesignEngineProvider>
        );
    };
}

describe("useMyHook", () => {
    beforeEach(() => {
        vi.mocked(useColorPaletteForSelectedItems).mockReturnValue(undefined);
    });

    it("should return expected state when no items selected", () => {
        const cimDoc = new DocumentBuilder()
            .addPanel({ id: "front-panel" })
            .addTextAreaItem({ id: "text-item-1" })
            .build();

        using designEngineWrapper = createDesignEngine(cimDoc);
        const designEngine = designEngineWrapper.value;
        designEngine.idaStore.setActiveDesignPanelId("front-panel");

        const { result } = renderHook(() => useMyHook(), {
            wrapper: createWrapper(designEngine)
        });

        expect(result.current.someValue).toBe(expectedValue);
    });

    it("should work with selected items", () => {
        const cimDoc = new DocumentBuilder()
            .addPanel({ id: "front-panel" })
            .addTextAreaItem({ id: "text-item-1" })
            .build();

        using designEngineWrapper = createDesignEngine(cimDoc);
        const designEngine = designEngineWrapper.value;
        designEngine.idaStore.setActiveDesignPanelId("front-panel");

        designEngine.idaStore.setSelectedIds(["text-item-1"]);

        const { result } = renderHook(() => useMyHook(), {
            wrapper: createWrapper(designEngine)
        });

        expect(result.current.someValue).toBe(expectedValue);
    });
});
```
