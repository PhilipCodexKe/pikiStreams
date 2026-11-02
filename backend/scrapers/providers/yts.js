const axios = require("axios");
const { getHealthyMirror } = require("../engine/mirror-manager");

/**
 * YTS Provider Module
 * YTS exposes clean JSON API endpoints on its mirrors for ultra-fast, sub-second responses.
 */
const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.openbittorrent.com:80/announce",
  "udp://tracker.coppersurfer.tk:6969/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://p4p.arenabg.ch:1337/announce",
  "udp://tracker.internetwarriors.net:1337/announce"
];

const buildMagnet = (hash, title) => {
  const encodedTitle = encodeURIComponent(title);
  const tr = TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
  return `magnet:?xt=urn:btih:${hash}&dn=${encodedTitle}${tr}`;
};

const search = async (query) => {
  const mirrors = [
    "https://yts.mx",
    "https://yts.lt",
    "https://yts.do"
  ];

  let lastError = null;

  for (const mirror of mirrors) {
    try {
      const url = `${mirror}/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=10`;

      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });

      const movies = response.data?.data?.movies;
      if (!movies || !Array.isArray(movies)) return [];

      const streams = [];

      for (const movie of movies) {
        if (!movie.torrents) continue;

        for (const torrent of movie.torrents) {
          const quality = torrent.quality || "Unknown";
          const type = torrent.type ? `.${torrent.type}` : "";
          const releaseTitle = `${movie.title_long || movie.title} [${quality}]${type} [YTS]`;
          const infoHash = torrent.hash.toLowerCase();

          // Direct .torrent download URL (works across active YTS mirrors)
          const torrentDownloadUrl = torrent.url || `${mirror}/torrent/download/${infoHash}`;

          streams.push({
            title: releaseTitle,
            infoHash,
            magnet: buildMagnet(torrent.hash, releaseTitle),
            torrentUrl: torrentDownloadUrl,
            quality,
            size: torrent.size || "Unknown",
            seeders: parseInt(torrent.seeds, 10) || 0,
            leechers: parseInt(torrent.peers, 10) || 0,
            year: movie.year || null,
            provider: "yts",
          });
        }
      }

      if (streams.length > 0) {
        console.log(`[YTS Provider] Successfully fetched streams using mirror: ${mirror}`);
        return streams;
      }
    } catch (err) {
      lastError = err;
      console.warn(`[YTS Provider] Mirror ${mirror} failed (${err.code || err.message}). Trying next mirror...`);
    }
  }

  console.error("[YTS Provider] All YTS mirrors failed. Last error:", lastError?.message);
  return [];
};

module.exports = {
  name: "yts",
  searchCheerio: search, // YTS is pure JSON/Cheerio compatible
  searchPlaywright: null, // YTS API is always direct
};
