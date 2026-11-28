# Changelog

All notable changes to the Sanctum Chrome extension will be documented in this file.

## [Unreleased] — 2026-11-28

### Added
- Implement Phase 4 OAuth credential hygiene, zero-dependency test harness, automated CI, MV3 validation, test coverage closure, and documentation overhaul (`TASK-20261128-c4y`)
  - Created sanitized `manifest.example.json` mirroring `manifest.json` with placeholder `key` (`"YOUR_EXTENSION_PUBLIC_KEY_HERE"`) and `oauth2.client_id` (`"YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com"`), leaving tracked `manifest.json` unmodified.
  - Added zero-dependency CommonJS `package.json` (`"type": "commonjs"`, `"scripts": { "test": "node --test test/*.test.js" }`, `"engines": { "node": ">=20" }`, empty `dependencies` and `devDependencies`), naturally excluding `test/preview/` harness files.
  - Added standalone zero-dependency MV3 validator (`scripts/validate-manifest.js`) checking JSON syntax, MV3 schema/version rules, disk existence of referenced assets, credential placeholders, and non-credential parity against `manifest.json`.
  - Added GitHub Actions workflow (`.github/workflows/ci.yml`) running on `push` and `pull_request` (`main`, `feature/architecture/industry-grade-upgrade`) with `contents: read`, Node `20.x`/`22.x` LTS matrix, zero-dependency gate, `npm test`, and `node scripts/validate-manifest.js`.
  - Closed Phase 4 unit test coverage gaps across `test/content.test.js` (`mangahere.cc`, `kunmanga.com`, `mangadex.org`, `mangaplus.shueisha.co.jp`, `asurascans.com`) and `test/background.test.js` (`compareChapterParts`, `pickPreferredTitle`, `mergeDuplicateSeriesEntries`, `reconcileSeriesMaps`, and `BUG-009` cross-site survivorship in `SYNC_CHAPTER` and `reconcileAndSync()`), reaching 75/75 passing tests.
  - Affected files: `manifest.example.json`, `package.json`, `scripts/validate-manifest.js`, `.github/workflows/ci.yml`, `test/content.test.js`, `test/background.test.js`

### Fixed
- Fix `BUG-009` cross-site display title survivorship in `background.js` (`TASK-20261128-c4y`)
  - Exported `pickPreferredTitle` in guarded CommonJS `module.exports` and routed both `reconcileAndSync()` queue replay and `SYNC_CHAPTER` title resolution through `pickPreferredTitle(candidateTitle, saved?.title, slug)` while preserving `BUG-006` prototype-key safety and `BUG-008` re-entrancy prefix draining.
  - Affected files: `background.js`, `test/background.test.js`

### Changed
- Overhaul `readme.md` with Phase 1–4 architecture, OAuth setup, testing/CI guides, and accurate file tree (`TASK-20261128-c4y`)
  - Fixed the broken `git clone` link, documented Local-First SWR caching, resilience/guardrails, SPA dwell/scroll gates, Vault UI controls, action badge states, OAuth setup from `manifest.example.json`, `npm test`, `scripts/validate-manifest.js`, LAN preview (`node test/preview/server.js` on port `3456`), and updated the repository directory tree.
  - Affected files: `readme.md`

## [Unreleased] — 2026-11-22

### Added
- Implement Phase 3 schema normalization, automatic LWW migration, DOM batching, and dashboard sort/filter controls (`TASK-20261122-fij`)
  - Added `normalizeSeriesKey()`, `deriveSite()`, `mergeDuplicateSeriesEntries()`, `migrateSeriesMap()`, `reconcileSeriesMaps()`, and `migrateStorageSchema()` in `background.js`, wired to `onInstalled`, `onStartup`, service-worker load, and `reconcileAndSync()` with no-op write avoidance (`areSeriesMapsEqual`) and hardened `isValidMangaName()` lowercase/trimmed prototype-key rejection.
  - Added `#sort-btn` (`"Recently Read"` default vs `"A–Z"` toggle) in `#header` and the `Kunmanga` radio filter in `#filter-container` (`popup.html`, `popup.js`), wired `#search-btn` click to `applyFilters()`, and added pre-migration duplicate key collapse (`normalizePopupSeriesEntries`) plus empty-vault vs empty-filter messaging (`"Vault is empty. Start reading!"` vs `"No matching series found."`).
  - Added 8 Phase 3 `node:test` unit tests across `test/background.test.js` and `test/popup.test.js` (65/65 tests passing) and updated `test/preview/mock-data.js` and `test/preview/mock-chrome.js` with lowercase slug keys, `title`/`site` metadata, a `kunmanga.com` entry, and normalized `DELETE_SERIES` matching.
  - Affected files: `background.js`, `popup.html`, `popup.js`, `test/background.test.js`, `test/popup.test.js`, `test/preview/mock-chrome.js`, `test/preview/mock-data.js`
- Implement Phase 2 local-first storage, offline mutation queue, and SPA navigation (`TASK-20261122-v5d`)
  - Added `chrome.storage.local` caching (`series`, `fileId`, `lastSync`, `pending_sync`) and stale `fileId` `404` recovery in `background.js`, keeping `lastSync` updated strictly on successful Google Drive syncs.
  - Added immediate cache-first popup rendering in `popup.js` with non-blocking background `SYNC_VAULT` refresh, interactive onboarding on empty cache and manual refresh, `isSafeUrl` `http`/`https` sanitization, and cache preservation when offline or on Drive errors.
  - Added FIFO `pending_sync` offline/error mutation queuing (`SYNC_CHAPTER`, `DELETE_SERIES`) covering `navigator.onLine === false`, auth errors, Drive network errors, and non-2xx HTTP errors, with sequential reconciliation via `enqueueOperation()`, failure retention, snapshot-prefix re-entrancy safety, and `online` event reconciliation in `background.js`.
  - Added monotonic chapter progress guard (`parseChapter`, `compareChapterParts`, `shouldUpdateProgress`) supporting integer, decimal, and hyphenated fractional chapters with timestamp fallback for non-numeric identifiers, non-error downgrade rejection, and prototype-pollution guards (`isValidMangaName`, `Object.hasOwn`).
  - Added `window.navigation` (`navigatesuccess`, `currententrychange`) with `popstate`/`hashchange` fallbacks, `{ passive: true }` scroll listeners, >25% scroll-depth gating (`getScrollDepth`, `isScrollDepthSatisfied`), 15-second dwell/debounce gating, single-dispatch per URL, and dispatch-time metadata re-extraction in `content.js`.
  - Expanded zero-dependency `node:test` coverage across `test/background.test.js`, `test/content.test.js`, and `test/popup.test.js` (57 passing tests) and added `chrome.storage.local` + `SYNC_VAULT` stubs in `test/preview/mock-chrome.js`.
  - Affected files: `background.js`, `content.js`, `popup.js`, `test/background.test.js`, `test/content.test.js`, `test/popup.test.js`, `test/preview/mock-chrome.js`

### Changed
- Standardize series storage schema, batch popup DOM rendering via `DocumentFragment`, and delegate list events (`TASK-20261122-fij`)
  - Updated `SYNC_CHAPTER`, `DELETE_SERIES`, and `reconcileAndSync()` (including empty-queue LWW reconciliation) in `background.js` to normalize keys via `name.toLowerCase().trim()` and persist `{ chapter, url, title, site, updated }`.
  - Refactored `renderList()` in `popup.js` to batch card creation in a `DocumentFragment` and mount once via `replaceChildren(fragment)` with zero `innerHTML` or per-card listeners, handling `.btn-delete` (with repeat-click guard) and `.btn-read` via single `#list` click delegation (`handleListClick`).
  - Updated existing `test/background.test.js` and `test/popup.test.js` mock DOM/assertions (`DocumentFragment`, `replaceChildren`, `closest`, event bubbling, normalized keys).
  - Affected files: `background.js`, `popup.js`, `test/background.test.js`, `test/popup.test.js`
- Replace full-document `MutationObserver` and 3-second debounce with targeted SPA navigation and 15-second dwell + scroll-depth gating (`TASK-20261122-v5d`)
  - Removed the `{ subtree: true, childList: true }` `MutationObserver` on `document` in `content.js`, resetting timers and per-route scroll/dispatch state on SPA URL transitions via `handleRouteChange()`.
  - Consolidated Drive read/validation (`fetchAndValidateDriveVault`) and write (`uploadDriveVault`) helpers with BUG-001 malformed-JSON aborts, added `clearBadge()` hygiene across `SYNC_CHAPTER`/`DELETE_SERIES`/`SYNC_VAULT`, and aligned `DELETE_SERIES` `{ status: "queued" }` handling in `popup.js`.
  - Affected files: `background.js`, `content.js`, `popup.js`

### Removed
- Remove dead cover preview markup, styles, and hover listeners (`TASK-20261122-fij`)
  - Removed `#manga-preview`, `#preview-img`, and `.no-cover` CSS/markup from `popup.html`, removed `mouseenter`/`mousemove`/`mouseleave` cover preview logic from `popup.js`, and removed dead preview mocks from `test/popup.test.js`.
  - Affected files: `popup.html`, `popup.js`, `test/popup.test.js`

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
