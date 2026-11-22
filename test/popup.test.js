const test = require("node:test");
const assert = require("node:assert/strict");

// Create minimal DOM mock for testing popup.js
function setupMockDom() {
  const elements = {};

  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: "",
      style: {},
      children: [],
      innerText: "",
      textContent: "",
      innerHTML: "",
      attributes: {},
      listeners: {},
      setAttribute(k, v) {
        this.attributes[k] = v;
      },
      getAttribute(k) {
        return this.attributes[k];
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      remove() {
        if (this.parent) {
          this.parent.children = this.parent.children.filter((c) => c !== this);
        }
      },
      addEventListener(evt, fn) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(fn);
      },
      trigger(evt, eventObj = {}) {
        if (this.listeners[evt]) {
          this.listeners[evt].forEach((fn) => fn.call(this, eventObj));
        }
      },
      classList: {
        classes: new Set(),
        add(c) {
          this.classes.add(c);
        },
        remove(c) {
          this.classes.delete(c);
        },
        contains(c) {
          return this.classes.has(c);
        },
      },
    };
    return el;
  }

  const list = createElement("div");
  const loading = createElement("div");
  const status = createElement("div");
  const refreshBtn = createElement("button");
  const searchInput = createElement("input");
  const mangaPreview = createElement("div");
  const previewImage = createElement("img");
  const filterContainer = createElement("div");

  elements["list"] = list;
  elements["loading"] = loading;
  elements["status"] = status;
  elements["refresh-btn"] = refreshBtn;
  elements["search-field"] = searchInput;
  elements["manga-preview"] = mangaPreview;
  elements["preview-img"] = previewImage;
  elements["filter-container"] = filterContainer;

  global.document = {
    createElement,
    getElementById: (id) => elements[id] || null,
    querySelector: (selector) => {
      if (selector === 'input[name="filter"]:checked') {
        return { value: "all" };
      }
      return null;
    },
    addEventListener: () => {},
  };

  global.window = {
    document: global.document,
  };

  return { elements, createElement };
}

test("popup loadVault: renders immediately from chrome.storage.local before/in parallel with cloud sync", async () => {
  const { elements } = setupMockDom();
  const { loadVault, getAllSeries, initPopupDom } = require("../popup.js");
  initPopupDom();

  let cloudSyncCalled = false;
  let cloudSyncCallback = null;

  global.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const res = {
            series: {
              "Solo Leveling": {
                chapter: "150",
                url: "https://asuracomic.net/series/solo-leveling/chapter/150",
                updated: "2026-11-21T10:00:00Z",
              },
            },
            lastSync: "2026-11-21T10:00:00Z",
          };
          if (typeof cb === "function") cb(res);
          return Promise.resolve(res);
        },
      },
    },
    runtime: {
      sendMessage: (msg, cb) => {
        if (msg.type === "SYNC_VAULT") {
          cloudSyncCalled = true;
          cloudSyncCallback = cb;
        }
      },
    },
  };

  const loadPromise = loadVault();

  // Sub-10ms cache check: local series should be loaded before resolving cloud sync
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(getAllSeries().length, 1, "Cached series must be rendered immediately from local storage");
  assert.equal(getAllSeries()[0][0], "Solo Leveling");
  assert.equal(elements["loading"].style.display, "none", "Loading spinner must be hidden when cache exists");

  // Complete cloud sync
  if (cloudSyncCallback) {
    cloudSyncCallback({
      status: "success",
      series: {
        "Solo Leveling": {
          chapter: "151",
          url: "https://asuracomic.net/series/solo-leveling/chapter/151",
          updated: "2026-11-22T00:00:00Z",
        },
        "Tower of God": {
          chapter: "500",
          url: "https://mangadex.org/chapter/tog-500",
          updated: "2026-11-22T00:00:00Z",
        },
      },
      lastSync: "2026-11-22T00:00:00Z",
    });
  }

  await loadPromise;

  assert.equal(cloudSyncCalled, true, "Cloud sync must be triggered in parallel");
  assert.equal(getAllSeries().length, 2, "Series must update after cloud sync completes");
  assert.ok(elements["status"].innerText.includes("Last updated"), "Status must display last update time");

  delete global.document;
  delete global.window;
  delete global.chrome;
});

test("popup loadVault: preserves cached series and displays friendly status when cloud sync fails or is offline", async () => {
  const { elements } = setupMockDom();
  const { loadVault, getAllSeries, initPopupDom } = require("../popup.js");
  initPopupDom();

  global.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const res = {
            series: {
              "Omniscient Reader": {
                chapter: "200",
                url: "https://asuracomic.net/series/orv/chapter/200",
                updated: "2026-11-21T00:00:00Z",
              },
            },
            lastSync: "2026-11-21T00:00:00Z",
          };
          if (typeof cb === "function") cb(res);
          return Promise.resolve(res);
        },
      },
    },
    runtime: {
      sendMessage: (msg, cb) => {
        // Simulate offline / network error from background sync
        if (typeof cb === "function") {
          cb({ status: "offline", series: null });
        }
      },
    },
  };

  await loadVault();

  // Cached series must NOT be wiped
  assert.equal(getAllSeries().length, 1, "Cached series must be retained on cloud failure");
  assert.equal(getAllSeries()[0][0], "Omniscient Reader");
  assert.equal(elements["loading"].style.display, "none");
  assert.equal(elements["status"].innerText, "Offline (showing cached).");

  delete global.document;
  delete global.window;
  delete global.chrome;
});

test("popup isSafeUrl: allows http/https and rejects unsafe schemes", () => {
  const { isSafeUrl } = require("../popup.js");
  assert.equal(isSafeUrl("https://mangadex.org/title/123"), true);
  assert.equal(isSafeUrl("http://asuracomic.net/series/solo"), true);
  assert.equal(isSafeUrl("javascript:alert(1)"), false);
  assert.equal(isSafeUrl("data:text/html,<h1>XSS</h1>"), false);
  assert.equal(isSafeUrl("vbscript:msgbox"), false);
  assert.equal(isSafeUrl(""), false);
  assert.equal(isSafeUrl(null), false);
  assert.equal(isSafeUrl(undefined), false);
});

test("Blocker #2: loadVault triggers interactive: true on empty cache and interactive: false when cache is populated", async () => {
  const { elements } = setupMockDom();
  const { loadVault, setAllSeries, initPopupDom } = require("../popup.js");
  initPopupDom();

  const sentMessages = [];
  global.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          // Empty cache on first run
          const res = { series: {}, lastSync: null };
          if (typeof cb === "function") cb(res);
          return Promise.resolve(res);
        },
      },
    },
    runtime: {
      sendMessage: (msg, cb) => {
        sentMessages.push(msg);
        if (typeof cb === "function") cb({ status: "success", series: {} });
      },
    },
  };

  setAllSeries([]);
  await loadVault();

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "SYNC_VAULT");
  assert.deepEqual(sentMessages[0].payload, { interactive: true }, "First run with empty cache must trigger interactive auth for onboarding");

  // Now test with populated cache
  sentMessages.length = 0;
  global.chrome.storage.local.get = (keys, cb) => {
    const res = { series: { "Solo Leveling": { chapter: "1" } }, lastSync: "2026-11-22T00:00:00Z" };
    if (typeof cb === "function") cb(res);
    return Promise.resolve(res);
  };

  await loadVault();
  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0].payload, { interactive: false }, "Cached render must trigger silent non-interactive cloud sync");

  delete global.document;
  delete global.window;
  delete global.chrome;
});

test("Blocker #2: refresh button triggers interactive: true OAuth refresh", async () => {
  const { elements } = setupMockDom();
  const { initPopupDom } = require("../popup.js");
  initPopupDom();

  const sentMessages = [];
  global.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        sentMessages.push(msg);
        if (typeof cb === "function") cb({ status: "success", series: {} });
      },
    },
  };

  const refreshBtn = elements["refresh-btn"];
  assert.ok(refreshBtn);
  refreshBtn.trigger("click");

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "SYNC_VAULT");
  assert.deepEqual(sentMessages[0].payload, { interactive: true }, "Manual refresh must pass interactive: true");

  delete global.document;
  delete global.window;
  delete global.chrome;
});

test("Warning #4 & #6: delete button handles queued status and readLink sanitizes unsafe URLs", () => {
  const { elements } = setupMockDom();
  const { renderList, getAllSeries, setAllSeries, initPopupDom } = require("../popup.js");
  initPopupDom();

  const series = [
    [
      "XSS Manga",
      {
        chapter: "1",
        url: "javascript:alert('pwned')",
        updated: "2026-11-22T00:00:00Z",
      },
    ],
  ];

  setAllSeries([...series]);
  renderList(series);

  const card = elements["list"].children[0];
  assert.ok(card);

  // Warning #6: readLink must NOT use javascript: URL
  const infoRow = card.children[1];
  const actionsDiv = infoRow.children[1];
  const readLink = actionsDiv.children[0];
  assert.equal(readLink.href, "#", "Unsafe URL schemes must fallback to '#'");

  // Warning #4: delete handles { status: 'queued' }
  const deleteBtn = actionsDiv.children[1];
  global.confirm = () => true;

  let messageSent = null;
  global.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        messageSent = msg;
        cb({ status: "queued" });
      },
    },
  };

  deleteBtn.trigger("click");
  assert.equal(messageSent.type, "DELETE_SERIES");
  assert.equal(getAllSeries().length, 0, "Card must be removed from series list when background returns queued");
  assert.ok(elements["list"].innerHTML.includes("Vault is empty"), "Empty status should display");

  delete global.confirm;
  delete global.document;
  delete global.window;
  delete global.chrome;
});
