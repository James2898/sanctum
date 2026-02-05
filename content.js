const SITE_CONFIGS = {
  "asuracomic.net": {
    regex: /series\/([^\/]+)\/chapter\/(\d+)/,
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
      // Targeted selector for the element you found
      const titleEl = document.querySelector("a.reader--header-manga");
      return titleEl ? titleEl.innerText.trim() : null;
    },
    getChapter: () => {
      const chapterEl = document.querySelector("div.reader--meta.chapter");
      console.log(chapterEl);
      console.log(chapterEl ? chapterEl.innerText.match(/[\d\.]+/) : "xxx");
      if (chapterEl) {
        // 2. We want to match one or more digits,
        // optionally followed by a dot and more digits (for 31.5)
        const match = chapterEl.innerText.match(/(\d+(\.\d+)?)/);

        // Return the first capture group (the number) or a fallback string
        return match && match[0] ? match[0] : "Reading";
      }

      return "Reading";
    },
  },
};

const domain = window.location.hostname.replace("www.", "");
const config = SITE_CONFIGS[domain];

if (config) {
  const checkPage = (retries = 0) => {
    const path = window.location.pathname;
    const match = path.match(config.regex);

    console.log(path);
    console.log(config.regex);
    console.log(match == true);
    if (match) {
      const mangaTitle = config.titleIndex
        ? config.getTitle(match)
        : config.getTitle();
      const chapterNumber = config.chapterIndex
        ? match[config.chapterIndex]
        : config.getChapter();

      console.log(mangaTitle, " : ", chapterNumber);

      // If MangaDex title isn't loaded yet, retry up to 5 times
      if (!mangaTitle && retries < 5) {
        console.log(
          `[Sanctum] Title not found, retrying... (${retries + 1}/5)`,
        );
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
