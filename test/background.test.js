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
  handleMessage,
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

test("DELETE_SERIES: silent auth failure returns error status and sets error badge", async () => {
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

    assert.deepEqual(responseData, { status: "error" });
    assert.equal(badgeCalls.some((c) => c.text === "!"), true);
    assert.equal(badgeCalls.some((c) => c.color === "#c0392b"), true);
  } finally {
    delete global.chrome;
  }
});

test("DELETE_SERIES: findFile error returns error status without creating files", async () => {
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

    assert.deepEqual(responseData, { status: "error" });
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

      assert.deepEqual(responseData, { status: "error" }, `Must return error for: ${badContent}`);
      assert.equal(patchCalled, false, `PATCH must not be called when Drive JSON is corrupted: ${badContent}`);
      assert.equal(badgeCalls.some((c) => c.text === "!"), true, "Must set error badge text '!'");
      assert.equal(badgeCalls.some((c) => c.color === "#c0392b"), true, "Must set error badge color");
    }
  } finally {
    delete global.chrome;
    global.fetch = originalFetch;
  }
});
