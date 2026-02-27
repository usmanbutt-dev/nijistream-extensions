// NijiStream — AnimePahe Extension (via Consumet API)
//
// Uses a self-hosted Consumet API instance for anime search, detail,
// episode lists, and direct MP4 video streams from AnimePahe.
//
// AnimePahe provides high-quality direct MP4 downloads (no HLS),
// with multiple quality options (360p–1080p) for sub and dub.
//
// This is a STREAMING extension — episodes return real video URLs.
//
// NOTE: AnimePahe's video extractor may fail on serverless platforms
// (Vercel) due to Cloudflare. If streaming doesn't work, try self-hosting
// the Consumet API on Railway or a VPS instead.
//
// ── Configuration ──
// Change API_BASE to point to your own Consumet API instance.
// Deploy: https://github.com/consumet/api.consumet.org

var API_BASE = "https://consumet-api-bay.vercel.app";

const manifest = {
  id: "com.nijistream.animepahe",
  name: "AnimePahe",
  version: "1.0.0",
  lang: "en",
  author: "nijistream",
  description: "Anime streaming via AnimePahe (Consumet API). High-quality MP4 streams with Sub/Dub.",
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
    log("AnimePahe search: " + query + " page=" + page);

    var url = API_BASE + "/anime/animepahe/" + encodeURIComponent(query);
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
    log("AnimePahe detail: " + animeId);

    // episodePage=-1 fetches all episodes at once
    var url = API_BASE + "/anime/animepahe/info/" + encodeURIComponent(animeId) + "?episodePage=-1";
    var data = await fetchJson(url, 2);

    if (!data) {
      throw new Error("Failed to fetch anime detail for: " + animeId);
    }

    var genres = data.genres || [];
    var rawStatus = (data.status || "").toLowerCase();
    var status = "unknown";
    if (rawStatus.indexOf("ongoing") !== -1 || rawStatus.indexOf("airing") !== -1) {
      status = "airing";
    } else if (rawStatus.indexOf("completed") !== -1 || rawStatus.indexOf("finished") !== -1) {
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
    log("AnimePahe sources: " + episodeUrl);

    // episodeUrl is the episode ID from getDetail (format: "session/episode-session")
    var url = API_BASE + "/anime/animepahe/watch?episodeId=" + encodeURIComponent(episodeUrl);
    var data = await fetchJson(url, 3);

    if (!data) {
      log("AnimePahe: failed to get sources for " + episodeUrl);
      return { sources: [], subtitles: [] };
    }

    var apiHeaders = data.headers || {};
    var sources = [];
    var rawSources = data.sources || [];

    for (var i = 0; i < rawSources.length; i++) {
      var s = rawSources[i];
      if (s.url) {
        var quality = s.quality || "auto";
        var isDub = s.isDub === true;
        sources.push({
          url: s.url,
          quality: quality + (isDub ? " (Dub)" : ""),
          type: s.isM3U8 ? "hls" : "mp4",
          server: "AnimePahe",
          headers: apiHeaders
        });
      }
    }

    // AnimePahe typically doesn't provide subtitles (hardsubbed)
    var subtitles = [];

    log("AnimePahe: found " + sources.length + " sources");
    return {
      sources: sources,
      subtitles: subtitles
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Popular
  // ═══════════════════════════════════════════════════════════════

  async getPopular(page) {
    log("AnimePahe popular page=" + page);

    var url = API_BASE + "/anime/animepahe/recent-episodes?page=" + page;
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
  // OPTIONAL: Get Latest
  // ═══════════════════════════════════════════════════════════════

  async getLatest(page) {
    log("AnimePahe latest page=" + page);

    var url = API_BASE + "/anime/animepahe/recent-episodes?page=" + page;
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
}
