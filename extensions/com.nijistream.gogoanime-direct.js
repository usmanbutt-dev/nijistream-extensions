// NijiStream — GogoAnime Direct Scraping Extension
//
// This extension scrapes GogoAnime directly using http.get + parseHtml.
// No external API dependency — works without any server infrastructure.
//
// TRADE-OFF: Less stable than API-based extensions because GogoAnime
// may change its HTML structure at any time, and they use anti-bot
// measures (JS challenges) that may block direct HTTP requests.
//
// If this extension stops working, update BASE_URL to the current
// active GogoAnime domain. Common mirrors to try:
//   https://gogoanime.gg
//   https://gogoanime3.net
//   https://anitaku.bz

const manifest = {
  id: "com.nijistream.gogoanime-direct",
  name: "GogoAnime (Direct)",
  version: "1.1.0",
  lang: "en",
  author: "nijistream",
  description: "GogoAnime direct scraper — may be blocked by anti-bot measures. Update BASE_URL if broken.",
  icon: null,
  nsfw: false
};

// ── Configuration ──
// Update BASE_URL to the current active GogoAnime domain if broken.
var BASE_URL = "https://gogoanime3.net";
var AJAX_URL = "https://ajax.gogocdn.net/ajax";

class AnimeSource {

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Search
  // ═══════════════════════════════════════════════════════════════

  async search(query, page) {
    log("GogoAnime-Direct search: " + query + " page=" + page);

    try {
      var url = BASE_URL + "/search.html?keyword=" + encodeURIComponent(query) + "&page=" + page;
      var html = await http.get(url);
      var dom = parseHtml(html);

      var results = [];
      var items = dom.querySelectorAll("ul.items li");

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var linkEl = item.querySelector("p.name a");
        var imgEl = item.querySelector("div.img a img");

        if (linkEl) {
          var href = linkEl.getAttribute("href") || "";
          var title = linkEl.getAttribute("title") || linkEl.text || "";
          var cover = imgEl ? imgEl.getAttribute("src") : null;

          // Extract anime ID from href: /category/anime-name → anime-name
          var id = href.replace("/category/", "");

          results.push({
            id: id,
            title: title.trim(),
            cover: cover,
            url: href
          });
        }
      }

      // Check if there's a next page
      var nextPage = dom.querySelector("ul.pagination-list li.selected");
      var hasNext = false;
      if (nextPage) {
        var nextLink = nextPage.querySelector("a");
        // If there's a next sibling, there's another page
        // Simple heuristic: if we got results, assume hasNextPage
        hasNext = results.length >= 20;
      }

      return {
        hasNextPage: hasNext,
        results: results
      };
    } catch (e) {
      log("GogoAnime-Direct search error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Detail
  // ═══════════════════════════════════════════════════════════════

  async getDetail(animeId) {
    log("GogoAnime-Direct detail: " + animeId);

    try {
      var url = BASE_URL + "/category/" + animeId;
      var html = await http.get(url);
      var dom = parseHtml(html);

      // Title
      var titleEl = dom.querySelector("div.anime_info_body_bg h1");
      var title = titleEl ? titleEl.text.trim() : "Unknown";

      // Cover image
      var imgEl = dom.querySelector("div.anime_info_body_bg img");
      var cover = imgEl ? imgEl.getAttribute("src") : null;

      // Synopsis and metadata
      var synopsis = "";
      var genres = [];
      var status = "unknown";

      var typeEls = dom.querySelectorAll("p.type");
      for (var i = 0; i < typeEls.length; i++) {
        var pEl = typeEls[i];
        var text = pEl.text || "";

        if (text.indexOf("Plot Summary") !== -1) {
          // Synopsis is in the text after the span
          synopsis = text.replace("Plot Summary:", "").trim();
        } else if (text.indexOf("Genre") !== -1) {
          var genreLinks = pEl.querySelectorAll("a");
          for (var g = 0; g < genreLinks.length; g++) {
            var genre = genreLinks[g].getAttribute("title") || genreLinks[g].text;
            if (genre) genres.push(genre.trim());
          }
        } else if (text.indexOf("Status") !== -1) {
          var statusText = text.replace("Status:", "").trim().toLowerCase();
          if (statusText.indexOf("ongoing") !== -1) status = "airing";
          else if (statusText.indexOf("completed") !== -1) status = "completed";
        }
      }

      // Episode list — GogoAnime stores episode range in a hidden input
      var episodes = [];
      var movieIdEl = dom.querySelector("input#movie_id");
      var movieId = movieIdEl ? movieIdEl.getAttribute("value") : null;

      if (movieId) {
        episodes = await this._fetchEpisodeList(movieId, animeId);
      }

      return {
        title: title,
        cover: cover,
        banner: null,
        synopsis: synopsis,
        genres: genres,
        status: status,
        episodes: episodes
      };
    } catch (e) {
      log("GogoAnime-Direct detail error: " + e);
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REQUIRED: Get Video Sources
  // ═══════════════════════════════════════════════════════════════

  async getVideoSources(episodeUrl) {
    log("GogoAnime-Direct sources: " + episodeUrl);

    try {
      // episodeUrl is like: anime-name-episode-1
      var url = BASE_URL + "/" + episodeUrl;
      var html = await http.get(url);
      var dom = parseHtml(html);

      var sources = [];

      // Look for download links which contain direct video URLs
      var downloadLinks = dom.querySelectorAll("div.anime_muti_link ul li a");
      for (var i = 0; i < downloadLinks.length; i++) {
        var link = downloadLinks[i];
        var dataVideo = link.getAttribute("data-video") || "";
        var serverName = link.text.trim();

        if (dataVideo) {
          // Try to extract the actual stream URL from the embed page
          sources.push({
            url: dataVideo,
            quality: "auto",
            type: "hls",
            server: serverName
          });
        }
      }

      // Fallback: check for embedded video iframe
      if (sources.length === 0) {
        var iframe = dom.querySelector("div.play-video iframe");
        if (iframe) {
          var iframeSrc = iframe.getAttribute("src") || "";
          if (iframeSrc) {
            sources.push({
              url: iframeSrc.indexOf("http") === 0 ? iframeSrc : "https:" + iframeSrc,
              quality: "auto",
              type: "hls",
              server: "default"
            });
          }
        }
      }

      return {
        sources: sources,
        subtitles: []
      };
    } catch (e) {
      log("GogoAnime-Direct sources error: " + e);
      return { sources: [], subtitles: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Popular
  // ═══════════════════════════════════════════════════════════════

  async getPopular(page) {
    log("GogoAnime-Direct popular page=" + page);

    try {
      var url = BASE_URL + "/popular.html?page=" + page;
      var html = await http.get(url);
      return this._parseListPage(html);
    } catch (e) {
      log("GogoAnime-Direct popular error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL: Get Latest
  // ═══════════════════════════════════════════════════════════════

  async getLatest(page) {
    log("GogoAnime-Direct latest page=" + page);

    try {
      var url = BASE_URL + "/?page=" + page;
      var html = await http.get(url);
      return this._parseListPage(html);
    } catch (e) {
      log("GogoAnime-Direct latest error: " + e);
      return { hasNextPage: false, results: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Fetch episode list from AJAX endpoint
  // ═══════════════════════════════════════════════════════════════

  async _fetchEpisodeList(movieId, animeId) {
    try {
      // GogoAnime uses an AJAX endpoint to load episode pages
      var url = AJAX_URL + "/load-list-episode?ep_start=0&ep_end=9999&id=" + movieId;
      var html = await http.get(url);
      var dom = parseHtml(html);

      var episodes = [];
      var links = dom.querySelectorAll("li a");

      for (var i = links.length - 1; i >= 0; i--) {
        var link = links[i];
        var href = link.getAttribute("href") || "";
        var epNumEl = link.querySelector("div.name");
        var epText = epNumEl ? epNumEl.text.trim() : "";

        // Extract episode number from "EP N" text
        var epNum = 0;
        var match = epText.replace("EP ", "");
        epNum = parseInt(match) || (links.length - i);

        // href is like: /anime-name-episode-1
        var episodeId = href.trim().replace(/^\//, "");

        episodes.push({
          number: epNum,
          title: "Episode " + epNum,
          url: episodeId
        });
      }

      return episodes;
    } catch (e) {
      log("GogoAnime-Direct episode list error: " + e);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Parse a listing page (popular, latest, search)
  // ═══════════════════════════════════════════════════════════════

  _parseListPage(html) {
    var dom = parseHtml(html);
    var results = [];
    var items = dom.querySelectorAll("ul.items li");

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var linkEl = item.querySelector("p.name a") || item.querySelector("a");
      var imgEl = item.querySelector("div.img a img") || item.querySelector("img");

      if (linkEl) {
        var href = linkEl.getAttribute("href") || "";
        var title = linkEl.getAttribute("title") || linkEl.text || "";
        var cover = imgEl ? imgEl.getAttribute("src") : null;
        var id = href.replace("/category/", "");

        results.push({
          id: id,
          title: title.trim(),
          cover: cover,
          url: href
        });
      }
    }

    return {
      hasNextPage: results.length >= 20,
      results: results
    };
  }
}
