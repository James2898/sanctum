# 🛡️ Sanctum: Private Manga Tracker

**Sanctum** is a lightweight, privacy-focused Chrome Extension that automatically tracks your manga and manhwa reading progress. Unlike other trackers, Sanctum uses your **personal Google Drive** as a backend, ensuring your reading habits remain private and accessible only to you.

## ✨ Features

- **Privacy-First:** No third-party databases. Your history is stored in a secure `sanctum_history.json` file on your own Google Drive.
- **Multi-Site Support:**
  - **Asura Scans** (`asurascans.com`)
  - **MangaDex** (`mangadex.org`) - Includes full SPA (Single Page Application) support.
  - **MangaHere** (`mangahere.cc`)
- **Fast Sync:** Progress is recorded after just **3 seconds** of activity.
- **Interactive Dashboard:** A clean, dark-themed UI to manage your "Vault."
  - **Alphabetical Sorting:** Automatically organized by manga title.
  - **Site Tagging:** Visual badges (e.g., MD, AS) to identify where you're reading.
  - **One-Click Continue:** Links directly back to your last read chapter.
  - **History Management:** Easily delete specific records from your vault.

## 🚀 Installation (Developer Mode)

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/your-username/sanctum.git](https://github.com/your-username/sanctum.git)
    ```
2.  **Google Cloud Setup:**
    - Go to the [Google Cloud Console](https://console.cloud.google.com/).
    - Create a new project (e.g., "Sanctum Vault").
    - Enable the **Google Drive API**.
    - Configure the **OAuth Consent Screen** and add your email to the **Test Users** list.
    - Create **OAuth 2.0 Client ID** credentials (Application type: **Chrome Extension**).
3.  **Configure Manifest:**
    - Open `manifest.json`.
    - Replace `client_id` with your generated Client ID.
    - Add your public `key` to ensure your Extension ID remains constant.
4.  **Load Extension:**
    - Open Chrome and navigate to `chrome://extensions`.
    - Enable **Developer mode**.
    - Click **Load unpacked** and select the project folder.

## 🛠️ Technical Stack

- **Manifest V3:** Built on the latest extension architecture.
- **Chrome Identity API:** Secure OAuth2 flow for Google Drive access.
- **Google Drive API v3:** Performs `GET` and `PATCH` requests to sync JSON data.
- **MutationObserver:** Monitors dynamic URL changes in Single Page Applications (MangaDex).
- **Regex Engine:** Precision parsing for diverse URL structures and DOM elements.

## 📂 File Structure

```text
sanctum-extension/
├── manifest.json    # Extension configuration and permissions
├── background.js    # The "Sync Engine" - Handles OAuth and Drive API
├── content.js       # The "Scraper" - Site-specific logic and reading timers
├── popup.html       # The Dashboard structure and styles
└── popup.js         # The Dashboard logic - Sorting, rendering, and deletion
```
