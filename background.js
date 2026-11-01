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
        let tokenObj;
        try {
          tokenObj = await chrome.identity.getAuthToken({
            interactive: false,
          });
        } catch (authErr) {
          throw new Error(
            chrome.runtime.lastError?.message ||
              authErr?.message ||
              "Background auth token retrieval failed",
          );
        }
        if (chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError.message);
        }
        const token = tokenObj?.token;
        if (!token) throw new Error("No auth token received");

        const lookup = await findFile(token);
        if (lookup.status === "error") {
          throw new Error(`Drive file lookup failed: ${lookup.error}`);
        }

        let fileId;
        if (lookup.status === "not_found") {
          fileId = await createFile(token);
        } else if (lookup.status === "found") {
          fileId = lookup.fileId;
        } else {
          throw new Error(`Unexpected lookup status: ${lookup.status}`);
        }

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
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
      }
    });
    return true;
  }

  if (message.type === "DELETE_SERIES") {
    enqueueOperation(async () => {
      try {
        const tokenObj = await chrome.identity.getAuthToken({
          interactive: false,
        });
        if (chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError.message);
        }
        const token = tokenObj?.token;
        if (!token) throw new Error("No auth token received");

        const lookup = await findFile(token);
        if (lookup.status === "error") {
          throw new Error(`Drive file lookup failed: ${lookup.error}`);
        }

        if (lookup.status === "found" && lookup.fileId) {
          const fileId = lookup.fileId;
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
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
        sendResponse({ status: "error" });
      }
    });
    return true; // Keep channel open for sendResponse
  }
});

async function findFile(token) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${HISTORY_FILE}' and trashed=false`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      return { status: "error", error: `HTTP ${res.status}` };
    }
    const { files } = await res.json();
    if (files && files.length > 0) {
      return { status: "found", fileId: files[0].id };
    }
    return { status: "not_found" };
  } catch (err) {
    return { status: "error", error: err.message || String(err) };
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
  if (!res.ok) throw new Error(`Drive create failed with status ${res.status}`);
  const file = await res.json();
  return file.id;
}
