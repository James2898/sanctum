# Changelog

All notable changes to the Sanctum Chrome extension will be documented in this file.

## [Unreleased] — 2026-11-21

### Fixed
- Harden Google Drive sync concurrency, background auth guardrails, and SPA chapter extraction (`TASK-20261121-ygi`)
  - Refactored `findFile(token)` in `background.js` to return a 3-state status (`found`, `not_found`, `error`) with `orderBy=createdTime`, restricting `createFile()` strictly to `not_found` across serialized `enqueueOperation` calls.
  - Switched all background `chrome.identity.getAuthToken` calls in `background.js` (`SYNC_CHAPTER` and `DELETE_SERIES`) to `{ interactive: false }`, aborting writes without overwriting remote data on auth/API/malformed-JSON errors and displaying the `"!"` (`#c0392b`) badge with `badgeClearTimer` cancellation.
  - Updated `SYNC_CHAPTER` in-flight badge background color reset (`"..."` / `#7f8c8d`) and fire-and-forget listener return value, and updated `DELETE_SERIES` to handle 3-state `findFile()` results and safe `JSON.parse`.
  - Updated MangaDex and MangaPlus `getChapter()` in `content.js` to return `null` instead of `"Reading"` on unmounted or placeholder DOM, added explicit `isValidTitle`/`isValidChapter` checks (preserving chapter `0`/`"0"`), enforced the 8-retry readiness gate in `checkPage()`, and cancelled pending retry/debounce timers on SPA route changes.
  - Updated Asura Scans regex (`asuraConfig.regex` and `getChapter`) in `content.js` to match integer, decimal (`150.5`), and fractional (`12-1`, `150-5`) chapters without capturing trailing separators.
  - Affected files: `background.js`, `content.js`

### Added
- Add zero-dependency unit test suite for `background.js` and `content.js` (`TASK-20261121-ygi`)
  - Added conditional CommonJS exports and `chrome`/`window`/`document` runtime guards in `background.js` and `content.js` for Node.js testability while keeping classic MV3 compatibility.
  - Added 33 unit tests using Node.js built-in `node:test` and `node:assert` covering Drive 3-state lookup, `createFile` guard, concurrency serialization, silent auth failure, badge timer cancellation, malformed Drive JSON aborts, Asura chapter regexes, MangaDex/MangaPlus null metadata, chapter `0`, 8-retry gating, and route-change timer cancellation.
  - Affected files: `background.js`, `content.js`, `test/background.test.js`, `test/content.test.js`

## [Unreleased] — 2026-10-31

### Added
- Add branded Sanctum visual identity and extension icon set (`TASK-20261031-oj0`)
  - Created master vector SVG (`icons/icon.svg`) with dark squircle badge (#121212), Electric Violet (#7d42ff) Torii gate, and white (#ffffff) open manga pages.
  - Generated standard raster PNG icons: `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, and `icons/icon-128.png`.
  - Registered extension icons under root `icons` and `action.default_icon` in `manifest.json`.
  - Added 24x24px inline brand icon with accessible alt text adjacent to "Sanctum Vault" in `popup.html`.
  - Updated `readme.md` directory structure documentation.
  - Affected files: `icons/icon.svg`, `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, `icons/icon-128.png`, `manifest.json`, `popup.html`, `readme.md`
