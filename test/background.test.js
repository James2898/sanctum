const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HISTORY_FILE,
  findFile,
  createFile,
  enqueueOperation,
  setErrorBadge,
  setSuccessBadge,
  setInFlightBadge,
  clearBadgeTimer,
  clearBadge,
  handleMessage,
  getStorage,
  setStorage,
  isValidMangaName,
  parseChapter,
  compareChapterParts,
  shouldUpdateProgress,
  fetchAndValidateDriveVault,
  uploadDriveVault,
  reconcileAndSync,
} = require("../background.js");

test("findFile: returns error when token is missing or falsy", async () => {
  const res1 = await findFile(null);
  assert.equal(res1.status, "error");
  assert.match(res1.error.message, /Missing auth token/i);

  const res2 = await findFile("");
  assert.equal(res2.status, "error");
  assert.match(res2.error.message, /Missing auth token/i);
});

test("findFile: returns error on non-OK HTTP status (401, 403, 429, 500)", async () => {
  const originalFetch = global.fetch;
  for (const status of [401, 403, 429, 500, 503]) {
    global.fetch = async () => ({
      ok: false,
      status,
      json: async () => ({ error: { message: "Failed" } }),
    });

    const res = await findFile("test-token");
    assert.equal(res.status, "error", `Should return error on HTTP ${status}`);
    assert.match(res.error.message, new RegExp(String(status)));
  }
  global.fetch = originalFetch;
});

test("findFile: returns error when network/fetch throws an exception", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("Network unreachable");
  };

  const res = await findFile("test-token");
  assert.equal(res.status, "error");
  assert.match(res.error.message, /Network unreachable/);

  global.fetch = originalFetch;
});

test("findFile: returns error when response schema is malformed (missing files array or missing id)", async () => {
  const originalFetch = global.fetch;

  // Missing files array
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ items: [] }),
  });
  const res1 = await findFile("test-token");
  assert.equal(res1.status, "error");
  assert.match(res1.error.message, /missing files array/i);

  // File item missing id
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ files: [{ name: "sanctum_history.json" }] }),
  });
  const res2 = await findFile("test-token");
  assert.equal(res2.status, "error");
  assert.match(res2.error.message, /missing id/i);

  global.fetch = originalFetch;
});

test("findFile: returns not_found when files array is empty", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(url, /q=name='sanctum_history.json'/);
    return {
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    };
  };

  const res = await findFile("test-token");
  assert.deepEqual(res, { status: "not_found" });

  global.fetch = originalFetch;
});

test("findFile: returns found with fileId when matching file exists", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      files: [{ id: "drive-file-123", name: "sanctum_history.json" }],
    }),
  });

  const res = await findFile("test-token");
  assert.deepEqual(res, { status: "found", fileId: "drive-file-123" });

  global.fetch = originalFetch;
});

test("findFile: deterministically selects first file when multiple matches exist", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      files: [
        { id: "drive-first-1", name: "sanctum_history.json" },
        { id: "drive-second-2", name: "sanctum_history.json" },
      ],
    }),
  });

  const res = await findFile("test-token");
  assert.deepEqual(res, { status: "found", fileId: "drive-first-1" });

  global.fetch = originalFetch;
});

test("createFile: creates file and returns fileId on success, throws on failure", async () => {
  const originalFetch = global.fetch;

  // Success
  global.fetch = async (url, options) => {
    assert.equal(options.method, "POST");
    assert.match(options.headers.Authorization, /Bearer my-token/);
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "new-file-999" }),
    };
  };

  const id = await createFile("my-token");
  assert.equal(id, "new-file-999");

  // Non-200 failure
  global.fetch = async () => ({
    ok: false,
    status: 403,
  });

  await assert.rejects(
    async () => createFile("my-token"),
    /Drive create failed with status 403/,
  );

  global.fetch = originalFetch;
});

test("badge functions: set correct text and colors, and clear pending badge timer", () => {
  const calls = [];
  const clearedTimerIds = [];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  try {
    let timerId = 50;
    let timerCb = null;
    global.setTimeout = (cb) => {
      timerCb = cb;
      return ++timerId;
    };
    global.clearTimeout = (id) => {
      clearedTimerIds.push(id);
    };

    global.chrome = {
      action: {
        setBadgeText: (arg) => calls.push({ type: "text", ...arg }),
        setBadgeBackgroundColor: (arg) => calls.push({ type: "bg", ...arg }),
      },
    };

    setSuccessBadge();
    const scheduledId = timerId;
    assert.deepEqual(calls.slice(-2), [
      { type: "text", text: "OK" },
      { type: "bg", color: "#27ae60" },
    ]);

    // Calling setErrorBadge must cancel the success timer so it doesn't wipe out error badge
    setErrorBadge();
    assert.ok(clearedTimerIds.includes(scheduledId), "Must cancel pending badge timer");
    assert.deepEqual(calls.slice(-2), [
      { type: "text", text: "!" },
      { type: "bg", color: "#c0392b" },
    ]);

    setInFlightBadge();
    assert.deepEqual(calls.slice(-2), [
      { type: "text", text: "..." },
      { type: "bg", color: "#7f8c8d" },
    ]);

    setSuccessBadge();
    if (timerCb) timerCb();
    assert.deepEqual(calls[calls.length - 1], { type: "text", text: "" });
  } finally {
    clearBadgeTimer();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    delete global.chrome;
  }
});

test("SYNC_CHAPTER: uses silent getAuthToken({ interactive: false }), aborts and sets error badge on silent auth failure", async () => {
  const badgeCalls = [];
  let authOptionsPassed = null;
  let createFileCalled = false;
  const originalFetch = global.fetch;

  try {
    global.chrome = {
      action: {
        setBadgeText: (arg) => badgeCalls.push({ type: "text", ...arg }),
        setBadgeBackgroundColor: (arg) => badgeCalls.push({ type: "bg", ...arg }),
      },
      identity: {
        getAuthToken: async (opts) => {
          authOptionsPassed = opts;
          throw new Error("User not signed in");
        },
      },
    };

    global.fetch = async (url, opts) => {
      if (opts && opts.method === "POST") createFileCalled = true;
      return { ok: true, status: 200, json: async () => ({ files: [] }) };
    };

    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Solo Leveling", chapter: "150", url: "https://test.com" },
      },
      {},
      () => {},
    );

    // Wait for queue to drain
    await enqueueOperation(async () => {});

    assert.deepEqual(authOptionsPassed, { interactive: false });
    assert.equal(createFileCalled, false, "createFile must not be called on auth failure");
    const lastText = badgeCalls.filter((c) => c.type === "text").pop();
    const lastBg = badgeCalls.filter((c) => c.type === "bg").pop();
    assert.equal(lastText.text, "!");
    assert.equal(lastBg.color, "#c0392b");
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("SYNC_CHAPTER: createFile() is called ONLY when findFile returns not_found, never on error", async () => {
  let createFileCount = 0;
  const badgeCalls = [];
  const originalSetTimeout = global.setTimeout;
  const originalFetch = global.fetch;

  try {
    global.setTimeout = () => 1;

    global.chrome = {
      action: {
        setBadgeText: (arg) => badgeCalls.push(arg),
        setBadgeBackgroundColor: (arg) => badgeCalls.push(arg),
      },
      identity: {
        getAuthToken: async () => ({ token: "valid-token" }),
      },
    };

    // Case 1: findFile returns error (HTTP 500) -> createFile NOT called
    global.fetch = async (url, opts) => {
      if (url.includes("/drive/v3/files?")) {
        return { ok: false, status: 500 };
      }
      if (opts?.method === "POST") {
        createFileCount++;
        return { ok: true, json: async () => ({ id: "created-file-id" }) };
      }
      return { ok: true, json: async () => ({}) };
    };

    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Solo Leveling", chapter: "150", url: "https://test.com" },
      },
      {},
      () => {},
    );
    await enqueueOperation(async () => {});

    assert.equal(createFileCount, 0, "createFile must not be called when findFile returns error");
    assert.equal(badgeCalls.some((c) => c.text === "!"), true);

    // Case 2: findFile returns found -> createFile NOT called
    badgeCalls.length = 0;
    createFileCount = 0;
    global.fetch = async (url, opts) => {
      if (url.includes("/drive/v3/files?")) {
        return {
          ok: true,
          json: async () => ({ files: [{ id: "existing-file-id" }] }),
        };
      }
      if (opts?.method === "POST") {
        createFileCount++;
        return { ok: true, json: async () => ({ id: "created-file-id" }) };
      }
      if (url.includes("/existing-file-id?alt=media")) {
        return {
          ok: true,
          text: async () => JSON.stringify({ series: {} }),
        };
      }
      if (opts?.method === "PATCH") {
        return { ok: true };
      }
      return { ok: true, json: async () => ({}) };
    };

    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Solo Leveling", chapter: "150", url: "https://test.com" },
      },
      {},
      () => {},
    );
    await enqueueOperation(async () => {});

    assert.equal(createFileCount, 0, "createFile must not be called when file is found");

    // Case 3: findFile returns not_found -> createFile IS called
    createFileCount = 0;
    global.fetch = async (url, opts) => {
      if (url.includes("/drive/v3/files?")) {
        return {
          ok: true,
          json: async () => ({ files: [] }),
        };
      }
      if (opts?.method === "POST" && url.endsWith("/files")) {
        createFileCount++;
        return { ok: true, json: async () => ({ id: "newly-created-file-id" }) };
      }
      if (url.includes("/newly-created-file-id?alt=media")) {
        return {
          ok: true,
          text: async () => JSON.stringify({ series: {} }),
        };
      }
      if (opts?.method === "PATCH") {
        return { ok: true };
      }
      return { ok: true, json: async () => ({}) };
    };

    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Solo Leveling", chapter: "150", url: "https://test.com" },
      },
      {},
      () => {},
    );
    await enqueueOperation(async () => {});

    assert.equal(createFileCount, 1, "createFile must be called strictly when status is not_found");
  } finally {
    global.setTimeout = originalSetTimeout;
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("SYNC_CHAPTER: aborts without calling PATCH and sets error badge on malformed or non-object Drive JSON", async () => {
  const originalFetch = global.fetch;
  const badgeCalls = [];

  try {
    global.chrome = {
      action: {
        setBadgeText: (arg) => badgeCalls.push(arg),
        setBadgeBackgroundColor: (arg) => badgeCalls.push(arg),
      },
      identity: {
        getAuthToken: async () => ({ token: "valid-token" }),
      },
    };

    for (const badContent of ["{ corrupt json", "[]", "null", "123"]) {
      badgeCalls.length = 0;
      let patchCalled = false;

      global.fetch = async (url, opts) => {
        if (url.includes("/drive/v3/files?")) {
          return {
            ok: true,
            json: async () => ({ files: [{ id: "sync-file-bad" }] }),
          };
        }
        if (url.includes("/sync-file-bad?alt=media")) {
          return {
            ok: true,
            text: async () => badContent,
          };
        }
        if (opts?.method === "PATCH") {
          patchCalled = true;
          return { ok: true };
        }
        return { ok: true, json: async () => ({}) };
      };

      handleMessage(
        {
          type: "SYNC_CHAPTER",
          payload: { manga: "Solo Leveling", chapter: "150", url: "https://test.com" },
        },
        {},
        () => {},
      );
      await enqueueOperation(async () => {});

      assert.equal(patchCalled, false, `PATCH must not be called when Drive JSON is: ${badContent}`);
      assert.equal(badgeCalls.some((c) => c.text === "!"), true, "Must set error badge text '!'");
      assert.equal(badgeCalls.some((c) => c.color === "#c0392b"), true, "Must set error badge color");
    }
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("SYNC_CHAPTER: concurrent calls via enqueueOperation only invoke createFile() once", async () => {
  const originalFetch = global.fetch;
  const originalSetTimeout = global.setTimeout;

  try {
    global.setTimeout = () => 1;
    let createFileCallCount = 0;
    let driveFileCreated = false;
    const existingFileId = "concur-file-id-42";

    global.chrome = {
      action: {
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {},
      },
      identity: {
        getAuthToken: async () => ({ token: "valid-token" }),
      },
    };

    global.fetch = async (url, opts) => {
      // Search Drive files: initially not found; once created, it's found
      if (url.includes("/drive/v3/files?")) {
        if (!driveFileCreated) {
          return {
            ok: true,
            json: async () => ({ files: [] }),
          };
        }
        return {
          ok: true,
          json: async () => ({ files: [{ id: existingFileId }] }),
        };
      }

      // Create file POST
      if (opts?.method === "POST" && url.endsWith("/files")) {
        createFileCallCount++;
        driveFileCreated = true;
        return {
          ok: true,
          json: async () => ({ id: existingFileId }),
        };
      }

      // Fetch file content
      if (url.includes(`/${existingFileId}?alt=media`)) {
        return {
          ok: true,
          text: async () => JSON.stringify({ series: {} }),
        };
      }

      // Patch
      if (opts?.method === "PATCH") {
        return { ok: true };
      }

      return { ok: true, json: async () => ({}) };
    };

    // Dispatch 3 concurrent SYNC_CHAPTER messages simultaneously before any completes
    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Solo Leveling", chapter: "150", url: "https://test.com/ch150" },
      },
      {},
      () => {},
    );
    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Omniscient Reader", chapter: "100", url: "https://test.com/ch100" },
      },
      {},
      () => {},
    );
    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Tower of God", chapter: "500", url: "https://test.com/ch500" },
      },
      {},
      () => {},
    );

    // Wait for all queued operations to drain
    await enqueueOperation(async () => {});

    assert.equal(createFileCallCount, 1, "createFile() must only be called once across concurrent sync operations");
    assert.equal(driveFileCreated, true, "Drive file must be created");
  } finally {
    global.setTimeout = originalSetTimeout;
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("DELETE_SERIES: silent auth failure returns queued status and sets error badge", async () => {
  const badgeCalls = [];
  try {
    global.chrome = {
      action: {
        setBadgeText: (arg) => badgeCalls.push(arg),
        setBadgeBackgroundColor: (arg) => badgeCalls.push(arg),
      },
      identity: {
        getAuthToken: async (opts) => {
          assert.deepEqual(opts, { interactive: false });
          throw new Error("Token expired");
        },
      },
    };

    let responseData = null;
    handleMessage(
      {
        type: "DELETE_SERIES",
        payload: { manga: "Solo Leveling" },
      },
      {},
      (res) => {
        responseData = res;
      },
    );
    await enqueueOperation(async () => {});

    assert.deepEqual(responseData, { status: "queued" });
    assert.equal(badgeCalls.some((c) => c.text === "!"), true);
    assert.equal(badgeCalls.some((c) => c.color === "#c0392b"), true);
  } finally {
    delete global.chrome;
  }
});

test("DELETE_SERIES: findFile error returns queued status without creating files", async () => {
  const originalFetch = global.fetch;
  try {
    global.chrome = {
      action: {
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {},
      },
      identity: {
        getAuthToken: async () => ({ token: "valid-token" }),
      },
    };

    let createFileCalled = false;
    global.fetch = async (url, opts) => {
      if (opts?.method === "POST") createFileCalled = true;
      if (url.includes("/drive/v3/files?")) {
        return { ok: false, status: 503 };
      }
      return { ok: true, json: async () => ({}) };
    };

    let responseData = null;
    handleMessage(
      {
        type: "DELETE_SERIES",
        payload: { manga: "Solo Leveling" },
      },
      {},
      (res) => {
        responseData = res;
      },
    );
    await enqueueOperation(async () => {});

    assert.deepEqual(responseData, { status: "queued" });
    assert.equal(createFileCalled, false);
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("DELETE_SERIES: successfully deletes series and patches Drive when file exists", async () => {
  global.chrome = {
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
    },
    identity: {
      getAuthToken: async () => ({ token: "valid-token" }),
    },
  };

  const originalFetch = global.fetch;
  try {
    let patchedBody = null;
    global.fetch = async (url, opts) => {
      if (url.includes("/drive/v3/files?")) {
        return {
          ok: true,
          json: async () => ({ files: [{ id: "del-file-1" }] }),
        };
      }
      if (url.includes("/del-file-1?alt=media")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              series: {
                "Solo Leveling": { chapter: "150" },
                "Omniscient Reader": { chapter: "100" },
              },
            }),
        };
      }
      if (opts?.method === "PATCH") {
        patchedBody = JSON.parse(opts.body);
        return { ok: true };
      }
      return { ok: true, json: async () => ({}) };
    };

    let responseData = null;
    handleMessage(
      {
        type: "DELETE_SERIES",
        payload: { manga: "Solo Leveling" },
      },
      {},
      (res) => {
        responseData = res;
      },
    );
    await enqueueOperation(async () => {});

    assert.deepEqual(responseData, { status: "success" });
    assert.deepEqual(patchedBody, {
      series: {
        "Omniscient Reader": { chapter: "100" },
      },
    });
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("DELETE_SERIES: aborts without calling PATCH, sets error badge, and responds with error on malformed or non-object Drive JSON", async () => {
  const originalFetch = global.fetch;
  const badgeCalls = [];

  try {
    global.chrome = {
      action: {
        setBadgeText: (arg) => badgeCalls.push(arg),
        setBadgeBackgroundColor: (arg) => badgeCalls.push(arg),
      },
      identity: {
        getAuthToken: async () => ({ token: "valid-token" }),
      },
    };

    for (const badContent of ["{ corrupted json", "[]", "null", "42"]) {
      badgeCalls.length = 0;
      let patchCalled = false;

      global.fetch = async (url, opts) => {
        if (url.includes("/drive/v3/files?")) {
          return {
            ok: true,
            json: async () => ({ files: [{ id: "del-file-bad" }] }),
          };
        }
        if (url.includes("/del-file-bad?alt=media")) {
          return {
            ok: true,
            text: async () => badContent,
          };
        }
        if (opts?.method === "PATCH") {
          patchCalled = true;
          return { ok: true };
        }
        return { ok: true, json: async () => ({}) };
      };

      let responseData = null;
      handleMessage(
        {
          type: "DELETE_SERIES",
          payload: { manga: "Solo Leveling" },
        },
        {},
        (res) => {
          responseData = res;
        },
      );
      await enqueueOperation(async () => {});

      assert.deepEqual(responseData, { status: "queued" }, `Must return queued for: ${badContent}`);
      assert.equal(patchCalled, false, `PATCH must not be called when Drive JSON is corrupted: ${badContent}`);
      assert.equal(badgeCalls.some((c) => c.text === "!"), true, "Must set error badge text '!'");
      assert.equal(badgeCalls.some((c) => c.color === "#c0392b"), true, "Must set error badge color");
    }
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

// Helper for Phase 2 tests
function createMockStorage(initial = {}) {
  let store = { ...initial };
  return {
    get: (keys, cb) => {
      let result = {};
      if (typeof keys === "string") {
        result[keys] = store[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach((k) => {
          if (store[k] !== undefined) result[k] = store[k];
        });
      } else if (keys && typeof keys === "object") {
        Object.keys(keys).forEach((k) => {
          result[k] = store[k] !== undefined ? store[k] : keys[k];
        });
      } else {
        result = { ...store };
      }
      if (typeof cb === "function") cb(result);
      return Promise.resolve(result);
    },
    set: (items, cb) => {
      Object.assign(store, items);
      if (typeof cb === "function") cb();
      return Promise.resolve();
    },
    getStore: () => store,
  };
}

test("parseChapter & shouldUpdateProgress: monotonic chapter progress comparison", () => {
  // 1. Parsing integer, decimal, and fractional
  assert.deepEqual(parseChapter("100"), { type: "numeric", value: [100] });
  assert.deepEqual(parseChapter(100), { type: "numeric", value: [100] });
  assert.deepEqual(parseChapter("150.5"), { type: "numeric", value: [150.5] });
  assert.deepEqual(parseChapter(150.5), { type: "numeric", value: [150.5] });
  assert.deepEqual(parseChapter("12-1"), { type: "fractional", value: [12, 1] });
  assert.deepEqual(parseChapter("12-2"), { type: "fractional", value: [12, 2] });
  assert.equal(parseChapter("Prologue"), null);
  assert.equal(parseChapter("Extra"), null);
  assert.equal(parseChapter(null), null);
  assert.equal(parseChapter(""), null);

  // 2. Integer progress
  assert.equal(shouldUpdateProgress("100", "2026-11-22T00:00:00Z", "1", "2026-11-21T00:00:00Z"), true);
  assert.equal(shouldUpdateProgress("1", "2026-11-22T00:00:00Z", "100", "2026-11-21T00:00:00Z"), false, "Downgrade 100 -> 1 must be rejected");
  assert.equal(shouldUpdateProgress("100", "2026-11-22T00:00:00Z", "100", "2026-11-21T00:00:00Z"), true, "Equal chapter must be accepted");

  // 3. Decimal progress
  assert.equal(shouldUpdateProgress("150.5", "2026-11-22T00:00:00Z", "150", "2026-11-21T00:00:00Z"), true);
  assert.equal(shouldUpdateProgress("150", "2026-11-22T00:00:00Z", "150.5", "2026-11-21T00:00:00Z"), false, "Downgrade 150.5 -> 150 must be rejected");
  assert.equal(shouldUpdateProgress("150.6", "2026-11-22T00:00:00Z", "150.5", "2026-11-21T00:00:00Z"), true);

  // 4. Fractional / hyphenated progress
  assert.equal(shouldUpdateProgress("12-2", "2026-11-22T00:00:00Z", "12-1", "2026-11-21T00:00:00Z"), true);
  assert.equal(shouldUpdateProgress("12-1", "2026-11-22T00:00:00Z", "12-2", "2026-11-21T00:00:00Z"), false, "Downgrade 12-2 -> 12-1 must be rejected");
  assert.equal(shouldUpdateProgress("13", "2026-11-22T00:00:00Z", "12-2", "2026-11-21T00:00:00Z"), true);
  assert.equal(shouldUpdateProgress("12-1", "2026-11-22T00:00:00Z", "12", "2026-11-21T00:00:00Z"), true);
  assert.equal(shouldUpdateProgress("12", "2026-11-22T00:00:00Z", "12-1", "2026-11-21T00:00:00Z"), false, "Downgrade 12-1 -> 12 must be rejected");

  // 5. Non-numeric chapters with timestamp fallback
  assert.equal(
    shouldUpdateProgress("Prologue", "2026-11-22T10:00:00Z", "Extra", "2026-11-22T09:00:00Z"),
    true,
    "Newer timestamp must be accepted for non-numeric chapters",
  );
  assert.equal(
    shouldUpdateProgress("Prologue", "2026-11-21T00:00:00Z", "100", "2026-11-22T00:00:00Z"),
    false,
    "Older timestamp must be rejected for non-numeric chapters",
  );

  // 6. First read (savedChapter is undefined/null)
  assert.equal(shouldUpdateProgress("1", "2026-11-22T00:00:00Z", undefined, undefined), true);
  assert.equal(shouldUpdateProgress("Prologue", "2026-11-22T00:00:00Z", null, null), true);
});

test("SYNC_CHAPTER: monotonic guard rejects downgrade without updating storage or calling Drive PATCH", async () => {
  const originalFetch = global.fetch;
  let patchCalled = false;
  const mockStorage = createMockStorage({
    series: {
      "Solo Leveling": {
        chapter: "100",
        url: "https://test.com/ch100",
        updated: "2026-11-20T00:00:00Z",
      },
    },
    fileId: "vault-file-01",
    lastSync: "2026-11-20T00:00:00Z",
    pending_sync: [],
  });

  const badgeCalls = [];
  try {
    global.chrome = {
      action: {
        setBadgeText: (arg) => badgeCalls.push(arg),
        setBadgeBackgroundColor: (arg) => badgeCalls.push(arg),
      },
      storage: {
        local: mockStorage,
      },
      identity: {
        getAuthToken: async () => ({ token: "valid-token" }),
      },
    };

    global.fetch = async (url, opts) => {
      if (opts?.method === "PATCH") patchCalled = true;
      return { ok: true, status: 200, json: async () => ({ files: [{ id: "vault-file-01" }] }) };
    };

    // User re-reads Chapter 1 when Chapter 100 is saved
    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Solo Leveling", chapter: "1", url: "https://test.com/ch1" },
      },
      {},
      () => {},
    );

    await enqueueOperation(async () => {});

    // Monotonic guard should reject:
    assert.equal(patchCalled, false, "Drive PATCH must not be called on downgrade");
    const store = mockStorage.getStore();
    assert.equal(store.series["Solo Leveling"].chapter, "100", "Local cache chapter must remain 100");
    assert.equal(store.pending_sync.length, 0, "Downgrade mutation must NOT be enqueued to pending_sync");
    assert.equal(badgeCalls.some((c) => c.text === "!"), false, "Error badge must not be set on downgrade");
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("chrome.storage.local: SYNC_CHAPTER caches series, fileId, and updates lastSync on successful Drive sync", async () => {
  const originalFetch = global.fetch;
  const mockStorage = createMockStorage();
  let uploadedPayload = null;

  try {
    global.chrome = {
      action: {
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {},
      },
      storage: {
        local: mockStorage,
      },
      identity: {
        getAuthToken: async () => ({ token: "token-abc" }),
      },
    };

    global.fetch = async (url, opts) => {
      if (url.includes("/drive/v3/files?")) {
        return { ok: true, json: async () => ({ files: [{ id: "file-xyz-123" }] }) };
      }
      if (url.includes("/file-xyz-123?alt=media")) {
        return { ok: true, text: async () => JSON.stringify({ series: {} }) };
      }
      if (opts?.method === "PATCH") {
        uploadedPayload = JSON.parse(opts.body);
        return { ok: true };
      }
      return { ok: true, json: async () => ({}) };
    };

    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Chainsaw Man", chapter: "10", url: "https://test.com/ch10" },
      },
      {},
      () => {},
    );

    await enqueueOperation(async () => {});

    const store = mockStorage.getStore();
    assert.ok(store.series["Chainsaw Man"], "Series must be saved in storage");
    assert.equal(store.series["Chainsaw Man"].chapter, "10");
    assert.equal(store.fileId, "file-xyz-123", "Drive fileId must be cached in storage");
    assert.ok(store.lastSync, "lastSync timestamp must be updated in storage");
    assert.equal(uploadedPayload.series["Chainsaw Man"].chapter, "10", "Drive must be patched with new chapter");
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("AM-1 Stale fileId recovery: recovers via findFile/createFile when cached fileId returns 404 from Drive", async () => {
  const originalFetch = global.fetch;
  const mockStorage = createMockStorage({
    fileId: "stale-deleted-fileId",
    series: {},
  });

  let findFileCalled = false;
  let newFileIdUsed = null;

  try {
    global.chrome = {
      action: {
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {},
      },
      storage: {
        local: mockStorage,
      },
      identity: {
        getAuthToken: async () => ({ token: "token-recovery" }),
      },
    };

    global.fetch = async (url, opts) => {
      // Stale fileId returns 404
      if (url.includes("/stale-deleted-fileId?alt=media")) {
        return { status: 404, ok: false };
      }
      // Recovery findFile search
      if (url.includes("/drive/v3/files?")) {
        findFileCalled = true;
        return { ok: true, json: async () => ({ files: [{ id: "new-recovered-fileId" }] }) };
      }
      // Fetch new file content
      if (url.includes("/new-recovered-fileId?alt=media")) {
        return { ok: true, text: async () => JSON.stringify({ series: {} }) };
      }
      // PATCH new file
      if (opts?.method === "PATCH") {
        newFileIdUsed = url;
        return { ok: true };
      }
      return { ok: true, json: async () => ({}) };
    };

    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Solo Leveling", chapter: "200", url: "https://test.com/ch200" },
      },
      {},
      () => {},
    );

    await enqueueOperation(async () => {});

    assert.equal(findFileCalled, true, "findFile must be called after cached fileId returns 404");
    assert.ok(newFileIdUsed.includes("new-recovered-fileId"), "PATCH must be issued against recovered fileId");
    const store = mockStorage.getStore();
    assert.equal(store.fileId, "new-recovered-fileId", "Updated fileId must replace stale fileId in storage");
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("offline mutation queue: enqueues pending_sync and optimistically updates local series without modifying lastSync", async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const mockStorage = createMockStorage({
    series: {
      "Solo Leveling": { chapter: "50", url: "https://test.com/ch50", updated: "2026-11-20T00:00:00Z" },
    },
    lastSync: "2026-11-20T00:00:00Z",
    pending_sync: [],
  });

  const badgeCalls = [];

  try {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
      writable: true,
    });
    global.chrome = {
      action: {
        setBadgeText: (arg) => badgeCalls.push(arg),
        setBadgeBackgroundColor: (arg) => badgeCalls.push(arg),
      },
      storage: {
        local: mockStorage,
      },
      identity: {
        getAuthToken: async () => {
          throw new Error("Should not be called while offline");
        },
      },
    };

    // 1. SYNC_CHAPTER while offline
    handleMessage(
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Solo Leveling", chapter: "55", url: "https://test.com/ch55" },
      },
      {},
      () => {},
    );
    await enqueueOperation(async () => {});

    let store = mockStorage.getStore();
    // Optimistic cache update
    assert.equal(store.series["Solo Leveling"].chapter, "55", "Local cache must be updated optimistically");
    // lastSync untouched
    assert.equal(store.lastSync, "2026-11-20T00:00:00Z", "lastSync must NOT be updated while offline");
    // Appended to pending_sync
    assert.equal(store.pending_sync.length, 1);
    assert.equal(store.pending_sync[0].type, "SYNC_CHAPTER");
    assert.equal(store.pending_sync[0].payload.chapter, "55");
    // Badge hygiene: clear badge while offline (never leave stuck '...')
    assert.equal(badgeCalls.some((c) => c.text === "..."), false, "Must not set in-flight badge while offline");

    // 2. DELETE_SERIES while offline
    let deleteResponse = null;
    handleMessage(
      {
        type: "DELETE_SERIES",
        payload: { manga: "Solo Leveling" },
      },
      {},
      (res) => {
        deleteResponse = res;
      },
    );
    await enqueueOperation(async () => {});

    store = mockStorage.getStore();
    assert.deepEqual(deleteResponse, { status: "success" });
    assert.equal(store.series["Solo Leveling"], undefined, "Deleted series must be removed optimistically from cache");
    assert.equal(store.pending_sync.length, 2);
    assert.equal(store.pending_sync[1].type, "DELETE_SERIES");
    assert.equal(store.lastSync, "2026-11-20T00:00:00Z", "lastSync must remain untouched");
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "navigator", originalDescriptor);
    } else {
      delete globalThis.navigator;
    }
    delete global.chrome;
  }
});

test("FIFO reconciliation: online sync replays pending_sync mutations in FIFO order, patches Drive once, and clears queue", async () => {
  const originalFetch = global.fetch;
  const mockStorage = createMockStorage({
    fileId: "vault-recon-01",
    series: {
      "Tower of God": { chapter: "100", url: "https://test.com/ch100" },
    },
    pending_sync: [
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Tower of God", chapter: "105", url: "https://test.com/ch105" },
        timestamp: "2026-11-22T01:00:00Z",
      },
      {
        type: "SYNC_CHAPTER",
        payload: { manga: "Tower of God", chapter: "110", url: "https://test.com/ch110" },
        timestamp: "2026-11-22T02:00:00Z",
      },
      {
        type: "DELETE_SERIES",
        payload: { manga: "Old Series" },
        timestamp: "2026-11-22T03:00:00Z",
      },
    ],
  });

  let patchedBody = null;
  let patchCallCount = 0;

  try {
    global.chrome = {
      action: {
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {},
      },
      storage: {
        local: mockStorage,
      },
      identity: {
        getAuthToken: async () => ({ token: "token-reconcile" }),
      },
    };

    global.fetch = async (url, opts) => {
      if (url.includes("/vault-recon-01?alt=media")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              series: {
                "Tower of God": { chapter: "90", url: "https://test.com/ch90", updated: "2026-11-21T00:00:00Z" },
                "Old Series": { chapter: "5", url: "https://test.com/old5" },
              },
            }),
        };
      }
      if (opts?.method === "PATCH") {
        patchCallCount++;
        patchedBody = JSON.parse(opts.body);
        return { ok: true };
      }
      return { ok: true, json: async () => ({}) };
    };

    // Trigger reconciliation via reconcileAndSync
    const res = await reconcileAndSync({ interactive: false });

    assert.equal(res.status, "success");
    assert.equal(patchCallCount, 1, "Must write merged vault via single PATCH call");

    // Verify FIFO applied mutations:
    // Tower of God had Ch. 105 then Ch. 110 -> final must be Ch. 110
    assert.equal(patchedBody.series["Tower of God"].chapter, "110");
    // Old Series was deleted -> must be absent from patched body
    assert.equal(patchedBody.series["Old Series"], undefined);

    // Verify storage was updated and pending_sync queue cleared
    const store = mockStorage.getStore();
    assert.equal(store.pending_sync.length, 0, "pending_sync items must be cleared after reconciliation");
    assert.equal(store.series["Tower of God"].chapter, "110");
    assert.equal(store.series["Old Series"], undefined);
    assert.ok(store.lastSync, "lastSync must be updated upon successful reconciliation");
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("reconciliation failure retention: pending_sync is preserved when Drive fetch/write fails or Drive JSON is malformed (BUG-001)", async () => {
  const originalFetch = global.fetch;
  const initialPending = [
    {
      type: "SYNC_CHAPTER",
      payload: { manga: "Chainsaw Man", chapter: "99", url: "https://test.com/ch99" },
      timestamp: "2026-11-22T00:00:00Z",
    },
  ];

  const mockStorage = createMockStorage({
    fileId: "vault-malformed-01",
    series: {},
    pending_sync: [...initialPending],
  });

  try {
    global.chrome = {
      action: {
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {},
      },
      storage: {
        local: mockStorage,
      },
      identity: {
        getAuthToken: async () => ({ token: "token-bad" }),
      },
    };

    // Drive returns corrupted non-empty JSON
    global.fetch = async (url, opts) => {
      if (url.includes("/vault-malformed-01?alt=media")) {
        return { ok: true, text: async () => "{ invalid-json" };
      }
      return { ok: true, json: async () => ({}) };
    };

    const res = await reconcileAndSync({ interactive: false });

    assert.equal(res.status, "malformed", "Must abort with malformed status per BUG-001");
    const store = mockStorage.getStore();
    assert.equal(store.pending_sync.length, 1, "pending_sync must be retained on malformed Drive JSON");
    assert.equal(store.pending_sync[0].payload.manga, "Chainsaw Man");
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("AC-7 & Blocker 1: SYNC_CHAPTER enqueues mutation to pending_sync and retains optimistic series when Drive fetch/create/patch fails", async () => {
  const originalFetch = global.fetch;

  // Case 1: Drive uploadDriveVault (PATCH) returns HTTP 503
  {
    const badgeCalls = [];
    const mockStorage = createMockStorage({
      fileId: "vault-sync-patch-err",
      series: { "Solo Leveling": { chapter: "100", updated: "2026-11-20T00:00:00Z" } },
      pending_sync: [],
      lastSync: "2026-11-20T00:00:00Z",
    });

    try {
      global.chrome = {
        action: {
          setBadgeText: (arg) => badgeCalls.push(arg),
          setBadgeBackgroundColor: (arg) => badgeCalls.push(arg),
        },
        storage: { local: mockStorage },
        identity: { getAuthToken: async () => ({ token: "valid-tok" }) },
      };

      global.fetch = async (url, opts) => {
        if (url.includes("/vault-sync-patch-err?alt=media")) {
          return {
            ok: true,
            text: async () => JSON.stringify({ series: { "Solo Leveling": { chapter: "100" } } }),
          };
        }
        if (opts?.method === "PATCH") {
          return { ok: false, status: 503 };
        }
        return { ok: true, json: async () => ({}) };
      };

      handleMessage({
        type: "SYNC_CHAPTER",
        payload: { manga: "Solo Leveling", chapter: "101", url: "https://test.com/ch101" },
      });
      await enqueueOperation(async () => {});

      const store = mockStorage.getStore();
      assert.equal(store.series["Solo Leveling"].chapter, "101", "Must update local cache optimistically");
      assert.equal(store.lastSync, "2026-11-20T00:00:00Z", "lastSync must NOT be updated when Drive PATCH fails");
      assert.equal(store.pending_sync.length, 1, "Must enqueue mutation to pending_sync");
      assert.equal(store.pending_sync[0].type, "SYNC_CHAPTER");
      assert.equal(store.pending_sync[0].payload.chapter, "101");
      assert.equal(badgeCalls.some((c) => c.text === "!"), true, "Must set error badge on PATCH failure");
    } finally {
      delete global.chrome;
      global.fetch = originalFetch;
    }
  }

  // Case 2: Drive fetch (GET) throws network rejection (Failed to fetch)
  {
    const badgeCalls = [];
    const mockStorage = createMockStorage({
      fileId: "vault-net-err",
      series: {},
      pending_sync: [],
    });

    try {
      global.chrome = {
        action: {
          setBadgeText: (arg) => badgeCalls.push(arg),
          setBadgeBackgroundColor: (arg) => badgeCalls.push(arg),
        },
        storage: { local: mockStorage },
        identity: { getAuthToken: async () => ({ token: "valid-tok" }) },
      };

      global.fetch = async () => {
        throw new TypeError("Failed to fetch (offline or network down)");
      };

      handleMessage({
        type: "SYNC_CHAPTER",
        payload: { manga: "Omniscient Reader", chapter: "50", url: "https://test.com/orv50" },
      });
      await enqueueOperation(async () => {});

      const store = mockStorage.getStore();
      assert.equal(store.series["Omniscient Reader"].chapter, "50", "Must update local cache optimistically");
      assert.equal(store.lastSync, undefined, "lastSync must NOT be set on network error");
      assert.equal(store.pending_sync.length, 1, "Must enqueue mutation to pending_sync");
      assert.equal(store.pending_sync[0].payload.manga, "Omniscient Reader");
      assert.equal(badgeCalls.some((c) => c.text === "!"), true, "Must set error badge on network rejection");
    } finally {
      delete global.chrome;
      global.fetch = originalFetch;
    }
  }

  // Case 3: Drive createFile (POST) returns HTTP 500
  {
    const badgeCalls = [];
    const mockStorage = createMockStorage({
      fileId: null,
      series: {},
      pending_sync: [],
    });

    try {
      global.chrome = {
        action: {
          setBadgeText: (arg) => badgeCalls.push(arg),
          setBadgeBackgroundColor: (arg) => badgeCalls.push(arg),
        },
        storage: { local: mockStorage },
        identity: { getAuthToken: async () => ({ token: "valid-tok" }) },
      };

      global.fetch = async (url, opts) => {
        if (url.includes("/drive/v3/files?")) {
          return { ok: true, json: async () => ({ files: [] }) }; // not found -> triggers createFile
        }
        if (opts?.method === "POST") {
          return { ok: false, status: 500 };
        }
        return { ok: true, json: async () => ({}) };
      };

      handleMessage({
        type: "SYNC_CHAPTER",
        payload: { manga: "Chainsaw Man", chapter: "10", url: "https://test.com/csm10" },
      });
      await enqueueOperation(async () => {});

      const store = mockStorage.getStore();
      assert.equal(store.series["Chainsaw Man"].chapter, "10", "Must update local cache optimistically");
      assert.equal(store.pending_sync.length, 1, "Must enqueue mutation when createFile fails");
      assert.equal(store.pending_sync[0].payload.manga, "Chainsaw Man");
      assert.equal(badgeCalls.some((c) => c.text === "!"), true, "Must set error badge when createFile fails");
    } finally {
      delete global.chrome;
      global.fetch = originalFetch;
    }
  }
});

test("AC-7 & Blocker 1: DELETE_SERIES enqueues mutation to pending_sync and responds with queued when Drive PATCH or GET fails", async () => {
  const originalFetch = global.fetch;

  // Case 1: Drive PATCH fails with HTTP 500
  {
    const mockStorage = createMockStorage({
      fileId: "vault-del-patch-fail",
      series: { "Solo Leveling": { chapter: "150" } },
      pending_sync: [],
      lastSync: "2026-11-20T00:00:00Z",
    });

    try {
      global.chrome = {
        action: {
          setBadgeText: () => {},
          setBadgeBackgroundColor: () => {},
        },
        storage: { local: mockStorage },
        identity: { getAuthToken: async () => ({ token: "valid-tok" }) },
      };

      global.fetch = async (url, opts) => {
        if (url.includes("/vault-del-patch-fail?alt=media")) {
          return {
            ok: true,
            text: async () => JSON.stringify({ series: { "Solo Leveling": { chapter: "150" } } }),
          };
        }
        if (opts?.method === "PATCH") {
          return { ok: false, status: 500 };
        }
        return { ok: true, json: async () => ({}) };
      };

      let responseData = null;
      handleMessage(
        {
          type: "DELETE_SERIES",
          payload: { manga: "Solo Leveling" },
        },
        {},
        (res) => {
          responseData = res;
        },
      );
      await enqueueOperation(async () => {});

      const store = mockStorage.getStore();
      assert.equal(store.series["Solo Leveling"], undefined, "Series must be removed optimistically from local cache");
      assert.equal(store.lastSync, "2026-11-20T00:00:00Z", "lastSync must NOT be updated when PATCH fails");
      assert.equal(store.pending_sync.length, 1, "Must enqueue DELETE_SERIES mutation");
      assert.equal(store.pending_sync[0].type, "DELETE_SERIES");
      assert.equal(store.pending_sync[0].payload.manga, "Solo Leveling");
      assert.deepEqual(responseData, { status: "queued" }, "Must respond with queued status to popup");
    } finally {
      delete global.chrome;
      global.fetch = originalFetch;
    }
  }

  // Case 2: Drive fetch network rejection
  {
    const mockStorage = createMockStorage({
      fileId: "vault-del-net-fail",
      series: { "Tower of God": { chapter: "300" } },
      pending_sync: [],
    });

    try {
      global.chrome = {
        action: {
          setBadgeText: () => {},
          setBadgeBackgroundColor: () => {},
        },
        storage: { local: mockStorage },
        identity: { getAuthToken: async () => ({ token: "valid-tok" }) },
      };

      global.fetch = async () => {
        throw new TypeError("Network connection lost");
      };

      let responseData = null;
      handleMessage(
        {
          type: "DELETE_SERIES",
          payload: { manga: "Tower of God" },
        },
        {},
        (res) => {
          responseData = res;
        },
      );
      await enqueueOperation(async () => {});

      const store = mockStorage.getStore();
      assert.equal(store.series["Tower of God"], undefined, "Series must be removed optimistically");
      assert.equal(store.pending_sync.length, 1);
      assert.equal(store.pending_sync[0].payload.manga, "Tower of God");
      assert.deepEqual(responseData, { status: "queued" });
    } finally {
      delete global.chrome;
      global.fetch = originalFetch;
    }
  }
});

test("AC-10 & Blocker 3(b): reconcileAndSync retains pending_sync intact when Drive PATCH or GET network fails", async () => {
  const originalFetch = global.fetch;

  const queuedMutations = [
    {
      type: "SYNC_CHAPTER",
      payload: { manga: "Recon Test", chapter: "5" },
      timestamp: "2026-11-22T00:00:00Z",
    },
  ];

  // Case 1: Drive PATCH HTTP 500
  {
    const mockStorage = createMockStorage({
      fileId: "vault-recon-patch-fail",
      series: {},
      pending_sync: [...queuedMutations],
      lastSync: "2026-11-20T00:00:00Z",
    });

    try {
      global.chrome = {
        action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
        storage: { local: mockStorage },
        identity: { getAuthToken: async () => ({ token: "valid-tok" }) },
      };

      global.fetch = async (url, opts) => {
        if (url.includes("/vault-recon-patch-fail?alt=media")) {
          return { ok: true, text: async () => JSON.stringify({ series: {} }) };
        }
        if (opts?.method === "PATCH") {
          return { ok: false, status: 500 };
        }
        return { ok: true, json: async () => ({}) };
      };

      const res = await reconcileAndSync({ interactive: false });
      assert.equal(res.status, "error");
      const store = mockStorage.getStore();
      assert.equal(store.pending_sync.length, 1, "pending_sync must be retained intact on PATCH failure");
      assert.equal(store.pending_sync[0].payload.manga, "Recon Test");
      assert.equal(store.lastSync, "2026-11-20T00:00:00Z", "lastSync must NOT be updated");
    } finally {
      delete global.chrome;
      global.fetch = originalFetch;
    }
  }

  // Case 2: Drive fetch GET network rejection
  {
    const mockStorage = createMockStorage({
      fileId: "vault-recon-get-fail",
      series: {},
      pending_sync: [...queuedMutations],
    });

    try {
      global.chrome = {
        action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
        storage: { local: mockStorage },
        identity: { getAuthToken: async () => ({ token: "valid-tok" }) },
      };

      global.fetch = async () => {
        throw new Error("DNS resolution failed");
      };

      const res = await reconcileAndSync({ interactive: false });
      assert.equal(res.status, "error");
      const store = mockStorage.getStore();
      assert.equal(store.pending_sync.length, 1, "pending_sync must be retained intact on GET network rejection");
    } finally {
      delete global.chrome;
      global.fetch = originalFetch;
    }
  }
});

test("AC-10 & Blocker 3(c): Re-entrancy / snapshot-prefix safety: mutations appended during in-flight PATCH are preserved", async () => {
  const originalFetch = global.fetch;

  const initialMutations = [
    { type: "SYNC_CHAPTER", payload: { manga: "Mut1", chapter: "1" }, timestamp: "2026-11-22T00:00:00Z" },
    { type: "SYNC_CHAPTER", payload: { manga: "Mut2", chapter: "2" }, timestamp: "2026-11-22T00:01:00Z" },
  ];

  const mockStorage = createMockStorage({
    fileId: "vault-snapshot-safety",
    series: {},
    pending_sync: [...initialMutations],
  });

  try {
    global.chrome = {
      action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      storage: { local: mockStorage },
      identity: { getAuthToken: async () => ({ token: "valid-tok" }) },
    };

    const mut3 = {
      type: "SYNC_CHAPTER",
      payload: { manga: "Mut3 (Appended In-Flight)", chapter: "3" },
      timestamp: "2026-11-22T00:02:00Z",
    };

    global.fetch = async (url, opts) => {
      if (url.includes("/vault-snapshot-safety?alt=media")) {
        return { ok: true, text: async () => JSON.stringify({ series: {} }) };
      }
      if (opts?.method === "PATCH") {
        // While PATCH is in flight, append Mut3 to pending_sync
        const currentStore = mockStorage.getStore();
        mockStorage.set({ pending_sync: [...currentStore.pending_sync, mut3] });
        return { ok: true };
      }
      return { ok: true, json: async () => ({}) };
    };

    const res = await reconcileAndSync({ interactive: false });
    assert.equal(res.status, "success");

    const finalStore = mockStorage.getStore();
    assert.equal(finalStore.pending_sync.length, 1, "Only the snapshotted prefix should be removed");
    assert.equal(finalStore.pending_sync[0].payload.manga, "Mut3 (Appended In-Flight)", "In-flight appended mutation must be preserved");
    assert.equal(finalStore.series["Mut1"].chapter, "1");
    assert.equal(finalStore.series["Mut2"].chapter, "2");
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});

test("Warning #3: Object prototype safety & message validation", async () => {
  // 1. isValidMangaName validation
  assert.equal(isValidMangaName("Solo Leveling"), true);
  assert.equal(isValidMangaName("  Solo Leveling  "), true);
  assert.equal(isValidMangaName(""), false);
  assert.equal(isValidMangaName("   "), false);
  assert.equal(isValidMangaName(null), false);
  assert.equal(isValidMangaName(undefined), false);
  assert.equal(isValidMangaName(123), false);
  assert.equal(isValidMangaName({}), false);
  assert.equal(isValidMangaName("__proto__"), false);
  assert.equal(isValidMangaName("constructor"), false);
  assert.equal(isValidMangaName("prototype"), false);

  // 2. handleMessage null/malformed guards
  assert.doesNotThrow(() => handleMessage(null));
  assert.doesNotThrow(() => handleMessage(undefined));
  assert.doesNotThrow(() => handleMessage("string message"));
  assert.doesNotThrow(() => handleMessage(42));

  // 3. Reject prototype pollution payloads in SYNC_CHAPTER
  let chapterRes = null;
  handleMessage(
    { type: "SYNC_CHAPTER", payload: { manga: "__proto__", chapter: "1" } },
    {},
    (res) => { chapterRes = res; },
  );
  await enqueueOperation(async () => {});
  assert.deepEqual(chapterRes, { status: "ignored", reason: "invalid_manga_name" });

  // 4. Reject prototype pollution payloads in DELETE_SERIES
  let deleteRes = null;
  handleMessage(
    { type: "DELETE_SERIES", payload: { manga: "prototype" } },
    {},
    (res) => { deleteRes = res; },
  );
  await enqueueOperation(async () => {});
  assert.deepEqual(deleteRes, { status: "error", error: "Invalid manga name" });
});

test("Warning #4: clearBadge helper and badge state reset on SYNC_VAULT success", async () => {
  const badgeCalls = [];
  try {
    global.chrome = {
      action: {
        setBadgeText: (arg) => badgeCalls.push(arg),
        setBadgeBackgroundColor: (arg) => badgeCalls.push(arg),
      },
    };

    // 1. Set error badge first
    setErrorBadge();
    assert.equal(badgeCalls.some((c) => c.text === "!"), true);

    // 2. clearBadge() resets text to empty and clears timer
    badgeCalls.length = 0;
    clearBadge();
    assert.equal(badgeCalls.some((c) => c.text === ""), true);

    // 3. SYNC_VAULT success clears prior error badge
    setErrorBadge();
    const mockStorage = createMockStorage({
      fileId: "vault-clear-badge",
      series: { "Solo Leveling": { chapter: "10" } },
      pending_sync: [],
    });
    global.chrome.storage = { local: mockStorage };
    global.chrome.identity = { getAuthToken: async () => ({ token: "valid-tok" }) };

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes("/vault-clear-badge?alt=media")) {
        return { ok: true, text: async () => JSON.stringify({ series: { "Solo Leveling": { chapter: "10" } } }) };
      }
      return { ok: true, json: async () => ({}) };
    };

    badgeCalls.length = 0;
    let syncVaultRes = null;
    handleMessage({ type: "SYNC_VAULT" }, {}, (res) => {
      syncVaultRes = res;
    });
    await enqueueOperation(async () => {});

    assert.equal(syncVaultRes.status, "success");
    assert.equal(badgeCalls.some((c) => c.text === ""), true, "SYNC_VAULT success must clear prior error badge");
    global.fetch = originalFetch;
  } finally {
    delete global.chrome;
  }
});
