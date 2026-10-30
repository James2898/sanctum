# Sanctum: Implementation Plan

This implementation plan outlines the prioritized execution roadmap for the Sanctum Chrome extension. Tasks are grouped into sequential phases, with items inside each phase sorted by descending priority.

---

## Design Decisions (Grill)

| # | Decision | Answer | Source | Spec Section |
|---|---|---|---|---|
| **D1** | Local Cache Conflict Resolution | Last-Write-Wins (LWW) per manga series entry based on `updated` ISO timestamp; Drive wins only if strictly newer than local cache. | User accepted default | Phase 2 / Data Model & Sync |
| **D2** | Title Normalization & Schema Migration | Store entries keyed by normalized lowercase slug (`name.toLowerCase().trim()`), store a `title` display string, and auto-migrate legacy keys on first load. | User accepted default | Phase 3 / Data & State |
| **D3** | Chapter Regression Guard | 15-second debounce + require scroll depth > 25%, and silently reject automatic updates if numeric `newChapter < savedChapter`. | User accepted default | Phase 3 / User Behavior |
| **D4** | SPA Navigation Detection | Use in-page `history.pushState` / `popstate` wrapping in `content.js` to trigger URL checks only inside matched manga reader tabs, keeping `manifest.json` permissions minimal. | User accepted default | Phase 2 / Architecture & Performance |
| **D5** | Cover Art Strategy | Delete dead cover preview code (`#manga-preview`, `.no-cover`, and hover listeners) to keep Sanctum lean, fast, and robust. | User accepted default | Phase 3 / Scope Boundary |
| **D6** | Test Tooling | Use Node.js built-in test runner (`node:test`) in a lightweight `test/` directory with zero external npm dependencies. | User accepted default | Phase 4 / Developer Tooling |

---

## Phase 1: Critical Bug Fixes & Sync Hardening
*Objective: Eliminate data corruption, duplicate file generation, and user-facing interruptions.*

### 1.1 Prevent Duplicate Drive File Creation on Network Errors (Priority: P0)
- **Target Files:** [`background.js`](../background.js) (`L22-L24`, `L142-L152`)
- **Action:**
  1. Refactor `findFile(token)` to return `{ status: "found", fileId }`, `{ status: "not_found" }`, or `{ status: "error", error }` based on `res.ok` and `files.length`.
  2. Modify sync worker so `createFile()` is invoked strictly when `status === "not_found"`.
  3. Abort operation with error badge if network or status error occurs.
- **Verification:** Simulate 500/offline response during sync; verify no duplicate `sanctum_history.json` is generated.

### 1.2 Quiet Background OAuth Token Retrieval (Priority: P0)
- **Target File:** [`background.js`](../background.js) (`L16-L18`)
- **Action:**
  1. Change `chrome.identity.getAuthToken({ interactive: true })` to `{ interactive: false }` in `background.js`.
  2. When background auth fails, set extension action badge to `"!"` with red background (`#c0392b`).
  3. Keep `{ interactive: true }` in `popup.js` when user opens the vault.
- **Verification:** Expire token; trigger sync from content script; verify no interactive prompt steals focus.

### 1.3 Fix Premature `"Chapter Reading"` Fallback on SPAs (Priority: P0)
- **Target File:** [`content.js`](../content.js) (`L24-L31`, `L43-L54`, `L84-L93`)
- **Action:**
  1. In MangaDex and MangaPlus site configs, make `getChapter()` return `null` instead of the fallback string `"Reading"`.
  2. Update `checkPage()` guard: retry if `(!mangaTitle || !chapterNumber) && retries < 8`.
  3. Only initiate debounce when both valid title and numeric chapter exist.
- **Verification:** Open MangaDex chapter with slow 3G simulation; confirm `"Chapter Reading"` is never dispatched.

### 1.4 Support Decimal & Fractional Chapters on Asura (Priority: P1)
- **Target File:** [`content.js`](../content.js) (`L1-L7`)
- **Action:**
  1. Change regex from `/(?:comics|series)\/([^\/]+)\/chapter\/(\d+)/` to `/(?:comics|series)\/([^\/]+)\/chapter\/([\d\.\-]+)/`.
  2. Parse chapter strings preserving decimal points (e.g. `150.5` or `12-1`).
- **Verification:** Test URLs `/series/solo-leveling/chapter/150.5` and `/series/nano-machine/chapter/12-1`.

---

## Phase 2: Local Storage & Performance Optimization
*Objective: Zero-latency dashboard loading, offline resilience, and CPU efficiency.*

### 2.1 Implement `chrome.storage.local` Cache & LWW Sync (Priority: P0)
- **Target Files:** [`manifest.json`](../manifest.json) (`L7`), [`popup.js`](../popup.js) (`L200-L255`), [`background.js`](../background.js) (`L58-L75`)
- **Action:**
  1. Cache `fileId` and latest `series` map in `chrome.storage.local`.
  2. On popup load, immediately read and render cached records from `chrome.storage.local` (0ms delay).
  3. Execute Drive fetch asynchronously in background and merge per-series using Last-Write-Wins (LWW) on `updated` ISO timestamps (**D1**).
  4. Save updates directly to `chrome.storage.local` on sync before uploading to Drive.
- **Verification:** Open popup in offline mode; verify vault displays cached history instantly.

### 2.2 Replace Full-Document `MutationObserver` with History Hooks (Priority: P1)
- **Target File:** [`content.js`](../content.js) (`L123-L132`)
- **Action:**
  1. Remove `observer.observe(document, { subtree: true, childList: true })`.
  2. Wrap `history.pushState` and `history.replaceState` and listen to `window` `popstate` events inside `content.js` to trigger `checkPage()` on SPA navigation (**D4**).
- **Verification:** Scroll through 100+ images on Asura/MangaDex; verify zero DOM mutation overhead.

### 2.3 Offline Sync Queue (Priority: P2)
- **Target File:** [`background.js`](../background.js) (`L11-L88`)
- **Action:**
  1. When offline or Drive patch fails, record pending updates under `pending_sync` in `chrome.storage.local`.
  2. Flush pending updates to Drive using LWW timestamp reconciliation when connectivity restores.
- **Verification:** Read chapter while disconnected, reconnect network, verify chapter syncs to Drive automatically.

---

## Phase 3: Dashboard UI/UX & Data Integrity
*Objective: Polished controls, intuitive sorting, and preventing duplicate series.*

### 3.1 Missing Kunmanga Filter & Search Button Click (Priority: P0)
- **Target Files:** [`popup.html`](../popup.html) (`L253-L269`), [`popup.js`](../popup.js) (`L257-L263`)
- **Action:**
  1. Add `<label><input type="radio" value="kunmanga" name="filter" />Kunmanga</label>` to `#filter-container`.
  2. Add click event listener on `#search-btn` calling `applyFilters()`.
- **Verification:** Click Kunmanga radio to filter; click magnifying glass icon to execute search.

### 3.2 Distinguish Empty Search from Empty Vault (Priority: P1)
- **Target File:** [`popup.js`](../popup.js) (`L19-L23`, `L181-L198`)
- **Action:**
  1. Update `renderList(series, isFilterActive)`:
     - When `series.length === 0` and filter/search is active: render `"<div class='status'>No matching series found.</div>"`.
     - When `allSeries.length === 0`: render `"<div class='status'>Vault is empty. Start reading!</div>"`.
- **Verification:** Search for non-existent term; verify "No matching series found." is displayed.

### 3.3 Add "Recently Read" Sorting Toggle (Priority: P1)
- **Target Files:** [`popup.html`](../popup.html) (`L238-L250`), [`popup.js`](../popup.js) (`L243-L245`)
- **Action:**
  1. Add sort toggle button to `#header` (Default: Recently Read).
  2. Implement sort modes:
     - **Recent:** `b[1].updated.localeCompare(a[1].updated)`
     - **A–Z:** `(a[1].title || a[0]).localeCompare(b[1].title || b[0])`
- **Verification:** Verify latest read chapter displays at top by default.

### 3.4 Title Normalization & Legacy Key Migration (Priority: P2)
- **Target Files:** [`content.js`](../content.js) (`L5-L7`), [`background.js`](../background.js) (`L58`)
- **Action:**
  1. Key `data.series` by normalized lowercase slug (`name.toLowerCase().trim()`) and store display `title` and `site` properties (**D2**).
  2. Run a one-time normalization pass over existing entries on load, merging duplicates via LWW `updated` timestamp.
- **Verification:** Read "Solo Leveling" on MangaDex and Asura; verify both update the same record.

### 3.5 Reading Overwrite Regression Guard (Priority: P2)
- **Target Files:** [`content.js`](../content.js) (`L101-L113`), [`background.js`](../background.js) (`L58-L62`)
- **Action:**
  1. Increase reading threshold from 3s to 15s and require user scroll depth > 25% before dispatching `SYNC_CHAPTER` (**D3**).
  2. In `background.js`, silently ignore automatic chapter updates when numeric `newChapter < savedChapter`.
- **Verification:** Open older chapter for 5 seconds; confirm progress does not revert.

### 3.6 Remove Dead Cover Preview Code (Priority: P3)
- **Target Files:** [`popup.js`](../popup.js) (`L12-L14`, `L130-L150`), [`popup.html`](../popup.html) (`L153-L174`, `L277-L279`)
- **Action:**
  1. Remove `#manga-preview`, `#preview-img`, and `.no-cover` styles from `popup.html` (**D5**).
  2. Remove cover hover event listeners and `no-cover` class assignment from `popup.js`.
- **Verification:** Verify clean card rendering without dashed underlines or unused preview DOM.

---

## Phase 4: Developer Tooling, Testing & Hygiene
*Objective: CI automation, zero-dependency test coverage, and security compliance.*

### 4.1 OAuth Credential Hygiene & Example Manifest (Priority: P0)
- **Target Files:** [`manifest.json`](../manifest.json), `manifest.example.json`, [`readme.md`](../readme.md)
- **Action:**
  1. Create `manifest.example.json` with placeholder values for `client_id` and `key`.
  2. Add setup instructions in `readme.md`.
- **Verification:** Ensure contributors have a clear template for local OAuth credentials.

### 4.2 Zero-Dependency Automated Test Harness (Priority: P1)
- **Target Files:** `test/content.test.js`, `test/background.test.js`
- **Action:**
  1. Use Node.js built-in test runner (`node --test`) with zero external npm dependencies (**D6**).
  2. Write unit tests for all URL regexes in `SITE_CONFIGS`.
  3. Write unit tests for Drive file parsing, LWW reconciliation, and regression guard logic.
- **Verification:** Run `node --test` and verify 100% test pass rate.

### 4.3 GitHub Actions CI (Priority: P2)
- **Target File:** `.github/workflows/ci.yml`
- **Action:**
  1. Run `node --test` and Manifest V3 JSON validation on pull requests.
- **Verification:** Push branch and confirm green CI workflow run.
