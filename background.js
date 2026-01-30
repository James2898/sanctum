const HISTORY_FILE = "sanctum_history.json";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SYNC_CHAPTER") {
    (async () => {
      try {
        chrome.action.setBadgeText({ text: "..." });
        const tokenObj = await chrome.identity.getAuthToken({
          interactive: true,
        });
        const token = tokenObj.token;

        let fileId = await findFile(token);
        if (!fileId) fileId = await createFile(token);

        // Fetch and parse content safely
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        let data = { series: {} };
        if (response.ok) {
          const text = await response.text();
          if (text.trim()) data = JSON.parse(text);
        }

        // Update entry
        data.series[message.payload.manga] = {
          chapter: message.payload.chapter,
          url: message.payload.url,
          updated: new Date().toISOString(),
        };

        // Upload back to Drive
        await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify(data),
          },
        );

        console.log("✅ [Sanctum] Vault Updated:", message.payload.manga);
        chrome.action.setBadgeText({ text: "OK" });
        chrome.action.setBadgeBackgroundColor({ color: "#27ae60" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
      } catch (err) {
        console.error("❌ [Sanctum] Sync Failed:", err.message);
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
      }
    })();
    return true;
  }
});

async function findFile(token) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${HISTORY_FILE}' and trashed=false`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const { files } = await res.json();
  return files && files.length > 0 ? files[0].id : null;
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
  const file = await res.json();
  return file.id;
}
