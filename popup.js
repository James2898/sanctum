const listElement = document.getElementById("list");
const loadingElement = document.getElementById("loading");
const statusElement = document.getElementById("status");
const refreshBtn = document.getElementById("refresh-btn");
const searchInput = document.getElementById("search-field");
const mangaPreview = document.getElementById("manga-preview");
const previewImage = document.getElementById("preview-img");
const filterContainer = document.getElementById("filter-container");

let allSeries = [];

previewImage.addEventListener("error", () => {
  mangaPreview.style.display = "none";
});

const renderList = (series) => {
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
    readLink.href = info.url || "#";
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
    if (info.cover) {
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
        chrome.runtime.sendMessage(
          {
            type: "DELETE_SERIES",
            payload: { manga: mangaName },
          },
          (response) => {
            if (response && response.status === "success") {
              allSeries = allSeries.filter(([n]) => n !== mangaName);
              card.remove();
              if (allSeries.length === 0) {
                listElement.innerHTML =
                  "<div class='status'>Vault is empty. Start reading!</div>";
              }
            } else {
              this.innerText = "Error";
            }
          },
        );
      }
    });

    listElement.appendChild(card);
  });
};

const applyFilters = () => {
  const searchText = searchInput.value.trim().toLowerCase();
  const selectedFilter =
    document.querySelector('input[name="filter"]:checked')?.value || "all";

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

const loadVault = async () => {
  try {
    // 1. Get the token
    const tokenObj = await chrome.identity.getAuthToken({ interactive: true });
    if (!tokenObj || !tokenObj.token) {
      throw new Error("Failed to get authentication token");
    }

    // 2. Find the file
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='sanctum_history.json' and trashed=false`,
      {
        headers: { Authorization: `Bearer ${tokenObj.token}` },
      },
    );
    if (!searchRes.ok) {
      throw new Error(`Drive search failed: ${searchRes.status}`);
    }
    const { files } = await searchRes.json();

    if (!files || files.length === 0) {
      loadingElement.style.display = "none";
      listElement.innerHTML =
        "<div class='status'>Vault is empty. Start reading!</div>";
      return;
    }

    // 3. Fetch the JSON content
    const contentRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`,
      {
        headers: { Authorization: `Bearer ${tokenObj.token}` },
      },
    );
    if (!contentRes.ok) {
      throw new Error(`Drive fetch failed: ${contentRes.status}`);
    }
    const data = await contentRes.json();

    // 4. Render the Dashboard
    loadingElement.style.display = "none";
    const seriesData =
      data && data.series && typeof data.series === "object" ? data.series : {};
    allSeries = Object.entries(seriesData).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    applyFilters();

    statusElement.innerText = `Last updated: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error(err);
    loadingElement.innerText = "Error accessing Vault.";
    statusElement.innerText = "Check your connection.";
  }
};

// Search Field & Filter By Mangasites
searchInput.addEventListener("input", applyFilters);
filterContainer.addEventListener("change", (e) => {
  if (e.target.name === "filter") {
    applyFilters();
  }
});

// Refresh Button
refreshBtn.addEventListener("click", () => {
  refreshBtn.classList.add("spinning");
  listElement.innerHTML = "";
  listElement.scrollTop = 0;
  loadingElement.style.display = "block";
  loadingElement.innerHTML = `<img src="refresh.svg" class="spinning" /><p>Fetching your records...</p>`;
  searchInput.value = "";
  const allRadio = document.querySelector('input[name="filter"][value="all"]');
  if (allRadio) allRadio.checked = true;

  loadVault().finally(() => {
    setTimeout(() => {
      refreshBtn.classList.remove("spinning");
    }, 500);
  });
});

document.addEventListener("DOMContentLoaded", () => {
  loadVault();
});
