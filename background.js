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

function handleMessage(message, sender, sendResponse) {
  if (message.type === "SYNC_CHAPTER") {
    enqueueOperation(async () => {
      try {
        setInFlightBadge();

        let tokenObj;
        try {
          tokenObj = await chrome.identity.getAuthToken({
            interactive: false,
          });
        } catch (authErr) {
          console.error("❌ [Sanctum] Silent auth failed:", authErr);
          setErrorBadge();
          return;
        }

        const token = tokenObj?.token;
        if (!token) {
          console.error("❌ [Sanctum] No auth token received");
          setErrorBadge();
          return;
        }

        const searchResult = await findFile(token);
        let fileId;
        if (searchResult.status === "found") {
          fileId = searchResult.fileId;
        } else if (searchResult.status === "not_found") {
          fileId = await createFile(token);
        } else {
          console.error("❌ [Sanctum] findFile error:", searchResult.error);
          setErrorBadge();
          return;
        }

        // Fetch and parse content safely
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        let data;
        if (response.ok) {
          const text = await response.text();
          if (!text.trim()) {
            data = { series: {} };
          } else {
            try {
              const parsed = JSON.parse(text);
              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                console.warn(
                  "⚠️ [Sanctum] Drive file is not a valid JSON object, aborting write to prevent data loss:",
                  text,
                );
                setErrorBadge();
                return;
              }
              data = parsed;
            } catch (parseErr) {
              console.warn(
                "⚠️ [Sanctum] Drive file JSON malformed, aborting write to prevent data loss:",
                parseErr,
              );
              setErrorBadge();
              return;
            }
          }
        } else if (response.status !== 404) {
          throw new Error(`Drive fetch failed with status ${response.status}`);
        } else {
          data = { series: {} };
        }

        if (!data.series || typeof data.series !== "object" || Array.isArray(data.series)) {
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
        setSuccessBadge();
      } catch (err) {
        console.error("❌ [Sanctum] Sync Failed:", err.message);
        setErrorBadge();
      }
    });
    // Do not return true: SYNC_CHAPTER is fire-and-forget and does not call sendResponse
    return;
  }

  if (message.type === "DELETE_SERIES") {
    enqueueOperation(async () => {
      try {
        let tokenObj;
        try {
          tokenObj = await chrome.identity.getAuthToken({
            interactive: false,
          });
        } catch (authErr) {
          console.error("[Sanctum] Delete Auth Failed:", authErr);
          setErrorBadge();
          sendResponse({ status: "error" });
          return;
        }

        const token = tokenObj?.token;
        if (!token) {
          setErrorBadge();
          sendResponse({ status: "error" });
          return;
        }

        const searchResult = await findFile(token);
        if (searchResult.status === "error") {
          console.error("[Sanctum] Delete findFile error:", searchResult.error);
          setErrorBadge();
          sendResponse({ status: "error" });
          return;
        }

        if (searchResult.status === "found") {
          const fileId = searchResult.fileId;
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );

          if (!response.ok) {
            throw new Error(`Drive fetch failed with status ${response.status}`);
          }

          let data;
          const text = await response.text();
          if (!text.trim()) {
            data = { series: {} };
          } else {
            try {
              const parsed = JSON.parse(text);
              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                console.warn(
                  "⚠️ [Sanctum] Delete: Drive file JSON is not a valid object, aborting:",
                  text,
                );
                setErrorBadge();
                sendResponse({ status: "error" });
                return;
              }
              data = parsed;
            } catch (parseErr) {
              console.warn(
                "⚠️ [Sanctum] Delete: Drive file JSON malformed, aborting:",
                parseErr,
              );
              setErrorBadge();
              sendResponse({ status: "error" });
              return;
            }
          }

          if (data && data.series && typeof data.series === "object" && !Array.isArray(data.series)) {
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

        setSuccessBadge();
        sendResponse({ status: "success" });
      } catch (err) {
        console.error("[Sanctum] Delete Failed:", err);
        setErrorBadge();
        sendResponse({ status: "error" });
      }
    });
    return true; // Keep channel open for sendResponse
  }
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(handleMessage);
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
    getBadgeClearTimer: () => badgeClearTimer,
    handleMessage,
  };
}
