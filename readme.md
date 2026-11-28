# 🛡️ Sanctum: Private Manga Tracker

**Sanctum** is a zero-dependency, local-first Chrome Extension (Manifest V3) that automatically tracks your manga and manhwa reading progress across 6 reader domains. Instead of relying on third-party servers or databases, Sanctum caches your reading Vault locally in `chrome.storage.local` and synchronizes it with a single `sanctum_history.json` file stored privately in your personal **Google Drive**.

---

## ✨ Architecture & Key Capabilities

### 1. Local-First Stale-While-Revalidate (SWR) Architecture
- **Instant Popup Paint (<10ms):** Opening the Sanctum Vault renders immediately from `chrome.storage.local` (`series`, `fileId`, `lastSync`) before kicking off a non-blocking background `SYNC_VAULT` refresh against Google Drive (`sanctum_history.json`).
- **Silent Background Auth:** Background service-worker operations strictly use silent OAuth (`chrome.identity.getAuthToken({ interactive: false })`). Interactive Google OAuth prompts are triggered only on explicit foreground user gestures (`#refresh-btn`) or empty-cache first-run onboarding.

### 2. Resilience, Concurrency & Data-Integrity Guardrails
- **Serialized Sync Queue:** All background Drive reads, writes, and reconciliations run through an in-process promise queue (`enqueueOperation`) to prevent race conditions and duplicate Drive files.
- **3-State Google Drive Discovery:** `findFile()` distinguishes `"found"`, `"not_found"`, and `"error"` (`orderBy=createdTime`), restricting `createFile()` strictly to `"not_found"`.
- **Corrupted Payload Guard:** If remote Drive data fails `JSON.parse` or is not a plain object, Sanctum aborts immediately before `PATCH` and raises the `"!"` error badge — never overwriting remote history with an empty object.
- **Offline FIFO Mutation Queue (`pending_sync`):** Mutations triggered while offline (`navigator.onLine === false`) or during auth/network/API failures are queued in `chrome.storage.local`, reconciled automatically on the `online` event, and drained using re-entrancy-safe prefix slicing (`currentPending.slice(snapshotCount)`).
- **Monotonic Chapter Guard & LWW Schema Normalization:** Series keys are normalized to lowercase slugs (`name.toLowerCase().trim()`) with reserved prototype-key rejection (`__proto__`, `constructor`, `prototype`) and `Object.hasOwn()` lookups. Chapter updates enforce monotonic progression across integers (`150`), decimals (`42.5`), and hyphenated fractions (`12-1`, `12-1-2`), paired with Last-Write-Wins (LWW) timestamp reconciliation.
- **Cross-Site Display Title Survivorship (`pickPreferredTitle`):** Lowercase URL-slug extractors (`asurascans.com`, `asuracomic.net`, `mangahere.cc`, `kunmanga.com`) never overwrite existing mixed-case display titles captured by DOM extractors (`mangadex.org`, `mangaplus.shueisha.co.jp`), while mixed-case DOM titles automatically upgrade lowercase slugs.

### 3. SPA-Optimized Reading Detection
- **Targeted Navigation Hooks:** Uses Chromium's `window.navigation` API (`navigatesuccess`, `currententrychange`) with `popstate` and `hashchange` fallbacks — completely eliminating full-document `MutationObserver` overhead.
- **15s Dwell + >25% Scroll-Depth Gate:** A chapter is dispatched at most once per URL only after both a **15-second dwell timer** and **>25% scroll depth** are satisfied (non-scrollable single-viewport pages satisfy scroll depth automatically).
- **End-of-Dwell DOM Re-Extraction & Retries:** Metadata retries up to **8 times** at **1000ms** intervals for slow SPA mounts, and `extractPageMetadata()` re-reads the DOM at dispatch time to guard against SPA route race conditions.

### 4. Vault UI & Extension Action Badge States
- **Compact `380px` Canvas:** Fixed `380px` popup viewport (`box-sizing: border-box`, `overflow-x: hidden`) with a dark theme.
- **Batched DOM & Event Delegation:** Renders cards through a single `DocumentFragment` + `replaceChildren()` pass (zero `innerHTML`) and handles `.btn-read` / `.btn-delete` interactions via single `#list` container event delegation with `http`/`https` URL sanitization (`isSafeUrl`).
- **Sorting, Search & Site Filters:** Toggle between **Recently Read** (default) and **A–Z** sorting, filter by keyword, or filter with radio controls (**All** + **5 site filters** covering all **6 configured domains**):
  - **Asura Scans** (`asurascans.com`, `asuracomic.net`)
  - **MangaHere** (`mangahere.cc`)
  - **MangaDex** (`mangadex.org`)
  - **MangaPlus** (`mangaplus.shueisha.co.jp`)
  - **Kunmanga** (`kunmanga.com`)
- **Action Badge Feedback:**
  - `...` (`#7f8c8d`) — Sync in flight
  - `OK` (`#27ae60`) — Sync succeeded (auto-clears after **3000ms**, with timer cancellation across state transitions)
  - `!` (`#c0392b`) — Sync/auth/payload error

---

## 🚀 Local Setup & Installation (Developer Mode)

### 1. Clone the Repository
```bash
git clone https://github.com/James2898/sanctum.git
cd sanctum
```

### 2. Create Google Cloud OAuth 2.0 Credentials
1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project (e.g., **Sanctum Vault**).
2. Enable the **Google Drive API**.
3. Configure the **OAuth Consent Screen**, add the `https://www.googleapis.com/auth/drive.file` scope, and add your Google account under **Test Users**.
4. Create an **OAuth 2.0 Client ID** with Application type **Chrome Extension** using your extension ID.

### 3. Configure `manifest.json` from `manifest.example.json`
`manifest.example.json` provides the sanitized Manifest V3 template with credential placeholders:
- Copy `manifest.example.json` to `manifest.json` (or update your local `manifest.json`).
- Replace `"YOUR_EXTENSION_PUBLIC_KEY_HERE"` in `key` with your extension's public key (keeps your unpacked Extension ID stable).
- Replace `"YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com"` in `oauth2.client_id` with your Google Cloud OAuth Client ID (keeping `oauth2.scopes` restricted to `["https://www.googleapis.com/auth/drive.file"]`).
- **Credential Hygiene:** Never commit personal OAuth client IDs or extension keys when opening pull requests; keep `manifest.example.json` synchronized with any non-credential manifest changes.

### 4. Load Unpacked in Chrome
1. Navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `sanctum/` repository directory.

---

## 🧪 Testing & Local Preview

Sanctum uses **zero third-party runtime or dev dependencies** — no `npm install` or `node_modules` directory is required. All scripts run natively on **Node.js 20.x and 22.x LTS** (CommonJS).

### Unit Test Suite (`node:test`)
```bash
npm test
```
This runs `node --test test/*.test.js` directly against the real exported production functions in `background.js`, `content.js`, and `popup.js` (naturally excluding `test/preview/` harness files).

### Manifest V3 Schema & Asset Validation
```bash
node scripts/validate-manifest.js
```
Verifies JSON syntax, required MV3 fields, Chrome version format, disk existence of all referenced scripts/popup/icon assets, credential placeholders in `manifest.example.json`, and non-credential field parity against `manifest.json`.

### Automated CI Pipeline
`.github/workflows/ci.yml` automatically runs on `push` and `pull_request` across Node **20.x** and **22.x** LTS (`ubuntu-latest`) with least-privilege permissions (`contents: read`):
1. Verifies zero entries in `package.json` `dependencies` and `devDependencies` (without running `npm install`).
2. Runs `npm test`.
3. Runs `node scripts/validate-manifest.js`.

### Local / LAN Popup Preview Harness
To inspect and interact with the `380px` Vault popup UI directly in any desktop or mobile browser without loading the unpacked extension:
```bash
node test/preview/server.js
```
The zero-dependency HTTP server listens on port **`3456`** (`http://localhost:3456` locally or `http://<LAN-IP>:3456` on your local network) using `test/preview/mock-chrome.js` and `test/preview/mock-data.js` (`default`, `empty`, `large`, and `error` scenarios).

---

## 🛠️ Technical Stack

- **Runtime:** Pure Vanilla ES2022+ (zero frameworks, zero bundlers, zero npm dependencies)
- **Extension Platform:** Chrome Manifest V3 (`identity` + `storage` permissions)
- **Storage & Cloud Sync:** `chrome.storage.local` + Google Drive API v3 (`drive.file` scope, `sanctum_history.json`)
- **SPA Detection:** Chromium Navigation API (`window.navigation`) + `popstate` / `hashchange` + passive scroll listeners
- **Testing & CI:** Node.js built-in `node:test` + `node:assert/strict` (Node 20+/22+ LTS) + GitHub Actions

---

## 📂 Repository Structure

```text
sanctum/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Automated CI (Node 20.x/22.x, zero-dep check, npm test, MV3 validation)
├── docs/
│   ├── IMPLEMENTATION_PLAN.md     # Phased architectural roadmap & design decisions
│   └── PROJECT_IMPROVEMENT_SUGGESTIONS.md
├── icons/
│   ├── icon.svg                   # Master Sanctum vector icon
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── scripts/
│   └── validate-manifest.js       # Zero-dependency MV3 schema, asset & parity validator
├── test/
│   ├── background.test.js         # Sync engine, Drive guardrails, LWW, monotonic & BUG-009 tests
│   ├── content.test.js            # 6-site extractors, retry backoff, dwell/scroll & SPA tests
│   ├── popup.test.js              # SWR cache render, DocumentFragment, delegation & UI tests
│   └── preview/
│       ├── index.html             # Standalone popup preview host page
│       ├── mock-chrome.js         # Mock chrome.storage / runtime / tabs bridge
│       ├── mock-data.js           # Vault preview scenarios (default, empty, large, error)
│       └── server.js              # Zero-dependency LAN HTTP preview server (port 3456)
├── arrow-right.svg                # Popup UI icon: continue reading
├── magnify.svg                    # Popup UI icon: search
├── refresh.svg                    # Popup UI icon: manual Drive sync
├── trash.svg                      # Popup UI icon: delete series
├── background.js                  # MV3 service worker: SWR cache, offline queue, LWW & Drive sync
├── content.js                     # Content script: 6-site scrapers, SPA hooks, dwell/scroll gates
├── popup.html                     # Vault dashboard markup & 380px styles
├── popup.js                       # Vault dashboard controller: sort, filter, search & delegation
├── manifest.example.json          # Sanitized MV3 manifest template (placeholder OAuth credentials)
├── manifest.json                  # Local MV3 extension manifest
├── package.json                   # Zero-dependency CommonJS test script harness
├── CHANGELOG.md                   # Release & architectural change history
└── readme.md                      # Architecture overview, setup & testing guide
```
