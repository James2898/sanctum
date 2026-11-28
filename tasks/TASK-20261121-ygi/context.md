<Context Bundle — Phase 1: Concurrency, Idempotency & Non-Intrusive Auth Guardrails>
## Relevant Files
| File | Why It's Relevant |
|------|------------------|
| `background.js` | Service worker Sync Engine handling `SYNC_CHAPTER` and `DELETE_SERIES`, `enqueueOperation` queue, `chrome.identity.getAuthToken`, `findFile`, `createFile`, and `chrome.action` badge updates |
| `content.js` | Content script holding `asuraConfig`, `SITE_CONFIGS` (MangaDex, MangaPlus, MangaHere, Kunmanga, Asura), `checkPage` retry loop, and `SYNC_CHAPTER` debounce dispatch |
| `manifest.json` | MV3 manifest defining classic `"service_worker": "background.js"`, `"content_scripts"` (`"content.js"`), `"identity"`/`"storage"` permissions, and matched host domains |
| `popup.js` | User-triggered dashboard (`loadVault` with `getAuthToken({ interactive: true })` on popup open/refresh) and `DELETE_SERIES` message sender expecting `{ status: "success" \| "error" }` |
| `pbi-docs/PBI-SANCTUM-ARCH-industry-grade-architecture.md` | Authoritative PBI specification defining Phase 1 Acceptance Criteria (L50-57), Phase 1 scope (L152-159), and Phases 2-4 boundaries |
| `docs/IMPLEMENTATION_PLAN.md` | Prioritized architecture plan (`Phase 1` L20-53) and Grill Design Decisions D1-D6 (L7-16, including `node:test` zero-dependency tooling in D6) |
| `docs/PROJECT_IMPROVEMENT_SUGGESTIONS.md` | Detailed root-cause audit for Phase 1 bugs 1.1-1.4 (L9-34) |

## Reuse Candidates
- `background.js` lines 3-9 (`syncQueue` / `enqueueOperation(operation)`) — Existing sequential promise chain that serializes Drive API operations across overlapping `SYNC_CHAPTER` and `DELETE_SERIES` messages; reuse directly for all Drive reads/creates/patches in Phase 1.
- `background.js` lines 37-47 (`JSON.parse` `try/catch` guard in `SYNC_CHAPTER`) — Safe parsing pattern for Drive JSON payloads; reuse or share if `DELETE_SERIES` (line 114) reads malformed content.
- `background.js` lines 79-85 (`chrome.action.setBadgeText` / `chrome.action.setBadgeBackgroundColor`) — Existing action badge status pattern (`"..."` in-flight, `"OK"` / `#27ae60` on success with 3s clear, `#c0392b` on error); align error badge text from `"ERR"` to `"!"` and extract or reuse consistently across auth and Drive error paths.
- `content.js` lines 1-7 (`asuraConfig`) — Shared site config object already reused by both `"asurascans.com"` (line 10) and `"asuracomic.net"` (line 11); updating `asuraConfig.regex` updates both domains in one place.
- `content.js` lines 20-23 & 36-42 (`getTitle` null-return pattern) — MangaDex and MangaPlus `getTitle()` already return `null` when the DOM header element is missing; mirror this exact pattern in `getChapter()` instead of `"Reading"`.
- `content.js` lines 88-93 (`checkPage(retries = 0)` with `retries < 8` and `1000ms` backoff) — Existing bounded SPA DOM-polling loop; extend the condition to wait for both valid title and chapter number rather than building a second timer mechanism.
- Node v22 built-in `node:test` and `node:assert` (per D6 in `docs/IMPLEMENTATION_PLAN.md`) — Standard platform test runner requiring zero npm dependencies for Phase 1 unit tests.

## Patterns to Follow
- Classic MV3 Script Compatibility: `manifest.json` declares `"background": { "service_worker": "background.js" }` (lines 21-23, no `"type": "module"`) and `"content_scripts"` injecting `"content.js"` (lines 24-37). Keep runtime code in vanilla ES2022+ without build steps or bare top-level ESM `import`/`export` statements that break classic MV3 execution. If exporting pure functions for `node:test`, guard browser top-level initialization (`typeof chrome !== "undefined"`, `typeof window !== "undefined"`) and use conditional CommonJS export (`if (typeof module !== "undefined" && module.exports)`).
- Structured Status Result Objects: Mirror `background.js` lines 132 & 135 (`{ status: "success" }` / `{ status: "error" }`) when refactoring `findFile(token)` to return `{ status: "found", fileId }`, `{ status: "not_found" }`, or `{ status: "error", error }`.
- Promise-based Chrome Extension APIs: `background.js` lines 16 & 94 and `popup.js` line 203 use the `await chrome.identity.getAuthToken(...)` Promise form rather than legacy callbacks. Note that `{ interactive: false }` may either throw/reject or return `{ token: undefined }` when silent auth fails, so handle both `try/catch` and `!tokenObj?.token`.
- Declarative `SITE_CONFIGS` Table: `content.js` lines 9-66 maps domain strings to `{ regex, titleIndex?, chapterIndex?, getTitle, getChapter? }`. Keep site extractors declarative inside `SITE_CONFIGS` and keep shared regex logic in `asuraConfig`.

## Anti-Patterns Flagged
- `background.js` lines 16-18 and lines 94-96: Both `SYNC_CHAPTER` and `DELETE_SERIES` call `chrome.identity.getAuthToken({ interactive: true })` inside the background service worker, risking intrusive OAuth modal popups over active reading tabs (also check `DELETE_SERIES` caller handling when updating auth and `findFile`).
- `background.js` lines 22-23 and lines 142-152: `findFile(token)` returns `null` on `!res.ok` (line 149) and does not catch `fetch()` / `res.json()` exceptions, while `SYNC_CHAPTER` calls `createFile(token)` on any falsy `fileId` (`if (!fileId)`), causing duplicate `sanctum_history.json` files on HTTP/network errors.
- `background.js` lines 100-102 (`DELETE_SERIES`): Calls `const fileId = await findFile(token); if (fileId)` assuming a string or `null`. Once `findFile` returns a 3-state object, leaving `if (fileId)` unchanged will treat `{ status: "not_found" }` or `{ status: "error", error }` as truthy and fetch `/files/[object Object]`.
- `background.js` line 15 & lines 84-85: `SYNC_CHAPTER` sets badge text `"..."` without resetting badge background color (stale green/red may show), and catch block sets `"ERR"` instead of `"!"`. Also `SYNC_CHAPTER` returns `true` on line 88 even though it never calls `sendResponse`.
- `content.js` lines 24-31 (`mangadex.org`) and lines 43-54 (`mangaplus.shueisha.co.jp`): `getChapter()` returns `"Reading"` when DOM elements are unmounted or regex doesn't match, causing truthy checks to sync `"Chapter Reading"`. Note also `kunmanga.com` line 63 has a `"Reading"` fallback when URL segment `match[2]` lacks digits (out of stated Phase 1 MangaDex/MangaPlus scope — clarify whether to preserve or change).
- `content.js` lines 50-51 (`mangaplus.shueisha.co.jp`): `parseInt(match[0], 10)` returns numeric `0` for chapter `0` and drops decimals if MangaPlus uses them; combined with line 95 (`if (mangaTitle && chapterNumber)`), numeric `0` evaluates falsy and silently skips syncing.
- `content.js` lines 89-93: `checkPage` retry condition `if (!mangaTitle && retries < 8)` ignores missing `chapterNumber` and exits without retrying if title mounts before chapter metadata.
- `content.js` line 2: `asuraConfig` regex `/chapter\/(\d+)/` truncates or misses decimal/fractional chapters like `150.5` and `12-1`.
- `content.js` lines 68-75 & `background.js` line 11: Unconditional top-level access to `window`, `document`, and `chrome` prevents direct import in `node:test` unless guarded or loaded via a mock context.

## MEMORY.md Notes
- N/A (`MEMORY.md` does not exist in workspace; listed in `.gitignore`).
