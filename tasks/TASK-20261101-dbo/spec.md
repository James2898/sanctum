<Spec — Phase 1: Critical Bug Fixes & Sync Hardening>
## Feature Summary
Implement Phase 1 critical bug fixes and sync hardening for the Sanctum extension across `background.js`, `content.js`, and `popup.js`. This phase eliminates Google Drive duplicate file creation during network or API errors by making `findFile()` return explicit status objects and restricting `createFile()` strictly to `not_found` outcomes, ensures background OAuth token requests run non-interactively without stealing focus or interrupting user workflows, fixes premature `"Chapter Reading"` fallback dispatches on single-page applications (MangaDex, MangaPlus) by requiring valid numeric chapters and retrying up to 8 times, and adds regex and parser support for decimal and fractional chapter formats on Asura.

## Acceptance Criteria
1. **Drive File Lookup Result Handling (`background.js`)**: Refactor `findFile(token)` to return a structured status object:
   - `{ status: "found", fileId: <id> }` when the Google Drive API responds successfully (`res.ok`) and at least one matching file exists in `files`.
   - `{ status: "not_found" }` when the Google Drive API responds successfully (`res.ok`) and `files` is empty.
   - `{ status: "error", error: <error details> }` when the fetch fails, `res.ok` is false (e.g. HTTP 500, 403, 404, or network offline), or JSON parsing fails.
2. **Strict File Creation Guard (`background.js`)**: In the sync flow / worker, `createFile()` must only be invoked when `findFile()` returns `{ status: "not_found" }`. Under no circumstances should `createFile()` be invoked if `findFile()` returns `{ status: "error", ... }` or `{ status: "found", ... }`.
3. **Drive Sync Error Handling & Badge (`background.js`)**: When `findFile()` or sync operations encounter a network, HTTP, or status error, the sync operation must abort immediately, log the error, and set the extension action badge text to `"!"` with background color `#c0392b`.
4. **Quiet Background Authentication (`background.js`)**: Background token retrieval via `chrome.identity.getAuthToken` must pass `{ interactive: false }`. Background sync attempts must never trigger an interactive login prompt or steal user focus.
5. **Background Auth Failure Indication (`background.js`)**: When background token retrieval fails (e.g., expired token, user not signed in, or `chrome.runtime.lastError`), the background script must suppress interactive prompts and set the extension action badge to `"!"` with red background color `#c0392b`.
6. **Interactive Vault Authentication (`popup.js`)**: Interactive authentication via `chrome.identity.getAuthToken({ interactive: true })` must be preserved in `popup.js` when the user manually opens the popup/vault to authenticate.
7. **Eliminate SPA Placeholder Fallback (`content.js`)**: In MangaDex and MangaPlus site extractors, `getChapter()` must return `null` instead of the fallback string `"Reading"`.
8. **SPA Extraction Retry Guard (`content.js`)**: In `checkPage()` or chapter detection lifecycle, if either `mangaTitle` or `chapterNumber` is falsy or null, retry extraction if retry count is less than 8 (`retries < 8`). If retries reach 8 without obtaining both a valid title and chapter, stop extraction without dispatching a sync message.
9. **Strict Dispatch Guard (`content.js`)**: The debounce and background message dispatch must only initiate when both a non-empty `mangaTitle` and a valid numeric/chapter identifier exist. Payload with chapter value `"Reading"` or `"Chapter Reading"` must never be dispatched to the background script.
10. **Decimal & Fractional Chapter Parsing for Asura (`content.js`)**: Update the Asura chapter URL regex from `/(?:comics|series)\/([^\/]+)\/chapter\/(\d+)/` to `/(?:comics|series)\/([^\/]+)\/chapter\/([\d\.\-]+)/`.
11. **Chapter String Preservation (`content.js`)**: Parse and preserve decimal points and fractional chapter strings (e.g. `150.5` and `12-1`) so they are properly formatted and transferred to the sync payload without truncation or corruption.

## Out of Scope
- Phase 2 features (multi-device conflict resolution, vector clocks, settings UI, popup enhancements).
- UI redesign or vault styling changes outside of action badge error indicators.
- Adding new manga site parsers beyond MangaDex, MangaPlus, and Asura.
- Automated token auto-refresh mechanisms beyond standard `chrome.identity.getAuthToken` quiet background polling.

## Fallback Behaviors
- **Missing / Expired Auth Token in Background**: Action badge is set to `"!"` (`#c0392b`). Background sync is halted silently without popup alert. User sees visual badge and can click extension popup to trigger interactive auth.
- **Drive API 5xx / Network Offline**: File creation is suppressed. Sync halts cleanly. Action badge is set to `"!"` (`#c0392b`). Existing local storage/history remains untouched and uncorrupted.
- **Unparsed or Missing Chapter on SPA**: If title or chapter cannot be resolved within 8 retries, extraction stops silently without emitting an invalid or dummy reading history event.

## Resolved Ambiguities
- Error badge color & icon -> Set to `"!"` with background color `#c0392b` across both auth failures and drive sync errors (source: Phase 1.1 and 1.2 spec actions).
- Extractor return on MangaDex/MangaPlus -> Return `null` instead of `"Reading"` (source: Phase 1.3 spec action).
- Asura chapter matching pattern -> Support decimals and hyphens via `/(?:comics|series)\/([^\/]+)\/chapter\/([\d\.\-]+)/` (source: Phase 1.4 spec action).
