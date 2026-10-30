<Spec — Add Sanctum Extension Icon>
## Feature Summary
Deliver a branded visual identity for the Sanctum Chrome extension by creating a custom icon set featuring a Japanese Torii gate in Electric Violet (#7d42ff) framing crisp white (#ffffff) open manga pages on a dark squircle badge (#121212). The icon assets include a master vector SVG (`icons/icon.svg`) and standard raster PNGs (16x16, 32x32, 48x48, 128x128). These icons are registered in `manifest.json` under `icons` and `action.default_icon`, and integrated as a 24x24px inline header emblem next to "Sanctum Vault" in `popup.html`.

## Acceptance Criteria
1. `icons/icon.svg` is present and contains valid SVG vector geometry depicting a Japanese Torii gate in Electric Violet (`#7d42ff`) framing open manga pages in white (`#ffffff`) centered on a dark squircle badge (`#121212`).
2. Standard PNG icon assets are generated from the SVG design and saved with exact pixel dimensions:
   - `icons/icon-16.png` (16x16 pixels)
   - `icons/icon-32.png` (32x32 pixels)
   - `icons/icon-48.png` (48x48 pixels)
   - `icons/icon-128.png` (128x128 pixels)
3. `manifest.json` registers top-level extension icons mapping sizes 16, 32, 48, and 128 to `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, and `icons/icon-128.png` respectively.
4. `manifest.json` registers `action.default_icon` mapping sizes 16, 32, 48, and 128 to `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, and `icons/icon-128.png` respectively <must match codebase convention — see context.md "Patterns to Follow">.
5. `popup.html` displays an inline 24x24px icon adjacent to the "Sanctum Vault" header title with accessible alt text (e.g., `alt="Sanctum Vault Icon"`) and vertically centered alignment.
6. The inline icon in `popup.html` preserves the existing header styling and layout without causing overflow, wrapping errors, or misalignments.

## Out of Scope
- Modifying extension background service worker, permissions, or content script logic.
- Redesigning the popup theme, colors, typography, or cards beyond adding the header icon.
- Dynamic runtime badge or icon swapping logic.
- Generating auxiliary non-Chrome icon formats (e.g. .ico, .icns).

## Fallback Behaviors
- **Missing SVG Extension Support**: All extension manifest declarations reference PNG raster assets (16/32/48/128) rather than SVG to guarantee Chrome web store and toolbar compatibility across all operating systems.
- **Header Icon Rendering**: If the inline icon in `popup.html` fails to load or image assets are blocked, descriptive `alt` text ensures "Sanctum Vault" remains accessible and functional.

## Resolved Ambiguities
- Icon Motif → Japanese Torii Gate framing open manga book pages in center archway (Source: User Design Grill Decision 1).
- Visual Palette & Container → Dark squircle badge (#121212), Electric Violet (#7d42ff) Torii gate, and crisp white (#ffffff) manga pages (Source: User Design Grill Decision 2).
- Deliverable Formats & Sizes → Master SVG (`icons/icon.svg`) and 4 PNG files at 16, 32, 48, and 128 pixels (Source: User Design Grill Decision 3).
- Manifest Configuration → Registered under both `"icons"` and `"action.default_icon"` for resolutions 16, 32, 48, 128 (Source: User Design Grill Decision 4).
- UI Header Placement → 24x24px inline icon adjacent to "Sanctum Vault" in popup.html header (Source: User Design Grill Decision 5).
