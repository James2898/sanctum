const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Create minimal DOM mock for testing popup.js with DocumentFragment, replaceChildren, closest, and bubbling
function setupMockDom() {
  const elements = {};
  let checkedFilterValue = "all";

  function createDocumentFragment() {
    return {
      nodeType: 11,
      tagName: "#DOCUMENT-FRAGMENT",
      children: [],
      appendChild(child) {
        if (child && child.nodeType === 11) {
          child.children.forEach((c) => {
            c.parent = this;
            this.children.push(c);
          });
          child.children = [];
        } else if (child) {
          child.parent = this;
          this.children.push(child);
        }
        return child;
      },
    };
  }

  function createElement(tag) {
    let _ownText = "";
    let _href = "";
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      className: "",
      style: {},
      children: [],
      parent: null,
      disabled: false,
      attributes: {},
      listeners: {},
      appendChildCalls: 0,
      replaceChildrenCalls: 0,
      get textContent() {
        if (this.children.length > 0) {
          return _ownText + this.children.map((c) => c.textContent).join("");
        }
        return _ownText;
      },
      set textContent(val) {
        _ownText = String(val ?? "");
        this.children = [];
      },
      get innerText() {
        return this.textContent;
      },
      set innerText(val) {
        this.textContent = val;
      },
      get href() {
        return _href;
      },
      set href(val) {
        _href = String(val ?? "");
        this.attributes["href"] = _href;
      },
      setAttribute(k, v) {
        const strVal = String(v ?? "");
        this.attributes[k] = strVal;
        if (k === "href") {
          _href = strVal;
        }
      },
      getAttribute(k) {
        return Object.hasOwn(this.attributes, k) ? this.attributes[k] : null;
      },
      removeAttribute(k) {
        delete this.attributes[k];
      },
      appendChild(child) {
        this.appendChildCalls++;
        if (child && child.nodeType === 11) {
          child.children.forEach((c) => {
            c.parent = this;
            this.children.push(c);
          });
          child.children = [];
        } else if (child) {
          child.parent = this;
          this.children.push(child);
        }
        return child;
      },
      replaceChildren(...nodes) {
        this.replaceChildrenCalls++;
        _ownText = "";
        this.children = [];
        nodes.forEach((node) => {
          if (node && node.nodeType === 11) {
            node.children.forEach((c) => {
              c.parent = this;
              this.children.push(c);
            });
            node.children = [];
          } else if (node) {
            node.parent = this;
            this.children.push(node);
          }
        });
      },
      remove() {
        if (this.parent && Array.isArray(this.parent.children)) {
          this.parent.children = this.parent.children.filter((c) => c !== this);
        }
      },
      matches(selector) {
        if (!selector || typeof selector !== "string") return false;
        if (selector.startsWith(".")) {
          const cls = selector.slice(1);
          const tokens = (this.className || "").split(/\s+/).filter(Boolean);
          return tokens.includes(cls) || this.classList.contains(cls);
        }
        if (selector.startsWith("#")) {
          const id = selector.slice(1);
          return this.id === id || this.attributes["id"] === id;
        }
        return this.tagName === selector.toUpperCase();
      },
      closest(selector) {
        let cur = this;
        while (cur && cur.nodeType === 1) {
          if (typeof cur.matches === "function" && cur.matches(selector)) {
            return cur;
          }
          cur = cur.parent || null;
        }
        return null;
      },
      addEventListener(evt, fn) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(fn);
      },
      trigger(evt, eventObj = {}) {
        const event = {
          type: evt,
          target: eventObj.target || this,
          currentTarget: this,
          defaultPrevented: false,
          propagationStopped: false,
          preventDefault() {
            this.defaultPrevented = true;
          },
          stopPropagation() {
            this.propagationStopped = true;
          },
          ...eventObj,
        };
        if (!event.target) event.target = this;

        let cur = this;
        while (cur && cur.nodeType === 1) {
          event.currentTarget = cur;
          if (cur.listeners && cur.listeners[evt]) {
            cur.listeners[evt].forEach((fn) => fn.call(cur, event));
          }
          if (event.propagationStopped) break;
          cur = cur.parent || null;
        }
        return event;
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
  const sortBtn = createElement("button");
  const searchInput = createElement("input");
  const searchBtn = createElement("button");
  const filterContainer = createElement("div");

  elements["list"] = list;
  elements["loading"] = loading;
  elements["status"] = status;
  elements["refresh-btn"] = refreshBtn;
  elements["sort-btn"] = sortBtn;
  elements["search-field"] = searchInput;
  elements["search-btn"] = searchBtn;
  elements["filter-container"] = filterContainer;

  const allRadio = { value: "all", checked: true };

  global.document = {
    createElement,
    createDocumentFragment,
    getElementById: (id) => elements[id] || null,
    querySelector: (selector) => {
      if (selector === 'input[name="filter"]:checked') {
        return { value: checkedFilterValue };
      }
      if (selector === 'input[name="filter"][value="all"]') {
        return allRadio;
      }
      return null;
    },
    addEventListener: () => {},
  };

  global.window = {
    document: global.document,
  };

  return {
    elements,
    createElement,
    createDocumentFragment,
    setCheckedFilter(val) {
      checkedFilterValue = val;
    },
  };
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

  // Warning #4: delete handles { status: 'queued' } via container-level delegation on #list
  const deleteBtn = actionsDiv.children[1];
  const deleteImg = deleteBtn.children[0];
  assert.equal(Object.keys(deleteBtn.listeners).length, 0, "deleteBtn must not have per-card event listeners");

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

  // Trigger click on the trash icon inside .btn-delete, bubbling to #list
  deleteImg.trigger("click");
  assert.equal(messageSent.type, "DELETE_SERIES");
  assert.deepEqual(messageSent.payload, { manga: "xss manga" }, "DELETE_SERIES payload must normalize manga key");
  assert.equal(getAllSeries().length, 0, "Card must be removed from series list when background returns queued");
  assert.equal(elements["list"].children.length, 1);
  assert.equal(elements["list"].children[0].textContent, "Vault is empty. Start reading!", "Empty status should display");

  delete global.confirm;
  delete global.document;
  delete global.window;
  delete global.chrome;
});

test("Phase 3 (AC-10, AC-11, AC-18, AM-5): DocumentFragment replaceChildren batching, #list delegation, repeat-click guard, and dead preview removal", () => {
  const { elements } = setupMockDom();
  const { renderList, setAllSeries, initPopupDom } = require("../popup.js");
  initPopupDom();

  const series = [
    [
      "solo leveling",
      {
        title: "Solo Leveling",
        chapter: "179",
        site: "asuracomic.net",
        url: "https://asuracomic.net/series/solo-leveling/chapter/179",
        cover: "https://example.com/cover.jpg",
        updated: "2026-11-22T10:00:00Z",
      },
    ],
    [
      "nano machine",
      {
        title: "Nano Machine",
        chapter: "215",
        site: "kunmanga.com",
        url: "https://kunmanga.com/manga/nano-machine/chapter-215/",
        updated: "2026-11-21T10:00:00Z",
      },
    ],
  ];

  setAllSeries([...series]);
  elements["list"].appendChildCalls = 0;
  elements["list"].replaceChildrenCalls = 0;

  renderList(series);

  // AC-10: Mounted via single replaceChildren(fragment) call without loop-body appendChild on #list
  assert.equal(elements["list"].replaceChildrenCalls, 1, "Must mount fragment via single replaceChildren call");
  assert.equal(elements["list"].appendChildCalls, 0, "Must not call listElement.appendChild inside render loop");
  assert.equal(elements["list"].children.length, 2);

  // AC-11 & AC-18: Zero per-card or hover listeners, no .no-cover class
  for (const card of elements["list"].children) {
    assert.equal(Object.keys(card.listeners).length, 0, "Card must have zero listeners");
    const headerRow = card.children[0];
    const titleEl = headerRow.children[0];
    assert.equal(Object.keys(titleEl.listeners).length, 0, "Title must have zero hover listeners");
    assert.equal(titleEl.classList.contains("no-cover"), false, "Title must never receive dead .no-cover class");
    const actionsDiv = card.children[1].children[1];
    const readLink = actionsDiv.children[0];
    const deleteBtn = actionsDiv.children[1];
    assert.equal(Object.keys(readLink.listeners).length, 0, "readLink must have zero per-card listeners");
    assert.equal(Object.keys(deleteBtn.listeners).length, 0, "deleteBtn must have zero per-card listeners");
  }

  // AM-5: Delegated delete repeat-click guard while in flight and error recovery
  const firstCard = elements["list"].children[0];
  const firstDeleteBtn = firstCard.children[1].children[1].children[1];
  global.confirm = () => true;

  let deleteSendCount = 0;
  let pendingDeleteCb = null;
  global.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        if (msg.type === "DELETE_SERIES") {
          deleteSendCount++;
          pendingDeleteCb = cb;
        }
      },
    },
  };

  firstDeleteBtn.trigger("click");
  assert.equal(deleteSendCount, 1);
  assert.equal(firstDeleteBtn.textContent, "Deleting...");
  assert.equal(firstDeleteBtn.disabled, true);

  // Second click while in-flight must be ignored
  firstDeleteBtn.trigger("click");
  assert.equal(deleteSendCount, 1, "Repeat click while delete is in flight must not dispatch duplicate DELETE_SERIES");

  // Simulate failed response -> button shows Error and becomes clickable again
  pendingDeleteCb({ status: "error" });
  assert.equal(firstDeleteBtn.textContent, "Error");
  assert.equal(firstDeleteBtn.disabled, false);

  delete global.confirm;
  delete global.document;
  delete global.window;
  delete global.chrome;
});

test("Phase 3 (AC-13, AC-15, AC-16, AC-17, AM-4): Sort toggle (Recently Read vs A–Z), Kunmanga filter, #search-btn click, and empty vault vs empty filter state", () => {
  const { elements, setCheckedFilter } = setupMockDom();
  const {
    setAllSeries,
    applyFilters,
    initPopupDom,
    getSortMode,
    setSortMode,
  } = require("../popup.js");
  initPopupDom();
  setSortMode("recent");

  // AC-16: Empty vault (0 total series) always renders "Vault is empty. Start reading!" even if search/filter active
  setAllSeries([]);
  elements["search-field"].value = "Solo";
  setCheckedFilter("kunmanga");
  applyFilters();
  assert.equal(elements["list"].children.length, 1);
  assert.equal(elements["list"].children[0].textContent, "Vault is empty. Start reading!");

  // Populate vault with 3 series
  elements["search-field"].value = "";
  setCheckedFilter("all");
  const vaultEntries = [
    [
      "tower of god",
      {
        title: "Tower of God",
        chapter: "600",
        site: "mangahere.cc",
        url: "https://www.mangahere.cc/manga/tower_of_god/c600/",
        updated: "2026-11-20T00:00:00Z",
      },
    ],
    [
      "nano machine",
      {
        title: "Nano Machine",
        chapter: "215",
        site: "kunmanga.com",
        url: "https://kunmanga.com/manga/nano-machine/chapter-215/",
        updated: "2026-11-22T08:00:00Z", // Most recent
      },
    ],
    [
      "asura blade",
      {
        title: "Asura Blade",
        chapter: "10",
        site: "asuracomic.net",
        url: "https://asuracomic.net/series/asura-blade/chapter/10",
        updated: "2026-11-21T00:00:00Z",
      },
    ],
  ];
  setAllSeries(vaultEntries);
  applyFilters();

  // AC-17: Default sort is "Recently Read" descending by updated timestamp
  assert.equal(getSortMode(), "recent");
  assert.equal(elements["sort-btn"].textContent, "Recently Read");
  const renderedTitlesRecent = elements["list"].children.map(
    (c) => c.children[0].children[0].textContent,
  );
  assert.deepEqual(renderedTitlesRecent, ["Nano Machine", "Asura Blade", "Tower of God"]);

  // Click #sort-btn to toggle to "A–Z"
  elements["sort-btn"].trigger("click");
  assert.equal(getSortMode(), "az");
  assert.equal(elements["sort-btn"].textContent, "A–Z");
  const renderedTitlesAz = elements["list"].children.map(
    (c) => c.children[0].children[0].textContent,
  );
  assert.deepEqual(renderedTitlesAz, ["Asura Blade", "Nano Machine", "Tower of God"]);

  // AC-13: Filter by "kunmanga"
  setCheckedFilter("kunmanga");
  elements["filter-container"].trigger("change", { target: { name: "filter", value: "kunmanga" } });
  assert.equal(elements["list"].children.length, 1);
  const kunCard = elements["list"].children[0];
  assert.equal(kunCard.children[0].children[0].textContent, "Nano Machine");
  const kunSiteTag = kunCard.children[1].children[0].children[0];
  assert.equal(kunSiteTag.textContent, "KunManga");

  // AC-15: Search button click triggers applyFilters()
  setCheckedFilter("all");
  elements["search-field"].value = "tower";
  elements["search-btn"].trigger("click");
  assert.equal(elements["list"].children.length, 1);
  assert.equal(elements["list"].children[0].children[0].children[0].textContent, "Tower of God");

  // AC-16: Non-empty vault with 0 matching results renders "No matching series found."
  elements["search-field"].value = "nonexistent series xyz";
  elements["search-btn"].trigger("click");
  assert.equal(elements["list"].children.length, 1);
  assert.equal(elements["list"].children[0].textContent, "No matching series found.");

  setSortMode("recent");
  delete global.document;
  delete global.window;
});

test("Phase 3 (AC-9): loadVault handles pre-migration duplicate keys in chrome.storage.local without rendering duplicate cards", async () => {
  const { elements } = setupMockDom();
  const { loadVault, getAllSeries, initPopupDom, setSortMode } = require("../popup.js");
  initPopupDom();
  setSortMode("recent");

  global.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const res = {
            series: {
              "Solo Leveling": {
                chapter: "150",
                url: "https://mangadex.org/chapter/150",
                updated: "2026-11-20T00:00:00Z",
              },
              "solo leveling": {
                chapter: "155",
                url: "https://asuracomic.net/series/solo-leveling/chapter/155",
                updated: "2026-11-22T00:00:00Z",
              },
            },
            lastSync: "2026-11-22T00:00:00Z",
          };
          if (typeof cb === "function") cb(res);
          return Promise.resolve(res);
        },
      },
    },
    runtime: {
      sendMessage: (msg, cb) => {
        if (typeof cb === "function") cb({ status: "offline" });
      },
    },
  };

  await loadVault();

  assert.equal(getAllSeries().length, 1, "Pre-migration duplicate keys must collapse into 1 card");
  assert.equal(elements["list"].children.length, 1);
  const card = elements["list"].children[0];
  assert.equal(card.children[0].children[0].textContent, "Solo Leveling", "Display title casing must be preserved");
  assert.equal(card.children[1].children[0].children[1].textContent, "Chapter 155", "Newer LWW chapter must win");

  delete global.document;
  delete global.window;
  delete global.chrome;
});

test("Phase 3 (AC-13, AC-14, AC-17, AC-18, BUG-003): popup.html preserves 380px viewport/box-sizing, includes Kunmanga radio & #sort-btn, and removes dead preview markup/CSS", () => {
  const htmlPath = path.join(__dirname, "..", "popup.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.match(html, /\*\s*\{\s*box-sizing:\s*border-box;\s*\}/, "Must preserve * { box-sizing: border-box; }");
  assert.match(html, /width:\s*380px;/, "Must preserve 380px body width");
  assert.match(html, /overflow-x:\s*hidden;/, "Must preserve overflow-x: hidden");
  assert.match(html, /flex-wrap:\s*wrap;/, "Must preserve flex-wrap: wrap on #filter-container");
  assert.match(html, /<input[^>]+value="kunmanga"[^>]+name="filter"/, "Must include Kunmanga radio in #filter-container");
  assert.match(html, /id="sort-btn"/, "Must include #sort-btn sort toggle in #header");

  assert.equal(html.includes("manga-preview"), false, "Must remove #manga-preview from popup.html");
  assert.equal(html.includes("preview-img"), false, "Must remove #preview-img from popup.html");
  assert.equal(html.includes("no-cover"), false, "Must remove .no-cover from popup.html");
});
