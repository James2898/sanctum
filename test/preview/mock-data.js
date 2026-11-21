// Mock datasets for Sanctum Popup live preview
const MOCK_DATASETS = {
  default: {
    series: {
      "Solo Leveling": {
        chapter: "179",
        site: "asura",
        url: "https://asuracomic.net/series/solo-leveling/chapter/179",
        updated: new Date(Date.now() - 1000 * 60 * 30).toISOString() // 30 mins ago
      },
      "Chainsaw Man": {
        chapter: "165",
        site: "mangaplus",
        url: "https://mangaplus.shueisha.co.jp/viewer/1020000",
        updated: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString() // 4 hours ago
      },
      "Omniscient Reader's Viewpoint": {
        chapter: "210.5",
        site: "asura",
        url: "https://asuracomic.net/series/omniscient-reader/chapter/210.5",
        updated: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() // 1 day ago
      },
      "Frieren: Beyond Journey's End": {
        chapter: "130",
        site: "mangadex",
        url: "https://mangadex.org/chapter/12345",
        updated: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() // 2 days ago
      },
      "One Piece": {
        chapter: "1125",
        site: "mangaplus",
        url: "https://mangaplus.shueisha.co.jp/viewer/1030000",
        updated: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString() // 3 days ago
      },
      "Tower of God": {
        chapter: "600",
        site: "mangahere",
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
      const sites = ["asura", "mangadex", "mangaplus", "mangahere"];
      for (let i = 1; i <= 25; i++) {
        const site = sites[i % sites.length];
        s[`Manga Series Title ${i}`] = {
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
