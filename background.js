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

function clearBadge() {
  clearBadgeTimer();
  if (typeof chrome !== "undefined" && chrome.action) {
    chrome.action.setBadgeText({ text: "" });
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

function isValidMangaName(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  if (trimmed === "__proto__" || trimmed === "constructor" || trimmed === "prototype") {
    return false;
  }
  return true;
}

function normalizeSeriesKey(name) {
  if (!isValidMangaName(name)) return null;
  return name.toLowerCase().trim();
}

function deriveSite(site, url) {
  if (typeof site === "string" && site.trim().length > 0) {
    return site.trim();
  }
  if (typeof url === "string" && url.trim().length > 0) {
    try {
      const parsed = new URL(url.trim());
      if (parsed.hostname) {
        return parsed.hostname.toLowerCase().replace(/^www\./, "");
      }
    } catch {
      // Ignore malformed URLs
    }
  }
  return "";
}

function pickPreferredTitle(primaryTitle, secondaryTitle, slug) {
  const p = typeof primaryTitle === "string" ? primaryTitle.trim() : "";
  const s = typeof secondaryTitle === "string" ? secondaryTitle.trim() : "";
  if (!p) return s || slug;
  if (!s) return p;
  if (p === slug && s !== slug && s.toLowerCase() === slug) {
    return s;
  }
  return p;
}

function mergeDuplicateSeriesEntries(existing, incoming, slug) {
  const existingTime =
    typeof existing.updated === "string" && existing.updated.trim()
      ? Date.parse(existing.updated)
      : NaN;
  const incomingTime =
    typeof incoming.updated === "string" && incoming.updated.trim()
      ? Date.parse(incoming.updated)
      : NaN;
  const existingValid = !Number.isNaN(existingTime);
  const incomingValid = !Number.isNaN(incomingTime);

  let incomingWins = false;
  if (incomingValid && !existingValid) {
    incomingWins = true;
  } else if (!incomingValid && existingValid) {
    incomingWins = false;
  } else if (incomingValid && existingValid) {
    if (incomingTime > existingTime) {
      incomingWins = true;
    } else if (incomingTime < existingTime) {
      incomingWins = false;
    } else {
      const parsedInc = parseChapter(incoming.chapter);
      const parsedEx = parseChapter(existing.chapter);
      if (parsedInc && parsedEx) {
        incomingWins = compareChapterParts(parsedInc.value, parsedEx.value) >= 0;
      } else {
        incomingWins = true;
      }
    }
  } else {
    const parsedInc = parseChapter(incoming.chapter);
    const parsedEx = parseChapter(existing.chapter);
    if (parsedInc && parsedEx) {
      incomingWins = compareChapterParts(parsedInc.value, parsedEx.value) >= 0;
    } else {
      incomingWins = true;
    }
  }

  const winner = incomingWins ? incoming : existing;
  const loser = incomingWins ? existing : incoming;

  const merged = {
    chapter: winner.chapter !== undefined ? winner.chapter : loser.chapter,
    title: pickPreferredTitle(winner.title, loser.title, slug),
    site:
      (typeof winner.site === "string" && winner.site.trim()) ||
      (typeof loser.site === "string" && loser.site.trim()) ||
      "",
  };

  const resolvedUrl =
    winner.url !== undefined && winner.url !== "" ? winner.url : loser.url;
  if (resolvedUrl !== undefined) {
    merged.url = resolvedUrl;
  }

  const resolvedUpdated =
    incomingWins && incomingValid
      ? incoming.updated
      : !incomingWins && existingValid
        ? existing.updated
        : winner.updated !== undefined
          ? winner.updated
          : loser.updated;
  if (resolvedUpdated !== undefined) {
    merged.updated = resolvedUpdated;
  }

  return merged;
}

function areEntriesEqual(a, b) {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const keysA = Object.keys(a).filter((k) => a[k] !== undefined);
  const keysB = Object.keys(b).filter((k) => b[k] !== undefined);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.hasOwn(b, k) || a[k] !== b[k]) return false;
  }
  return true;
}

function areSeriesMapsEqual(mapA, mapB) {
  if (!mapA || !mapB || typeof mapA !== "object" || typeof mapB !== "object") {
    return false;
  }
  const keysA = Object.keys(mapA);
  const keysB = Object.keys(mapB);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.hasOwn(mapB, k)) return false;
    if (!areEntriesEqual(mapA[k], mapB[k])) return false;
  }
  return true;
}

function migrateSeriesMap(rawSeries) {
  if (!rawSeries || typeof rawSeries !== "object" || Array.isArray(rawSeries)) {
    return { series: {}, changed: Boolean(rawSeries !== undefined && rawSeries !== null) };
  }

  const migrated = Object.create(null);
  let changed = false;

  for (const rawKey of Object.keys(rawSeries)) {
    if (!Object.hasOwn(rawSeries, rawKey)) continue;
    const slug = normalizeSeriesKey(rawKey);
    const rawEntry = rawSeries[rawKey];

    if (!slug || !rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      changed = true;
      continue;
    }

    if (rawKey !== slug) {
      changed = true;
    }

    const trimmedKey = rawKey.trim();
    const resolvedTitle =
      typeof rawEntry.title === "string" && rawEntry.title.trim().length > 0
        ? rawEntry.title.trim()
        : trimmedKey;
    const resolvedSite = deriveSite(rawEntry.site, rawEntry.url);

    if (rawEntry.title !== resolvedTitle || rawEntry.site !== resolvedSite) {
      changed = true;
    }

    const candidate = {
      chapter: rawEntry.chapter,
      title: resolvedTitle,
      site: resolvedSite,
    };
    if (rawEntry.url !== undefined) {
      candidate.url = rawEntry.url;
    }
    if (rawEntry.updated !== undefined) {
      candidate.updated = rawEntry.updated;
    }

    if (Object.hasOwn(migrated, slug)) {
      changed = true;
      migrated[slug] = mergeDuplicateSeriesEntries(migrated[slug], candidate, slug);
    } else {
      migrated[slug] = candidate;
    }
  }

  const plainSeries = {};
  for (const slug of Object.keys(migrated)) {
    plainSeries[slug] = migrated[slug];
  }

  return { series: plainSeries, changed };
}

function reconcileSeriesMaps(remoteSeries, localSeries) {
  const merged = {};
  let remoteChanged = false;

  for (const slug of Object.keys(remoteSeries)) {
    if (!Object.hasOwn(remoteSeries, slug)) continue;
    merged[slug] = { ...remoteSeries[slug] };
  }

  for (const slug of Object.keys(localSeries)) {
    if (!Object.hasOwn(localSeries, slug)) continue;
    const localEntry = localSeries[slug];
    if (!Object.hasOwn(merged, slug)) {
      merged[slug] = { ...localEntry };
      remoteChanged = true;
    } else {
      const remoteEntry = merged[slug];
      const combined = mergeDuplicateSeriesEntries(localEntry, remoteEntry, slug);
      if (!areEntriesEqual(remoteEntry, combined)) {
        remoteChanged = true;
      }
      merged[slug] = combined;
    }
  }

  return { series: merged, remoteChanged };
}

async function migrateStorageSchema() {
  const storage = await getStorage(["series", "pending_sync"]);
  const updates = {};
  let hasUpdates = false;

  if (storage.series && typeof storage.series === "object" && !Array.isArray(storage.series)) {
    const { series: migratedSeries, changed: seriesChanged } = migrateSeriesMap(storage.series);
    if (seriesChanged) {
      updates.series = migratedSeries;
      hasUpdates = true;
    }
  }

  if (Array.isArray(storage.pending_sync) && storage.pending_sync.length > 0) {
    let queueChanged = false;
    const migratedQueue = [];
    for (const mut of storage.pending_sync) {
      if (!mut || typeof mut !== "object" || !mut.type) {
        queueChanged = true;
        continue;
      }
      const rawManga = mut.payload?.manga;
      const slug = normalizeSeriesKey(rawManga);
      if (!slug) {
        queueChanged = true;
        continue;
      }
      if (mut.type === "SYNC_CHAPTER") {
        const trimmedRaw = typeof rawManga === "string" ? rawManga.trim() : slug;
        const nextTitle =
          (typeof mut.payload?.title === "string" && mut.payload.title.trim()) ||
          trimmedRaw;
        const nextSite = deriveSite(mut.payload?.site, mut.payload?.url);
        if (
          mut.payload.manga !== slug ||
          mut.payload.title !== nextTitle ||
          mut.payload.site !== nextSite
        ) {
          queueChanged = true;
          migratedQueue.push({
            ...mut,
            payload: {
              ...mut.payload,
              manga: slug,
              title: nextTitle,
              site: nextSite,
            },
          });
        } else {
          migratedQueue.push(mut);
        }
      } else if (mut.type === "DELETE_SERIES") {
        if (mut.payload?.manga !== slug) {
          queueChanged = true;
          migratedQueue.push({
            ...mut,
            payload: {
              ...mut.payload,
              manga: slug,
            },
          });
        } else {
          migratedQueue.push(mut);
        }
      } else {
        migratedQueue.push(mut);
      }
    }
    if (queueChanged) {
      updates.pending_sync = migratedQueue;
      hasUpdates = true;
    }
  }

  if (hasUpdates) {
    await setStorage(updates);
  }
  return { migrated: hasUpdates, ...updates };
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
  try {
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
  } catch (netErr) {
    console.error("❌ [Sanctum] Drive fetch network error:", netErr);
    return { status: "error", error: netErr };
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
  try {
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
        try {
          fileId = await createFile(token);
          vaultResult = { status: "ok", data: { series: {} } };
        } catch (createErr) {
          console.error("❌ [Sanctum] createFile error:", createErr);
          setErrorBadge();
          return { status: "error", error: createErr };
        }
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

    const localMig = migrateSeriesMap(storage.series);
    const remoteMig = migrateSeriesMap(remoteVault.series);
    remoteVault.series = remoteMig.series;

    // 4. Gather pending mutations to reconcile
    const pendingQueue = Array.isArray(storage.pending_sync) ? [...storage.pending_sync] : [];
    const snapshotCount = pendingQueue.length;

    if (liveMutation) {
      pendingQueue.push(liveMutation);
    }

    // If there are no pending mutations and no live mutation, migrate and reconcile local vs remote via LWW (AM-2)
    if (pendingQueue.length === 0) {
      const { series: reconciledSeries, remoteChanged } = reconcileSeriesMaps(
        remoteVault.series,
        localMig.series,
      );
      remoteVault.series = reconciledSeries;

      if (remoteMig.changed || remoteChanged) {
        try {
          await uploadDriveVault(fileId, token, remoteVault);
        } catch (uploadErr) {
          console.error("❌ [Sanctum] uploadDriveVault error:", uploadErr);
          setErrorBadge();
          return { status: "error", error: uploadErr };
        }
      }

      const nowIso = new Date().toISOString();
      const localNeedsWrite =
        localMig.changed ||
        storage.fileId !== fileId ||
        !storage.lastSync ||
        !areSeriesMapsEqual(storage.series, remoteVault.series);

      const effectiveLastSync = localNeedsWrite ? nowIso : storage.lastSync;
      if (localNeedsWrite) {
        await setStorage({
          series: remoteVault.series,
          fileId: fileId,
          lastSync: effectiveLastSync,
        });
      }
      return {
        status: "success",
        series: remoteVault.series,
        lastSync: effectiveLastSync,
        fileId,
      };
    }

    // Apply mutations in FIFO order using normalized lowercase slug keys (AC-4, AC-8)
    for (const mut of pendingQueue) {
      if (!mut || !mut.type) continue;
      if (mut.type === "SYNC_CHAPTER") {
        const rawManga = mut.payload?.manga;
        const slug = normalizeSeriesKey(rawManga);
        const mChapter = mut.payload?.chapter;
        const mUrl = mut.payload?.url;
        const mTime = mut.timestamp || new Date().toISOString();
        if (slug) {
          const saved = Object.hasOwn(remoteVault.series, slug)
            ? remoteVault.series[slug]
            : undefined;
          const trimmedRaw = typeof rawManga === "string" ? rawManga.trim() : slug;
          const explicitTitle =
            typeof mut.payload?.title === "string" && mut.payload.title.trim()
              ? mut.payload.title.trim()
              : "";
          const candidateTitle = pickPreferredTitle(explicitTitle, trimmedRaw, slug);
          const mTitle = pickPreferredTitle(candidateTitle, saved?.title, slug);
          const mSite = deriveSite(mut.payload?.site, mUrl) || saved?.site || "";

          if (!saved || shouldUpdateProgress(mChapter, mTime, saved.chapter, saved.updated)) {
            const nextEntry = {
              chapter: mChapter,
              title: mTitle,
              site: mSite,
              updated: mTime,
            };
            if (mUrl !== undefined) {
              nextEntry.url = mUrl;
            } else if (saved?.url !== undefined) {
              nextEntry.url = saved.url;
            }
            remoteVault.series[slug] = nextEntry;
          } else {
            console.log(`[Sanctum] Reconciliation monotonic guard skipped ${slug} Ch. ${mChapter}`);
          }
        }
      } else if (mut.type === "DELETE_SERIES") {
        const slug = normalizeSeriesKey(mut.payload?.manga);
        if (slug && remoteVault.series) {
          if (Object.hasOwn(remoteVault.series, slug)) {
            delete remoteVault.series[slug];
          }
        }
      }
    }

    // 5. Upload merged vault back to Drive
    try {
      await uploadDriveVault(fileId, token, remoteVault);
    } catch (uploadErr) {
      console.error("❌ [Sanctum] uploadDriveVault error:", uploadErr);
      setErrorBadge();
      return { status: "error", error: uploadErr };
    }

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
  } catch (unexpectedErr) {
    console.error("❌ [Sanctum] reconcileAndSync unexpected error:", unexpectedErr);
    setErrorBadge();
    return { status: "error", error: unexpectedErr };
  }
}

function handleMessage(message, sender, sendResponse) {
  if (!message || typeof message !== "object") return;

  if (message.type === "SYNC_CHAPTER") {
    enqueueOperation(async () => {
      try {
        const rawManga = message.payload?.manga;
        const slug = normalizeSeriesKey(rawManga);
        if (!slug) {
          console.warn("[Sanctum] SYNC_CHAPTER rejected: invalid mangaName", rawManga);
          if (typeof sendResponse === "function") {
            sendResponse({ status: "ignored", reason: "invalid_manga_name" });
          }
          return;
        }

        const displayName = rawManga.trim();
        const newChapter = message.payload?.chapter;
        const newUrl = message.payload?.url;
        const nowIso = new Date().toISOString();

        const storage = await getStorage(["series", "pending_sync"]);
        const { series: localSeries } = migrateSeriesMap(storage.series);

        // 1. Monotonic guard check against current cached local series entry
        const savedEntry = Object.hasOwn(localSeries, slug) ? localSeries[slug] : undefined;
        if (savedEntry) {
          const allowed = shouldUpdateProgress(newChapter, nowIso, savedEntry.chapter, savedEntry.updated);
          if (!allowed) {
            console.log(
              `[Sanctum] Monotonic guard rejected: ${slug} Ch. ${newChapter} < current Ch. ${savedEntry.chapter}`,
            );
            if (typeof sendResponse === "function") {
              sendResponse({ status: "ignored", reason: "monotonic_downgrade" });
            }
            return;
          }
        }

        const explicitTitle =
          typeof message.payload?.title === "string" && message.payload.title.trim()
            ? message.payload.title.trim()
            : "";
        const candidateTitle = pickPreferredTitle(explicitTitle, displayName, slug);
        const resolvedTitle = pickPreferredTitle(candidateTitle, savedEntry?.title, slug);
        const resolvedSite = deriveSite(message.payload?.site, newUrl) || savedEntry?.site || "";

        // 2. Optimistic local cache update
        const nextEntry = {
          chapter: newChapter,
          title: resolvedTitle,
          site: resolvedSite,
          updated: nowIso,
        };
        if (newUrl !== undefined) {
          nextEntry.url = newUrl;
        } else if (savedEntry?.url !== undefined) {
          nextEntry.url = savedEntry.url;
        }
        localSeries[slug] = nextEntry;
        await setStorage({ series: localSeries });

        const liveMutation = {
          type: "SYNC_CHAPTER",
          payload: {
            manga: slug,
            title: resolvedTitle,
            chapter: newChapter,
            url: newUrl,
            site: resolvedSite,
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
          clearBadge();
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
        const rawManga = message.payload?.manga;
        const slug = normalizeSeriesKey(rawManga);
        if (!slug) {
          console.warn("[Sanctum] DELETE_SERIES rejected: invalid mangaName", rawManga);
          if (typeof sendResponse === "function") {
            sendResponse({ status: "error", error: "Invalid manga name" });
          }
          return;
        }

        const nowIso = new Date().toISOString();

        // 1. Optimistic local cache delete
        const storage = await getStorage(["series", "pending_sync"]);
        const { series: localSeries, changed: localMigrated } = migrateSeriesMap(storage.series);
        if (Object.hasOwn(localSeries, slug)) {
          delete localSeries[slug];
          await setStorage({ series: localSeries });
        } else if (localMigrated) {
          await setStorage({ series: localSeries });
        }

        const liveMutation = {
          type: "DELETE_SERIES",
          payload: { manga: slug },
          timestamp: nowIso,
        };

        // 2. Offline check
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (isOffline) {
          const freshStorage = await getStorage(["pending_sync"]);
          const q = Array.isArray(freshStorage.pending_sync) ? [...freshStorage.pending_sync] : [];
          q.push(liveMutation);
          await setStorage({ pending_sync: q });
          clearBadge();
          sendResponse({ status: "success" });
          return;
        }

        // 3. Online sync
        const syncResult = await reconcileAndSync({ liveMutation, interactive: false });
        if (syncResult.status === "success" || syncResult.status === "not_found") {
          clearBadge();
          sendResponse({ status: "success" });
        } else {
          const freshStorage = await getStorage(["pending_sync"]);
          const q = Array.isArray(freshStorage.pending_sync) ? [...freshStorage.pending_sync] : [];
          q.push(liveMutation);
          await setStorage({ pending_sync: q });
          sendResponse({ status: "queued" });
        }
      } catch (err) {
        console.error("[Sanctum] Delete Failed:", err);
        setErrorBadge();
        sendResponse({ status: "error", error: err?.message || String(err) });
      }
    });
    return true; // Keep channel open for sendResponse
  }

  if (message.type === "SYNC_VAULT") {
    enqueueOperation(async () => {
      try {
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (isOffline) {
          await migrateStorageSchema();
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
          clearBadge();
          sendResponse({
            status: "success",
            series: syncResult.series || {},
            lastSync: syncResult.lastSync,
          });
        } else {
          await migrateStorageSchema();
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

if (typeof chrome !== "undefined" && chrome.runtime) {
  if (chrome.runtime.onInstalled && typeof chrome.runtime.onInstalled.addListener === "function") {
    chrome.runtime.onInstalled.addListener(() => {
      enqueueOperation(() => migrateStorageSchema());
    });
  }
  if (chrome.runtime.onStartup && typeof chrome.runtime.onStartup.addListener === "function") {
    chrome.runtime.onStartup.addListener(() => {
      enqueueOperation(() => migrateStorageSchema());
    });
  }
}

if (typeof module === "undefined") {
  enqueueOperation(() => migrateStorageSchema());
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  self.addEventListener("online", () => {
    enqueueOperation(async () => {
      try {
        const storage = await getStorage(["pending_sync"]);
        if (storage.pending_sync && storage.pending_sync.length > 0) {
          await reconcileAndSync();
        }
      } catch (err) {
        console.error("❌ [Sanctum] Online sync listener error:", err);
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
    clearBadge,
    getBadgeClearTimer: () => badgeClearTimer,
    handleMessage,
    getStorage,
    setStorage,
    isValidMangaName,
    normalizeSeriesKey,
    deriveSite,
    pickPreferredTitle,
    mergeDuplicateSeriesEntries,
    migrateSeriesMap,
    reconcileSeriesMaps,
    migrateStorageSchema,
    parseChapter,
    compareChapterParts,
    shouldUpdateProgress,
    fetchAndValidateDriveVault,
    uploadDriveVault,
    reconcileAndSync,
  };
}
