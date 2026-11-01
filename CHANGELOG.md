# Changelog

All notable changes to the Sanctum Chrome extension will be documented in this file.

## [Unreleased] — 2026-11-01

### Fixed
- Hardened Google Drive sync flow and fixed SPA chapter extraction (`TASK-20261101-dbo`)
  - Refactored `findFile(token)` in `background.js` to return structured tri-state status objects (`found`, `not_found`, `error`), preventing duplicate file creation on network or API failures.
  - Restricted `createFile()` invocation strictly to `{ status: "not_found" }` outcomes.
  - Configured quiet non-interactive background authentication (`interactive: false`) for `getAuthToken`, preventing focus stealing during sync.
  - Added visual error action badge (`"!"` with background `#c0392b`) on Drive API and authentication failures.
  - Eliminated premature `"Reading"` / `"Chapter Reading"` fallback dispatches on MangaDex and MangaPlus, retrying up to 8 times for title and chapter availability.
  - Extended Asura chapter regex and parsers to preserve decimal and fractional chapter numbers (e.g., `150.5`, `12-1`).
  - Updated `DELETE_SERIES` handler to inspect structured `findFile` status objects.
  - Affected files: `background.js`, `content.js`

## [Unreleased] — 2026-10-31

### Added
- Add branded Sanctum visual identity and extension icon set (`TASK-20261031-oj0`)
  - Created master vector SVG (`icons/icon.svg`) with dark squircle badge (#121212), Electric Violet (#7d42ff) Torii gate, and white (#ffffff) open manga pages.
  - Generated standard raster PNG icons: `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, and `icons/icon-128.png`.
  - Registered extension icons under root `icons` and `action.default_icon` in `manifest.json`.
  - Added 24x24px inline brand icon with accessible alt text adjacent to "Sanctum Vault" in `popup.html`.
  - Updated `readme.md` directory structure documentation.
  - Affected files: `icons/icon.svg`, `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, `icons/icon-128.png`, `manifest.json`, `popup.html`, `readme.md`
