// NijiStream — AniList Extension (via AniList GraphQL API)
//
// Uses the AniList GraphQL API (https://graphql.anilist.co) for anime
// metadata: search, popular/trending, and detail pages.
//
// AniList is a modern anime database with high-quality cover art and
// comprehensive metadata. No authentication required for browsing.
// Supports pagination, genres, scores, and more.
//
// AniList API docs: https://docs.anilist.co/

const manifest = {
  id: "com.nijistream.zoro",
  name: "AniList",
  version: "2.0.0",
  lang: "en",
  author: "nijistream",
  description: "Anime browse & search via AniList GraphQL. High-quality covers and metadata.",
  icon: null,
  nsfw: false
};

var GRAPHQL_URL = "https://graphql.anilist.co";

// Helper: POST a GraphQL query and return the raw JSON string.
async function gql(query, variables) {
  var body = JSON.stringify({ query: query, variables: variables || {} });
  var raw = await http.post(GRAPHQL_URL, body, {
    "Content-Type": "application/json",
    "Accept": "application/json"
  });
  return raw;
}

// Helper: extract a cover URL from an AniList media item.
function getCover(item) {
  if (!item || !item.coverImage) return null;
  return item.coverImage.large || item.coverImage.medium || null;
}

// Helper: extract preferred title (english → romaji → native).
function getTitle(item) {
  if (!item || !item.title) return "Unknown";
  return item.title.english || item.title.romaji || item.title.native || "Unknown";
}

class AnimeSource {

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Search
  // ═══════════════════════════════════════════════════════════════

  async search(query, page) {
    log("AniList search: " + query + " page=" + page);

    try {
      var q = "query ($search: String, $page: Int) { Page(page: $page, perPage: 20) { pageInfo { hasNextPage } media(search: $search, type: ANIME, isAdult: false) { id title { romaji english native } coverImage { large medium } } } }";

      var raw = await gql(q, { search: query, page: page });
      var data = JSON.parse(raw);
      var page_data = data.data && data.data.Page ? data.data.Page : {};
      var media = page_data.media || [];
      var pageInfo = page_data.pageInfo || {};

      var results = [];
      for (var i = 0; i < media.length; i++) {
        var item = media[i];
        results.push({
          id: String(item.id || ""),
          title: getTitle(item),
          cover: getCover(item),
          url: String(item.id || "")
        });
      }

      return {
        hasNextPage: pageInfo.hasNextPage || false,
        results: results
      };
    } catch (e) {
      log("AniList search error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Detail (anime info + episode list)
  // ═══════════════════════════════════════════════════════════════

  async getDetail(animeId) {
    log("AniList detail: " + animeId);

    try {
      var q = "query ($id: Int) { Media(id: $id, type: ANIME) { id title { romaji english native } coverImage { large medium } bannerImage description(asHtml: false) genres status episodes } }";

      var raw = await gql(q, { id: parseInt(animeId) });
      var data = JSON.parse(raw);
      var item = data.data && data.data.Media ? data.data.Media : {};

      // Build synthetic episode list from known episode count.
      var episodeCount = item.episodes || 1;
      if (episodeCount > 100) episodeCount = 100;
      var episodes = [];
      for (var i = 1; i <= episodeCount; i++) {
        episodes.push({
          number: i,
          title: "Episode " + i,
          url: "anilist:" + animeId + ":ep:" + i
        });
      }

      var statusMap = {
        "FINISHED": "completed",
        "RELEASING": "ongoing",
        "NOT_YET_RELEASED": "upcoming",
        "CANCELLED": "cancelled",
        "HIATUS": "hiatus"
      };
      var rawStatus = (item.status || "").toUpperCase();
      var status = statusMap[rawStatus] || "unknown";

      return {
        title: getTitle(item),
        cover: getCover(item),
        banner: item.bannerImage || null,
        synopsis: item.description || null,
        genres: item.genres || [],
        status: status,
        episodes: episodes
      };
    } catch (e) {
      log("AniList detail error: " + e);
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Video Sources
  // (AniList is metadata-only — no streaming sources available)
  // ═══════════════════════════════════════════════════════════════

  async getVideoSources(episodeUrl) {
    log("AniList sources: " + episodeUrl + " (metadata-only — no video sources)");
    return { sources: [], subtitles: [] };
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Popular / Trending
  // ═══════════════════════════════════════════════════════════════

  async getPopular(page) {
    log("AniList popular page=" + page);

    try {
      var q = "query ($page: Int) { Page(page: $page, perPage: 20) { pageInfo { hasNextPage } media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { id title { romaji english native } coverImage { large medium } } } }";

      var raw = await gql(q, { page: page });
      var data = JSON.parse(raw);
      var page_data = data.data && data.data.Page ? data.data.Page : {};
      var media = page_data.media || [];
      var pageInfo = page_data.pageInfo || {};

      var results = [];
      for (var i = 0; i < media.length; i++) {
        var item = media[i];
        results.push({
          id: String(item.id || ""),
          title: getTitle(item),
          cover: getCover(item),
          url: String(item.id || "")
        });
      }

      return {
        hasNextPage: pageInfo.hasNextPage || false,
        results: results
      };
    } catch (e) {
      log("AniList popular error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Latest (currently airing)
  // ═══════════════════════════════════════════════════════════════

  async getLatest(page) {
    log("AniList latest page=" + page);

    try {
      var q = "query ($page: Int) { Page(page: $page, perPage: 20) { pageInfo { hasNextPage } media(type: ANIME, status: RELEASING, sort: TRENDING_DESC, isAdult: false) { id title { romaji english native } coverImage { large medium } } } }";

      var raw = await gql(q, { page: page });
      var data = JSON.parse(raw);
      var page_data = data.data && data.data.Page ? data.data.Page : {};
      var media = page_data.media || [];
      var pageInfo = page_data.pageInfo || {};

      var results = [];
      for (var i = 0; i < media.length; i++) {
        var item = media[i];
        results.push({
          id: String(item.id || ""),
          title: getTitle(item),
          cover: getCover(item),
          url: String(item.id || "")
        });
      }

      return {
        hasNextPage: pageInfo.hasNextPage || false,
        results: results
      };
    } catch (e) {
      log("AniList latest error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }
}
