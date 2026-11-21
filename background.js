const HISTORY_FILE = "sanctum_history.json";

let syncQueue = Promise.resolve();
let badgeClearTimer = null;

function enqueueOperation(operation) {
  const next = syncQueue.then(operation, operation);
  syncQueue = next.catch(() => {});
  return next;
}

function clearBadgeTimer() {
  if (badgeClearTimer) {
    clearTimeout(badgeClearTimer);
    badgeClearTimer = null;
  }
}

function setErrorBadge() {
  clearBadgeTimer();
  if (typeof chrome !== "undefined" && chrome.action) {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
  }
}

function setInFlightBadge() {
  clearBadgeTimer();
  if (typeof chrome !== "undefined" && chrome.action) {
    chrome.action.setBadgeText({ text: "..." });
    chrome.action.setBadgeBackgroundColor({ color: "#7f8c8d" });
  }
}

function setSuccessBadge() {
  clearBadgeTimer();
  if (typeof chrome !== "undefined" && chrome.action) {
    chrome.action.setBadgeText({ text: "OK" });
    chrome.action.setBadgeBackgroundColor({ color: "#27ae60" });
    badgeClearTimer = setTimeout(() => {
      badgeClearTimer = null;
      if (typeof chrome !== "undefined" && chrome.action) {
        chrome.action.setBadgeText({ text: "" });
      }
    }, 3000);
  }
}

// Storage helpers
async function getStorage(keys) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    return {};
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result || {});
    });
  });
}

async function setStorage(items) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => {
      resolve();
    });
  });
}

// Chapter parsing and monotonic progress guard
function parseChapter(chapter) {
  if (chapter === null || chapter === undefined) return null;
  if (typeof chapter === "number") {
    return Number.isFinite(chapter) ? { type: "numeric", value: [chapter] } : null;
  }
  if (typeof chapter !== "string") return null;
  const trimmed = chapter.trim();
  if (!trimmed) return null;

  // Fractional / hyphenated chapters e.g. "12-1", "12-1-3", "150-5"
  if (/^\d+(?:-\d+)+$/.test(trimmed)) {
    const parts = trimmed.split("-").map((p) => parseInt(p, 10));
    return { type: "fractional", value: parts };
  }

  // Standard numeric (integer or decimal) e.g. "100", "150.5", "0.5"
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return { type: "numeric", value: [parseFloat(trimmed)] };
  }

  return null;
}

function compareChapterParts(newParts, savedParts) {
  const len = Math.max(newParts.length, savedParts.length);
  for (let i = 0; i < len; i++) {
    const a = i < newParts.length ? newParts[i] : 0;
    const b = i < savedParts.length ? savedParts[i] : 0;
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

function shouldUpdateProgress(newChapter, newTimestamp, savedChapter, savedTimestamp) {
  if (savedChapter === undefined || savedChapter === null) {
    return true;
  }

  const parsedNew = parseChapter(newChapter);
  const parsedSaved = parseChapter(savedChapter);

  // Both chapters have numeric/fractional structure: enforce monotonic progress
  if (parsedNew && parsedSaved) {
    const comp = compareChapterParts(parsedNew.value, parsedSaved.value);
    // Reject if new < saved
    if (comp < 0) {
      return false;
    }
    return true;
  }

  // Fallback to timestamp comparison when either chapter is non-numeric
  if (newTimestamp && savedTimestamp) {
    const newTime = new Date(newTimestamp).getTime();
    const savedTime = new Date(savedTimestamp).getTime();
    if (!Number.isNaN(newTime) && !Number.isNaN(savedTime)) {
      return newTime >= savedTime;
    }
  }

  return true;
}

async function findFile(token) {
  if (!token) {
    return { status: "error", error: new Error("Missing auth token") };
  }
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${HISTORY_FILE}' and trashed=false&orderBy=createdTime`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      return {
        status: "error",
        error: new Error(`Drive search failed with status ${res.status}`),
      };
    }
    const body = await res.json();
    if (!body || !Array.isArray(body.files)) {
      return {
        status: "error",
        error: new Error("Malformed Drive search response: missing files array"),
      };
    }
    if (body.files.length === 0) {
      return { status: "not_found" };
    }
    const file = body.files[0];
    if (!file || !file.id) {
      return {
        status: "error",
        error: new Error("Drive file record missing id"),
      };
    }
    return { status: "found", fileId: file.id };
  } catch (err) {
    return { status: "error", error: err };
  }
}

async function createFile(token) {
  const metadata = { name: HISTORY_FILE, mimeType: "application/json" };
  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) {
    throw new Error(`Drive create failed with status ${res.status}`);
  }
  const file = await res.json();
  if (!file || !file.id) {
    throw new Error("Drive create response missing id");
  }
  return file.id;
}

async function fetchAndValidateDriveVault(fileId, token) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (response.status === 404) {
    return { status: "not_found", data: { series: {} } };
  }

  if (!response.ok) {
    return {
      status: "error",
      error: new Error(`Drive fetch failed with status ${response.status}`),
    };
  }

  const text = await response.text();
  if (!text.trim()) {
    return { status: "ok", data: { series: {} } };
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn(
        "⚠️ [Sanctum] Drive file is not a valid JSON object, aborting write to prevent data loss:",
        text,
      );
      return { status: "malformed", text };
    }
    if (!parsed.series || typeof parsed.series !== "object" || Array.isArray(parsed.series)) {
      parsed.series = {};
    }
    return { status: "ok", data: parsed };
  } catch (parseErr) {
    console.warn(
      "⚠️ [Sanctum] Drive file JSON malformed, aborting write to prevent data loss:",
      parseErr,
    );
    return { status: "malformed", error: parseErr };
  }
}

async function uploadDriveVault(fileId, token, data) {
  const patchRes = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    },
  );

  if (!patchRes.ok) {
    throw new Error(`Drive patch failed with status ${patchRes.status}`);
  }
  return patchRes;
}

// Reconciles pending mutations against Google Drive and writes back changes
async function reconcileAndSync(opts = {}) {
  const { liveMutation, interactive = false } = opts;

  let tokenObj;
  try {
    tokenObj = await chrome.identity.getAuthToken({ interactive });
  } catch (authErr) {
    console.error("❌ [Sanctum] Auth failed:", authErr);
    setErrorBadge();
    return { status: "error", error: authErr };
  }

  const token = tokenObj?.token;
  if (!token) {
    console.error("❌ [Sanctum] No auth token received");
    setErrorBadge();
    return { status: "error", error: new Error("No auth token received") };
  }

  const storage = await getStorage(["series", "fileId", "lastSync", "pending_sync"]);
  let fileId = storage.fileId;
  let vaultResult = null;

  // 1. Try cached fileId if available
  if (fileId) {
    vaultResult = await fetchAndValidateDriveVault(fileId, token);
    if (vaultResult.status === "not_found") {
      // Stale cached fileId (AM-1): recover via findFile / createFile
      console.warn("⚠️ [Sanctum] Cached fileId returned 404, recovering via findFile/createFile...");
      fileId = null;
      await setStorage({ fileId: null });
    }
  }

  // 2. Fall back to findFile / createFile if no valid fileId
  if (!fileId) {
    const searchResult = await findFile(token);
    if (searchResult.status === "found") {
      fileId = searchResult.fileId;
      vaultResult = await fetchAndValidateDriveVault(fileId, token);
    } else if (searchResult.status === "not_found") {
      if (liveMutation && liveMutation.type === "DELETE_SERIES" && (!storage.pending_sync || storage.pending_sync.length === 0)) {
        return { status: "not_found", series: {} };
      }
      fileId = await createFile(token);
      vaultResult = { status: "ok", data: { series: {} } };
    } else {
      console.error("❌ [Sanctum] findFile error:", searchResult.error);
      setErrorBadge();
      return { status: "error", error: searchResult.error };
    }
  }

  // 3. Check vault content validation result (BUG-001)
  if (vaultResult.status === "malformed") {
    setErrorBadge();
    return { status: "malformed", error: vaultResult.error || new Error("Malformed Drive JSON") };
  }
  if (vaultResult.status === "error") {
    setErrorBadge();
    return { status: "error", error: vaultResult.error };
  }

  const remoteVault = vaultResult.data || { series: {} };
  if (!remoteVault.series || typeof remoteVault.series !== "object" || Array.isArray(remoteVault.series)) {
    remoteVault.series = {};
  }

  // 4. Gather pending mutations to reconcile
  const pendingQueue = Array.isArray(storage.pending_sync) ? [...storage.pending_sync] : [];
  const snapshotCount = pendingQueue.length;

  if (liveMutation) {
    pendingQueue.push(liveMutation);
  }

  // If there are no pending mutations and no live mutation, we just refreshed from Drive
  if (pendingQueue.length === 0) {
    const nowIso = new Date().toISOString();
    await setStorage({
      series: remoteVault.series,
      fileId: fileId,
      lastSync: nowIso,
    });
    return { status: "success", series: remoteVault.series, lastSync: nowIso, fileId };
  }

  // Apply mutations in FIFO order
  for (const mut of pendingQueue) {
    if (!mut || !mut.type) continue;
    if (mut.type === "SYNC_CHAPTER") {
      const mName = mut.payload?.manga;
      const mChapter = mut.payload?.chapter;
      const mUrl = mut.payload?.url;
      const mTime = mut.timestamp || new Date().toISOString();
      if (mName) {
        const saved = remoteVault.series[mName];
        if (!saved || shouldUpdateProgress(mChapter, mTime, saved.chapter, saved.updated)) {
          remoteVault.series[mName] = {
            chapter: mChapter,
            url: mUrl,
            updated: mTime,
          };
        } else {
          console.log(`[Sanctum] Reconciliation monotonic guard skipped ${mName} Ch. ${mChapter}`);
        }
      }
    } else if (mut.type === "DELETE_SERIES") {
      const mName = mut.payload?.manga;
      if (mName && remoteVault.series) {
        delete remoteVault.series[mName];
      }
    }
  }

  // 5. Upload merged vault back to Drive
  await uploadDriveVault(fileId, token, remoteVault);

  // 6. Update local storage and remove the reconciled prefix
  const nowIso = new Date().toISOString();
  const freshStorage = await getStorage(["pending_sync"]);
  const currentPending = Array.isArray(freshStorage.pending_sync) ? freshStorage.pending_sync : [];
  const remainingPending = currentPending.slice(snapshotCount);

  await setStorage({
    series: remoteVault.series,
    fileId: fileId,
    lastSync: nowIso,
    pending_sync: remainingPending,
  });

  setSuccessBadge();
  return {
    status: "success",
    series: remoteVault.series,
    lastSync: nowIso,
    fileId: fileId,
  };
}

function handleMessage(message, sender, sendResponse) {
  if (message.type === "SYNC_CHAPTER") {
    enqueueOperation(async () => {
      try {
        const storage = await getStorage(["series", "pending_sync"]);
        const localSeries =
          storage.series && typeof storage.series === "object" && !Array.isArray(storage.series)
            ? { ...storage.series }
            : {};

        const mangaName =
          typeof message.payload?.manga === "string"
            ? message.payload.manga.trim()
            : message.payload?.manga;
        const newChapter = message.payload?.chapter;
        const newUrl = message.payload?.url;
        const nowIso = new Date().toISOString();

        // 1. Monotonic guard check against current cached local series entry
        const savedEntry = localSeries[mangaName];
        if (savedEntry) {
          const allowed = shouldUpdateProgress(newChapter, nowIso, savedEntry.chapter, savedEntry.updated);
          if (!allowed) {
            console.log(
              `[Sanctum] Monotonic guard rejected: ${mangaName} Ch. ${newChapter} < current Ch. ${savedEntry.chapter}`,
            );
            if (typeof sendResponse === "function") {
              sendResponse({ status: "ignored", reason: "monotonic_downgrade" });
            }
            return;
          }
        }

        // 2. Optimistic local cache update
        localSeries[mangaName] = {
          chapter: newChapter,
          url: newUrl,
          updated: nowIso,
        };
        await setStorage({ series: localSeries });

        const liveMutation = {
          type: "SYNC_CHAPTER",
          payload: {
            manga: mangaName,
            chapter: newChapter,
            url: newUrl,
            site: message.payload?.site,
          },
          timestamp: nowIso,
        };

        // 3. Offline check
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (isOffline) {
          const freshStorage = await getStorage(["pending_sync"]);
          const q = Array.isArray(freshStorage.pending_sync) ? [...freshStorage.pending_sync] : [];
          q.push(liveMutation);
          await setStorage({ pending_sync: q });
          clearBadgeTimer();
          if (typeof chrome !== "undefined" && chrome.action) {
            chrome.action.setBadgeText({ text: "" });
          }
          if (typeof sendResponse === "function") {
            sendResponse({ status: "queued_offline" });
          }
          return;
        }

        // 4. Online sync
        setInFlightBadge();
        const syncResult = await reconcileAndSync({ liveMutation, interactive: false });
        if (syncResult.status !== "success") {
          const freshStorage = await getStorage(["pending_sync"]);
          const q = Array.isArray(freshStorage.pending_sync) ? [...freshStorage.pending_sync] : [];
          q.push(liveMutation);
          await setStorage({ pending_sync: q });
        }
      } catch (err) {
        console.error("❌ [Sanctum] Sync Failed:", err.message);
        setErrorBadge();
      }
    });
    // Fire-and-forget; do not return true
    return;
  }

  if (message.type === "DELETE_SERIES") {
    enqueueOperation(async () => {
      try {
        const mangaName = message.payload?.manga;
        const nowIso = new Date().toISOString();

        // 1. Optimistic local cache delete
        const storage = await getStorage(["series", "pending_sync"]);
        const localSeries =
          storage.series && typeof storage.series === "object" && !Array.isArray(storage.series)
            ? { ...storage.series }
            : {};
        if (mangaName && localSeries[mangaName]) {
          delete localSeries[mangaName];
          await setStorage({ series: localSeries });
        }

        const liveMutation = {
          type: "DELETE_SERIES",
          payload: { manga: mangaName },
          timestamp: nowIso,
        };

        // 2. Offline check
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (isOffline) {
          const freshStorage = await getStorage(["pending_sync"]);
          const q = Array.isArray(freshStorage.pending_sync) ? [...freshStorage.pending_sync] : [];
          q.push(liveMutation);
          await setStorage({ pending_sync: q });
          clearBadgeTimer();
          if (typeof chrome !== "undefined" && chrome.action) {
            chrome.action.setBadgeText({ text: "" });
          }
          sendResponse({ status: "success" });
          return;
        }

        // 3. Online sync
        const syncResult = await reconcileAndSync({ liveMutation, interactive: false });
        if (syncResult.status === "success" || syncResult.status === "not_found") {
          sendResponse({ status: "success" });
        } else {
          const freshStorage = await getStorage(["pending_sync"]);
          const q = Array.isArray(freshStorage.pending_sync) ? [...freshStorage.pending_sync] : [];
          q.push(liveMutation);
          await setStorage({ pending_sync: q });
          sendResponse({ status: "error" });
        }
      } catch (err) {
        console.error("[Sanctum] Delete Failed:", err);
        setErrorBadge();
        sendResponse({ status: "error" });
      }
    });
    return true; // Keep channel open for sendResponse
  }

  if (message.type === "SYNC_VAULT") {
    enqueueOperation(async () => {
      try {
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (isOffline) {
          const storage = await getStorage(["series", "lastSync"]);
          sendResponse({
            status: "offline",
            series: storage.series || {},
            lastSync: storage.lastSync || null,
          });
          return;
        }

        const syncResult = await reconcileAndSync({
          interactive: Boolean(message.payload?.interactive),
        });

        if (syncResult.status === "success") {
          sendResponse({
            status: "success",
            series: syncResult.series || {},
            lastSync: syncResult.lastSync,
          });
        } else {
          const storage = await getStorage(["series", "lastSync"]);
          sendResponse({
            status: "error",
            error: syncResult.error ? syncResult.error.message : syncResult.status,
            series: storage.series || {},
            lastSync: storage.lastSync || null,
          });
        }
      } catch (err) {
        console.error("❌ [Sanctum] SYNC_VAULT error:", err);
        const storage = await getStorage(["series", "lastSync"]);
        sendResponse({
          status: "error",
          error: err.message,
          series: storage.series || {},
          lastSync: storage.lastSync || null,
        });
      }
    });
    return true;
  }
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(handleMessage);
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  self.addEventListener("online", () => {
    enqueueOperation(async () => {
      const storage = await getStorage(["pending_sync"]);
      if (storage.pending_sync && storage.pending_sync.length > 0) {
        await reconcileAndSync();
      }
    });
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    HISTORY_FILE,
    findFile,
    createFile,
    enqueueOperation,
    setErrorBadge,
    setSuccessBadge,
    setInFlightBadge,
    clearBadgeTimer,
    getBadgeClearTimer: () => badgeClearTimer,
    handleMessage,
    getStorage,
    setStorage,
    parseChapter,
    compareChapterParts,
    shouldUpdateProgress,
    fetchAndValidateDriveVault,
    uploadDriveVault,
    reconcileAndSync,
  };
}
