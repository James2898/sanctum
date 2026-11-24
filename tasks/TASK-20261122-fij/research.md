# Research — Sanctum Phase 3: Schema Migration, UI Polish & DOM Batching

## Open Questions

### Blocking
- None.

### Pending Reconciliation
- **Pending Reconciliation** — What is the exact `chrome.storage.local` key name storing the cached series/vault object, and is there an existing schema version or migration flag key? (suggested resolution source: `context.md` "Patterns to Follow" / `background.js`, `popup.js`)
- **Pending Reconciliation** — What exact string convention does `site` use (e.g., filter value `"kunmanga"` vs hostname `"kunmanga.com"` vs display label), does `content.js` already emit `site`/`title` in `SYNC_CHAPTER` payloads or does `background.js` derive `site` from `url`, and how does `popup.js` currently filter series by radio value? (suggested resolution source: `context.md` / `content.js`, `background.js`, `popup.js`, `popup.html`)
- **Pending Reconciliation** — How are card link navigation and delete actions currently wired in `popup.js` (native `<a href>` vs `chrome.tabs.create`, direct `DELETE_SERIES` vs `confirm()` dialog, exact `data-*` attribute and message payload shape)? (suggested resolution source: `context.md` / `popup.js`)
- **Pending Reconciliation** — What existing element IDs, CSS styles, and listeners exist inside `#header`, `#search-input`, `#search-btn`, and `#filter-container` in `popup.html` and `popup.js` (to align naming/styling for the sort toggle and preserve existing search/filter listeners)? (suggested resolution source: `context.md` / `popup.html`, `popup.js`)
- **Pending Reconciliation** — Do `background.js` and `popup.js` share any helper `<script>` in `popup.html`, or must normalization/migration helpers be self-contained or exposed appropriately across files? (suggested resolution source: `context.md` / `popup.html`, `manifest.json`, `background.js`, `popup.js`)
- **Pending Reconciliation** — Does the local dev preview harness (`test/preview/mock-chrome.js`, `test/preview/index.html`) reference `#manga-preview`, `.no-cover`, or legacy unmigrated vault shapes that need verification or update? (suggested resolution source: `context.md` / `test/preview/`)
