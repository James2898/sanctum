let listElement = null;
let loadingElement = null;
let statusElement = null;
let refreshBtn = null;
let searchInput = null;
let mangaPreview = null;
let previewImage = null;
let filterContainer = null;

let allSeries = [];

function isSafeUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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

const renderList = (series) => {
  if (!listElement) return;
  listElement.innerHTML = "";

  if (series.length === 0) {
    listElement.innerHTML =
      "<div class='status'>Vault is empty. Start reading!</div>";
    return;
  }

  series.forEach(([name, info]) => {
    const card = document.createElement("div");
    card.className = "manga-card";

    // 1. Date Formatting
    const lastUpdated = info.updated
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(info.updated))
      : "Date Unknown";

    // 2. Site Logic
    let siteTag = "???";
    let tagColor = "#27ae60";
    if (info.url) {
      const lowerUrl = info.url.toLowerCase();
      if (lowerUrl.includes("mangadex")) {
        siteTag = "Mangadex";
        tagColor = "#ff6740";
      } else if (lowerUrl.includes("asura")) {
        siteTag = "AsuraScans";
        tagColor = "#7d42ff";
      } else if (lowerUrl.includes("mangahere")) {
        siteTag = "Mangahere";
        tagColor = "rgb(231, 49, 255)";
      } else if (lowerUrl.includes("mangaplus")) {
        siteTag = "MangaPlus";
        tagColor = "#efefef";
      } else if (lowerUrl.includes("kunmanga")) {
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
    titleEl.textContent = name;

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
    chapterSpan.textContent = `Chapter ${info.chapter ?? ""}`;

    tagGroup.appendChild(tagSpan);
    tagGroup.appendChild(chapterSpan);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "manga-actions";

    const readLink = document.createElement("a");
    readLink.className = "btn-read";
    readLink.target = "_blank";
    readLink.rel = "noopener noreferrer";
    readLink.href = isSafeUrl(info.url) ? info.url : "#";
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

    // Art Cover Preview Function
    if (info.cover && mangaPreview && previewImage) {
      titleEl.addEventListener("mouseenter", () => {
        previewImage.src = info.cover;
        mangaPreview.style.display = "block";
      });

      titleEl.addEventListener("mousemove", (e) => {
        const offset = 100;
        mangaPreview.style.left = e.clientX + "px";
        mangaPreview.style.top = e.clientY - offset + "px";
      });

      titleEl.addEventListener("mouseleave", () => {
        mangaPreview.style.display = "none";
        previewImage.src = "";
      });
    } else {
      titleEl.classList.add("no-cover");
    }

    // Delete Function
    deleteBtn.addEventListener("click", function () {
      const mangaName = this.getAttribute("data-manga");
      if (confirm(`Delete ${mangaName} from your history?`)) {
        this.innerText = "Deleting...";
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage(
            {
              type: "DELETE_SERIES",
              payload: { manga: mangaName },
            },
            (response) => {
              if (chrome.runtime && chrome.runtime.lastError) {
                console.warn("[Sanctum] Delete message error:", chrome.runtime.lastError);
                this.innerText = "Error";
                return;
              }
              if (response && (response.status === "success" || response.status === "queued")) {
                allSeries = allSeries.filter(([n]) => n !== mangaName);
                card.remove();
                if (allSeries.length === 0 && listElement) {
                  listElement.innerHTML =
                    "<div class='status'>Vault is empty. Start reading!</div>";
                }
              } else {
                this.innerText = "Error";
              }
            },
          );
        }
      }
    });

    listElement.appendChild(card);
  });
};

const applyFilters = () => {
  const searchText =
    searchInput && typeof searchInput.value === "string"
      ? searchInput.value.trim().toLowerCase()
      : "";
  const selectedFilter =
    (typeof document !== "undefined" &&
      document.querySelector('input[name="filter"]:checked')?.value) ||
    "all";

  let filtered = allSeries;
  if (selectedFilter !== "all") {
    filtered = filtered.filter(([, data]) =>
      data.url && data.url.toLowerCase().includes(selectedFilter),
    );
  }
  if (searchText) {
    filtered = filtered.filter(([name]) =>
      name.toLowerCase().includes(searchText),
    );
  }
  renderList(filtered);
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
            statusElement.innerText =
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
          allSeries = Object.entries(seriesData).sort((a, b) =>
            a[0].localeCompare(b[0]),
          );
          applyFilters();
          if (statusElement) {
            const syncDate = response.lastSync ? new Date(response.lastSync) : new Date();
            statusElement.innerText = `Last updated: ${syncDate.toLocaleTimeString()}`;
          }
        } else {
          // Offline or sync failure: preserve cached series!
          if (loadingElement) loadingElement.style.display = "none";
          if (allSeries.length === 0) {
            if (listElement) {
              listElement.innerHTML =
                "<div class='status'>Vault is empty. Start reading!</div>";
            }
            if (statusElement) {
              statusElement.innerText =
                response?.status === "offline"
                  ? "Offline mode."
                  : "Error accessing Vault. Check your connection.";
            }
          } else {
            if (statusElement) {
              statusElement.innerText =
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
      const entries = Object.entries(cached.series);
      if (entries.length > 0) {
        hasCachedData = true;
        allSeries = entries.sort((a, b) => a[0].localeCompare(b[0]));
        if (loadingElement) loadingElement.style.display = "none";
        applyFilters();
        if (statusElement && cached.lastSync) {
          statusElement.innerText = `Last updated: ${new Date(cached.lastSync).toLocaleTimeString()}`;
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
  searchInput = document.getElementById("search-field");
  mangaPreview = document.getElementById("manga-preview");
  previewImage = document.getElementById("preview-img");
  filterContainer = document.getElementById("filter-container");

  if (previewImage) {
    previewImage.addEventListener("error", () => {
      if (mangaPreview) mangaPreview.style.display = "none";
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
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
        if (listElement) listElement.innerHTML = "";
        if (loadingElement) {
          loadingElement.style.display = "block";
          loadingElement.innerHTML = `<img src="refresh.svg" class="spinning" /><p>Fetching your records...</p>`;
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
    getAllSeries: () => allSeries,
    setAllSeries: (s) => {
      allSeries = s;
    },
  };
}
