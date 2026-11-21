# PBI-SANCTUM-ARCH — Sanctum Industry-Grade Architecture & Implementation

- **Saved:** 2026-11-21
- **Source:** Pasted PBI text

---

## PBI (verbatim)

# Handover: Sanctum Industry-Grade Architecture & Implementation

### Context & Background
I am working on elevating **Sanctum** from a personal utility into an industry-grade Chrome Extension (Manifest V3) before finalizing its featured case study in my portfolio (`portfolio/src/content/projects/sanctum.md`).

An architectural audit of this repository (`sanctum`) identified four critical areas to address:

1. **Local-First Storage & Offline Availability:**
   - Currently, `popup.js` fetches `sanctum_history.json` directly from the Google Drive REST API on every open, introducing 1–2s network latency and failing offline.
   - Goal: Implement a stale-while-revalidate pattern using `chrome.storage.local` for instant sub-10ms popup rendering, local caching of Drive `fileId`, and offline mutation queueing.

2. **Concurrency, Idempotency & Data Guardrails:**
   - In `background.js`, `findFile()` returning `null` on network errors (e.g., 429, 503) causes `createFile()` to execute, spawning duplicate `sanctum_history.json` files on Drive and splitting history.
   - In `content.js`, re-reading Chapter 1 accidentally overwrites Chapter 100 progress due to an unconstrained 3-second debounce.
   - Goal: Strict separation between empty search results and API errors; monotonic chapter update guards; title slug normalization across aggregator domains.

3. **Non-Intrusive Auth & Service Worker Lifecycle:**
   - In `background.js`, calling `chrome.identity.getAuthToken({ interactive: true })` can launch an intrusive Google login modal over an active reading tab when a token expires.
   - Goal: Restrict background sync to `{ interactive: false }` with non-blocking badge alerts (`!`); keep `{ interactive: true }` strictly within user-initiated clicks in `popup.js`.

4. **High-Performance SPA Navigation & Reading Engagement:**
   - In `content.js`, an unbounded `MutationObserver` on `document` with `{ subtree: true, childList: true }` runs on every DOM mutation, causing excessive callbacks on infinite-scroll webtoon readers.
   - Goal: Switch to targeted URL change listeners (`Navigation API` or wrapping `history.pushState` / `popstate`); pair debounce with scroll-depth detection (>25% scroll).

5. **Housekeeping & Code Quality:**
   - Remove dead cover preview code (`#manga-preview` in `popup.html`/`popup.js`).
   - Add Kunmanga to popup filter options and wire up `#search-btn` click listener.
   - Add zero-dependency tests using `node:test` for regex/chapter parsing.

### Workflow & Deliverables for this Session:
1. **Brainstorm & Plan First:** Do not jump straight into editing code. Review `docs/PROJECT_IMPROVEMENT_SUGGESTIONS.md` and `docs/IMPLEMENTATION_PLAN.md`, then discuss the proposed implementation roadmap with me so we align on decisions, tradeoffs, and code changes.
2. **Execute & Test:** Implement the agreed changes incrementally in vanilla JavaScript (ES2022+, zero build tools, Manifest V3).
3. **Generate Return Handover:** Once implementation and testing are complete, provide a structured handover summary of what was changed, verified performance/reliability improvements, and system metrics so I can bring it back to my portfolio workspace to complete the showcase post (`src/content/projects/sanctum.md`).

---

## Analysis

### Acceptance Criteria

#### Phase 1: Concurrency, Idempotency & Non-Intrusive Auth
- [ ] `findFile(token)` in `background.js` returns a structured status (`{ status: "found", fileId }`, `{ status: "not_found" }`, or `{ status: "error", error }`). `createFile()` is called **only** when `status === "not_found"`.
- [ ] If `findFile()` or network operations return an HTTP error or throw, `background.js` aborts creation, displays an error badge (`!`), and sets badge background color to `#c0392b`.
- [ ] `background.js` uses `{ interactive: false }` for all background token acquisitions via `chrome.identity.getAuthToken`. If auth fails silently, action badge displays `"!"` without launching an interactive modal window over the active reader tab.
- [ ] Interactive authentication (`{ interactive: true }`) is restricted strictly to user-initiated clicks (e.g. in `popup.js`).
- [ ] In `content.js`, `getChapter()` on MangaDex and MangaPlus returns `null` (not `"Reading"`) when DOM title or chapter metadata elements are not yet mounted.
- [ ] `content.js` waits up to 8 retries for both valid title and chapter number; sync debounce is initiated only when both are present and non-null.
- [ ] Asura Scans regex in `content.js` matches decimal and fractional chapter formats (e.g. `150.5`, `12-1`).

#### Phase 2: Local-First Storage & SPA Navigation
- [ ] `chrome.storage.local` caches the latest `series` map, `fileId`, and `lastSync` timestamp.
- [ ] `popup.js` renders immediately from `chrome.storage.local` on open (sub-10ms perceived latency) before or in parallel with background cloud synchronization.
- [ ] When offline or when Google Drive requests fail, pending mutations (`SYNC_CHAPTER` or `DELETE_SERIES`) are enqueued in `chrome.storage.local` under `pending_sync` and reconciled on next online sync.
- [ ] The unbounded `MutationObserver` on `document` with `{ subtree: true, childList: true }` in `content.js` is removed.
- [ ] SPA navigation detection uses targeted URL change listeners (`window.navigation` API / `popstate` / `hashchange`) without observing full-document subtree mutations.
- [ ] Content script enforces a 15-second debounce combined with a scroll-depth check (>25% scroll of page height) before dispatching `SYNC_CHAPTER`.
- [ ] Monotonic chapter guard: `background.js` rejects automatic progress overwrites when `numericNewChapter < numericSavedChapter`.

#### Phase 3: Dashboard UI/UX & Data Integrity
- [ ] Manga series keys in storage are normalized lowercase slugs (`name.toLowerCase().trim()`), with display `title` and `site` preserved in the series record.
- [ ] An automatic one-time migration routine runs on load to reconcile legacy title keys using Last-Write-Wins (LWW) based on `updated` ISO timestamps.
- [ ] Dead cover preview markup (`#manga-preview`, `#preview-img`), `.no-cover` CSS styles, and mouse hover/move listeners are completely removed from `popup.html` and `popup.js`.
- [ ] `popup.js` uses `DocumentFragment` batching and container-level event delegation for card interactions (delete, link navigation) instead of per-card event listeners.
- [ ] Kunmanga is added to the `#filter-container` radio options in `popup.html`.
- [ ] `#search-btn` click listener in `popup.js` triggers `applyFilters()`.
- [ ] An empty search/filter result displays `"No matching series found."` while a genuinely empty vault displays `"Vault is empty. Start reading!"`.
- [ ] A "Recently Read" (descending `updated` timestamp) vs "A–Z" sort toggle is present in `popup.html` and wired in `popup.js` (defaulting to Recently Read).

#### Phase 4: Developer Tooling, Zero-Dependency Testing & CI
- [ ] A zero-dependency test suite is created under `test/` running with `node --test` and `node:assert`.
- [ ] Unit tests cover all `SITE_CONFIGS` regexes, chapter number parsers (integers, decimals, fractions), slug normalization, monotonic comparison, and LWW merge logic.
- [ ] `manifest.example.json` is provided with placeholder OAuth client IDs and keys.
- [ ] `readme.md` is updated with local setup instructions and documentation of new capabilities.
- [ ] GitHub Actions CI workflow (`.github/workflows/ci.yml`) runs `node --test` and validates Manifest V3 JSON syntax.

---

### Scope & Out-of-Scope

- **In Scope:**
  - Hardening `background.js` Drive API calls, single-writer cloud sync coordination, and auth lifecycle.
  - Adding `chrome.storage.local` caching and offline mutation queueing.
  - Optimizing `content.js` SPA navigation detection, scroll-depth gating, and chapter regexes.
  - Refactoring `popup.js` and `popup.html` for DOM batching, event delegation, sorting, filter fixes, and dead code removal.
  - Schema migration for normalized slugs and LWW reconciliation.
  - Zero-dependency automated test harness and CI workflow.
- **Out of Scope:**
  - Adding third-party databases, cloud backends, or analytics platforms outside Google Drive.
  - Scraping or hosting image cover files (explicitly rejected to keep the extension lightweight and private).
  - Introducing heavy build tools (Webpack, Vite) or frontend frameworks (React, Vue) — implementation remains pure vanilla ES2022+.
  - Modifying non-Chromium extensions or non-Manifest V3 targets.

---

### Ambiguities & Risks

1. **SPA Navigation in Isolated World:**
   - *Risk:* In Chrome extensions, content scripts run in an isolated JavaScript context. Monkey-patching `history.pushState` inside `content.js` only intercepts calls made by the content script itself, not SPA framework routers (Vue, React, Next).
   - *Resolution:* Use the Chromium `window.navigation` API (supported in Chrome 102+ across worlds) with `popstate`/`hashchange` fallbacks and lightweight URL checks.
2. **Fractional & Non-Numeric Chapter Comparisons:**
   - *Risk:* Chapters like `150.5`, `12-1`, `"Prologue"`, or `"Extra"` could fail numeric parsing (`parseFloat`), risking unintended rejections or overwrites in the monotonic guard.
   - *Resolution:* Robust `parseChapterNumber()` parser that extracts primary numeric components for comparison, and falls back to preserving timestamps when non-numeric strings match.
3. **Concurrent Cloud Writes:**
   - *Risk:* If both `popup.js` and `background.js` initiate direct Drive `PATCH` calls simultaneously, one write can overwrite another or generate conflict errors.
   - *Resolution:* Establish `background.js` as the single coordinator/writer for Google Drive requests. `popup.js` requests syncs via runtime messaging and observes storage changes.

---

### Codebase-Aware Notes

- `manifest.json`: Ensure `"storage"` permission is present (already declared) and clean up host permissions if necessary.
- `background.js`:
  - Refactor `findFile()` and `createFile()`.
  - Implement single-writer Drive synchronization queue and offline mutation queue reconciliation (`pending_sync`).
  - Update `chrome.identity.getAuthToken` to `{ interactive: false }` with non-blocking badge handling.
  - Implement monotonic chapter validation in `SYNC_CHAPTER` handler.
- `content.js`:
  - Update `asuraConfig` regex to support decimals/fractions: `/(?:comics|series)\/([^\/]+)\/chapter\/([\d\.\-]+)/`.
  - Fix `getChapter()` in MangaDex and MangaPlus to return `null` instead of `"Reading"`.
  - Remove `MutationObserver` on `document`.
  - Add `window.navigation` / `popstate` listeners and 15s debounce + >25% scroll depth detection.
- `popup.html`:
  - Add Kunmanga filter radio button.
  - Add sort toggle ("Recently Read" / "A-Z").
  - Remove dead `#manga-preview`, `#preview-img`, and `.no-cover` CSS styles.
- `popup.js`:
  - Implement immediate render from `chrome.storage.local`.
  - Wire `#search-btn` click event.
  - Refactor rendering to use `DocumentFragment` and event delegation on `#list`.
  - Implement empty state differentiation (`"No matching series found."` vs `"Vault is empty. Start reading!"`).
  - Remove cover preview listeners.
- `test/`:
  - Create `test/regex.test.js` and `test/sync.test.js` using Node's built-in `node:test` and `node:assert`.
- `.github/workflows/ci.yml`:
  - New GitHub Actions workflow executing `node --test` across Node 18/20/22.

---

## Project Manager Phase Organization

To execute this PBI methodically using `@project-manager`, the work is divided into four self-contained, sequentially executable phases:

### Phase 1: Concurrency, Idempotency & Auth Guardrails (Tier 1)
- **Scope:** `background.js`, `content.js`
- **Key Tasks:**
  1. `findFile()` 3-state return and duplicate file creation guard.
  2. Silent background OAuth token retrieval with non-blocking error badge.
  3. Fix premature `"Chapter Reading"` fallback in MangaDex/MangaPlus.
  4. Decimal and fractional chapter regex support on Asura.
- **Verification:** Unit tests for chapter extraction and Drive search status logic.

### Phase 2: Local Storage & High-Performance SPA Navigation (Tier 1)
- **Scope:** `background.js`, `content.js`, `popup.js`
- **Key Tasks:**
  1. Local storage caching (`chrome.storage.local`) and offline mutation queue.
  2. Replace full-document `MutationObserver` with `window.navigation` & `popstate` listeners.
  3. 15-second debounce + scroll-depth (>25%) detection.
  4. Monotonic chapter progress guard in background sync.
- **Verification:** Verify zero DOM mutation overhead on infinite scroll; verify offline queue persistence.

### Phase 3: Schema Migration, UI Polish & DOM Batching (Tier 1)
- **Scope:** `popup.html`, `popup.js`, `background.js`
- **Key Tasks:**
  1. Title slug normalization and automatic legacy key migration (LWW).
  2. DocumentFragment batching and container event delegation on `#list`.
  3. "Recently Read" / "A-Z" sort toggle, Kunmanga filter option, and `#search-btn` click binding.
  4. Removal of dead cover preview markup, styles, and listeners.
- **Verification:** Fast DOM updates, filter validation, empty state verification.

### Phase 4: Developer Tooling, Test Harness & CI (Tier 1)
- **Scope:** `test/`, `manifest.example.json`, `.github/workflows/ci.yml`, `readme.md`
- **Key Tasks:**
  1. Zero-dependency `node:test` suite for all site configs, parsers, slug normalization, and monotonic rules.
  2. `manifest.example.json` and documentation updates.
  3. GitHub Actions CI workflow.
- **Verification:** Run `node --test` with 100% pass rate.
