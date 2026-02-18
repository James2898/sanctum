const listElement = document.getElementById("list");
const loadingElement = document.getElementById("loading");
const statusElement = document.getElementById("status");
const refreshBtn = document.getElementById("refresh-btn");
const searchInput = document.getElementById("search-field");
const IS_DEV_MODE = false;

let allSeries = [];
const mockData = {
  series: {
    "childhood friend of the zenith": {
      chapter: "93",
      url: "https://asuracomic.net/series/childhood-friend-of-the-zenith-a137c072/chapter/93",
      updated: "2026-02-15T09:18:35.046Z",
    },
    "dead tube": {
      chapter: "112",
      url: "https://www.mangahere.cc/manga/dead_tube/c112/1.html#ipg38",
      updated: "2026-02-16T10:29:53.599Z",
    },
    "gachi akuta": {
      chapter: "162.5",
      url: "https://www.mangahere.cc/manga/gachi_akuta/c162.5/15.html",
      updated: "2026-02-11T23:52:44.307Z",
    },
    haikyu: {
      chapter: "402",
      url: "https://www.mangahere.cc/manga/haikyu/c402/1.html",
      updated: "2026-02-05T04:04:56.705Z",
    },
    "Hochiya-san wa Amariaru": {
      chapter: "1",
      url: "https://mangadex.org/chapter/06b6fdbd-2e3b-4fd1-af43-24509d2d7e28/9",
      updated: "2026-02-12T08:33:57.600Z",
    },
    "Ichi the Witch": {
      chapter: 70,
      url: "https://mangaplus.shueisha.co.jp/viewer/1028143",
      updated: "2026-02-16T01:41:01.756Z",
    },
    "Mousou Sensei": {
      chapter: "5",
      url: "https://mangadex.org/chapter/795e85f5-754e-4c05-ae7d-b21480aab7e8",
      updated: "2026-02-16T09:49:09.743Z",
    },
    "ogami tsumiki to kinichijou": {
      chapter: "067",
      url: "https://www.mangahere.cc/manga/ogami_tsumiki_to_kinichijou/c067/1.html",
      updated: "2026-02-15T09:23:23.142Z",
    },
    "Ookii Muki Muki Chiisai Muchi Muchi": {
      chapter: "32",
      url: "https://mangadex.org/chapter/fd0a8958-479d-41e7-a8ff-28562c55aca6/14",
      updated: "2026-02-10T23:47:35.711Z",
    },
    "raising villains the right way": {
      chapter: "226",
      url: "https://asuracomic.net/series/raising-villains-the-right-way-d53bec38/chapter/222",
      updated: "2026-02-15T09:23:52.790Z",
    },
    "shangri la frontier": {
      chapter: "254",
      url: "https://www.mangahere.cc/manga/shangri_la_frontier/c254/1.html#ipg18",
      updated: "2026-02-10T02:27:27.223Z",
    },
    "Shibou Yuugi de Meshi wo Kuu.": {
      chapter: "4",
      url: "https://mangadex.org/chapter/e171ce23-9b11-444a-9d99-a800d718c3d3/32",
      updated: "2026-02-12T08:38:32.891Z",
    },
    "survival story of a sword king in a fantasy world": {
      chapter: "059",
      url: "https://www.mangahere.cc/manga/survival_story_of_a_sword_king_in_a_fantasy_world/c059/1.html#ipg2",
      updated: "2026-02-13T22:44:26.856Z",
    },
    "the knight king who returned with a god": {
      chapter: "150",
      url: "https://asuracomic.net/series/the-knight-king-who-returned-with-a-god-059bea61/chapter/150",
      updated: "2026-02-11T23:49:01.206Z",
    },
    "the max level hero has returned": {
      chapter: "226",
      url: "https://asuracomic.net/series/the-max-level-hero-has-returned-16db2f56/chapter/226",
      updated: "2026-02-05T03:37:40.159Z",
    },
    "the ultimate shut in": {
      chapter: "7",
      url: "https://asuracomic.net/series/the-ultimate-shut-in-1c94d41f/chapter/7",
      updated: "2026-02-05T03:37:17.512Z",
    },
    "Toru ni Taranai": {
      chapter: "4",
      url: "https://mangadex.org/chapter/a8d82fdf-2c46-4cb6-ad51-1573ef61705d/21",
      updated: "2026-02-13T22:43:37.868Z",
    },
    "Tsuihou Sareru Tabi ni Skill o Te ni Ireta Ore ga, 100 no Isekai de 2-shuume Musou":
      {
        chapter: "27.4",
        url: "https://mangadex.org/chapter/7072ea33-02fb-4c7e-a3a4-fda97ed7b833/9",
        updated: "2026-02-07T23:29:10.787Z",
      },
    "tsuki ga michibiku isekai douchuu": {
      chapter: "114",
      url: "https://www.mangahere.cc/manga/tsuki_ga_michibiku_isekai_douchuu/c114/1.html#ipg28",
      updated: "2026-02-09T05:11:17.759Z",
    },
    "Ueno-kun wa Kaihatsuzumi": {
      chapter: "66",
      url: "https://mangadex.org/chapter/e1951c73-f118-47f0-b2dc-2cf58c0de609/18",
      updated: "2026-02-16T19:17:53.351Z",
    },
  },
};

const renderList = (series) => {
  if (series.length === 0) {
    listElement.innerHTML =
      "<div class='status'>Vault is empty. Start reading!</div>";
  }

  listElement.innerHTML = "";

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
    var siteTag = "???";
    var tagColor = "#27ae60";
    if (info.url) {
      if (info.url.includes("mangadex")) {
        siteTag = "Mangadex"; // Shortened for better fit next to chapter
        tagColor = "#ff6740";
      }
      if (info.url.includes("asuracomic")) {
        siteTag = "AsuraScans";
        tagColor = "#7d42ff";
      }
      if (info.url.includes("mangahere")) {
        siteTag = "Mangahere";
        tagColor = "rgb(231, 49, 255)";
      }
      if (info.url.includes("mangaplus")) {
        siteTag = "MangaPlus";
        tagColor = "rgb(0, 0, 0)";
      }
    }

    card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom: 4px;">
      <span class="manga-title" style="flex: 1; padding-right: 10px;">${name}</span>
      <span style="font-size: 10px; color: #777; white-space: nowrap;">${lastUpdated}</span>
    </div>
    
    <div class="manga-info" style="display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size:12px; padding:1px 4px; background:none; color:${tagColor}; font-weight: bold;">${siteTag}</span>
        <span style="font-size: 13px;">Chapter ${info.chapter}</span>
      </div>
      
      <div class="manga-actions">
        <a href="${info.url}" target="_blank" class="btn-read">
          <img src="arrow-right.svg" />
        </a>
        <button class="btn-delete" data-manga="${name}">
          <img src="trash.svg" /> 
        </button>
      </div>
    </div>
  `;

    // ... (Keep your existing Delete Click listener here)
    card.querySelector(".btn-delete").addEventListener("click", function () {
      const mangaName = this.getAttribute("data-manga");
      if (confirm(`Delete ${mangaName} from your history?`)) {
        this.innerText = "Deleting...";
        chrome.runtime.sendMessage(
          {
            type: "DELETE_SERIES",
            payload: { manga: mangaName },
          },
          (response) => {
            if (response.status === "success") {
              card.remove();
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

const loadVault = async () => {
  if (IS_DEV_MODE) {
    console.log("🛠️ Sanctum: Using Mock Data");

    // Process exactly like real API data
    allSeries = Object.entries(mockData.series).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    renderList(allSeries);
    loadingElement.style.display = "none";
    return; // Skip the actual fetch
  }

  try {
    // 1. Get the token
    const tokenObj = await chrome.identity.getAuthToken({ interactive: true });

    // 2. Find the file
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='sanctum_history.json' and trashed=false`,
      {
        headers: { Authorization: `Bearer ${tokenObj.token}` },
      },
    );
    const { files } = await searchRes.json();

    if (!files || files.length === 0) {
      loadingElement.innerText = "No history found in Vault.";
      return;
    }

    // 3. Fetch the JSON content
    const contentRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`,
      {
        headers: { Authorization: `Bearer ${tokenObj.token}` },
      },
    );
    const data = await contentRes.json();

    // 4. Render the Dashboard
    loadingElement.style.display = "none";
    allSeries = Object.entries(data.series).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    renderList(allSeries);

    statusElement.innerText = `Last updated: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error(err);
    loadingElement.innerText = "Error accessing Vault.";
    statusElement.innerText = "Check your connection.";
  }
};

// Search Field
searchInput.addEventListener("input", (e) => {
  const searchText = e.target.value.toLowerCase();
  const filteredSeries = allSeries.filter(([name]) =>
    name.toLowerCase().includes(searchText),
  );

  renderList(filteredSeries);
});

// Refresh Button
refreshBtn.addEventListener("click", () => {
  refreshBtn.classList.add("spinning");
  listElement.innerHTML = "";
  listElement.scrollTop = 0;
  loadingElement.style.display = "block";
  loadingElement.innerText = "Fetching you records...";

  loadVault().finally(() => {
    setTimeout(() => {
      refreshBtn.classList.remove("spinning");
    }, 500);
  });
});

document.addEventListener("DOMContentLoaded", () => {
  loadVault();
});
