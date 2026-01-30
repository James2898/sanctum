const url = window.location.href;
const regex = /series\/([^\/]+)\/chapter\/(\d+)/;
const match = url.match(regex);

if (match) {
  const rawSlug = match[1];
  const mangaTitle = rawSlug.replace(/-[a-z0-9]{8}$/, ""); // Cleans 'raising-villains-the-right-way'
  const chapterNumber = parseInt(match[2]);

  console.log(
    `%c[Sanctum] Monitoring: ${mangaTitle} Ch.${chapterNumber}`,
    "color: #7d42ff; font-weight: bold;",
  );

  // Wait 20 seconds of reading
  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: "SYNC_CHAPTER",
      payload: { manga: mangaTitle, chapter: chapterNumber, url: url },
    });
  }, 1000);
}
