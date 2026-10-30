const HISTORY_FILE = "sanctum_history.json";

let syncQueue = Promise.resolve();

function enqueueOperation(operation) {
  const next = syncQueue.then(operation, operation);
  syncQueue = next.catch(() => {});
  return next;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SYNC_CHAPTER") {
    enqueueOperation(async () => {
      try {
        chrome.action.setBadgeText({ text: "..." });
        const tokenObj = await chrome.identity.getAuthToken({
          interactive: true,
        });
        const token = tokenObj?.token;
        if (!token) throw new Error("No auth token received");

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
          if (text.trim()) {
            try {
              const parsed = JSON.parse(text);
              if (parsed && typeof parsed === "object") {
                data = parsed;
              }
            } catch (parseErr) {
              console.warn(
                "[Sanctum] Existing file JSON malformed, resetting:",
                parseErr,
              );
            }
          }
        } else if (response.status !== 404) {
          throw new Error(`Drive fetch failed with status ${response.status}`);
        }

        if (!data.series || typeof data.series !== "object") {
          data.series = {};
        }

        // Update entry
        data.series[message.payload.manga] = {
          chapter: message.payload.chapter,
          url: message.payload.url,
          updated: new Date().toISOString(),
        };

        // Upload back to Drive
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

        console.log("✅ [Sanctum] Vault Updated:", message.payload.manga);
        chrome.action.setBadgeText({ text: "OK" });
        chrome.action.setBadgeBackgroundColor({ color: "#27ae60" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
      } catch (err) {
        console.error("❌ [Sanctum] Sync Failed:", err.message);
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
      }
    });
    return true;
  }

  if (message.type === "DELETE_SERIES") {
    enqueueOperation(async () => {
      try {
        const tokenObj = await chrome.identity.getAuthToken({
          interactive: true,
        });
        const token = tokenObj?.token;
        if (!token) throw new Error("No auth token received");

        const fileId = await findFile(token);

        if (fileId) {
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );

          if (!response.ok) {
            throw new Error(`Drive fetch failed with status ${response.status}`);
          }

          let data = await response.json();
          if (data && data.series && typeof data.series === "object") {
            delete data.series[message.payload.manga];
          }

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
        }
        sendResponse({ status: "success" });
      } catch (err) {
        console.error("[Sanctum] Delete Failed:", err);
        sendResponse({ status: "error" });
      }
    });
    return true; // Keep channel open for sendResponse
  }
});

async function findFile(token) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${HISTORY_FILE}' and trashed=false`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) return null;
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
  if (!res.ok) throw new Error(`Drive create failed with status ${res.status}`);
  const file = await res.json();
  return file.id;
}
