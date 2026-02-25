// NijiStream — Zoro/HiAnime Extension (via Consumet API)
//
// This extension uses a Consumet API instance to provide anime from
// Zoro.to / HiAnime.to — a popular source known for soft-subbed
// anime with multiple quality options.
//
// Consumet Zoro endpoints:
//   GET /{query}?page=N          → search results
//   GET /info?id={id}            → anime info + episode list
//   GET /watch?episodeId={id}    → streaming sources
//   GET /top-airing?page=N       → popular/trending
//   GET /recent-episodes?page=N  → latest episodes

const manifest = {
  id: "com.nijistream.zoro",
  name: "HiAnime (Zoro)",
  version: "1.0.0",
  lang: "en",
  author: "nijistream",
  description: "HiAnime/Zoro via Consumet API — soft-subbed anime with multiple servers.",
  icon: null,
  nsfw: false
};

// ── Configuration ──
var API_BASE = "https://api.consumet.org/anime/zoro";

class AnimeSource {

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Search
  // ═══════════════════════════════════════════════════════════════

  async search(query, page) {
    log("Zoro search: " + query + " page=" + page);

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
      log("Zoro search error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Detail
  // ═══════════════════════════════════════════════════════════════

  async getDetail(animeId) {
    log("Zoro detail: " + animeId);

    try {
      // Zoro uses query parameter style: /info?id=xxx
      var url = API_BASE + "/info?id=" + encodeURIComponent(animeId);
      var raw = await http.get(url);
      var data = JSON.parse(raw);

      var episodes = [];
      if (data.episodes && data.episodes.length > 0) {
        for (var i = 0; i < data.episodes.length; i++) {
          var ep = data.episodes[i];
          episodes.push({
            number: ep.number || (i + 1),
            title: ep.title || ("Episode " + (ep.number || (i + 1))),
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
      log("Zoro detail error: " + e);
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Video Sources
  // ═══════════════════════════════════════════════════════════════

  async getVideoSources(episodeUrl) {
    log("Zoro sources: " + episodeUrl);

    try {
      // Try vidcloud first (usually best quality), then vidstreaming
      var sources = await this._fetchSources(episodeUrl, "vidcloud");
      if (sources.sources.length === 0) {
        sources = await this._fetchSources(episodeUrl, "vidstreaming");
      }

      return sources;
    } catch (e) {
      log("Zoro sources error: " + e);
      return { sources: [], subtitles: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Popular
  // ═══════════════════════════════════════════════════════════════

  async getPopular(page) {
    log("Zoro popular page=" + page);

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
      log("Zoro popular error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Latest
  // ═══════════════════════════════════════════════════════════════

  async getLatest(page) {
    log("Zoro latest page=" + page);

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
      log("Zoro latest error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Fetch sources from a specific server
  // ═══════════════════════════════════════════════════════════════

  async _fetchSources(episodeId, server) {
    var url = API_BASE + "/watch?episodeId=" + encodeURIComponent(episodeId) + "&server=" + server;
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

    // Zoro often provides subtitles
    var subtitles = [];
    if (data.subtitles && data.subtitles.length > 0) {
      for (var i = 0; i < data.subtitles.length; i++) {
        var sub = data.subtitles[i];
        subtitles.push({
          url: sub.url || "",
          lang: sub.lang || "unknown",
          label: sub.lang || "Unknown",
          type: "vtt"
        });
      }
    }

    return { sources: sources, subtitles: subtitles };
  }
}
