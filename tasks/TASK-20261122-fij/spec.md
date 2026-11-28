# Spec — Sanctum Phase 3: Schema Migration, UI Polish & DOM Batching

## Feature Summary
Phase 3 of the Sanctum Chrome Extension (Manifest V3) industry-grade upgrade standardizes series storage keys to normalized lowercase slugs with explicit display `title` and `site` metadata via an automatic, idempotent Last-Write-Wins (LWW) schema migration routine, eliminates popup DOM reflows and per-card listener overhead by batching cards with `DocumentFragment` + `replaceChildren()` and container-level event delegation, aligns dashboard UI controls (`Kunmanga` filter radio, `#search-btn` click wiring, `"Recently Read"` vs `"A–Z"` sort toggle, empty-vault vs empty-search messaging), removes dead cover-preview markup/CSS/listeners, and verifies all behaviors with zero-dependency `node --test` unit tests.

## Acceptance Criteria
1. **Normalized Series Key Format:** All series entries stored in `chrome.storage.local` (under `<must match codebase convention — see context.md "Patterns to Follow">`) and in the remote Google Drive vault (`remoteVault.series`) are keyed by normalized lowercase slug computed as `name.toLowerCase().trim()`.
2. **Reserved Key & Empty Slug Protection (BUG-006):** Normalization rejects empty or whitespace-only names (`!name || !name.trim()`) and checks the normalized slug against `isValidMangaName()`, rejecting `"__proto__"`, `"constructor"`, and `"prototype"`. All lookups, reads, and writes on local and remote series maps must be guarded with `Object.hasOwn()` (or built on `Object.create(null)` prior to serialization).
3. **Series Record Schema:** Each series entry conforms to `{ chapter, url, title, site, updated }`, preserving original trimmed display `title` casing and `site` (`<must match codebase convention — see context.md "Patterns to Follow">`) alongside `chapter`, `url`, and `updated` ISO timestamp.
4. **Mutation Handler Key Normalization:** `SYNC_CHAPTER` and `DELETE_SERIES` handlers in `background.js` (and any corresponding popup mutation triggers) normalize incoming series names via `name.toLowerCase().trim()` before reading, updating, or deleting entries in `chrome.storage.local` and `remoteVault.series`, while storing `title` and `site` on writes.
5. **Automatic Idempotent Schema Migration:** An automatic, idempotent migration pass runs on startup/load and during `reconcileAndSync()` in `background.js` (covering both local series storage and fetched `remoteVault.series`) to scan legacy keys, normalize them to `name.toLowerCase().trim()`, populate missing `title` (defaulting to trimmed legacy key) and missing `site` (`<must match codebase convention — see context.md "Patterns to Follow">`), and skip invalid/reserved keys without throwing.
6. **LWW Duplicate Resolution:** When multiple legacy keys normalize to the same lowercase slug, they are merged into one entry using Last-Write-Wins (LWW) based on `updated` ISO timestamps:
   - Parsed valid timestamps (`!Number.isNaN(Date.parse(updated))`) always beat missing or invalid timestamps.
   - When comparing two valid timestamps, the more recent timestamp wins.
   - On equal or unparseable timestamps, resolution is deterministic and does not drop non-empty `title`/`site` metadata when available (`<must match codebase convention — see context.md "Patterns to Follow">`).
7. **Idempotency & No-Op Write Avoidance:** Re-running the migration routine on an already-normalized series map returns an identical map and avoids redundant `chrome.storage.local` writes or Google Drive `PATCH` uploads when no keys or fields changed.
8. **Migration Safety Guards (BUG-001, BUG-004, BUG-008):**
   - Remote Drive migration/reconciliation never falls back to `{ series: {} }` on non-empty malformed JSON or non-plain-object/array payloads; it aborts and calls `setErrorBadge()` (BUG-001).
   - Sync failures during Drive migration/reconciliation return structured `{ status, error }` results rather than throwing unhandled rejections that bypass `pending_sync` queuing (BUG-004).
   - Any `pending_sync` mutations queued before or concurrently with migration/reconciliation preserve `snapshotCount` / `currentPending.slice(snapshotCount)` draining semantics (BUG-008) and normalize target keys cleanly.
9. **Popup Non-Blocking Load & Pre-Migration Compatibility (BUG-005):** On popup open, `popup.js` renders immediately from `chrome.storage.local` (preserving silent vs `{ interactive: true }` `SYNC_VAULT` behavior) and handles unmigrated local cache entries cleanly without UI crashes or duplicate cards before background migration finishes.
10. **Native DocumentFragment DOM Batching (`popup.js`):** `renderList()` builds all series cards into a native `DocumentFragment` and mounts them in a single DOM operation via `listElement.replaceChildren(fragment)` without appending cards individually to `#list` inside the render loop.
11. **Container-Level Event Delegation (`popup.js`):** `renderList()` attaches zero per-card event listeners (no `deleteBtn.addEventListener` or per-card click listeners). A single delegated listener is bound once on `#list` to handle card actions:
    - Clicking a delete button matched via `e.target.closest('.btn-delete')` resolves the target series key (`<must match codebase convention — see context.md "Patterns to Follow">`) and triggers the delete flow (`DELETE_SERIES`).
    - Link navigation (`<must match codebase convention — see context.md "Patterns to Follow">`) uses container-level delegation if JS-driven, or sanitized anchor elements if native `<a>` navigation.
12. **URL Sanitization & XSS-Safe Rendering:** Every navigation URL rendered or opened from a card is validated via the existing `isSafeUrl` helper; unsafe URLs (e.g., `javascript:`, `data:`, malformed URLs) are blocked/neutralized. All untrusted scraped strings (`title`, `chapter`, `site`) are inserted via safe text APIs (`textContent`), never raw `innerHTML`.
13. **Kunmanga Radio Filter (`popup.html`, `popup.js`):** `#filter-container` in `popup.html` includes `<label><input type="radio" value="kunmanga" name="filter" />Kunmanga</label>`. Selecting `"kunmanga"` filters displayed series to Kunmanga entries (`<must match codebase convention — see context.md "Patterns to Follow">`).
14. **Popup Viewport & Flex-Wrap Integrity (BUG-003):** Adding the Kunmanga filter radio and `#header` sort toggle preserves `* { box-sizing: border-box; }`, `body { width: 380px; overflow-x: hidden; }`, and `flex-wrap: wrap` on `#filter-container` so no horizontal scrollbar or left/right content clipping occurs.
15. **Search Button Wiring (`popup.js`):** Clicking `#search-btn` triggers `applyFilters()` (while preserving `<must match codebase convention — see context.md "Patterns to Follow">` live search / radio change triggers).
16. **Empty Vault vs Empty Filter State:**
    - When the vault has 0 total series, `#list` displays `"Vault is empty. Start reading!"` regardless of search input or selected site filter.
    - When the vault has >= 1 series and active search text and/or site filter matches 0 series, `#list` displays `"No matching series found."`.
    - Deleting the last remaining series from the vault transitions `#list` to `"Vault is empty. Start reading!"`.
17. **Sort Toggle in `#header` ("Recently Read" vs "A–Z"):**
    - `#header` in `popup.html` contains a sort toggle control (`<must match codebase convention — see context.md "Patterns to Follow">`) supporting `"Recently Read"` (default) and `"A–Z"`.
    - `"Recently Read"` orders entries descending by `updated` ISO timestamp (`String(b[1]?.updated || "").localeCompare(String(a[1]?.updated || ""))`).
    - `"A–Z"` orders entries ascending alphabetically by display `title` (case-insensitive, falling back to series key if `title` is missing).
    - Switching sort mode immediately re-renders the list while preserving active search text and site filter state.
18. **Dead Cover Preview Removal (`popup.html`, `popup.js`):**
    - `#manga-preview` and `#preview-img` markup and `.no-cover` CSS styles (plus any unused preview CSS rules) are completely removed from `popup.html`.
    - All `mouseenter`, `mousemove`, and `mouseleave` hover listeners and preview image logic are completely removed from `popup.js`.
19. **MV3 Classic Script Exports & Guards (LESSON-001):** `popup.js` (alongside `background.js` and `content.js`) maintains classic MV3 browser compatibility while guarding browser-only globals (`typeof window`, `typeof document`, `typeof chrome`) and auto-init (`typeof module === "undefined"`), and conditionally exporting real functions via `if (typeof module !== "undefined" && module.exports)` so tests exercise production logic directly rather than `simulate*` helpers.
20. **Zero-Dependency Automated Tests:** Unit tests in `test/popup.test.js` and/or `test/background.test.js` run under `node --test test/*.test.js` with zero external dependencies, achieve 100% pass rate across all existing (57) and new tests, and cover:
    - Slug normalization, reserved prototype key rejection, and `{ chapter, url, title, site, updated }` record shape.
    - Idempotent legacy migration and LWW conflict resolution (including edge-case timestamps).
    - `"Recently Read"` (default) vs `"A–Z"` sorting order.
    - Site filter matching (including `"kunmanga"`), `#search-btn` click triggering `applyFilters()`, and `"Vault is empty. Start reading!"` vs `"No matching series found."` states.
    - `DocumentFragment` batching via `replaceChildren()`, `#list` event delegation (`e.target.closest('.btn-delete')`), absence of per-card listeners, and `isSafeUrl` sanitization.

## Out of Scope
- Phase 4+ architecture tasks (build toolchains/bundlers, TypeScript conversion, or external npm test/lint dependencies).
- Adding new site scrapers or modifying `content.js` 15-second SPA dwell extraction logic (BUG-007) beyond any `site`/`title` payload alignment identified in `context.md`.
- Changing Google Drive API endpoints, storage file naming, or OAuth scopes from Phases 1–2.
- Implementing remote cover image fetching or restoring hover preview UI.

## Fallback Behaviors
- **Empty / Missing Local Vault:** If `chrome.storage.local` has no vault or `{}` series, `popup.js` renders `"Vault is empty. Start reading!"` cleanly without throwing.
- **Google Drive Sync / Delete Failure or Offline State (BUG-004 / BUG-005):** If `SYNC_VAULT` or `DELETE_SERIES` fails (offline, non-2xx HTTP, unauthenticated token), `popup.js` keeps locally cached series rendered and surfaces non-blocking status/error feedback (`<must match codebase convention — see context.md "Patterns to Follow">`), while `background.js` falls back to `pending_sync` and calls `setErrorBadge()`.
- **Unsafe Series URL:** If a stored series record has an unsafe or malformed `url` failing `isSafeUrl()`, card navigation is disabled/neutralized (`<must match codebase convention — see context.md "Patterns to Follow">`) rather than executing unsafe protocols or throwing.
- **Malformed Remote Drive Payload During Migration (BUG-001):** If `fetchAndValidateDriveVault()` returns non-empty invalid JSON or an invalid payload shape, migration aborts before writing/patching Drive and sets the error badge.

## Resolved Ambiguities
- **Slug Normalization Definition:** Both the handover request and inlined PBI spec explicitly define normalized lowercase slug as `name.toLowerCase().trim()` (rather than hyphenating or stripping punctuation).
- **Prototype Key Hardening on Normalized Keys (`MEMORY.md` BUG-006):** Lowercasing/trimming can produce `"__proto__"`, `"constructor"`, or `"prototype"` from padded/mixed-case strings; `isValidMangaName()` must validate the normalized slug and all series map accesses must use `Object.hasOwn()`.
- **Remote Read-Modify-Write & Queue Re-Entrancy Safety (`MEMORY.md` BUG-001, BUG-004, BUG-008):** Migration and reconciliation must never overwrite corrupted non-empty Drive responses with `{ series: {} }`, must return structured `{ status, error }` objects instead of throwing, and must drain `pending_sync` via `snapshotCount` slicing.
- **Popup Viewport & Flex-Wrapping (`MEMORY.md` BUG-003):** Adding the Kunmanga radio button and sort toggle must keep `* { box-sizing: border-box; }`, `body { width: 380px; overflow-x: hidden; }`, and `flex-wrap: wrap` on `#filter-container`.
- **Unit Testing Classic MV3 Scripts (`MEMORY.md` LESSON-001):** Export real functions from `popup.js` via guarded CommonJS (`typeof module !== "undefined" && module.exports`) with browser-global and auto-init guards; never substitute local `simulate*` helpers in unit tests.
