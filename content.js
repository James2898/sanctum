const SITE_CONFIGS = {
  "asurascans.com": {
    regex: /comics\/([^\/]+)\/chapter\/(\d+)/,
    titleIndex: 1,
    chapterIndex: 2,
    getTitle: (match) =>
      match[1].replace(/-[a-z0-9]{8}$/, "").replace(/-/g, " "),
  },
  "mangahere.cc": {
    regex: /manga\/([^\/]+)\/c([\d\.]+)/,
    titleIndex: 1,
    chapterIndex: 2,
    getTitle: (match) => match[1].replace(/_/g, " "),
  },
  "mangadex.org": {
    regex: /chapter\/([^\/]+)/,
    getTitle: () => {
      const titleEl = document.querySelector("a.reader--header-manga");
      return titleEl ? titleEl.innerText.trim() : null;
    },
    getChapter: () => {
      const chapterEl = document.querySelector("div.reader--meta.chapter");
      if (chapterEl) {
        const match = chapterEl.innerText.match(/(\d+(\.\d+)?)/);
        return match && match[0] ? match[0] : "Reading";
      }
      return "Reading";
    },
  },
  "mangaplus.shueisha.co.jp": {
    // MangaPlus URLs are just /viewer/12345
    regex: /viewer\/(\d+)/,
    getTitle: () => {
      // Using the class you found
      const titleEl = document.querySelector(
        "h1[class*='Navigation-module_title']",
      );
      return titleEl ? titleEl.innerText.trim() : null;
    },
    getChapter: () => {
      // Using the class you found for chapter
      const chapterEl = document.querySelector(
        "p[class*='Navigation-module_chapterTitle']",
      );
      if (chapterEl) {
        // Extracts the number from strings like "#070"
        const match = chapterEl.innerText.match(/(\d+)/);
        return match ? parseInt(match[0], 10) : "Reading";
      }
      return "Reading";
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

const domain = window.location.hostname.replace("www.", "");
const config = SITE_CONFIGS[domain];

if (config) {
  const checkPage = (retries = 0) => {
    const path = window.location.pathname;
    const match = path.match(config.regex);

    if (match) {
      const mangaTitle = config.titleIndex
        ? config.getTitle(match)
        : config.getTitle();
      const chapterNumber = config.getChapter
        ? config.getChapter(match)
        : match[config.chapterIndex];

      // Retry logic if title isn't loaded yet (common in SPAs like MangaPlus/MangaDex)
      if (!mangaTitle && retries < 8) {
        console.log(`[Sanctum] Waiting for title... retry ${retries + 1}/8`);
        setTimeout(() => checkPage(retries + 1), 1000);
        return;
      }

      if (mangaTitle && chapterNumber) {
        console.log(
          `%c[Sanctum] Spotted: ${mangaTitle} | Ch. ${chapterNumber}`,
          "color: #7d42ff; font-weight: bold;",
        );

        if (window.sanctumTimer) clearTimeout(window.sanctumTimer);
        window.sanctumTimer = setTimeout(() => {
          chrome.runtime.sendMessage({
            type: "SYNC_CHAPTER",
            payload: {
              manga: mangaTitle,
              chapter: chapterNumber,
              url: window.location.href,
              site: domain,
            },
          });
        }, 3000);
      }
    } else {
      console.log("Not Match");
    }
  };

  // Initial check
  checkPage();

  // Listen for URL changes (important for MangaDex "Next Chapter" clicks)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log("[Sanctum] URL Changed, re-checking...");
      // Delay slightly to let MangaDex update the DOM
      setTimeout(() => checkPage(), 2000);
    }
  });
  observer.observe(document, { subtree: true, childList: true });
}
