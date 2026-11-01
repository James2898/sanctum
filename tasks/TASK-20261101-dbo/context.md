<Context Bundle — Phase 1: Critical Bug Fixes & Sync Hardening>
## Relevant Files
| File | Why It's Relevant |
|------|------------------|
| `background.js` | Background service worker; handles Drive API sync queue, token acquisition (`getAuthToken`), `findFile`/`createFile`, and badge status indicators (`OK`, `ERR`, `!`). |
| `content.js` | Content script injected into manga sites; defines `asuraConfig` regex, MangaDex/MangaPlus chapter extractors, SPA retry logic in `checkPage()`, and dispatches `SYNC_CHAPTER`. |
| `popup.js` | Extension popup dashboard; performs interactive OAuth token retrieval (`interactive: true`) and Drive queries; triggers `DELETE_SERIES` which also calls `findFile`. |
| `manifest.json` | Extension Manifest V3 configuration; declares `identity` and `storage` permissions, service worker, content scripts, and host permissions for Google APIs and manga sites. |

## Reuse Candidates
- `background.js` lines 80 & 85: Action badge color constants (`#27ae60` for OK green, `#c0392b` for ERR red) — reuse `#c0392b` for background auth failure badge (`"!"`).
- `background.js` lines 154-167: `createFile(token)` — existing Drive file creation routine; reuse strictly when `findFile` reports `{ status: "not_found" }`.
- `background.js` lines 5-9: `enqueueOperation(operation)` — existing Promise queue ensuring serialized execution of sync and delete operations.
- `content.js` lines 9-66: `SITE_CONFIGS` — existing declarative mapping for host-specific parsing; reuse and modify `asuraConfig.regex` and MangaDex/MangaPlus `getChapter()` callbacks.
- `content.js` lines 76-93: `checkPage(retries = 0)` — retry loop pattern; reuse and extend guard to check both `!mangaTitle` and `!chapterNumber`.
- Platform APIs / Web Standards: Native `RegExp` matching (`/[\d\.\-]+/`), `chrome.action.setBadgeText`, `chrome.action.setBadgeBackgroundColor`, and non-interactive `chrome.identity.getAuthToken({ interactive: false })`.

## Patterns to Follow
- Tri-state Status Return Pattern: Refactor `findFile(token)` in `background.js` to return `{ status: "found", fileId }`, `{ status: "not_found" }`, or `{ status: "error", error }` based on `res.ok` and `files.length`, preventing network or HTTP errors from being misinterpreted as missing files.
- Quiet Background Execution: In MV3 background service workers, always request OAuth tokens non-interactively (`chrome.identity.getAuthToken({ interactive: false })`), setting visual badge cues (`"!"`, `#c0392b`) rather than interrupting the user with focus-stealing interactive prompts.
- Interactive Auth in User Surfaces: Keep `{ interactive: true }` in `popup.js` (line 203) where user presence is guaranteed upon opening the popup.
- Strict DOM Hydration Retries: In `content.js`, return `null` instead of dummy fallback strings (`"Reading"`) from `getChapter()`, and gate debounce initiation on both valid title and numeric chapter, retrying up to 8 times for SPA element hydration.
- Non-Destructive Chapter String Preservation: Keep raw chapter strings (such as `"150.5"` or `"12-1"`) rather than coercing via `parseInt`/`parseFloat`, preserving decimals and multipart chapter numbering.

## Anti-Patterns Flagged
- `background.js` lines 149-151: `findFile(token)` returns `null` on `!res.ok` (e.g. 500 error or network disconnect). Combined with lines 22-23 (`if (!fileId) fileId = await createFile(token);`), this causes duplicate `sanctum_history.json` files to be created on Google Drive whenever a network or server error occurs.
- `background.js` line 16: `chrome.identity.getAuthToken({ interactive: true })` inside a background sync handler interrupts the user while reading with unexpected modal dialogs.
- `background.js` lines 100-102: In `DELETE_SERIES`, `const fileId = await findFile(token); if (fileId)` assumes `findFile` returns a string or null; updating `findFile` to return an object will break this check if not updated in tandem.
- `content.js` lines 28, 30, 51, 53: Returning fallback string `"Reading"` when chapter elements are unmounted causes premature sync of invalid chapter data before SPAs finish loading.
- `content.js` lines 89-93: Guard `if (!mangaTitle && retries < 8)` only retried on missing title, ignoring whether `chapterNumber` was missing or returned `"Reading"`.
- `content.js` line 64: `kunmanga.com` also returns `"Reading"` on fallback; should be kept in mind for consistency to avoid repeating the SPA premature fallback pattern.
- `popup.js` lines 209-214: Duplicates Google Drive file search fetch inline with hardcoded filename string `"sanctum_history.json"`.

## MEMORY.md Notes
- N/A (MEMORY.md not present in workspace or root repository; verified gitignored).
