// NijiStream — AnimeSaturn Extension (via Consumet API)
//
// Uses a self-hosted Consumet API instance for anime search, detail,
// episode lists, and HLS video streams from AnimeSaturn.
//
// AnimeSaturn is an Italian anime site with a large library. Audio is
// Japanese with Italian subtitles (sub) or Italian dub (ITA) versions.
//
// This is a STREAMING extension — episodes return real .m3u8 HLS URLs.
//
// ── Configuration ──
// Change API_BASE to point to your own Consumet API instance.
// Deploy: https://github.com/consumet/api.consumet.org

var API_BASE = "https://consumet-api-bay.vercel.app";

const manifest = {
  id: "com.nijistream.animesaturn",
  name: "AnimeSaturn",
  version: "1.0.0",
  lang: "it",
  author: "nijistream",
  description: "Anime streaming via AnimeSaturn (Consumet API). Japanese audio with Italian subtitles. HLS streams.",
  icon: null,
  nsfw: false
};

// ── Helpers ──

function safeParse(raw) {
  try {
    var data = JSON.parse(raw);
    if (data && data.message && data.message.length > 0) {
      log("API error: " + data.message);
      return null;
    }
    return data;
  } catch (e) {
    log("JSON parse error: " + e);
    return null;
  }
}

async function fetchJson(url, retries) {
  var maxRetries = retries || 1;
  var lastError = null;

  for (var attempt = 0; attempt < maxRetries; attempt++) {
    try {
      var raw = await http.get(url);
      var data = safeParse(raw);
      if (data) return data;
      lastError = "Empty or error response";
    } catch (e) {
      lastError = String(e);
    }

    if (attempt < maxRetries - 1) {
      await new Promise(function(resolve) { resolve(); });
    }
  }

  log("fetchJson failed after " + maxRetries + " attempts: " + lastError);
  return null;
}

class AnimeSource {

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Search
  // ═══════════════════════════════════════════════════════════════

  async search(query, page) {
    log("AnimeSaturn search: " + query + " page=" + page);

    var url = API_BASE + "/anime/animesaturn/" + encodeURIComponent(query);
    var data = await fetchJson(url);

    if (!data || !data.results) {
      return { hasNextPage: false, results: [] };
    }

    var results = [];
    var items = data.results || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      results.push({
        id: item.id || "",
        title: item.title || "Unknown",
        cover: item.image || null,
        url: item.id || ""
      });
    }

    return {
      hasNextPage: data.hasNextPage || false,
      results: results
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Detail (anime info + episode list)
  // ═══════════════════════════════════════════════════════════════

  async getDetail(animeId) {
    log("AnimeSaturn detail: " + animeId);

    var url = API_BASE + "/anime/animesaturn/info?id=" + encodeURIComponent(animeId);
    var data = await fetchJson(url, 2);

    if (!data) {
      throw new Error("Failed to fetch anime detail for: " + animeId);
    }

    var genres = data.genres || [];
    var rawStatus = (data.status || "").toLowerCase();
    var status = "unknown";
    if (rawStatus.indexOf("ongoing") !== -1 || rawStatus.indexOf("airing") !== -1 || rawStatus.indexOf("in corso") !== -1) {
      status = "airing";
    } else if (rawStatus.indexOf("completed") !== -1 || rawStatus.indexOf("finished") !== -1 || rawStatus.indexOf("finito") !== -1) {
      status = "completed";
    } else if (rawStatus.indexOf("upcoming") !== -1 || rawStatus.indexOf("not yet") !== -1) {
      status = "upcoming";
    }

    var episodes = [];
    var epList = data.episodes || [];
    for (var i = 0; i < epList.length; i++) {
      var ep = epList[i];
      episodes.push({
        number: ep.number || (i + 1),
        title: ep.title || ("Episode " + (ep.number || (i + 1))),
        // AnimeSaturn episode IDs are like "Naruto-ep-1"
        url: ep.id || ""
      });
    }

    return {
      title: data.title || "Unknown",
      cover: data.image || null,
      banner: data.cover || null,
      synopsis: data.description || null,
      genres: genres,
      status: status,
      episodes: episodes
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Video Sources
  // ═══════════════════════════════════════════════════════════════

  async getVideoSources(episodeUrl) {
    log("AnimeSaturn sources: " + episodeUrl);

    // episodeUrl is the episode ID from getDetail (e.g. "Naruto-ep-1")
    var url = API_BASE + "/anime/animesaturn/watch/" + encodeURIComponent(episodeUrl);
    var data = await fetchJson(url, 3);

    if (!data) {
      log("AnimeSaturn: failed to get sources for " + episodeUrl);
      return { sources: [], subtitles: [] };
    }

    var apiHeaders = data.headers || {};
    var sources = [];
    var rawSources = data.sources || [];

    for (var i = 0; i < rawSources.length; i++) {
      var s = rawSources[i];
      if (s.url) {
        // Filter out malformed URLs (consumet sometimes returns broken ones)
        if (s.url.indexOf(".replace(") !== -1) continue;

        sources.push({
          url: s.url,
          quality: s.quality || "auto",
          type: s.isM3U8 ? "hls" : "mp4",
          server: "AnimeSaturn",
          headers: apiHeaders
        });
      }
    }

    // Build subtitles array
    var subtitles = [];
    var rawSubs = data.subtitles || [];
    for (var j = 0; j < rawSubs.length; j++) {
      var sub = rawSubs[j];
      if (sub.url && sub.lang) {
        subtitles.push({
          url: sub.url,
          lang: sub.lang || "Unknown",
          label: sub.lang || "Unknown",
          type: "vtt"
        });
      }
    }

    log("AnimeSaturn: found " + sources.length + " sources, " + subtitles.length + " subtitles");
    return {
      sources: sources,
      subtitles: subtitles
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Popular
  // ═══════════════════════════════════════════════════════════════

  async getPopular(page) {
    log("AnimeSaturn popular page=" + page);

    // Use search with a broad term as AnimeSaturn has no dedicated popular endpoint
    var url = API_BASE + "/anime/animesaturn/top-anime?page=" + page;
    var data = await fetchJson(url);

    // If top-anime endpoint doesn't exist, fall back to a popular search
    if (!data || !data.results) {
      // Search for a very popular anime to get browse-like results
      return this.search("", page);
    }

    var results = [];
    var items = data.results || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      results.push({
        id: item.id || "",
        title: item.title || "Unknown",
        cover: item.image || null,
        url: item.id || ""
      });
    }

    return {
      hasNextPage: data.hasNextPage || false,
      results: results
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Latest
  // ═══════════════════════════════════════════════════════════════

  async getLatest(page) {
    log("AnimeSaturn latest page=" + page);

    // AnimeSaturn doesn't have a recent-episodes endpoint in consumet,
    // so fall back to search (which returns by recency)
    return this.search("", page);
  }
}
