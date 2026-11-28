# Spec — Sanctum Phase 4 (Developer Tooling, CI, Test Closure & BUG-009)

## Feature Summary
Phase 4 completes the industry-grade architectural elevation of the Sanctum Chrome Extension (Manifest V3) by establishing open-source OAuth credential hygiene (`manifest.example.json`), a zero-dependency CommonJS test harness (`package.json`), an automated GitHub Actions CI pipeline (`.github/workflows/ci.yml`) running unit tests and Manifest V3 schema/asset validation across Node 20.x and 22.x LTS, a full `readme.md` overhaul documenting the local-first/resilient/SPA/Vault architecture and local setup/testing workflows, closure of remaining PBI Phase 4 unit test coverage gaps in `test/`, and resolution of `BUG-009` (cross-site display title survivorship in `background.js`).

## Acceptance Criteria

### A. OAuth Credential Hygiene & `manifest.example.json`
1. `manifest.example.json` exists at the repository root and mirrors every key and value of `manifest.json` (`manifest_version: 3`, `name`, `version`, `description`, `permissions: ["identity", "storage"]`, all 7 `host_permissions`, `oauth2.scopes: ["https://www.googleapis.com/auth/drive.file"]`, `background.service_worker: "background.js"`, `content_scripts`, `icons`, `action`) except the two credential fields:
   - `key` is set to `"YOUR_EXTENSION_PUBLIC_KEY_HERE"`
   - `oauth2.client_id` is set to `"YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com"`
2. The existing tracked `manifest.json` remains completely unmodified and remains tracked in git (`git diff manifest.json` is empty).

### B. Zero-Dependency NPM Script Harness (`package.json`)
3. `package.json` exists at the repository root with:
   - `"type": "commonjs"` (preserving conditional `typeof module !== "undefined" && module.exports` interoperability across classic MV3 scripts and Node)
   - `"scripts": { "test": "node --test test/*.test.js" }`
   - `"engines": { "node": ">=20" }`
   - Explicitly zero external dependencies (`"dependencies": {}` and `"devDependencies": {}`), with no `node_modules` directory or lockfile required.
4. Running `npm test` (and `node --test test/*.test.js`) executes only top-level `test/*.test.js` unit test files, naturally excluding `test/preview/` harness files (`test/preview/server.js`, `test/preview/mock-chrome.js`), and exits `0` across Node 20.x and 22.x LTS without hanging or external package installation.

### C. Automated GitHub Actions CI Workflow (`.github/workflows/ci.yml`)
5. `.github/workflows/ci.yml` exists and triggers on both `push` and `pull_request` events targeting branches `main` and `feature/architecture/industry-grade-upgrade`, with least-privilege permissions (`permissions: { contents: read }`).
6. The CI job runs on `ubuntu-latest` with a Node.js LTS matrix of `['20.x', '22.x']`, performs checkout (`actions/checkout@v4`) and Node setup (`actions/setup-node@v4`) without running `npm install` or `npm ci`, and verifies via a zero-dependency check that `package.json` contains zero entries in `dependencies` and `devDependencies` (failing if any external dependency is present).
7. The CI job executes `npm test` (running `node --test test/*.test.js`) on every matrix node version and fails the build if any test fails or skips unexpectedly.
8. The CI job executes a zero-dependency Node Manifest V3 validation script that validates `manifest.example.json` (required) and `manifest.json` (when present — required in this repository since tracked) for:
   - Valid JSON syntax (`JSON.parse` produces a non-null plain object).
   - Required MV3 keys and shapes: `manifest_version === 3`, non-empty string `name`, valid Chrome extension `version` (`^\d+(?:\.\d+){0,3}$` with segments `0..65535`), non-empty `permissions` array containing `"identity"` and `"storage"`, `host_permissions` array of match strings, `background.service_worker` non-empty string, `action` object, `content_scripts` array with non-empty `matches` and `js`, `icons` object, and `oauth2` object with non-empty `client_id` string and non-empty `scopes` array.
   - Disk existence of every referenced local asset: `background.service_worker`, every entry in `content_scripts[*].js`, `action.default_popup` (when present), and every icon file path in `icons` (when present).
   - Credential placeholder & parity checks on `manifest.example.json`: `key === "YOUR_EXTENSION_PUBLIC_KEY_HERE"`, `oauth2.client_id === "YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com"`, and deep equality against `manifest.json` (when `manifest.json` is present) for all fields other than `key` and `oauth2.client_id`.

### D. BUG-009 Fix — Cross-Site Display Title Survivorship (`background.js`)
9. `background.js` exports `pickPreferredTitle` in its guarded CommonJS `module.exports` object while keeping classic MV3 browser global guards intact (`LESSON-001`).
10. Inside `reconcileAndSync()` (`background.js:729-733`), pending queue replay selects the series title via `pickPreferredTitle(candidateTitle, saved?.title, slug)` instead of `||` truthy fallback, so a queued sync from a lowercase URL-slug extractor (`asura`, `mangahere`, `kunmanga`) never overwrites an existing mixed-case `saved.title` from a DOM extractor (`mangadex`, `mangaplus`).
11. Inside `SYNC_CHAPTER` (`background.js:842-846`), chapter synchronization selects the series title via `pickPreferredTitle(candidateTitle, saved?.title, slug)` instead of `||` truthy fallback, preserving mixed-case `saved.title` across local cache and Google Drive (`sanctum_history.json`) while maintaining prototype-key safety (`isValidMangaName` / `Object.hasOwn` per `BUG-006`) and monotonic chapter guards.

### E. Unit Test Coverage Closure & `BUG-009` Tests (`test/`)
12. `test/content.test.js` imports real exported functions from `content.js` (per `LESSON-001`, zero `simulate*` duplicates, zero external dependencies) and includes passing unit tests covering:
    - `mangahere.cc` URL/DOM extraction and chapter parsing.
    - `kunmanga.com` URL/DOM extraction and chapter parsing.
    - Direct URL regex assertions for `mangadex.org` and `mangaplus.shueisha.co.jp`.
    - `asurascans.com` domain lookup in `extractPageMetadata()`.
13. `test/background.test.js` imports real exported functions from `background.js` (per `LESSON-001`, zero external dependencies) and includes passing unit tests covering:
    - `compareChapterParts` (integers, decimals, fractions, monotonic ordering).
    - `mergeDuplicateSeriesEntries`.
    - `reconcileSeriesMaps` (LWW timestamp merge + monotonic chapter guard).
    - `pickPreferredTitle` directly (mixed-case DOM title preservation over lowercase slugs, fallback handling).
    - `BUG-009` cross-site display title survivorship in both `SYNC_CHAPTER` and `reconcileAndSync()` queue replay: verifying that syncing a newer chapter from `asura`, `mangahere`, or `kunmanga` preserves existing mixed-case `saved.title` from `mangadex` or `mangaplus`, whereas a mixed-case title upgrades an existing lowercase slug title.
14. All unit tests in `test/*.test.js` (65 baseline tests plus all newly added tests) pass 100% under both `npm test` and `node --test test/*.test.js` with zero skipped or weakened assertions.

### F. Documentation Overhaul (`readme.md`)
15. Lowercase `readme.md` at the repository root is updated (fixing the broken `git clone` link on line 23 and replacing stale documentation) to clearly document the elevated architecture:
    - **Local-First Architecture:** `chrome.storage.local` caching with Stale-While-Revalidate (SWR) sync to `sanctum_history.json` on Google Drive (sub-10ms popup first paint).
    - **Resilience & Guardrails:** FIFO offline mutation queue (`pending_sync`) with re-entrancy-safe prefix draining, 3-state Google Drive search (`found`, `not_found`, `error`), corrupted payload guard (abort without overwrite), monotonic chapter progress guard + LWW merge, and cross-site display title survivorship (`pickPreferredTitle`).
    - **SPA Optimization:** Chromium `window.navigation` API + `popstate` listeners replacing full-document `MutationObserver`; `15s` dwell + `>25%` scroll-depth gate with end-of-dwell DOM re-extraction and `8` metadata retries (`1000ms` interval).
    - **Vault UI & Badge State:** `380px` popup canvas (`box-sizing: border-box`), Recently Read vs. A–Z sorting, `DocumentFragment` batching, container event delegation, filter radio controls (`All` + 5 site filters across the 6 configured domains: `asurascans.com`, `asuracomic.net`, `mangahere.cc`, `mangadex.org`, `mangaplus.shueisha.co.jp`, `kunmanga.com`), and extension action badge states (`3000ms` OK auto-clear).
16. `readme.md` provides accurate, step-by-step developer setup and testing instructions:
    - Configuring local OAuth credentials from `manifest.example.json` into `manifest.json` (`key` and Google Cloud `oauth2.client_id` with `drive.file` scope) without committing personal secrets, and loading unpacked via `chrome://extensions`.
    - Running the zero-dependency unit test suite with `npm test` (`node --test test/*.test.js`) on Node 20+/22+ LTS with zero `npm install` step.
    - Running the local LAN popup preview harness with `node test/preview/server.js` (port `3456`).

## Out of Scope
- Modifying `manifest.json` or removing `manifest.json` from git tracking.
- Adding third-party `dependencies` or `devDependencies` (test frameworks, linters, bundlers such as Webpack/Vite) or committing `node_modules` / `package-lock.json`.
- Adding third-party databases, cloud backends, or analytics platforms outside Google Drive (`sanctum_history.json`).
- Scraping or hosting cover image files.
- Introducing frontend frameworks (React, Vue); runtime implementation remains pure vanilla ES2022+.
- Modifying non-Chromium extensions or non-Manifest V3 targets.
- Modifying external portfolio repository files (e.g., `portfolio/src/content/projects/sanctum.md`); the final Return Handover summary is generated in chat after Phase 4 merges into `feature/architecture/industry-grade-upgrade`.

## Fallback Behaviors
- **Offline / Drive Sync Failure (`background.js`):** Existing local-first fallback remains intact (`fetchAndValidateDriveVault()`, `createFile()`, `uploadDriveVault()`, and `reconcileAndSync()` return `{ status: "error", error }` and enqueue failed mutations into `pending_sync` per `BUG-004`), with `pickPreferredTitle()` ensuring queued offline mutations preserve mixed-case titles upon replay (`BUG-009`).
- **CI Manifest Validation Fallback:** The CI validation script fails fast with a clear diagnostic message if `manifest.example.json` is missing/invalid, and checks `manifest.json` (plus parity with `manifest.example.json`) whenever `manifest.json` is present in the workspace.
- **Cross-Platform Test Glob Compatibility:** `package.json` uses `"node --test test/*.test.js"` (avoiding `node --test test` so `test/preview/server.js` is never executed as a test file) and declares `"engines": { "node": ">=20" }` (`readme.md` documents Node 20+/22+ LTS compatibility across Linux/macOS shells and Windows).

## Resolved Ambiguities
- **BUG-009 (`[Queued for Phase 4]` in `MEMORY.md`) vs. Phase 4 Handover Scope** → User confirmed: include `BUG-009` fix in `background.js` (`SYNC_CHAPTER` and `reconcileAndSync()`), export `pickPreferredTitle`, and add unit tests in `test/background.test.js` within Phase 4.
- **`manifest.json` Retention vs. Credential Hygiene** → PM/context confirmed: keep tracked `manifest.json` unmodified and in git; mirror all non-credential fields in `manifest.example.json` with exact placeholder strings (`"YOUR_EXTENSION_PUBLIC_KEY_HERE"`, `"YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com"`).
- **`readme.md` Casing & Architecture Metrics** → Resolved from `tasks/pending/context.md`: file is lowercase `readme.md` (58 lines, broken clone link on line 23); verified metrics (`15s` dwell, `>25%` scroll, `8` retries @ `1000ms`, `3000ms` OK clear, `380px` popup, 6 domains / 5 site filters + `All`, `sanctum_history.json`, LAN preview server `node test/preview/server.js` on port `3456`).
- **PBI Phase 4 Test Coverage vs. 65-Test Baseline** → Resolved from `tasks/pending/context.md`: add missing tests in `test/content.test.js` (`mangahere.cc`, `kunmanga.com`, direct URL regexes for `mangadex.org` and `mangaplus.shueisha.co.jp`, `asurascans.com` in `extractPageMetadata()`) and `test/background.test.js` (`compareChapterParts`, `mergeDuplicateSeriesEntries`, `reconcileSeriesMaps`, `pickPreferredTitle`, `BUG-009`).
- **Test Glob Isolation (`test/*.test.js` vs. `test/preview/`)** → Resolved from `tasks/pending/context.md` & `MEMORY.md` (`LESSON-002`): `node --test test/*.test.js` matches only top-level unit tests and excludes `test/preview/server.js` and `test/preview/mock-chrome.js`.
