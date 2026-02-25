// NijiStream — GogoAnime Extension (via Consumet API)
//
// This extension uses a Consumet API instance to provide anime search,
// details, and video streaming from GogoAnime.
//
// Consumet API is an open-source aggregator that handles scraping
// server-side, making this extension very stable — when GogoAnime
// changes its HTML, only the Consumet instance needs updating,
// not this extension.
//
// Self-host: https://github.com/consumet/api.consumet.org
// Public demo (rate-limited): https://api.consumet.org
//
// Consumet GogoAnime endpoints:
//   GET /{query}?page=N          → search results
//   GET /info/{id}               → anime info + episode list
//   GET /watch/{episodeId}       → streaming sources
//   GET /top-airing?page=N       → popular/trending
//   GET /recent-episodes?page=N  → latest episodes

const manifest = {
  id: "com.nijistream.gogoanime",
  name: "GogoAnime",
  version: "1.0.0",
  lang: "en",
  author: "nijistream",
  description: "GogoAnime via Consumet API — anime streaming with multi-quality sources.",
  icon: null,
  nsfw: false
};

// ── Configuration ──
// Change this to your self-hosted Consumet instance URL for reliability.
// The public endpoint is rate-limited and may go down.
var API_BASE = "https://api.consumet.org/anime/gogoanime";

class AnimeSource {

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Search
  // ═══════════════════════════════════════════════════════════════

  async search(query, page) {
    log("GogoAnime search: " + query + " page=" + page);

    try {
      var url = API_BASE + "/" + encodeURIComponent(query) + "?page=" + page;
      var raw = await http.get(url);
      var data = JSON.parse(raw);

      var results = [];
      if (data.results && data.results.length > 0) {
        for (var i = 0; i < data.results.length; i++) {
          var item = data.results[i];
          results.push({
            id: item.id || "",
            title: item.title || "Unknown",
            cover: item.image || null,
            url: item.id || ""
          });
        }
      }

      return {
        hasNextPage: data.hasNextPage || false,
        results: results
      };
    } catch (e) {
      log("GogoAnime search error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Detail (anime info + episode list)
  // ═══════════════════════════════════════════════════════════════

  async getDetail(animeId) {
    log("GogoAnime detail: " + animeId);

    try {
      var url = API_BASE + "/info/" + encodeURIComponent(animeId);
      var raw = await http.get(url);
      var data = JSON.parse(raw);

      var episodes = [];
      if (data.episodes && data.episodes.length > 0) {
        for (var i = 0; i < data.episodes.length; i++) {
          var ep = data.episodes[i];
          episodes.push({
            number: ep.number || (i + 1),
            title: "Episode " + (ep.number || (i + 1)),
            url: ep.id || ""
          });
        }
      }

      return {
        title: data.title || "Unknown",
        cover: data.image || null,
        banner: data.cover || null,
        synopsis: data.description || null,
        genres: data.genres || [],
        status: (data.status || "unknown").toLowerCase(),
        episodes: episodes
      };
    } catch (e) {
      log("GogoAnime detail error: " + e);
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Video Sources (streaming URLs for an episode)
  // ═══════════════════════════════════════════════════════════════

  async getVideoSources(episodeUrl) {
    log("GogoAnime sources: " + episodeUrl);

    try {
      // Try gogocdn server first (most reliable), fall back to vidstreaming
      var sources = await this._fetchSources(episodeUrl, "gogocdn");
      if (sources.length === 0) {
        sources = await this._fetchSources(episodeUrl, "vidstreaming");
      }

      return {
        sources: sources,
        subtitles: []
      };
    } catch (e) {
      log("GogoAnime sources error: " + e);
      return { sources: [], subtitles: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Popular / Trending
  // ═══════════════════════════════════════════════════════════════

  async getPopular(page) {
    log("GogoAnime popular page=" + page);

    try {
      var url = API_BASE + "/top-airing?page=" + page;
      var raw = await http.get(url);
      var data = JSON.parse(raw);

      var results = [];
      if (data.results && data.results.length > 0) {
        for (var i = 0; i < data.results.length; i++) {
          var item = data.results[i];
          results.push({
            id: item.id || "",
            title: item.title || "Unknown",
            cover: item.image || null,
            url: item.id || ""
          });
        }
      }

      return {
        hasNextPage: data.hasNextPage || false,
        results: results
      };
    } catch (e) {
      log("GogoAnime popular error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Latest / Recent Episodes
  // ═══════════════════════════════════════════════════════════════

  async getLatest(page) {
    log("GogoAnime latest page=" + page);

    try {
      var url = API_BASE + "/recent-episodes?page=" + page;
      var raw = await http.get(url);
      var data = JSON.parse(raw);

      var results = [];
      if (data.results && data.results.length > 0) {
        for (var i = 0; i < data.results.length; i++) {
          var item = data.results[i];
          results.push({
            id: item.id || "",
            title: item.title || "Unknown",
            cover: item.image || null,
            url: item.id || ""
          });
        }
      }

      return {
        hasNextPage: data.hasNextPage || false,
        results: results
      };
    } catch (e) {
      log("GogoAnime latest error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Fetch sources from a specific server
  // ═══════════════════════════════════════════════════════════════

  async _fetchSources(episodeId, server) {
    var url = API_BASE + "/watch/" + encodeURIComponent(episodeId) + "?server=" + server;
    var raw = await http.get(url);
    var data = JSON.parse(raw);

    var sources = [];
    if (data.sources && data.sources.length > 0) {
      for (var i = 0; i < data.sources.length; i++) {
        var src = data.sources[i];
        sources.push({
          url: src.url || "",
          quality: src.quality || "default",
          type: src.isM3U8 ? "hls" : "mp4",
          server: server
        });
      }
    }
    return sources;
  }
}
