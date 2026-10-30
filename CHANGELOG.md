# Changelog

All notable changes to the Sanctum Chrome extension will be documented in this file.

## [Unreleased] — 2026-10-31

### Added
- Add branded Sanctum visual identity and extension icon set (`TASK-20261031-oj0`)
  - Created master vector SVG (`icons/icon.svg`) with dark squircle badge (#121212), Electric Violet (#7d42ff) Torii gate, and white (#ffffff) open manga pages.
  - Generated standard raster PNG icons: `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, and `icons/icon-128.png`.
  - Registered extension icons under root `icons` and `action.default_icon` in `manifest.json`.
  - Added 24x24px inline brand icon with accessible alt text adjacent to "Sanctum Vault" in `popup.html`.
  - Updated `readme.md` directory structure documentation.
  - Affected files: `icons/icon.svg`, `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, `icons/icon-128.png`, `manifest.json`, `popup.html`, `readme.md`
