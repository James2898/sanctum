# Sanctum: Project Improvement Suggestions & Audit

- **Date:** 2026-10-31
- **Target Version:** Sanctum MV3 (`manifest.json` v1.0)
- **Scope:** Full repository (`manifest.json`, `background.js`, `content.js`, `popup.html`, `popup.js`, docs)

---

## 1. High Priority: Critical Bugs & Reliability (Must Fix)

### 1.1 Duplicate `sanctum_history.json` on API/Network Glitches
- **Locations:** `background.js:22-24`, `background.js:142-152`
- **Cause:** `findFile()` returns `null` on any non-200 HTTP response (rate limit 429, temporary 503, timeout, or offline). When `findFile()` returns `null`, line 23 executes `fileId = await createFile(token)`.
- **Consequence:** Creates duplicate `sanctum_history.json` files on Google Drive, causing split history or apparent data loss.
- **Fix:** Distinguish an empty query result (`files.length === 0`) from an API error (`!res.ok`). Only call `createFile()` when search explicitly succeeds with zero results. Cache the resulting `fileId` in `chrome.storage.local`.

### 1.2 Interactive OAuth Prompt Interrupting Active Reading
- **Location:** `background.js:16-18`
- **Cause:** Background message handler calls `chrome.identity.getAuthToken({ interactive: true })`.
- **Consequence:** If the user's OAuth token expires while reading, Chrome opens an intrusive modal Google sign-in window over the active reader tab.
- **Fix:** Use `{ interactive: false }` in `background.js`. If token retrieval fails, display an error badge (`!`) on the action icon. Keep `{ interactive: true }` strictly within `popup.js` on user-initiated actions.

### 1.3 Race Condition Stores `"Chapter Reading"` to Vault
- **Locations:** `content.js:24-31`, `content.js:43-54`, `content.js:84-113`, `popup.js:95`
- **Cause:** On SPA readers (MangaDex, MangaPlus), if the reader element hasn't finished rendering when `checkPage()` fires, `getChapter()` defaults to the string `"Reading"`. Because `"Reading"` is truthy, the 3-second debounce pushes `{ chapter: "Reading" }` to Drive.
- **Consequence:** Corrupts stored chapter data to `"Reading"`, displaying `"Chapter Reading"` in the dashboard.
- **Fix:** Return `null` from `getChapter()` if DOM elements are missing. Extend the retry loop (`retries < 8`) to wait for both title and valid chapter number before starting the debounce timer.

### 1.4 Decimal & Fractional Chapter Regex Failure on Asura
- **Location:** `content.js:1-7`
- **Cause:** Regex is `/(?:comics|series)\/([^\/]+)\/chapter\/(\d+)/`, requiring integer digits only.
- **Consequence:** Chapters such as `150.5` or `12-1` fail to match; reading progress on decimal releases is ignored.
- **Fix:** Update regex to `/(?:comics|series)\/([^\/]+)\/chapter\/([\d\.\-]+)/`.

---

## 2. Architecture & Performance (Should Fix)

### 2.1 Missing Local Cache (`chrome.storage.local`)
- **Locations:** `manifest.json:7`, `popup.js:200-255`, `background.js:11-88`
- **Cause:** `"storage"` is declared in permissions but never used. Every popup open performs 2 roundtrip Drive API requests (`files?q=...` and `files/{id}?alt=media`).
- **Consequence:** 1–3 second popup load delay on every click; total failure when offline; unnecessary API quota usage.
- **Fix:** 
  1. Cache vault contents and `fileId` in `chrome.storage.local`.
  2. In `popup.js`, render immediately from `chrome.storage.local` (0ms perceived latency).
  3. Perform a silent background sync with Drive to pull new updates.
  4. Allow offline chapter queueing that flushes to Drive when connectivity restores.

### 2.2 Unbounded `MutationObserver` on Webtoon Infinite Scroll
- **Location:** `content.js:123-132`
- **Cause:** `observer.observe(document, { subtree: true, childList: true })` checks `location.href` on every single DOM mutation.
- **Consequence:** Infinite-scroll webtoon readers mount and unmount hundreds of DOM nodes, causing thousands of redundant observer callbacks per chapter.
- **Fix:** Wrap in-page `history.pushState` / `history.replaceState` and listen to `popstate` in `content.js` to trigger URL checks only on actual navigation events.

### 2.3 Dead Code: Manga Cover Preview
- **Locations:** `popup.js:130-150`, `popup.html:153-155, 277-279`
- **Cause:** `popup.js` contains hover preview logic for `info.cover`, but neither `content.js` nor `background.js` scrapes or saves `cover`.
- **Consequence:** `info.cover` is always `undefined`; every title receives `.no-cover` (dashed underline) and `#manga-preview` is dead code.
- **Fix:** Remove the dead preview DOM (`#manga-preview`), `.no-cover` CSS styling, and hover event listeners to keep the extension lean and dependency-free.

---

## 3. UI & UX Improvements

### 3.1 Missing Kunmanga Filter & Inactive Search Button
- **Locations:** `popup.html:253-269`, `popup.js:257-263`
- **Cause:**
  1. `kunmanga.com` is configured in `content.js` and `popup.js`, but missing from `#filter-container` radio options.
  2. `#search-btn` has no click listener in `popup.js` (only the `input` event on the field works).
  3. When a search returns 0 matches, `renderList()` renders `"Vault is empty. Start reading!"`.
- **Fix:** Add Kunmanga radio button to `popup.html`, bind `#search-btn` click to `applyFilters()`, and display `"No matching series found."` when search/filters return empty results.

### 3.2 Sort by Recently Read
- **Location:** `popup.js:243-245`
- **Cause:** Hardcoded alphabetical sort (`localeCompare`).
- **Fix:** Add a toggle in the popup header for "Recently Read" (sort by `info.updated` descending) vs "A–Z".

### 3.3 Overwrite Regression Guard
- **Location:** `content.js:101-113`
- **Cause:** Fixed 3-second debounce timer unconditionally overwrites progress.
- **Consequence:** Opening Chapter 1 to check older art downgrades progress from Chapter 100 to Chapter 1 after 3 seconds.
- **Fix:** Increase debounce to 15 seconds with >25% scroll-depth detection, and silently ignore automatic updates when numeric `newChapter < savedChapter`.

### 3.4 Series Title Normalization
- **Locations:** `content.js:5-7`, `background.js:58`
- **Cause:** MangaDex produces `"Solo Leveling"`, Asura produces `"solo leveling"`.
- **Consequence:** Reading across multiple sites creates duplicate vault entries for the same title.
- **Fix:** Store entries keyed by normalized lowercase slug (`name.toLowerCase().trim()`), persist a display `title` and `site` field, and auto-migrate legacy keys on first load.

---

## 4. Code Quality & Tooling

### 4.1 Automated Tests, Linting & CI
- **Scope:** Root repository
- **Needs:**
  - Zero-dependency unit tests using Node.js built-in test runner (`node:test`) for regexes and chapter parsers across supported site URLs.
  - GitHub Actions CI workflow to validate Manifest V3 syntax and run unit tests on pull requests.
  - `manifest.example.json` to prevent contributors from committing personal OAuth client IDs or keys.
