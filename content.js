const asuraConfig = {
  regex: /(?:comics|series)\/([^\/]+)\/chapter\/(\d+(?:[\.\-]\d+)*)/,
  titleIndex: 1,
  chapterIndex: 2,
  getTitle: (match) =>
    match[1].replace(/-[a-z0-9]{8}$/, "").replace(/-/g, " "),
  getChapter: (match) => {
    if (!match || !match[2]) return null;
    const numMatch = match[2].match(/^(\d+(?:[\.\-]\d+)*)/);
    return numMatch ? numMatch[1] : null;
  },
};

const SITE_CONFIGS = {
  "asurascans.com": asuraConfig,
  "asuracomic.net": asuraConfig,
  "mangahere.cc": {
    regex: /manga\/([^\/]+)\/c([\d\.]+)/,
    titleIndex: 1,
    chapterIndex: 2,
    getTitle: (match) => match[1].replace(/_/g, " "),
  },
  "mangadex.org": {
    regex: /chapter\/([^\/]+)/,
    getTitle: (doc = typeof document !== "undefined" ? document : null) => {
      if (!doc) return null;
      const titleEl = doc.querySelector("a.reader--header-manga");
      return titleEl && titleEl.innerText ? titleEl.innerText.trim() : null;
    },
    getChapter: (match, doc = typeof document !== "undefined" ? document : null) => {
      if (!doc) return null;
      const chapterEl = doc.querySelector("div.reader--meta.chapter");
      if (!chapterEl) return null;
      const text = chapterEl.innerText?.trim();
      if (!text || text === "Reading") return null;
      const numMatch = text.match(/(\d+(\.\d+)?)/);
      return numMatch ? numMatch[0] : null;
    },
  },
  "mangaplus.shueisha.co.jp": {
    // MangaPlus URLs are just /viewer/12345
    regex: /viewer\/(\d+)/,
    getTitle: (doc = typeof document !== "undefined" ? document : null) => {
      if (!doc) return null;
      const titleEl = doc.querySelector(
        "h1[class*='Navigation-module_title']",
      );
      return titleEl && titleEl.innerText ? titleEl.innerText.trim() : null;
    },
    getChapter: (match, doc = typeof document !== "undefined" ? document : null) => {
      if (!doc) return null;
      const chapterEl = doc.querySelector(
        "p[class*='Navigation-module_chapterTitle']",
      );
      if (!chapterEl) return null;
      const text = chapterEl.innerText?.trim();
      if (!text || text === "Reading") return null;
      // Extracts the number from strings like "#070" or "#000" or "#070.5"
      const numMatch = text.match(/(\d+(\.\d+)?)/);
      if (!numMatch) return null;
      return numMatch[2] ? parseFloat(numMatch[0]) : parseInt(numMatch[0], 10);
    },
  },
  "kunmanga.com": {
    regex: /manga\/([^\/]+)\/([^\/]+)/,
    titleIndex: 1,
    chapterIndex: 2,
    getTitle: (match) => match[1].replace(/-/g, " "),
    getChapter: (match) => {
      const numMatch = match[2].match(/[\d\.]+/);
      return numMatch && numMatch[0] ? numMatch[0] : "Reading";
    },
  },
};

function isValidTitle(title) {
  return typeof title === "string" && title.trim().length > 0;
}

function isValidChapter(ch) {
  if (ch === null || ch === undefined) return false;
  if (typeof ch === "number") {
    return Number.isFinite(ch);
  }
  if (typeof ch === "string") {
    const trimmed = ch.trim();
    return trimmed.length > 0 && trimmed !== "Reading";
  }
  return false;
}

let activeRetryTimer = null;
let activeRouteChangeTimer = null;
let lastUrl = typeof window !== "undefined" && window.location ? window.location.href : "";

// Dwell and scroll-depth tracking for current chapter route
let dwellSatisfied = false;
let dispatchedForUrl = null;
let detectedChapterPayload = null;

function clearAllTimers() {
  if (typeof window !== "undefined" && window.sanctumTimer) {
    clearTimeout(window.sanctumTimer);
    window.sanctumTimer = null;
  }
  if (activeRetryTimer) {
    clearTimeout(activeRetryTimer);
    activeRetryTimer = null;
  }
  if (activeRouteChangeTimer) {
    clearTimeout(activeRouteChangeTimer);
    activeRouteChangeTimer = null;
  }
  dwellSatisfied = false;
}

function getScrollDepth() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return 1.0;
  }
  const docEl = document.documentElement;
  const body = document.body;
  const scrollHeight = Math.max(
    docEl && docEl.scrollHeight ? docEl.scrollHeight : 0,
    body && body.scrollHeight ? body.scrollHeight : 0,
  );
  const viewportHeight =
    window.innerHeight ||
    (docEl && docEl.clientHeight ? docEl.clientHeight : 0) ||
    0;
  const scrollableHeight = scrollHeight - viewportHeight;

  // Single viewport or non-scrollable page evaluates as satisfied (1.0)
  if (scrollableHeight <= 0) {
    return 1.0;
  }

  const scrollTop =
    (typeof window.scrollY === "number" ? window.scrollY : 0) ||
    (docEl && typeof docEl.scrollTop === "number" ? docEl.scrollTop : 0) ||
    (body && typeof body.scrollTop === "number" ? body.scrollTop : 0) ||
    0;

  return scrollTop / scrollableHeight;
}

function isScrollDepthSatisfied() {
  return getScrollDepth() > 0.25;
}

function maybeDispatchSync() {
  if (typeof window === "undefined" || !window.location) return;
  const currentUrl = window.location.href;

  // Dispatched at most once per chapter/URL
  if (dispatchedForUrl === currentUrl) {
    return;
  }

  if (!detectedChapterPayload || detectedChapterPayload.url !== currentUrl) {
    return;
  }

  // Both 15-second dwell and >25% scroll depth must hold
  if (dwellSatisfied && isScrollDepthSatisfied()) {
    dispatchedForUrl = currentUrl;
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: "SYNC_CHAPTER",
        payload: detectedChapterPayload,
      });
    }
  }
}

function onScroll() {
  if (
    dwellSatisfied &&
    typeof window !== "undefined" &&
    window.location &&
    dispatchedForUrl !== window.location.href
  ) {
    maybeDispatchSync();
  }
}

function handleRouteChange() {
  clearAllTimers();
  dwellSatisfied = false;
  dispatchedForUrl = null;
  detectedChapterPayload = null;
  checkPage();
}

function onUrlChange() {
  if (typeof window === "undefined" || !window.location) return;
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    console.log("[Sanctum] SPA Route Changed, resetting timers and re-checking...");
    handleRouteChange();
  }
}

function checkPage(retries = 0) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const hostname = window.location.hostname ? window.location.hostname.toLowerCase() : "";
  const domain = Object.keys(SITE_CONFIGS).find(
    (configuredDomain) =>
      hostname === configuredDomain || hostname.endsWith("." + configuredDomain),
  );
  const config = domain ? SITE_CONFIGS[domain] : undefined;

  if (!config) {
    console.log("Not Match");
    return;
  }

  const currentUrl = window.location.href;
  const path = window.location.pathname;
  const match = path ? path.match(config.regex) : null;

  if (match) {
    const mangaTitle = config.titleIndex
      ? config.getTitle(match)
      : config.getTitle(document);
    const chapterNumber = config.getChapter
      ? config.getChapter(match, document)
      : match[config.chapterIndex];

    const validTitle = isValidTitle(mangaTitle);
    const validChapter = isValidChapter(chapterNumber);

    // Retry logic if title or chapter isn't loaded yet (common in SPAs like MangaPlus/MangaDex)
    if ((!validTitle || !validChapter) && retries < 8) {
      console.log(
        `[Sanctum] Waiting for title/chapter metadata... retry ${retries + 1}/8`,
      );
      if (activeRetryTimer) clearTimeout(activeRetryTimer);
      activeRetryTimer = setTimeout(() => {
        if (typeof window !== "undefined" && window.location.href === currentUrl) {
          checkPage(retries + 1);
        }
      }, 1000);
      return;
    }

    if (validTitle && validChapter) {
      console.log(
        `%c[Sanctum] Spotted: ${mangaTitle} | Ch. ${chapterNumber}`,
        "color: #7d42ff; font-weight: bold;",
      );

      detectedChapterPayload = {
        manga: typeof mangaTitle === "string" ? mangaTitle.trim() : mangaTitle,
        chapter: chapterNumber,
        url: currentUrl,
        site: domain,
      };

      if (typeof window !== "undefined") {
        if (dispatchedForUrl !== currentUrl && !window.sanctumTimer && !dwellSatisfied) {
          // 15-second dwell/debounce timer
          window.sanctumTimer = setTimeout(() => {
            window.sanctumTimer = null;
            if (typeof window !== "undefined" && window.location && window.location.href === currentUrl) {
              dwellSatisfied = true;
              maybeDispatchSync();
            }
          }, 15000);
        } else if (dwellSatisfied) {
          maybeDispatchSync();
        }
      }
    }
  } else {
    console.log("Not Match");
  }
}

function init() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const hostname = window.location.hostname ? window.location.hostname.toLowerCase() : "";
  const domain = Object.keys(SITE_CONFIGS).find(
    (configuredDomain) =>
      hostname === configuredDomain || hostname.endsWith("." + configuredDomain),
  );
  if (!domain) return;

  lastUrl = window.location.href;

  // Initial check
  checkPage();

  // Listen for SPA route changes via Navigation API (Chromium 102+)
  if (window.navigation && typeof window.navigation.addEventListener === "function") {
    window.navigation.addEventListener("navigatesuccess", onUrlChange);
    window.navigation.addEventListener("currententrychange", onUrlChange);
  }

  // Fallback route listeners for popstate & hashchange
  if (typeof window.addEventListener === "function") {
    window.addEventListener("popstate", onUrlChange);
    window.addEventListener("hashchange", onUrlChange);
    window.addEventListener("scroll", onScroll, { passive: true });
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && typeof module === "undefined") {
  init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
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
    getActiveRetryTimer: () => activeRetryTimer,
    getActiveRouteChangeTimer: () => activeRouteChangeTimer,
    getDwellSatisfied: () => dwellSatisfied,
    getDispatchedForUrl: () => dispatchedForUrl,
    getDetectedChapterPayload: () => detectedChapterPayload,
    resetState: () => {
      clearAllTimers();
      dwellSatisfied = false;
      dispatchedForUrl = null;
      detectedChapterPayload = null;
      lastUrl = "";
    },
  };
}
