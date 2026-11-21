const test = require("node:test");
const assert = require("node:assert/strict");

const {
  asuraConfig,
  SITE_CONFIGS,
  isValidTitle,
  isValidChapter,
  clearAllTimers,
  checkPage,
  init,
  getScrollDepth,
  isScrollDepthSatisfied,
  maybeDispatchSync,
  onScroll,
  onUrlChange,
  handleRouteChange,
  getActiveRetryTimer,
  getActiveRouteChangeTimer,
  getDwellSatisfied,
  getDispatchedForUrl,
  getDetectedChapterPayload,
  resetState,
} = require("../content.js");

test("isValidTitle: checks for non-empty string", () => {
  assert.equal(isValidTitle("Solo Leveling"), true);
  assert.equal(isValidTitle("  Valid Title  "), true);
  assert.equal(isValidTitle(""), false);
  assert.equal(isValidTitle("   "), false);
  assert.equal(isValidTitle(null), false);
  assert.equal(isValidTitle(undefined), false);
  assert.equal(isValidTitle(123), false);
});

test("isValidChapter: treats chapter 0 and '0' as valid, rejects nullish/empty/Reading/NaN/booleans/objects", () => {
  // Numeric and string 0 must be valid
  assert.equal(isValidChapter(0), true, "Numeric 0 must be valid");
  assert.equal(isValidChapter("0"), true, "String '0' must be valid");

  // Valid integers, decimals, and fractional strings
  assert.equal(isValidChapter(150), true);
  assert.equal(isValidChapter("150"), true);
  assert.equal(isValidChapter(150.5), true);
  assert.equal(isValidChapter("150.5"), true);
  assert.equal(isValidChapter("12-1"), true);
  assert.equal(isValidChapter("150-5"), true);

  // Invalid values
  assert.equal(isValidChapter(null), false, "null must be invalid");
  assert.equal(isValidChapter(undefined), false, "undefined must be invalid");
  assert.equal(isValidChapter(""), false, "Empty string must be invalid");
  assert.equal(isValidChapter("   "), false, "Whitespace must be invalid");
  assert.equal(isValidChapter("Reading"), false, "'Reading' placeholder must be invalid");
  assert.equal(isValidChapter(NaN), false, "NaN must be invalid");
  assert.equal(isValidChapter(Infinity), false, "Infinity must be invalid");
  assert.equal(isValidChapter(-Infinity), false, "-Infinity must be invalid");
  assert.equal(isValidChapter(true), false, "boolean true must be invalid");
  assert.equal(isValidChapter(false), false, "boolean false must be invalid");
  assert.equal(isValidChapter({}), false, "object must be invalid");
  assert.equal(isValidChapter([]), false, "array must be invalid");
  assert.equal(isValidChapter(() => {}), false, "function must be invalid");
});

test("Asura Scans: regex matches integer, decimal, and fractional chapters", () => {
  const cases = [
    {
      url: "/comics/solo-leveling-8a7b6c5d/chapter/150",
      expectedTitle: "solo leveling",
      expectedChapter: "150",
    },
    {
      url: "/series/solo-leveling-8a7b6c5d/chapter/150.5",
      expectedTitle: "solo leveling",
      expectedChapter: "150.5",
    },
    {
      url: "/series/nano-machine/chapter/12-1",
      expectedTitle: "nano machine",
      expectedChapter: "12-1",
    },
    {
      url: "/series/nano-machine/chapter/150-5",
      expectedTitle: "nano machine",
      expectedChapter: "150-5",
    },
    {
      url: "/comics/the-beginning-after-the-end-8a7b6c5d/chapter/175.2",
      expectedTitle: "the beginning after the end",
      expectedChapter: "175.2",
    },
  ];

  for (const { url, expectedTitle, expectedChapter } of cases) {
    const match = url.match(asuraConfig.regex);
    assert.ok(match, `URL ${url} should match asura regex`);
    const title = asuraConfig.getTitle(match);
    const chapter = asuraConfig.getChapter(match);
    assert.equal(title, expectedTitle);
    assert.equal(chapter, expectedChapter);
  }
});

test("Asura Scans: malformed trailing separators do not capture stray characters", () => {
  // Trailing dot
  const dotUrl = "/series/solo-leveling/chapter/150.";
  const dotMatch = dotUrl.match(asuraConfig.regex);
  assert.ok(dotMatch);
  assert.equal(asuraConfig.getChapter(dotMatch), "150", "Stray dot must not be captured");

  // Trailing hyphen
  const hyphenUrl = "/series/nano-machine/chapter/12-";
  const hyphenMatch = hyphenUrl.match(asuraConfig.regex);
  assert.ok(hyphenMatch);
  assert.equal(asuraConfig.getChapter(hyphenMatch), "12", "Stray hyphen must not be captured");
});

test("Asura Scans: series slugs with numbers do not produce false-positive chapter matches", () => {
  const url = "/series/solo-leveling-2-12345678/chapter/150";
  const match = url.match(asuraConfig.regex);
  assert.ok(match);
  assert.equal(asuraConfig.getTitle(match), "solo leveling 2");
  assert.equal(asuraConfig.getChapter(match), "150");
});

test("Asura Scans: returns null when chapter is missing or non-matching path", () => {
  const nonChapterUrl = "/series/solo-leveling/about";
  const match = nonChapterUrl.match(asuraConfig.regex);
  assert.equal(match, null);

  assert.equal(asuraConfig.getChapter(null), null);
  assert.equal(asuraConfig.getChapter([]), null);
  assert.equal(asuraConfig.getChapter(["", "title", "non-digit-chapter"]), null);
});

test("MangaDex: getTitle() and getChapter() return null when DOM elements are unmounted", () => {
  const config = SITE_CONFIGS["mangadex.org"];

  // Empty DOM: no elements found
  const emptyDoc = {
    querySelector: () => null,
  };

  assert.equal(config.getTitle(emptyDoc), null);
  assert.equal(config.getChapter(null, emptyDoc), null);
});

test("MangaDex: getChapter() returns null on 'Reading' placeholder and never returns 'Reading'", () => {
  const config = SITE_CONFIGS["mangadex.org"];

  const readingDoc = {
    querySelector: (selector) => {
      if (selector === "div.reader--meta.chapter") {
        return { innerText: "Reading" };
      }
      return null;
    },
  };

  const result = config.getChapter(null, readingDoc);
  assert.equal(result, null, "Must return null instead of 'Reading'");
});

test("MangaDex: getChapter() extracts integer, decimal, and chapter 0", () => {
  const config = SITE_CONFIGS["mangadex.org"];

  function createDoc(chapterText, titleText = "Chainsaw Man") {
    return {
      querySelector: (selector) => {
        if (selector === "a.reader--header-manga") return { innerText: titleText };
        if (selector === "div.reader--meta.chapter") return { innerText: chapterText };
        return null;
      },
    };
  }

  // Chapter 0
  const doc0 = createDoc("Chapter 0");
  assert.equal(config.getTitle(doc0), "Chainsaw Man");
  assert.equal(config.getChapter(null, doc0), "0");

  // Chapter 150
  const doc150 = createDoc("Chapter 150 - The Hero");
  assert.equal(config.getChapter(null, doc150), "150");

  // Chapter 42.5
  const docDecimal = createDoc("Chapter 42.5");
  assert.equal(config.getChapter(null, docDecimal), "42.5");
});

test("MangaPlus: getTitle() and getChapter() return null when DOM elements are unmounted", () => {
  const config = SITE_CONFIGS["mangaplus.shueisha.co.jp"];

  const emptyDoc = {
    querySelector: () => null,
  };

  assert.equal(config.getTitle(emptyDoc), null);
  assert.equal(config.getChapter(null, emptyDoc), null);
});

test("MangaPlus: getChapter() returns null on 'Reading' placeholder, whitespace, or missing numbers", () => {
  const config = SITE_CONFIGS["mangaplus.shueisha.co.jp"];

  const readingDoc = {
    querySelector: (selector) => {
      if (selector === "p[class*='Navigation-module_chapterTitle']") {
        return { innerText: "Reading" };
      }
      return null;
    },
  };

  assert.equal(config.getChapter(null, readingDoc), null);

  const emptyDoc = {
    querySelector: (selector) => {
      if (selector === "p[class*='Navigation-module_chapterTitle']") {
        return { innerText: "   " };
      }
      return null;
    },
  };

  assert.equal(config.getChapter(null, emptyDoc), null);
});

test("MangaPlus: getChapter() extracts numbers including 0, #070, and decimal chapters", () => {
  const config = SITE_CONFIGS["mangaplus.shueisha.co.jp"];

  function createDoc(chapterText, titleText = "Jujutsu Kaisen") {
    return {
      querySelector: (selector) => {
        if (selector === "h1[class*='Navigation-module_title']") return { innerText: titleText };
        if (selector === "p[class*='Navigation-module_chapterTitle']") return { innerText: chapterText };
        return null;
      },
    };
  }

  // Chapter #000 / 0
  const doc0 = createDoc("#000");
  assert.equal(config.getTitle(doc0), "Jujutsu Kaisen");
  assert.equal(config.getChapter(null, doc0), 0);

  // Chapter #070
  const doc70 = createDoc("#070");
  assert.equal(config.getChapter(null, doc70), 70);

  // Chapter #070.5
  const docDecimal = createDoc("#070.5");
  assert.equal(config.getChapter(null, docDecimal), 70.5);
});

test("checkPage: retries up to 8 times when title or chapter is missing and stops cleanly without scheduling sync debounce", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  try {
    let timerCount = 0;
    let scheduledCallback = null;
    let scheduledDelay = null;

    global.setTimeout = (cb, delay) => {
      timerCount++;
      scheduledCallback = cb;
      scheduledDelay = delay;
      return timerCount;
    };
    global.clearTimeout = () => {};

    // Mock window & document for MangaDex with missing metadata elements
    global.window = {
      location: {
        hostname: "mangadex.org",
        href: "https://mangadex.org/chapter/test-uuid",
        pathname: "/chapter/test-uuid",
      },
      sanctumTimer: null,
    };
    global.document = {
      querySelector: () => null, // Elements not mounted
    };

    // First call (retry 0)
    checkPage(0);
    assert.equal(scheduledDelay, 1000, "Should schedule 1000ms retry backoff");
    assert.equal(global.window.sanctumTimer, null, "Should not schedule sync debounce");

    // Execute retries 1 through 7
    for (let r = 1; r < 8; r++) {
      assert.ok(scheduledCallback, `Callback must be scheduled for retry ${r}`);
      const cb = scheduledCallback;
      scheduledCallback = null;
      cb();
      assert.equal(scheduledDelay, 1000);
      assert.equal(global.window.sanctumTimer, null);
    }

    // Now invoke retry 8 (exhausted)
    scheduledCallback = null;
    scheduledDelay = null;
    checkPage(8);

    // After 8 retries, no further retry timer scheduled and no sanctumTimer
    assert.equal(scheduledCallback, null, "Must stop scheduling retries after 8 attempts");
    assert.equal(global.window.sanctumTimer, null, "Must never schedule sync debounce when metadata is missing");
  } finally {
    clearAllTimers();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    delete global.window;
    delete global.document;
  }
});

test("checkPage: initiates 15s sync debounce when both title and chapter (including chapter 0) are valid", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  try {
    let syncTimerDelay = null;
    let syncTimerCb = null;

    global.setTimeout = (cb, delay) => {
      syncTimerCb = cb;
      syncTimerDelay = delay;
      return 101;
    };
    global.clearTimeout = () => {};

    const sentMessages = [];
    global.chrome = {
      runtime: {
        sendMessage: (msg) => sentMessages.push(msg),
      },
    };

    // Mock window & document for MangaDex with title and chapter 0
    global.window = {
      location: {
        hostname: "mangadex.org",
        href: "https://mangadex.org/chapter/test-uuid",
        pathname: "/chapter/test-uuid",
      },
      sanctumTimer: null,
    };
    global.document = {
      querySelector: (selector) => {
        if (selector === "a.reader--header-manga") return { innerText: "Chainsaw Man" };
        if (selector === "div.reader--meta.chapter") return { innerText: "Chapter 0" };
        return null;
      },
    };

    checkPage(0);

    assert.equal(syncTimerDelay, 15000, "Must schedule 15s debounce timer");
    assert.equal(global.window.sanctumTimer, 101, "sanctumTimer must be set on window");
    assert.equal(sentMessages.length, 0, "Should not send message before debounce timer fires");

    // Trigger debounce timer
    syncTimerCb();

    assert.equal(sentMessages.length, 1, "Must send SYNC_CHAPTER on debounce timer fire");
    assert.deepEqual(sentMessages[0], {
      type: "SYNC_CHAPTER",
      payload: {
        manga: "Chainsaw Man",
        chapter: "0",
        url: "https://mangadex.org/chapter/test-uuid",
        site: "mangadex.org",
      },
    });
  } finally {
    clearAllTimers();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    delete global.window;
    delete global.document;
    delete global.chrome;
  }
});

test("checkPage & clearAllTimers: route/URL change cancels all pending retry and debounce timers", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  try {
    const clearedTimers = [];
    let timerId = 10;

    global.setTimeout = () => ++timerId;
    global.clearTimeout = (id) => clearedTimers.push(id);

    global.window = {
      location: {
        hostname: "mangadex.org",
        href: "https://mangadex.org/chapter/old-uuid",
        pathname: "/chapter/old-uuid",
      },
      sanctumTimer: null,
    };
    global.document = {
      querySelector: () => null, // triggers retry timer
    };

    // Schedule retry timer
    checkPage(0);
    const retryTimer = getActiveRetryTimer();
    assert.ok(retryTimer, "Retry timer must be active");

    // Also simulate an active sanctumTimer
    global.window.sanctumTimer = 777;

    // Call clearAllTimers (simulating route change handler)
    clearAllTimers();

    assert.equal(global.window.sanctumTimer, null, "window.sanctumTimer must be cleared");
    assert.equal(getActiveRetryTimer(), null, "activeRetryTimer must be cleared");
    assert.ok(clearedTimers.includes(retryTimer), "clearTimeout must have been called for retry timer");
    assert.ok(clearedTimers.includes(777), "clearTimeout must have been called for sanctumTimer");
  } finally {
    clearAllTimers();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    delete global.window;
    delete global.document;
  }
});

test("clearAllTimers: clears sanctumTimer without errors", () => {
  const originalClearTimeout = global.clearTimeout;
  try {
    let cleared = false;
    global.window = {
      sanctumTimer: 12345,
    };
    global.clearTimeout = (id) => {
      if (id === 12345) cleared = true;
    };

    clearAllTimers();
    assert.equal(cleared, true);
    assert.equal(global.window.sanctumTimer, null);
  } finally {
    global.clearTimeout = originalClearTimeout;
    delete global.window;
  }
});

test("scroll depth: evaluates <=25%, >25%, and non-scrollable single-viewport edge cases", () => {
  try {
    // 1. Non-scrollable page (scrollHeight <= viewportHeight) evaluates as 1.0 (satisfied)
    global.window = { innerHeight: 800, scrollY: 0 };
    global.document = {
      documentElement: { scrollHeight: 800, clientHeight: 800, scrollTop: 0 },
      body: { scrollHeight: 800, scrollTop: 0 },
    };
    assert.equal(getScrollDepth(), 1.0, "Non-scrollable page must evaluate to 1.0");
    assert.equal(isScrollDepthSatisfied(), true, "Non-scrollable page must be satisfied");

    // 2. Scrollable page (scrollHeight = 2000, viewport = 1000, scrollableHeight = 1000)
    // At scrollTop = 200: depth = 0.20 (<= 0.25 -> not satisfied)
    global.window = { innerHeight: 1000, scrollY: 200 };
    global.document = {
      documentElement: { scrollHeight: 2000, clientHeight: 1000, scrollTop: 200 },
      body: { scrollHeight: 2000, scrollTop: 200 },
    };
    assert.equal(getScrollDepth(), 0.2, "200/1000 must evaluate to 0.20");
    assert.equal(isScrollDepthSatisfied(), false, "0.20 must not satisfy > 0.25 gate");

    // At scrollTop = 250: depth = 0.25 (boundary case: strictly > 0.25 is required -> not satisfied)
    global.window.scrollY = 250;
    global.document.documentElement.scrollTop = 250;
    assert.equal(getScrollDepth(), 0.25, "250/1000 must evaluate to 0.25");
    assert.equal(isScrollDepthSatisfied(), false, "Boundary 0.25 must not satisfy > 0.25 gate");

    // At scrollTop = 260: depth = 0.26 (> 0.25 -> satisfied)
    global.window.scrollY = 260;
    global.document.documentElement.scrollTop = 260;
    assert.equal(getScrollDepth(), 0.26, "260/1000 must evaluate to 0.26");
    assert.equal(isScrollDepthSatisfied(), true, "0.26 must satisfy > 0.25 gate");
  } finally {
    delete global.window;
    delete global.document;
  }
});

test("scroll/dwell convergence: 15s dwell with scroll <= 25% withholds dispatch until scroll > 25%, and dispatches once", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  try {
    resetState();
    let dwellTimerCb = null;

    global.setTimeout = (cb, delay) => {
      if (delay === 15000) {
        dwellTimerCb = cb;
        return 555;
      }
      return 1;
    };
    global.clearTimeout = () => {};

    const sentMessages = [];
    global.chrome = {
      runtime: {
        sendMessage: (msg) => sentMessages.push(msg),
      },
    };

    // Scrollable page, user currently at scrollTop = 0 (0% depth)
    global.window = {
      innerHeight: 1000,
      scrollY: 0,
      location: {
        hostname: "mangadex.org",
        href: "https://mangadex.org/chapter/chapter-convergence-test",
        pathname: "/chapter/chapter-convergence-test",
      },
      sanctumTimer: null,
    };
    global.document = {
      documentElement: { scrollHeight: 2000, clientHeight: 1000, scrollTop: 0 },
      body: { scrollHeight: 2000, scrollTop: 0 },
      querySelector: (selector) => {
        if (selector === "a.reader--header-manga") return { innerText: "Tower of God" };
        if (selector === "div.reader--meta.chapter") return { innerText: "Chapter 50" };
        return null;
      },
    };

    // 1. Detect page: schedules 15s timer
    checkPage(0);
    assert.ok(dwellTimerCb, "15s dwell timer callback must be scheduled");
    assert.equal(sentMessages.length, 0, "Must not dispatch before dwell timer fires");

    // 2. 15s timer fires while user is still at scrollTop = 0 (<= 25%)
    dwellTimerCb();
    assert.equal(getDwellSatisfied(), true, "Dwell must now be marked satisfied");
    assert.equal(sentMessages.length, 0, "Must NOT dispatch if scroll depth is <= 25% when dwell fires");

    // 3. User scrolls to 20% (still <= 25%)
    global.window.scrollY = 200;
    global.document.documentElement.scrollTop = 200;
    onScroll();
    assert.equal(sentMessages.length, 0, "Must NOT dispatch at 20% scroll depth");

    // 4. User scrolls past 25% to 40% (400px)
    global.window.scrollY = 400;
    global.document.documentElement.scrollTop = 400;
    onScroll();
    assert.equal(sentMessages.length, 1, "Must dispatch SYNC_CHAPTER once user scrolls > 25%");
    assert.deepEqual(sentMessages[0], {
      type: "SYNC_CHAPTER",
      payload: {
        manga: "Tower of God",
        chapter: "50",
        url: "https://mangadex.org/chapter/chapter-convergence-test",
        site: "mangadex.org",
      },
    });

    // 5. Subsequent scrolling on same URL must NOT dispatch duplicate messages
    global.window.scrollY = 800;
    global.document.documentElement.scrollTop = 800;
    onScroll();
    assert.equal(sentMessages.length, 1, "Must NOT dispatch duplicate messages on subsequent scrolls");
  } finally {
    resetState();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    delete global.window;
    delete global.document;
    delete global.chrome;
  }
});

test("route change: early scroll with route departure before 15s cancels timer and never dispatches", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  try {
    resetState();
    let dwellTimerId = null;
    let cancelledTimerId = null;

    global.setTimeout = (cb, delay) => {
      if (delay === 15000) {
        dwellTimerId = 777;
        return dwellTimerId;
      }
      return 1;
    };
    global.clearTimeout = (id) => {
      cancelledTimerId = id;
    };

    const sentMessages = [];
    global.chrome = {
      runtime: {
        sendMessage: (msg) => sentMessages.push(msg),
      },
    };

    // User is on Chapter 1 and immediately scrolls > 25%
    global.window = {
      innerHeight: 1000,
      scrollY: 500, // 50% scroll depth
      location: {
        hostname: "mangadex.org",
        href: "https://mangadex.org/chapter/chapter-early-leave-1",
        pathname: "/chapter/chapter-early-leave-1",
      },
      sanctumTimer: null,
    };
    global.document = {
      documentElement: { scrollHeight: 2000, clientHeight: 1000, scrollTop: 500 },
      body: { scrollHeight: 2000, scrollTop: 500 },
      querySelector: (selector) => {
        if (selector === "a.reader--header-manga") return { innerText: "Omniscient Reader" };
        if (selector === "div.reader--meta.chapter") return { innerText: "Chapter 1" };
        return null;
      },
    };

    checkPage(0);
    assert.equal(global.window.sanctumTimer, 777, "Timer must be active");
    assert.equal(sentMessages.length, 0, "Must not dispatch before 15s");

    // User navigates away to Chapter 2 before 15s expires
    global.window.location.href = "https://mangadex.org/chapter/chapter-early-leave-2";
    global.window.location.pathname = "/chapter/chapter-early-leave-2";
    onUrlChange();

    assert.equal(cancelledTimerId, 777, "15s dwell timer must be cancelled on route change");
    assert.equal(getDwellSatisfied(), false, "Dwell satisfied must be reset to false");
    assert.equal(sentMessages.length, 0, "SYNC_CHAPTER must never have been dispatched");
  } finally {
    resetState();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    delete global.window;
    delete global.document;
    delete global.chrome;
  }
});

test("init: does NOT observe document with MutationObserver and wires window.navigation with fallbacks", () => {
  let mutationObserverInstantiated = false;
  let navigationListeners = {};
  let windowListeners = {};

  const originalMutationObserver = global.MutationObserver;

  try {
    resetState();

    global.MutationObserver = class MockMutationObserver {
      constructor() {
        mutationObserverInstantiated = true;
      }
      observe() {
        mutationObserverInstantiated = true;
      }
      disconnect() {}
    };

    global.window = {
      location: {
        hostname: "asuracomic.net",
        href: "https://asuracomic.net/series/solo-leveling/chapter/1",
        pathname: "/series/solo-leveling/chapter/1",
      },
      navigation: {
        addEventListener: (event, handler) => {
          navigationListeners[event] = handler;
        },
      },
      addEventListener: (event, handler) => {
        windowListeners[event] = handler;
      },
    };

    global.document = {
      querySelector: () => null,
    };

    init();

    // Verify AC-12: Zero MutationObserver usage on document
    assert.equal(
      mutationObserverInstantiated,
      false,
      "init() must NOT instantiate or observe MutationObserver on document",
    );

    // Verify AC-13: window.navigation API event listeners
    assert.equal(typeof navigationListeners["navigatesuccess"], "function", "Must listen to navigatesuccess");
    assert.equal(typeof navigationListeners["currententrychange"], "function", "Must listen to currententrychange");

    // Verify AC-13: fallback window event listeners
    assert.equal(typeof windowListeners["popstate"], "function", "Must listen to popstate");
    assert.equal(typeof windowListeners["hashchange"], "function", "Must listen to hashchange");
    assert.equal(typeof windowListeners["scroll"], "function", "Must listen to scroll");
  } finally {
    resetState();
    global.MutationObserver = originalMutationObserver;
    delete global.window;
    delete global.document;
  }
});
