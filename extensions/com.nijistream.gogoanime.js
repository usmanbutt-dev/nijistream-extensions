// NijiStream — GogoAnime Extension (via Jikan/MAL API)
//
// Uses the Jikan REST API (https://api.jikan.moe/v4) for anime
// metadata: search, popular/trending, and detail pages.
//
// Jikan is the unofficial MyAnimeList REST API — no auth required,
// 3 requests/second, 60 requests/minute. Completely free and reliable.
//
// NOTE: This extension provides metadata browsing only.
//       Video streaming sources are not available through Jikan.
//       The extension will show anime with correct titles and covers;
//       tapping an episode will show no playable sources.
//
// Jikan API docs: https://docs.api.jikan.moe/

const manifest = {
  id: "com.nijistream.gogoanime",
  name: "GogoAnime (MAL)",
  version: "2.0.0",
  lang: "en",
  author: "nijistream",
  description: "Anime browse & search via MyAnimeList (Jikan API). Metadata only.",
  icon: null,
  nsfw: false
};

var API_BASE = "https://api.jikan.moe/v4";

class AnimeSource {

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Search
  // ═══════════════════════════════════════════════════════════════

  async search(query, page) {
    log("GogoAnime search: " + query + " page=" + page);

    try {
      var url = API_BASE + "/anime?q=" + encodeURIComponent(query) + "&page=" + page + "&limit=20&sfw=true";
      var raw = await http.get(url);
      var data = JSON.parse(raw);

      var results = [];
      if (data.data && data.data.length > 0) {
        for (var i = 0; i < data.data.length; i++) {
          var item = data.data[i];
          results.push({
            id: String(item.mal_id || ""),
            title: item.title || "Unknown",
            cover: (item.images && item.images.jpg) ? (item.images.jpg.large_image_url || item.images.jpg.image_url || null) : null,
            url: String(item.mal_id || "")
          });
        }
      }

      var pagination = data.pagination || {};
      return {
        hasNextPage: pagination.has_next_page || false,
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
      var url = API_BASE + "/anime/" + encodeURIComponent(animeId) + "/full";
      var raw = await http.get(url);
      var data = JSON.parse(raw);
      var item = data.data || {};

      // Build a synthetic episode list from the episode count.
      // Jikan /episodes requires separate paginated calls; for simplicity
      // we generate numbered stubs up to the known episode count.
      var episodeCount = item.episodes || 1;
      if (episodeCount > 100) episodeCount = 100; // cap for performance
      var episodes = [];
      for (var i = 1; i <= episodeCount; i++) {
        episodes.push({
          number: i,
          title: "Episode " + i,
          url: "mal:" + animeId + ":ep:" + i
        });
      }

      var genres = [];
      if (item.genres && item.genres.length > 0) {
        for (var j = 0; j < item.genres.length; j++) {
          genres.push(item.genres[j].name || "");
        }
      }

      var cover = null;
      if (item.images && item.images.jpg) {
        cover = item.images.jpg.large_image_url || item.images.jpg.image_url || null;
      }

      return {
        title: item.title || "Unknown",
        cover: cover,
        banner: null,
        synopsis: item.synopsis || null,
        genres: genres,
        status: (item.status || "unknown").toLowerCase(),
        episodes: episodes
      };
    } catch (e) {
      log("GogoAnime detail error: " + e);
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Video Sources
  // (Jikan is metadata-only — no streaming sources available)
  // ═══════════════════════════════════════════════════════════════

  async getVideoSources(episodeUrl) {
    log("GogoAnime sources: " + episodeUrl + " (metadata-only extension — no video sources)");
    return { sources: [], subtitles: [] };
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Popular / Trending
  // ═══════════════════════════════════════════════════════════════

  async getPopular(page) {
    log("GogoAnime popular page=" + page);

    try {
      var url = API_BASE + "/top/anime?page=" + page + "&limit=20&filter=airing";
      var raw = await http.get(url);
      var data = JSON.parse(raw);

      var results = [];
      if (data.data && data.data.length > 0) {
        for (var i = 0; i < data.data.length; i++) {
          var item = data.data[i];
          results.push({
            id: String(item.mal_id || ""),
            title: item.title || "Unknown",
            cover: (item.images && item.images.jpg) ? (item.images.jpg.large_image_url || item.images.jpg.image_url || null) : null,
            url: String(item.mal_id || "")
          });
        }
      }

      var pagination = data.pagination || {};
      return {
        hasNextPage: pagination.has_next_page || false,
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
      // Use seasonal/current season as "latest"
      var url = API_BASE + "/seasons/now?page=" + page + "&limit=20";
      var raw = await http.get(url);
      var data = JSON.parse(raw);

      var results = [];
      if (data.data && data.data.length > 0) {
        for (var i = 0; i < data.data.length; i++) {
          var item = data.data[i];
          results.push({
            id: String(item.mal_id || ""),
            title: item.title || "Unknown",
            cover: (item.images && item.images.jpg) ? (item.images.jpg.large_image_url || item.images.jpg.image_url || null) : null,
            url: String(item.mal_id || "")
          });
        }
      }

      var pagination = data.pagination || {};
      return {
        hasNextPage: pagination.has_next_page || false,
        results: results
      };
    } catch (e) {
      log("GogoAnime latest error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }
}
