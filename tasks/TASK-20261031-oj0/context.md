<Context Bundle — Add Sanctum Extension Icon>
## Relevant Files
| File | Why It's Relevant |
|------|------------------|
| `manifest.json` | Extension Manifest V3 configuration; needs root `icons` and `action.default_icon` registered |
| `popup.html` | Extension dashboard UI; `#header` requires 24x24px inline brand icon next to 'Sanctum Vault' |
| `popup.js` | Dashboard logic and styles; demonstrates UI color usage and dynamic element structures |
| `refresh.svg` | Reference SVG asset showing standard viewBox and `#7d42ff` primary brand color |
| `magnify.svg` | Reference SVG asset showing vector path structure and dark theme contrast |
| `arrow-right.svg` | Reference SVG asset showing 32x32 viewBox sizing and `#7d42ff` fill styling |
| `trash.svg` | Reference SVG asset showing standard 256x256 viewBox and action icon style |
| `icons/icon.svg` | Target master vector asset depicting Electric Violet Torii gate framing white manga pages |
| `icons/icon-16.png` | Target 16x16 raster icon for browser favicon and extension toolbar context menu |
| `icons/icon-32.png` | Target 32x32 raster icon for Windows taskbar and high-DPI browser toolbar displays |
| `icons/icon-48.png` | Target 48x48 raster icon for Chrome extensions management page (`chrome://extensions`) |
| `icons/icon-128.png` | Target 128x128 raster icon for Chrome Web Store, installation prompt, and high-DPI displays |
| `readme.md` | Extension documentation; file tree should document the new `icons/` asset directory |

## Reuse Candidates
- `#7d42ff` (Electric Violet) brand token: Extracted from `popup.html` (`h2`, `#refresh-btn`), `refresh.svg`, and `arrow-right.svg` — reuse as the primary Torii gate fill color.
- `#121212` (dark squircle) & `#0f0f0f` (body background): Extracted from `popup.html` body background to ensure cohesive dark-mode contrast.
- 24x24px icon sizing pattern: Extracted from `popup.html` lines 43-45 (`#refresh-btn img { width: 24px; height: 24px; }`) and line 82 (`#search-btn img`) — reuse 24x24px dimensions for the inline header emblem.
- Header flexbox container: Extracted from `popup.html` (`#header { display: flex; align-items: center; justify-content: space-between; }`) — group icon and `h2` in an inner flex wrapper (`display: flex; align-items: center; gap: 8px;`) to preserve layout without disturbing `#refresh-btn`.
- Headless browser canvas / Playwright MCP: Standard platform rendering capabilities can rasterize `icons/icon.svg` into exact 16, 32, 48, 128 PNG assets without introducing external runtime npm dependencies.

## Patterns to Follow
- Chrome Manifest V3 Icon Standard: Register icons under both root `icons` and `action.default_icon` for resolutions 16, 32, 48, and 128 (e.g. `"16": "icons/icon-16.png"`).
- Standalone Scalable Vector Geometry: Match `refresh.svg` and `magnify.svg` by creating `icons/icon.svg` with self-contained paths, exact viewBox (`0 0 128 128`), and no external font or stylesheet dependencies.
- Static Local Asset Sourcing: Follow `popup.html` lines 230 and 236 using relative local file paths for images (`src="icons/icon-32.png"` or `src="icons/icon.svg"`).

## Anti-Patterns Flagged
- `popup.html` line 23: `border-bottom: 1px #333;` omits border-style (`solid`), causing browsers to invalidate the CSS rule — do not replicate malformed CSS properties.
- `popup.html` line 67: `border-radius: 2%;` uses percentage units rather than fixed pixel dimensions (`4px`, `8px`), causing distorted corner curvature — use fixed pixel or standard squircle math.
- `manifest.json`: Complete omission of extension icons and action icons, causing Chrome to fall back to a default puzzle piece.

## MEMORY.md Notes
- N/A (`MEMORY.md` not present in workspace; verified untracked in `.gitignore`).
