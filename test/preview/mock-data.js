// Mock datasets for Sanctum Popup live preview
const MOCK_DATASETS = {
  default: {
    series: {
      "solo leveling": {
        title: "Solo Leveling",
        chapter: "179",
        site: "asuracomic.net",
        url: "https://asuracomic.net/series/solo-leveling/chapter/179",
        updated: new Date(Date.now() - 1000 * 60 * 30).toISOString() // 30 mins ago
      },
      "chainsaw man": {
        title: "Chainsaw Man",
        chapter: "165",
        site: "mangaplus.shueisha.co.jp",
        url: "https://mangaplus.shueisha.co.jp/viewer/1020000",
        updated: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString() // 4 hours ago
      },
      "omniscient reader's viewpoint": {
        title: "Omniscient Reader's Viewpoint",
        chapter: "210.5",
        site: "asuracomic.net",
        url: "https://asuracomic.net/series/omniscient-reader/chapter/210.5",
        updated: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() // 1 day ago
      },
      "frieren: beyond journey's end": {
        title: "Frieren: Beyond Journey's End",
        chapter: "130",
        site: "mangadex.org",
        url: "https://mangadex.org/chapter/12345",
        updated: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() // 2 days ago
      },
      "nano machine": {
        title: "Nano Machine",
        chapter: "215",
        site: "kunmanga.com",
        url: "https://kunmanga.com/manga/nano-machine/chapter-215/",
        updated: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString() // 3 days ago
      },
      "tower of god": {
        title: "Tower of God",
        chapter: "600",
        site: "mangahere.cc",
        url: "https://www.mangahere.cc/manga/tower_of_god/c600/",
        updated: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString() // 5 days ago
      }
    }
  },
  empty: {
    series: {}
  },
  large: {
    series: (() => {
      const s = {};
      const sites = ["asura", "mangadex", "mangaplus", "mangahere", "kunmanga"];
      for (let i = 1; i <= 25; i++) {
        const site = sites[i % sites.length];
        const title = `Manga Series Title ${i}`;
        s[title.toLowerCase()] = {
          title: title,
          chapter: `${100 + i}`,
          site: site,
          url: `https://example.com/${site}/series-${i}/chapter/${100 + i}`,
          updated: new Date(Date.now() - 1000 * 60 * 60 * i * 3).toISOString()
        };
      }
      return s;
    })()
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MOCK_DATASETS };
}
