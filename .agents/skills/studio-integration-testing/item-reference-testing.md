# Building Documents with Item References

Use `DocumentBuilder.addItemReference()` to add Word Art, Table, or Teams Name
items to a test document. The method accepts `Partial<ItemReference>` — pass only
the fields your test needs.

```ts
import { DocumentBuilder } from "@internal/design-core";
```

## Word Art

```ts
const doc = new DocumentBuilder()
    .addPanel({ id: "panel-1", decorationTechnology: "offsetOrDigital" })
    .addItemReference({
        type: "Word Art"
    })
    .build();
```

For tests that need the full data payload (see `WordArtItemReference` in
`apps/studio/src/studioSix/features/editorUI/wordArtEditing/wordArtTypes.ts`):

```ts
.addItemReference({
    type: "Word Art",
    data: {
        fontFamily: "Arimo",
        fontStyle: "Normal,Normal",
        content: "Hello World",
        focus: "center",
        color: "rgb(0, 0, 0)",
        stroke: { color: "rgb(255, 255, 255)", thickness: 0 },
        shadow: { color: "rgb(0, 0, 0)", xoffset: 0, yoffset: 0 },
        curve: { radius: 0, height: 0, angle: 0 }
    }
})
```

## Table

```ts
const doc = new DocumentBuilder()
    .addPanel({ id: "panel-1", height: "100mm", width: "100mm" })
    .addItemReference({
        type: "Table",
        data: {
            columns: [
                { alignment: "Left", width: "50mm" },
                { alignment: "Center", width: "50mm" }
            ],
            rows: [
                { cells: [{ text: "Header 1" }, { text: "Header 2" }] },
                { cells: [{ text: "Cell 1" }, { text: "Cell 2" }] }
            ],
            predefinedStyle: {
                backgroundColor: "rgb(220, 39, 39)",
                fontColor: "rgb(210, 39, 39)",
                fontFamily: "Arimo",
                fontSize: "12pt",
                fontStyle: "Normal",
                styleId: 1
            }
        }
    })
    .build();
```

See `TableItemReferenceData` in `libs/util/table/src/types.ts` for all available
fields (columns, rows, predefinedStyle, bodyStyle, headerStyle, alternateStyle).

## Teams Name

```ts
const doc = new DocumentBuilder()
    .addPanel({ id: "panel-1" })
    .addItemReference({
        type: "Teams Name",
        url: "https://example.internal/api/itemref/wordart",
        position: { x: "0mm", y: "0mm", width: "200mm", height: "30mm" },
        data: {
            fontFamily: "Arimo",
            fontStyle: "Normal,Normal",
            content: "Name",
            color: "rgb(0, 0, 0)",
            focus: "center",
            placeholderType: "Name",
            placeholderKey: "Name",
            curve: { radius: 0, height: 0, angle: 0 }
        }
    })
    .build();
```

See `TeamsNameItemReference` in `libs/sim/sim-teams-name/src/utils/isTeamsNameItemReference.ts`
for all data fields. Valid `placeholderType` values: `"Name"`, `"Role"`, `"Number"`, `"Text"`.
