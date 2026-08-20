# Complete Component Integration Test Example

Copy-paste starter template for a component integration test that depends on
DesignEngine and TextLikeAdaptersContext.

```typescript
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
    DocumentBuilder,
    DesignEngineProvider,
    InteractiveDesignEngine,
    ItemSelectionExtension
} from "@internal/design-core";
import type { CimDoc } from "@vp/types-ddif";
import {
    TextLikeAdaptersContext,
    type TextLikeAdaptersContextValue,
    type TextLikeItemAdapter
} from "@internal/sim-framework";
import { MyComponent } from "../MyComponent";

// ---------------------------------------------------------------------------
// Mocks — only what's approved through the Mock Negotiation Protocol
// ---------------------------------------------------------------------------

// useTranslationSSR depends on a runtime i18n provider initialized at app boot — unavailable in test env
vi.mock("@vp/i18n-helper", () => ({
    useTranslationSSR: () => ({
        t: (id: string) => id
    }),
    defineMessages: <T extends Record<string, unknown>>(msgs: T) => msgs
}));

// ---------------------------------------------------------------------------
// DesignEngine helper
// ---------------------------------------------------------------------------

const createDesignEngine = (cimDoc: CimDoc) => {
    const designEngine = new InteractiveDesignEngine({
        authProvider: vi.fn().mockResolvedValue({ Authorization: "Bearer mock-access-token" }),
        cimDoc
    });

    designEngine.designExtensionSystem.injector.provide("designRequirements", {
        panels: []
    });

    // useSelectedItems wiring
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

// ---------------------------------------------------------------------------
// Test adapters — minimal implementations for TextLikeAdaptersContext
// ---------------------------------------------------------------------------

const wordArtTestAdapter: TextLikeItemAdapter = {
    isApplicable: (item) => item.isItemReference() && item.model.type === "Word Art",
    getFontFamily: (item) => (item as any).model.data?.fontFamily,
    applyFontFamily: vi.fn(),
    getFontStyle: (item) => (item as any).model.data?.fontStyle,
    applyFontStyle: vi.fn(),
    getFontSize: () => undefined,
    applyFontSize: vi.fn(),
    getFontColor: (item) => (item as any).model.data?.color,
    applyFontColor: vi.fn()
};

const adaptersValue: TextLikeAdaptersContextValue = {
    adapters: [wordArtTestAdapter]
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderWithProviders(ui: React.ReactElement, config: { designEngine: InteractiveDesignEngine }) {
    return render(
        <DesignEngineProvider designEngine={config.designEngine}>
            <TextLikeAdaptersContext.Provider value={adaptersValue}>
                {ui}
            </TextLikeAdaptersContext.Provider>
        </DesignEngineProvider>
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MyComponent", () => {
    it("should render nothing when no items are selected", () => {
        const cimDoc = new DocumentBuilder()
            .addPanel({ id: "panel-1" })
            .addTextAreaItem({ id: "text-1" })
            .build();

        using designEngineWrapper = createDesignEngine(cimDoc);
        const designEngine = designEngineWrapper.value;
        designEngine.idaStore.setActiveDesignPanelId("panel-1");

        renderWithProviders(<MyComponent />, { designEngine });

        expect(screen.queryByTestId("my-component")).not.toBeInTheDocument();
    });

    it("should render for selected text item", () => {
        const cimDoc = new DocumentBuilder()
            .addPanel({ id: "panel-1" })
            .addTextAreaItem({ id: "text-1" })
            .build();

        using designEngineWrapper = createDesignEngine(cimDoc);
        const designEngine = designEngineWrapper.value;
        designEngine.idaStore.setActiveDesignPanelId("panel-1");
        designEngine.idaStore.setSelectedIds(["text-1"]);

        renderWithProviders(<MyComponent />, { designEngine });

        // Assert the component renders for text items
        expect(screen.getByTestId("my-component")).toBeVisible();
    });

    it("should render differently for word art items", () => {
        const cimDoc = new DocumentBuilder()
            .addPanel({ id: "panel-1" })
            .addItemReference({
                id: "wordart-1",
                type: "Word Art",
                data: {
                    fontFamily: "Arial",
                    fontStyle: "Normal,Normal",
                    content: "Hello",
                    focus: "center",
                    color: "rgb(0, 0, 0)",
                    stroke: { color: "rgb(255, 255, 255)", thickness: 0 },
                    shadow: { color: "rgb(0, 0, 0)", xoffset: 0, yoffset: 0 },
                    curve: { radius: 0, height: 0, angle: 0 }
                }
            })
            .build();

        using designEngineWrapper = createDesignEngine(cimDoc);
        const designEngine = designEngineWrapper.value;
        designEngine.idaStore.setActiveDesignPanelId("panel-1");
        designEngine.idaStore.setSelectedIds(["wordart-1"]);

        renderWithProviders(<MyComponent />, { designEngine });

        // Assert the word-art-specific UI renders
        expect(screen.getByRole("textbox")).toBeVisible();
    });

    it("should respond to selection changes", () => {
        const cimDoc = new DocumentBuilder()
            .addPanel({ id: "panel-1" })
            .addTextAreaItem({ id: "text-1" })
            .build();

        using designEngineWrapper = createDesignEngine(cimDoc);
        const designEngine = designEngineWrapper.value;
        designEngine.idaStore.setActiveDesignPanelId("panel-1");
        designEngine.idaStore.setSelectedIds(["text-1"]);

        renderWithProviders(<MyComponent />, { designEngine });

        expect(screen.getByTestId("my-component")).toBeVisible();

        // Deselect — observer should re-render
        act(() => {
            designEngine.idaStore.setSelectedIds([]);
        });

        expect(screen.queryByTestId("my-component")).not.toBeInTheDocument();
    });
});
```
