document.addEventListener("DOMContentLoaded", async () => {
  const listElement = document.getElementById("list");
  const loadingElement = document.getElementById("loading");
  const statusElement = document.getElementById("status");

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
    const series = Object.entries(data.series).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    if (series.length === 0) {
      listElement.innerHTML =
        "<div class='status'>Vault is empty. Start reading!</div>";
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
      var siteTag = "???";
      var tagColor = "#27ae60";
      if (info.url) {
        if (info.url.includes("mangadex")) {
          siteTag = "MD"; // Shortened for better fit next to chapter
          tagColor = "#ff6740";
        }
        if (info.url.includes("asuracomic")) {
          siteTag = "AS";
          tagColor = "#7d42ff";
        }
        if (info.url.includes("mangahere")) {
          siteTag = "MH";
          tagColor = "rgb(231, 49, 255)";
        }
        if (info.url.includes("mangaplus")) {
          siteTag = "MP";
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
        <span style="font-size:9px; padding:1px 4px; border-radius:3px; background:${tagColor}; color:white; font-weight: bold;">${siteTag}</span>
        <span style="font-size: 13px;">Chapter ${info.chapter}</span>
      </div>
      
      <div class="manga-actions">
        <a href="${info.url}" target="_blank" class="btn-read">Continue</a>
        <button class="btn-delete" data-manga="${name}">X</button>
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

    statusElement.innerText = `Last updated: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error(err);
    loadingElement.innerText = "Error accessing Vault.";
    statusElement.innerText = "Check your connection.";
  }
});
