// Injected into popup.html inside the test harness
(() => {
  console.log("[Sanctum Preview] Initializing mock Chrome Extension environment...");

  // Load active scenario from URL param or sessionStorage
  const urlParams = new URLSearchParams(window.location.search);
  let activeScenario = urlParams.get("scenario") || sessionStorage.getItem("sanctum_scenario") || "default";

  // Deep clone initial data
  let currentVault = JSON.parse(JSON.stringify(
    MOCK_DATASETS[activeScenario] || MOCK_DATASETS.default
  ));

  let mockStorage = {
    series: JSON.parse(JSON.stringify(currentVault.series || {})),
    fileId: "mock-sanctum-file-id-001",
    lastSync: new Date().toISOString(),
    pending_sync: [],
  };

  window.__MOCK_STATE__ = {
    get scenario() { return activeScenario; },
    set scenario(s) {
      activeScenario = s;
      sessionStorage.setItem("sanctum_scenario", s);
      currentVault = JSON.parse(JSON.stringify(MOCK_DATASETS[s] || MOCK_DATASETS.default));
      mockStorage.series = JSON.parse(JSON.stringify(currentVault.series || {}));
    },
    get vault() { return currentVault; },
    get storage() { return mockStorage; },
    reset() {
      currentVault = JSON.parse(JSON.stringify(MOCK_DATASETS[activeScenario] || MOCK_DATASETS.default));
      mockStorage.series = JSON.parse(JSON.stringify(currentVault.series || {}));
    }
  };

  // Mock chrome API
  window.chrome = {
    identity: {
      getAuthToken: async ({ interactive }) => {
        console.log(`[Sanctum Preview] chrome.identity.getAuthToken(interactive: ${interactive})`);
        if (activeScenario === "error") {
          throw new Error("Simulated OAuth authentication failure");
        }
        return { token: "mock-google-oauth-token-12345" };
      }
    },
    storage: {
      local: {
        get: (keys, callback) => {
          console.log("[Sanctum Preview] chrome.storage.local.get:", keys);
          let result = {};
          if (typeof keys === "string") {
            result[keys] = mockStorage[keys];
          } else if (Array.isArray(keys)) {
            keys.forEach((k) => {
              result[k] = mockStorage[k];
            });
          } else if (keys && typeof keys === "object") {
            Object.keys(keys).forEach((k) => {
              result[k] = mockStorage[k] !== undefined ? mockStorage[k] : keys[k];
            });
          } else {
            result = { ...mockStorage };
          }
          if (typeof callback === "function") {
            callback(result);
          }
          return Promise.resolve(result);
        },
        set: (items, callback) => {
          console.log("[Sanctum Preview] chrome.storage.local.set:", items);
          Object.assign(mockStorage, items);
          if (items.series) {
            currentVault.series = JSON.parse(JSON.stringify(items.series));
          }
          if (typeof callback === "function") {
            callback();
          }
          return Promise.resolve();
        },
        remove: (keys, callback) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          arr.forEach((k) => delete mockStorage[k]);
          if (typeof callback === "function") callback();
          return Promise.resolve();
        },
        clear: (callback) => {
          mockStorage = {};
          if (typeof callback === "function") callback();
          return Promise.resolve();
        },
      },
    },
    runtime: {
      sendMessage: (message, callback) => {
        console.log("[Sanctum Preview] chrome.runtime.sendMessage:", message);
        if (message && message.type === "DELETE_SERIES") {
          const mangaName = message.payload?.manga;
          if (mangaName && currentVault.series[mangaName]) {
            delete currentVault.series[mangaName];
            delete mockStorage.series[mangaName];
            console.log(`[Sanctum Preview] Deleted "${mangaName}" from mock vault.`);
          }
          if (typeof callback === "function") {
            setTimeout(() => callback({ status: "success" }), 100);
          }
        } else if (message && message.type === "SYNC_VAULT") {
          if (activeScenario === "error") {
            if (typeof callback === "function") {
              setTimeout(() => callback({ status: "error", error: "Simulated preview sync error" }), 100);
            }
          } else {
            mockStorage.series = JSON.parse(JSON.stringify(currentVault.series || {}));
            mockStorage.lastSync = new Date().toISOString();
            if (typeof callback === "function") {
              setTimeout(() => callback({
                status: "success",
                series: mockStorage.series,
                lastSync: mockStorage.lastSync,
              }), 100);
            }
          }
        }
      }
    }
  };

  // Intercept Google Drive API calls made by popup.js
  const originalFetch = window.fetch;
  window.fetch = async (url, options = {}) => {
    const urlStr = typeof url === "string" ? url : url.toString();

    // 1. Drive file search
    if (urlStr.includes("googleapis.com/drive/v3/files?q=")) {
      console.log("[Sanctum Preview] Intercepted Drive search:", urlStr);
      if (activeScenario === "error") {
        return new Response(JSON.stringify({ error: "Simulated Drive API 500" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ files: [{ id: "mock-sanctum-file-id-001" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Drive file content (alt=media)
    if (urlStr.includes("alt=media")) {
      console.log("[Sanctum Preview] Intercepted Drive content fetch:", urlStr);
      if (activeScenario === "error") {
        return new Response(JSON.stringify({ error: "Simulated Read Error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
      // Small artificial network latency (80ms) for realistic feel
      await new Promise(r => setTimeout(r, 80));
      return new Response(JSON.stringify(currentVault), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return originalFetch(url, options);
  };

  // Listen for messages from the parent frame (test harness UI)
  window.addEventListener("message", (event) => {
    if (!event.data || !event.data.type) return;

    if (event.data.type === "SET_SCENARIO") {
      window.__MOCK_STATE__.scenario = event.data.scenario;
      const refreshBtn = document.getElementById("refresh-btn");
      if (refreshBtn) refreshBtn.click();
    } else if (event.data.type === "RESET_VAULT") {
      window.__MOCK_STATE__.reset();
      const refreshBtn = document.getElementById("refresh-btn");
      if (refreshBtn) refreshBtn.click();
    }
  });

  console.log("[Sanctum Preview] Mock environment ready. Active scenario:", activeScenario);
})();
