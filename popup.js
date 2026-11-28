let listElement = null;
let loadingElement = null;
let statusElement = null;
let refreshBtn = null;
let sortBtn = null;
let searchInput = null;
let searchBtn = null;
let filterContainer = null;

let allSeries = [];
let currentSort = "recent";

function isSafeUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidPopupSeriesKey(name) {
  if (typeof name !== "string") return false;
  const normalized = name.trim().toLowerCase();
  if (normalized.length === 0) return false;
  if (
    normalized === "__proto__" ||
    normalized === "constructor" ||
    normalized === "prototype"
  ) {
    return false;
  }
  return true;
}

function getDisplayTitle(key, info) {
  if (info && typeof info.title === "string" && info.title.trim().length > 0) {
    return info.title.trim();
  }
  return typeof key === "string" ? key.trim() : String(key || "");
}

function normalizePopupSeriesEntries(seriesObj) {
  if (!seriesObj || typeof seriesObj !== "object" || Array.isArray(seriesObj)) {
    return [];
  }
  const bySlug = Object.create(null);
  for (const rawKey of Object.keys(seriesObj)) {
    if (!Object.hasOwn(seriesObj, rawKey)) continue;
    if (!isValidPopupSeriesKey(rawKey)) continue;
    const rawInfo = seriesObj[rawKey];
    if (!rawInfo || typeof rawInfo !== "object" || Array.isArray(rawInfo)) continue;

    const slug = rawKey.toLowerCase().trim();
    const displayTitle = getDisplayTitle(rawKey, rawInfo);

    if (!Object.hasOwn(bySlug, slug)) {
      bySlug[slug] = [rawKey, { ...rawInfo, title: displayTitle }];
    } else {
      const [existingKey, existingInfo] = bySlug[slug];
      const exTime =
        typeof existingInfo.updated === "string" && existingInfo.updated.trim()
          ? Date.parse(existingInfo.updated)
          : NaN;
      const inTime =
        typeof rawInfo.updated === "string" && rawInfo.updated.trim()
          ? Date.parse(rawInfo.updated)
          : NaN;
      const exValid = !Number.isNaN(exTime);
      const inValid = !Number.isNaN(inTime);
      const incomingWins =
        (inValid && !exValid) || (inValid && exValid && inTime > exTime);
      const winnerInfo = incomingWins ? rawInfo : existingInfo;
      const loserInfo = incomingWins ? existingInfo : rawInfo;
      const winnerTitle = getDisplayTitle(
        incomingWins ? rawKey : existingKey,
        winnerInfo,
      );
      const loserTitle = getDisplayTitle(
        incomingWins ? existingKey : rawKey,
        loserInfo,
      );
      const preferredTitle =
        winnerTitle === slug &&
        loserTitle !== slug &&
        loserTitle.toLowerCase() === slug
          ? loserTitle
          : winnerTitle;

      bySlug[slug] = [
        slug,
        {
          ...loserInfo,
          ...winnerInfo,
          title: preferredTitle,
          site: winnerInfo.site || loserInfo.site || "",
        },
      ];
    }
  }
  return Object.keys(bySlug).map((s) => bySlug[s]);
}

function sortSeriesEntries(entries, sortMode = currentSort) {
  if (!Array.isArray(entries)) return [];
  const isAz = sortMode === "az" || sortMode === "A–Z" || sortMode === "A-Z";
  return [...entries].sort((a, b) => {
    const titleA = getDisplayTitle(a[0], a[1]).toLowerCase();
    const titleB = getDisplayTitle(b[0], b[1]).toLowerCase();
    if (isAz) {
      return titleA.localeCompare(titleB);
    }
    const updatedCmp = String(b[1]?.updated || "").localeCompare(
      String(a[1]?.updated || ""),
    );
    return updatedCmp !== 0 ? updatedCmp : titleA.localeCompare(titleB);
  });
}

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

const renderList = (series, isFilterActive = allSeries.length > 0) => {
  if (!listElement || typeof document === "undefined") return;

  const fragment = document.createDocumentFragment();

  if (!Array.isArray(series) || series.length === 0) {
    const statusDiv = document.createElement("div");
    statusDiv.className = "status";
    statusDiv.textContent = isFilterActive
      ? "No matching series found."
      : "Vault is empty. Start reading!";
    fragment.appendChild(statusDiv);
    listElement.replaceChildren(fragment);
    return;
  }

  series.forEach(([name, info]) => {
    const safeInfo = info && typeof info === "object" ? info : {};
    const card = document.createElement("div");
    card.className = "manga-card";
    card.setAttribute("data-manga", name);

    // 1. Date Formatting
    const parsedTime =
      typeof safeInfo.updated === "string" && safeInfo.updated.trim()
        ? Date.parse(safeInfo.updated)
        : NaN;
    const lastUpdated = !Number.isNaN(parsedTime)
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(parsedTime))
      : "Date Unknown";

    // 2. Site Logic
    let siteTag = "???";
    let tagColor = "#27ae60";
    const siteSource = (safeInfo.site || safeInfo.url || "").toLowerCase();
    if (siteSource) {
      if (siteSource.includes("mangadex")) {
        siteTag = "Mangadex";
        tagColor = "#ff6740";
      } else if (siteSource.includes("asura")) {
        siteTag = "AsuraScans";
        tagColor = "#7d42ff";
      } else if (siteSource.includes("mangahere")) {
        siteTag = "Mangahere";
        tagColor = "rgb(231, 49, 255)";
      } else if (siteSource.includes("mangaplus")) {
        siteTag = "MangaPlus";
        tagColor = "#efefef";
      } else if (siteSource.includes("kunmanga")) {
        siteTag = "KunManga";
        tagColor = "rgb(1, 255, 183)";
      }
    }

    // Build header row safely
    const headerRow = document.createElement("div");
    headerRow.style.cssText =
      "display:flex; justify-content:space-between; align-items:start; margin-bottom: 4px;";

    const titleEl = document.createElement("span");
    titleEl.className = "manga-title";
    titleEl.style.cssText = "flex: 1; padding-right: 10px;";
    titleEl.textContent = getDisplayTitle(name, safeInfo);

    const dateEl = document.createElement("span");
    dateEl.style.cssText = "font-size: 10px; color: #777; white-space: nowrap;";
    dateEl.textContent = lastUpdated;

    headerRow.appendChild(titleEl);
    headerRow.appendChild(dateEl);

    // Build info row safely
    const infoRow = document.createElement("div");
    infoRow.className = "manga-info";
    infoRow.style.cssText =
      "display: flex; align-items: center; justify-content: space-between;";

    const tagGroup = document.createElement("div");
    tagGroup.style.cssText = "display: flex; align-items: center; gap: 6px;";

    const tagSpan = document.createElement("span");
    tagSpan.style.cssText = `font-size:12px; padding:1px 4px; background:none; color:${tagColor}; font-weight: bold;`;
    tagSpan.textContent = siteTag;

    const chapterSpan = document.createElement("span");
    chapterSpan.style.cssText = "font-size: 13px;";
    chapterSpan.textContent = `Chapter ${safeInfo.chapter ?? ""}`;

    tagGroup.appendChild(tagSpan);
    tagGroup.appendChild(chapterSpan);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "manga-actions";

    const readLink = document.createElement("a");
    readLink.className = "btn-read";
    readLink.target = "_blank";
    readLink.rel = "noopener noreferrer";
    const safeUrl = isSafeUrl(safeInfo.url) ? safeInfo.url : "#";
    readLink.href = safeUrl;
    readLink.setAttribute("href", safeUrl);
    const readImg = document.createElement("img");
    readImg.src = "arrow-right.svg";
    readImg.alt = "Continue reading";
    readLink.appendChild(readImg);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete";
    deleteBtn.setAttribute("data-manga", name);
    const deleteImg = document.createElement("img");
    deleteImg.src = "trash.svg";
    deleteImg.alt = "Delete series";
    deleteBtn.appendChild(deleteImg);

    actionsDiv.appendChild(readLink);
    actionsDiv.appendChild(deleteBtn);

    infoRow.appendChild(tagGroup);
    infoRow.appendChild(actionsDiv);

    card.appendChild(headerRow);
    card.appendChild(infoRow);

    fragment.appendChild(card);
  });

  listElement.replaceChildren(fragment);
};

function handleListClick(e) {
  const target = e && e.target;
  if (!target || typeof target.closest !== "function") return;

  const readLink = target.closest(".btn-read");
  if (readLink) {
    const href = readLink.getAttribute("href") || readLink.href || "";
    if (!isSafeUrl(href)) {
      if (typeof e.preventDefault === "function") {
        e.preventDefault();
      }
    }
    return;
  }

  const deleteBtn = target.closest(".btn-delete");
  if (!deleteBtn) return;

  if (deleteBtn.disabled || deleteBtn.getAttribute("data-deleting") === "true") {
    return;
  }

  const mangaKey = deleteBtn.getAttribute("data-manga");
  if (!mangaKey) return;

  const normalizedKey = mangaKey.toLowerCase().trim();
  const matchedEntry = allSeries.find(
    ([k]) => k.toLowerCase().trim() === normalizedKey,
  );
  const displayTitle = matchedEntry
    ? getDisplayTitle(matchedEntry[0], matchedEntry[1])
    : mangaKey;

  const confirmFn = typeof confirm === "function" ? confirm : () => true;
  if (!confirmFn(`Delete ${displayTitle} from your history?`)) {
    return;
  }

  deleteBtn.disabled = true;
  deleteBtn.setAttribute("data-deleting", "true");
  deleteBtn.textContent = "Deleting...";

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(
      {
        type: "DELETE_SERIES",
        payload: { manga: normalizedKey },
      },
      (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn("[Sanctum] Delete message error:", chrome.runtime.lastError);
          deleteBtn.disabled = false;
          deleteBtn.setAttribute("data-deleting", "false");
          deleteBtn.textContent = "Error";
          return;
        }
        if (response && (response.status === "success" || response.status === "queued")) {
          allSeries = allSeries.filter(
            ([n]) => n.toLowerCase().trim() !== normalizedKey,
          );
          const card = deleteBtn.closest(".manga-card");
          if (card && typeof card.remove === "function") {
            card.remove();
          }
          if (
            allSeries.length === 0 ||
            (listElement && listElement.children.length === 0)
          ) {
            applyFilters();
          }
        } else {
          deleteBtn.disabled = false;
          deleteBtn.setAttribute("data-deleting", "false");
          deleteBtn.textContent = "Error";
        }
      },
    );
  }
}

const applyFilters = () => {
  const searchText =
    searchInput && typeof searchInput.value === "string"
      ? searchInput.value.trim().toLowerCase()
      : "";
  const selectedFilter =
    (typeof document !== "undefined" &&
      document.querySelector('input[name="filter"]:checked')?.value) ||
    "all";

  if (allSeries.length === 0) {
    renderList([], false);
    return;
  }

  let filtered = sortSeriesEntries(allSeries, currentSort);
  if (selectedFilter !== "all") {
    filtered = filtered.filter(([, data]) =>
      (data?.site || data?.url || "").toLowerCase().includes(selectedFilter),
    );
  }
  if (searchText) {
    filtered = filtered.filter(([name, data]) =>
      getDisplayTitle(name, data).toLowerCase().includes(searchText),
    );
  }
  renderList(filtered, true);
};

const syncVault = async (opts = {}) => {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
    return;
  }

  const interactive = Boolean(opts.interactive);

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "SYNC_VAULT",
        payload: { interactive },
      },
      (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn("[Sanctum] SYNC_VAULT error:", chrome.runtime.lastError);
          if (loadingElement) loadingElement.style.display = "none";
          if (statusElement) {
            statusElement.textContent =
              allSeries.length === 0
                ? "Error accessing Vault. Check your connection."
                : "Sync failed (showing cached).";
          }
          resolve({ status: "error", error: chrome.runtime.lastError.message });
          return;
        }

        if (response && response.status === "success") {
          if (loadingElement) loadingElement.style.display = "none";
          const seriesData =
            response.series && typeof response.series === "object" ? response.series : {};
          allSeries = sortSeriesEntries(
            normalizePopupSeriesEntries(seriesData),
            currentSort,
          );
          applyFilters();
          if (statusElement) {
            const syncDate = response.lastSync ? new Date(response.lastSync) : new Date();
            statusElement.textContent = `Last updated: ${syncDate.toLocaleTimeString()}`;
          }
        } else {
          // Offline or sync failure: preserve cached series!
          if (loadingElement) loadingElement.style.display = "none";
          if (allSeries.length === 0) {
            renderList([], false);
            if (statusElement) {
              statusElement.textContent =
                response?.status === "offline"
                  ? "Offline mode."
                  : "Error accessing Vault. Check your connection.";
            }
          } else {
            if (statusElement) {
              statusElement.textContent =
                response?.status === "offline"
                  ? "Offline (showing cached)."
                  : "Sync failed (showing cached).";
            }
          }
        }
        resolve(response);
      },
    );
  });
};

const loadVault = async () => {
  let hasCachedData = false;
  // 1. Read local cache and render immediately (sub-10ms perceived latency)
  try {
    const cached = await getStorage(["series", "lastSync"]);
    if (cached && cached.series && typeof cached.series === "object") {
      const entries = normalizePopupSeriesEntries(cached.series);
      if (entries.length > 0) {
        hasCachedData = true;
        allSeries = sortSeriesEntries(entries, currentSort);
        if (loadingElement) loadingElement.style.display = "none";
        applyFilters();
        if (statusElement && cached.lastSync) {
          statusElement.textContent = `Last updated: ${new Date(cached.lastSync).toLocaleTimeString()}`;
        }
      }
    }
  } catch (err) {
    console.warn("[Sanctum] Could not read local cache:", err);
  }

  // 2. Trigger background cloud sync in parallel:
  // If cache is empty (first run / new install), trigger interactive auth so user can onboard
  await syncVault({ interactive: !hasCachedData });
};

function initPopupDom() {
  if (typeof document === "undefined") return;

  listElement = document.getElementById("list");
  loadingElement = document.getElementById("loading");
  statusElement = document.getElementById("status");
  refreshBtn = document.getElementById("refresh-btn");
  sortBtn = document.getElementById("sort-btn");
  searchInput = document.getElementById("search-field");
  searchBtn = document.getElementById("search-btn");
  filterContainer = document.getElementById("filter-container");

  if (listElement) {
    listElement.addEventListener("click", handleListClick);
  }

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", applyFilters);
  }

  if (sortBtn) {
    sortBtn.textContent = currentSort === "az" ? "A–Z" : "Recently Read";
    sortBtn.addEventListener("click", () => {
      currentSort = currentSort === "recent" ? "az" : "recent";
      sortBtn.textContent = currentSort === "az" ? "A–Z" : "Recently Read";
      allSeries = sortSeriesEntries(allSeries, currentSort);
      applyFilters();
    });
  }

  if (filterContainer) {
    filterContainer.addEventListener("change", (e) => {
      if (e.target && e.target.name === "filter") {
        applyFilters();
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshBtn.classList.add("spinning");
      if (allSeries.length === 0) {
        if (listElement && typeof listElement.replaceChildren === "function") {
          listElement.replaceChildren();
        }
        if (loadingElement) {
          loadingElement.style.display = "block";
        }
      }
      if (searchInput) searchInput.value = "";
      const allRadio = document.querySelector('input[name="filter"][value="all"]');
      if (allRadio) allRadio.checked = true;

      syncVault({ interactive: true }).finally(() => {
        setTimeout(() => {
          if (refreshBtn) refreshBtn.classList.remove("spinning");
        }, 500);
      });
    });
  }
}

if (typeof document !== "undefined") {
  initPopupDom();
  if (typeof module === "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      loadVault();
    });
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getStorage,
    renderList,
    applyFilters,
    syncVault,
    loadVault,
    initPopupDom,
    isSafeUrl,
    getDisplayTitle,
    normalizePopupSeriesEntries,
    sortSeriesEntries,
    getSortMode: () => currentSort,
    setSortMode: (mode) => {
      currentSort = mode === "az" || mode === "A–Z" || mode === "A-Z" ? "az" : "recent";
      if (sortBtn) {
        sortBtn.textContent = currentSort === "az" ? "A–Z" : "Recently Read";
      }
      allSeries = sortSeriesEntries(allSeries, currentSort);
    },
    getAllSeries: () => allSeries,
    setAllSeries: (s) => {
      allSeries = s;
    },
  };
}
