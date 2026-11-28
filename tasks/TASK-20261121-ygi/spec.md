# Spec — Phase 1: Concurrency, Idempotency & Non-Intrusive Auth Guardrails

## Feature Summary
Harden the extension's Google Drive synchronization, background OAuth handling, and chapter extraction pipelines across `background.js` and `content.js`. On the backend/service-worker side, `findFile(token)` returns an explicit 3-state status so `createFile()` runs only when a file genuinely does not exist, network/API errors abort writes with a non-intrusive `"!"` (`#c0392b`) action badge, and background authentication is restricted to `{ interactive: false }` so interactive sign-in prompts never interrupt active reader tabs. On the content-script side, MangaDex and MangaPlus return `null` instead of falling back to `"Reading"` while DOM metadata is unmounted, sync debounce waits up to 8 retries until both valid title and non-null chapter exist, and Asura Scans chapter extraction supports decimal and fractional chapter formats (e.g., `150.5`, `12-1`), backed by unit tests for Drive search status logic and chapter extraction.

## Acceptance Criteria
1. **3-State `findFile(token)` Return Contract (`background.js`)**:
   - When the Drive file search request succeeds (`response.ok === true`) and returns one or more matching file records (`files.length >= 1`) with a valid `id`, `findFile(token)` returns `{ status: "found", fileId }` using a deterministic selection rule consistent with the query ordering (`<must match codebase convention — see context.md "Patterns to Follow">`).
   - When the Drive file search request succeeds (`response.ok === true`) and returns zero matching records (`files.length === 0`), `findFile(token)` returns `{ status: "not_found" }`.
   - When `findFile(token)` is called with a missing/falsy `token`, encounters any non-OK HTTP status (e.g., `401`, `403`, `429`, `5xx`), receives a Drive error payload or malformed JSON/unexpected schema (e.g., missing `files` array or missing `id`), or throws a network/fetch exception, `findFile(token)` returns `{ status: "error", error }` — never `null`, `undefined`, or `{ status: "not_found" }`.
2. **Strict `createFile()` Guard (`background.js`)**:
   - All callers in `background.js` invoke `createFile()` **only** when `findFile()` returns `status === "not_found"`.
   - When `findFile()` returns `status === "found"` or `status === "error"`, `createFile()` MUST NOT be called.
3. **Concurrent File Lookup / Creation Idempotency (`background.js`)**:
   - Concurrent background sync or file-lookup calls in `background.js` must not race to invoke `createFile()` multiple times when no remote file exists yet (`<reconcile whether an explicit in-flight mutex/lock is part of Phase 1 per full PBI doc — see context.md>`).
4. **Error Abort & Error Badge Display (`background.js`)**:
   - Whenever `findFile()` returns `{ status: "error", error }`, or `createFile()` or any Drive network operation returns an HTTP error or throws, `background.js` aborts file creation and the pending remote write without overwriting local cached data or storing an invalid `fileId`.
   - On any such failure, `background.js` sets the extension action badge text to `"!"` and sets the badge background color to `#c0392b`.
   - When a subsequent Drive sync/auth operation succeeds, the `"!"` error badge state is cleared or updated to `<must match codebase convention — see context.md "Patterns to Follow">`.
5. **Silent Background OAuth Token Acquisition (`background.js`)**:
   - Every background token acquisition via `chrome.identity.getAuthToken` in `background.js` (including background syncs, content-script triggered syncs, startup/alarm handlers, and any cached-token refresh retry after a `401`) MUST pass `{ interactive: false }`.
   - When silent auth fails (`chrome.runtime.lastError`, rejected promise, thrown error, or falsy/empty token), `background.js` aborts Drive operations without calling `createFile()`, sets the action badge text to `"!"` and badge background color to `#c0392b`, and does not open an interactive sign-in modal over the active reader tab.
6. **User-Initiated Interactive Auth Boundary (`popup.js` / `background.js`)**:
   - Interactive authentication (`chrome.identity.getAuthToken({ interactive: true })`) is restricted strictly to user-initiated click handlers (e.g., in `popup.js`, or if delegated via runtime messaging, strictly from an explicit user-click message `<must match codebase convention — see context.md "Patterns to Follow">`).
   - Background/content-triggered flows can never escalate to `{ interactive: true }`.
7. **MangaDex & MangaPlus Null Metadata Return (`content.js`)**:
   - On MangaDex and MangaPlus, `getChapter()` returns `null` — never `"Reading"` or `"Chapter Reading"` — when the DOM manga title element or chapter metadata element is not yet mounted, is empty/whitespace-only, or holds an unhydrated placeholder (`<must match codebase convention — see context.md "Patterns to Follow">`).
   - Numeric/string chapter `"0"` / `0` (when legitimately extracted) MUST be treated as valid and non-null rather than failing a truthy check.
8. **8-Retry Readiness Gate & Sync Debounce (`content.js`)**:
   - `content.js` checks that **both** a valid non-empty title AND a valid non-null chapter are present before initiating sync debounce.
   - If either title or chapter is missing/null, `content.js` retries up to 8 retries (`<confirm retry interval and exact retry-vs-attempt count against existing content.js logic — see context.md>`) until both are present and non-null.
   - If all 8 retries are exhausted and either title or chapter remains missing/null (e.g., non-reader page or unmounted DOM), `content.js` stops retrying cleanly and MUST NOT initiate sync debounce or send a sync request to `background.js`.
9. **SPA Route-Change Timer Cancellation (`content.js`)**:
   - If the active URL/route changes on an SPA reader (such as MangaDex or MangaPlus) while retries or sync debounce are pending, pending retry/debounce timers from the prior route are cancelled or invalidated so stale metadata cannot trigger a sync for the wrong chapter or on a non-reader route.
10. **Asura Scans Decimal & Fractional Chapter Regex (`content.js`)**:
    - The Asura Scans chapter extraction regex in `content.js` matches integer chapters (e.g., `150`), decimal chapters (e.g., `150.5`), and hyphen-separated fractional chapters (e.g., `12-1`, `150-5`) across the configured URL/DOM extraction target(s) (`<reconcile URL vs DOM source and literal "12-1" vs "12.1" normalization — see context.md>`).
    - Malformed trailing separators (e.g., `150.` or `12-` without following digits) do not capture stray `.` or `-` characters, and numbers within series ID/title slugs do not produce false-positive matches.
    - When no valid chapter pattern is present on Asura Scans, `getChapter()` returns `null`; existing chapter extraction behavior for other supported sites remains intact.
11. **Automated Unit Tests**:
    - Unit tests run via `<must match codebase convention — see context.md "Patterns to Follow">` verify:
      - `findFile(token)` returning `found`, `not_found`, and `error` (across HTTP errors, thrown exceptions, malformed responses, and multi-result handling) and verifying `createFile()` is called only on `not_found` while errors trigger badge `"!"` / `#c0392b` and abort creation.
      - Silent background `getAuthToken({ interactive: false })` failure behavior (badge `"!"` set, no `{ interactive: true }` call).
      - `content.js` MangaDex/MangaPlus `null` return on unmounted DOM (never `"Reading"`), 8-retry gating (debounce starts only when both title and chapter are non-null, aborted after 8 failed retries), and Asura Scans regex matching `150`, `150.5`, `12-1`, plus negative/slug cases.

## Out of Scope
- Phase 2+ architectural features from `pbi-docs/PBI-SANCTUM-ARCH-industry-grade-architecture.md` (e.g., persistent offline sync queues, schema migration/versioning, multi-device conflict resolution UI, telemetry/logging backends).
- Refactoring site extractors beyond the targeted MangaDex/MangaPlus `"Reading"` fallback + 8-retry sync gate and Asura Scans chapter regex (unless shared retry orchestration in `content.js` governs all sites uniformly).
- Redesigning `popup.js` UI/UX beyond preserving interactive auth solely on user-initiated clicks.
- Adding new third-party npm packages or build tooling without explicit user approval.

## Fallback Behaviors
- **Silent Background Auth Failure (`background.js`)**: Because background sync runs without interrupting reader tabs, if `chrome.identity.getAuthToken({ interactive: false })` fails, no modal/prompt is shown on the tab; Drive operations abort cleanly, local data is preserved, and the extension action badge displays `"!"` with background `#c0392b` until a user-initiated action (e.g., clicking in `popup.js`) re-authenticates.
- **Drive API / Network Failure (`background.js`)**: If `findFile()`, `createFile()`, or any Drive sync request fails (HTTP error or thrown exception), file creation and remote writes abort cleanly, local state is preserved, and the extension action badge displays `"!"` with background `#c0392b`.
- **Unmounted / Missing Reader Metadata (`content.js`)**: If MangaDex, MangaPlus, or Asura DOM title or chapter metadata remains missing/`null` after 8 retries, sync debounce is skipped cleanly with no partial `"Chapter Reading"` entry written locally or remotely.
- **Popup Error Handling (`popup.js`)**: Any user-initiated auth/sync failure surfaced in the popup retains `<must match codebase convention — see context.md "Patterns to Follow">` non-blocking user feedback rather than silently failing or discarding local state.

## Resolved Ambiguities
- **`findFile()` failure vs missing file distinction** → Resolved from Phase 1 AC 1–2: `findFile(token)` uses a 3-state discriminated object (`found` | `not_found` | `error`), and `createFile()` is strictly gated on `status === "not_found"`.
- **Interactive auth prompt interruption** → Resolved from Phase 1 AC 3–4: all background token acquisitions in `background.js` use `{ interactive: false }` and report failure via the `"!"` badge; `{ interactive: true }` is restricted to user-initiated click handlers.
- **Premature `"Chapter Reading"` sync on SPAs** → Resolved from Phase 1 AC 5–6: `getChapter()` returns `null` when DOM title or chapter metadata is unmounted on MangaDex/MangaPlus, and `content.js` waits up to 8 retries before initiating sync debounce only when both valid title and non-null chapter exist.
- **Decimal/fractional Asura Scans chapters** → Resolved from Phase 1 AC 7: Asura Scans regex in `content.js` supports decimal (`150.5`) and fractional (`12-1`) formats.
- **Codebase-specific literals (message types, selectors, badge reset values, test runner)** → Deferred via code-string placeholders to `@task-logger` reconciliation with `@codebase-explorer`'s `context.md`.

## Open Questions
- **Pending Reconciliation** — Does the full Phase 1 specification in `pbi-docs/PBI-SANCTUM-ARCH-industry-grade-architecture.md` mandate an explicit in-flight mutex/lock/queue in `background.js` for concurrent `findFile`/`createFile`/sync operations (as suggested by the Phase 1 title "Concurrency, Idempotency & Non-Intrusive Auth Guardrails"), and does `background.js` currently have any concurrency guard? (suggested resolution source: `pbi-docs/PBI-SANCTUM-ARCH-industry-grade-architecture.md` Phase 1 section & `background.js`)
- **Pending Reconciliation** — Which callers in `background.js` invoke `findFile()` and `createFile()`, what is the expected type/shape of `error` in `{ status: "error", error }`, and what Drive query/ordering does `findFile()` use when multiple matching files exist? (suggested resolution source: `background.js` — `findFile`, `createFile`, and sync helpers)
- **Pending Reconciliation** — How does `background.js` / `popup.js` currently set, clear, or restore `chrome.action` badge text/color on successful operations, and is there a sync-enabled user preference checked before attempting background auth? (suggested resolution source: `background.js` and `popup.js`)
- **Pending Reconciliation** — Does `popup.js` call `chrome.identity.getAuthToken({ interactive: true })` directly on user click, or does it send a runtime message to `background.js` (and if so, what is the exact message action name)? (suggested resolution source: `popup.js` and `background.js` `onMessage` listener)
- **Pending Reconciliation** — What is the exact signature and return structure of `getChapter()` in `content.js`, what DOM selectors/placeholder checks are used for MangaDex and MangaPlus title and chapter extraction, and how are the existing retry interval, attempt vs retry counter, and SPA URL-change handlers implemented? (suggested resolution source: `content.js` — `getChapter`, MangaDex/MangaPlus extractors, retry/debounce logic)
- **Pending Reconciliation** — Does the Asura Scans chapter extractor in `content.js` parse the URL path, DOM heading text, or both, and should hyphenated formats like `"12-1"` be returned literally as `"12-1"` or normalized to `"12.1"`? (suggested resolution source: `pbi-docs/PBI-SANCTUM-ARCH-industry-grade-architecture.md` Phase 1 details & `content.js` Asura extractor / downstream consumers)
- **Pending Reconciliation** — What test runner (`package.json`, `node --test`, etc.) and script module structure (`manifest.json`, CommonJS/ESM exports vs Chrome globals in `background.js` and `content.js`) exist in the repository for running unit tests? (suggested resolution source: `package.json`, `manifest.json`, `tests/` if present, and module boundaries of `background.js` / `content.js`)
