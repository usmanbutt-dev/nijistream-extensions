# NijiStream Extensions

Official extension repository for [NijiStream](https://github.com/usmanbutt-dev/NijiStream).

## How to use

In NijiStream, go to **Settings → Extensions** and paste this URL into the repo field:

```
https://raw.githubusercontent.com/usmanbutt-dev/nijistream-extensions/master/index.json
```

## Available extensions

| Extension | ID | Language | NSFW |
|---|---|---|---|
| Example Source | `com.nijistream.example` | en | No |

## Writing your own extension

Extensions are JavaScript files that export a `const manifest` object and an `AnimeSource` class.

### Manifest

```js
const manifest = {
  id: "com.example.mysource",   // reverse-domain, must be unique
  name: "My Source",
  version: "1.0.0",
  lang: "en",
  author: "yourname",
  description: "Short description.",
  icon: null,   // or an https:// image URL
  nsfw: false
};
```

### Required methods

```js
class AnimeSource {
  // Returns { hasNextPage: bool, results: [{ id, title, cover, url }] }
  async search(query, page) { ... }

  // Returns { title, cover, banner, synopsis, genres, status,
  //           episodes: [{ number, title, url }] }
  async getDetail(animeId) { ... }

  // Returns { sources: [{ url, quality, type }], subtitles: [...] }
  async getVideoSources(episodeUrl) { ... }
}
```

### Available bridge APIs

```js
// HTTP
http.get(url, headers?)      // → string
http.post(url, body, headers?) // → string

// HTML parsing
const dom = parseHtml(htmlString);
dom.querySelector(css)       // → element | null
dom.querySelectorAll(css)    // → element[]
element.text / element.html
element.getAttribute(name)

// Crypto
crypto.md5(str)
crypto.base64Encode(str)
crypto.base64Decode(str)

// Debug
log(message)
```

### Hosting

Host the `.js` file anywhere that returns the raw text — GitHub raw URLs work well:

```
https://raw.githubusercontent.com/username/repo/main/extensions/com.example.mysource.js
```

Then add an entry to your `index.json` pointing to that URL, and share the raw URL of your `index.json` with users.
