// NijiStream — HiAnime Extension (via aniwatch-api)
//
// Uses an aniwatch-api instance (REST wrapper around hianime.to) for
// anime search, detail, episode lists, and actual HLS video streams.
//
// This is a STREAMING extension — episodes return real .m3u8 URLs
// with subtitles, unlike metadata-only extensions (Jikan, AniList).
//
// ── Configuration ──
// Change API_BASE to point to your own aniwatch-api instance.
// See the self-hosting guide in the extensions repo README.
//
// Default: BytesGaming public Vercel instance (community-hosted, may go down).
// Self-host recommended for reliability.
//
// aniwatch-api docs: https://github.com/ghoshRitesh12/aniwatch-api

var API_BASE = "https://usman-lenovo-1.tailb5865a.ts.net";

const manifest = {
  id: "com.nijistream.hianime",
  name: "HiAnime",
  version: "1.0.0",
  lang: "en",
  author: "nijistream",
  description: "Anime streaming via HiAnime (aniwatch-api). Sub/Dub with subtitles.",
  icon: null,
  nsfw: false
};

// ── Helpers ──

// Safe JSON parse that returns null on failure.
function safeParse(raw) {
  try {
    var data = JSON.parse(raw);
    // The bridge returns {"error": "..."} on HTTP failures.
    if (data && data.error) {
      log("API error: " + data.error);
      return null;
    }
    return data;
  } catch (e) {
    log("JSON parse error: " + e);
    return null;
  }
}

// Fetch a JSON endpoint with retry logic.
// aniwatch-api's /episode/sources fails ~30% of the time, so we retry.
async function fetchJson(url, retries) {
  var maxRetries = retries || 1;
  var lastError = null;

  for (var attempt = 0; attempt < maxRetries; attempt++) {
    try {
      var raw = await http.get(url);
      var data = safeParse(raw);
      if (data && data.success !== false) {
        return data;
      }
      lastError = "API returned unsuccessful response";
    } catch (e) {
      lastError = String(e);
    }

    // Wait before retry (500ms, 1000ms, ...)
    if (attempt < maxRetries - 1) {
      await new Promise(function(resolve) {
        // QuickJS doesn't have setTimeout, but we can use a resolved promise
        // to yield. The actual delay happens Dart-side between poll cycles.
        resolve();
      });
    }
  }

  log("fetchJson failed after " + maxRetries + " attempts: " + lastError);
  return null;
}

// Map aniwatch-api anime item to NijiStream search result format.
function mapAnimeToResult(anime) {
  return {
    id: anime.id || "",
    title: anime.name || anime.title || "Unknown",
    cover: anime.poster || null,
    url: anime.id || ""
  };
}

class AnimeSource {

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Search
  // ═══════════════════════════════════════════════════════════════

  async search(query, page) {
    log("HiAnime search: " + query + " page=" + page);

    var url = API_BASE + "/api/v2/hianime/search?q=" + encodeURIComponent(query) + "&page=" + page;
    var data = await fetchJson(url);

    if (!data || !data.data) {
      return { hasNextPage: false, results: [] };
    }

    var animes = data.data.animes || [];
    var results = [];
    for (var i = 0; i < animes.length; i++) {
      results.push(mapAnimeToResult(animes[i]));
    }

    return {
      hasNextPage: data.data.hasNextPage || false,
      results: results
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Detail (anime info + episode list)
  // ═══════════════════════════════════════════════════════════════

  async getDetail(animeId) {
    log("HiAnime detail: " + animeId);

    // Need two API calls: detail + episode list.
    var detailUrl = API_BASE + "/api/v2/hianime/anime/" + encodeURIComponent(animeId);
    var episodesUrl = API_BASE + "/api/v2/hianime/anime/" + encodeURIComponent(animeId) + "/episodes";

    var detailData = await fetchJson(detailUrl);
    var episodesData = await fetchJson(episodesUrl);

    if (!detailData || !detailData.data || !detailData.data.anime) {
      throw new Error("Failed to fetch anime detail for: " + animeId);
    }

    var anime = detailData.data.anime;
    var info = anime.info || {};
    var moreInfo = anime.moreInfo || {};

    // Parse genres
    var genres = [];
    if (moreInfo.genres) {
      // genres may be an array or a comma-separated string
      if (Array.isArray(moreInfo.genres)) {
        genres = moreInfo.genres;
      } else if (typeof moreInfo.genres === "string") {
        genres = moreInfo.genres.split(",").map(function(g) { return g.trim(); });
      }
    }

    // Map status
    var rawStatus = (moreInfo.status || "").toLowerCase();
    var status = "unknown";
    if (rawStatus.indexOf("currently airing") !== -1 || rawStatus.indexOf("airing") !== -1) {
      status = "airing";
    } else if (rawStatus.indexOf("finished") !== -1 || rawStatus.indexOf("completed") !== -1) {
      status = "completed";
    } else if (rawStatus.indexOf("not yet") !== -1 || rawStatus.indexOf("upcoming") !== -1) {
      status = "upcoming";
    }

    // Parse episodes
    var episodes = [];
    if (episodesData && episodesData.data && episodesData.data.episodes) {
      var epList = episodesData.data.episodes;
      for (var i = 0; i < epList.length; i++) {
        var ep = epList[i];
        episodes.push({
          number: ep.number || (i + 1),
          title: ep.title || ("Episode " + (ep.number || (i + 1))),
          // episodeId from the API (e.g. "naruto-shippuden-355?ep=7882")
          // is what getVideoSources expects.
          url: ep.episodeId || ""
        });
      }
    }

    return {
      title: info.name || "Unknown",
      cover: info.poster || null,
      banner: null,
      synopsis: info.description || null,
      genres: genres,
      status: status,
      episodes: episodes
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Video Sources
  // ═══════════════════════════════════════════════════════════════

  async getVideoSources(episodeUrl) {
    log("HiAnime sources: " + episodeUrl);

    // episodeUrl is like "naruto-shippuden-355?ep=7882"
    // Must be URL-encoded when passed as a query parameter.
    var url = API_BASE + "/api/v2/hianime/episode/sources"
      + "?animeEpisodeId=" + encodeURIComponent(episodeUrl)
      + "&server=hd-1&category=sub";

    // Retry up to 3 times — this endpoint fails ~30% of the time.
    var data = await fetchJson(url, 3);

    if (!data || !data.data) {
      // Try hd-2 as fallback server.
      log("HiAnime: hd-1 failed, trying hd-2...");
      var fallbackUrl = API_BASE + "/api/v2/hianime/episode/sources"
        + "?animeEpisodeId=" + encodeURIComponent(episodeUrl)
        + "&server=hd-2&category=sub";
      data = await fetchJson(fallbackUrl, 2);
    }

    if (!data || !data.data) {
      log("HiAnime: all source servers failed for " + episodeUrl);
      return { sources: [], subtitles: [] };
    }

    var responseData = data.data;

    // Build sources array with Referer headers from the API response.
    var apiHeaders = responseData.headers || {};
    var sources = [];
    var rawSources = responseData.sources || [];
    for (var i = 0; i < rawSources.length; i++) {
      var s = rawSources[i];
      if (s.url) {
        sources.push({
          url: s.url,
          quality: s.quality || "auto",
          type: s.isM3U8 ? "hls" : "mp4",
          server: "HiAnime",
          headers: apiHeaders
        });
      }
    }

    // Build subtitles array.
    var subtitles = [];
    var rawSubs = responseData.subtitles || [];
    for (var j = 0; j < rawSubs.length; j++) {
      var sub = rawSubs[j];
      if (sub.url) {
        subtitles.push({
          url: sub.url,
          lang: sub.lang || "Unknown",
          label: sub.lang || "Unknown",
          type: "vtt"
        });
      }
    }

    log("HiAnime: found " + sources.length + " sources, " + subtitles.length + " subtitles");
    return {
      sources: sources,
      subtitles: subtitles
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Popular
  // ═══════════════════════════════════════════════════════════════

  async getPopular(page) {
    log("HiAnime popular page=" + page);

    var url = API_BASE + "/api/v2/hianime/category/most-popular?page=" + page;
    var data = await fetchJson(url);

    if (!data || !data.data) {
      return { hasNextPage: false, results: [] };
    }

    var animes = data.data.animes || [];
    var results = [];
    for (var i = 0; i < animes.length; i++) {
      results.push(mapAnimeToResult(animes[i]));
    }

    return {
      hasNextPage: data.data.hasNextPage || false,
      results: results
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Latest
  // ═══════════════════════════════════════════════════════════════

  async getLatest(page) {
    log("HiAnime latest page=" + page);

    var url = API_BASE + "/api/v2/hianime/category/recently-updated?page=" + page;
    var data = await fetchJson(url);

    if (!data || !data.data) {
      return { hasNextPage: false, results: [] };
    }

    var animes = data.data.animes || [];
    var results = [];
    for (var i = 0; i < animes.length; i++) {
      results.push(mapAnimeToResult(animes[i]));
    }

    return {
      hasNextPage: data.data.hasNextPage || false,
      results: results
    };
  }
}
