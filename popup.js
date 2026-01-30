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
    const series = Object.entries(data.series).sort(
      (a, b) => new Date(b[1].updated) - new Date(a[1].updated),
    );

    if (series.length === 0) {
      listElement.innerHTML =
        "<div class='status'>Vault is empty. Start reading!</div>";
    }

    series.forEach(([name, info]) => {
      const card = document.createElement("div");
      card.className = "manga-card";
      const cleanName = name.replace(/-/g, " ");

      card.innerHTML = `
        <span class="manga-title">${cleanName}</span>
        <div class="manga-info">
          <span>Chapter ${info.chapter}</span>
          <a href="${info.url}" target="_blank" class="btn-read">Continue</a>
        </div>
      `;
      listElement.appendChild(card);
    });

    statusElement.innerText = `Last updated: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error(err);
    loadingElement.innerText = "Error accessing Vault.";
    statusElement.innerText = "Check your connection.";
  }
});
