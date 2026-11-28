<Research — Phase 2: Local-First Storage & SPA Navigation>
## Open Questions
- None.

## Pending Reconciliation (for @task-logger via context.md)
- **Pending Reconciliation** — Confirm whether `manifest.json` already declares `"storage"` permission, whether any `chrome.storage.local` keys already exist, and confirm the exact `series` entry fields and Google Drive file/folder naming convention (`suggested resolution source: manifest.json, background.js, popup.js`).
- **Pending Reconciliation** — Confirm whether `popup.js` interacts with Google Drive directly or via `chrome.runtime.sendMessage` to `background.js`, what status/error DOM elements exist in `popup.html`, and whether `test/preview/mock-chrome.js` already stubs `chrome.storage.local` (`suggested resolution source: popup.js, popup.html, test/preview/mock-chrome.js`).
- **Pending Reconciliation** — Confirm whether a chapter parsing helper (handling integer, `150.5`, and `12-1`) and `handleMessage` return payload conventions already exist (`suggested resolution source: background.js, popup.js, content.js`).
- **Pending Reconciliation** — Confirm existing `MutationObserver`, `checkPage`, debounce timer, and `SYNC_CHAPTER` message structure in `content.js` (`suggested resolution source: content.js, test/content.test.js`).
- **Pending Reconciliation** — Confirm existing test file layout in `test/` and whether `test/popup.test.js` exists (`suggested resolution source: test/`).
</Research — Phase 2: Local-First Storage & SPA Navigation>
