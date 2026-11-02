const axios = require('axios');

/**
 * EZTV TV Show Provider Module
 * EZTV provides a public JSON API for TV episodes indexed by numeric IMDb ID.
 */
const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://p4p.arenabg.ch:1337/announce',
  'udp://tracker.internetwarriors.net:1337/announce',
];

const buildMagnet = (hash, title) => {
  const encodedTitle = encodeURIComponent(title);
  const tr = TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('');
  return `magnet:?xt=urn:btih:${hash}&dn=${encodedTitle}${tr}`;
};

const extractQuality = (title) => {
  if (/2160p|4k/i.test(title)) return '4K';
  if (/1080p/i.test(title)) return '1080p';
  if (/720p/i.test(title)) return '720p';
  if (/480p|hdtv|webrip|web-dl/i.test(title)) return 'HDTV';
  return 'HD';
};

/**
 * Fetch torrents for a TV show from EZTV
 * @param {string|number} imdbId - IMDb ID (with or without 'tt' prefix)
 * @param {number|null} season - Season number to filter
 * @param {number|null} episode - Episode number to filter
 */
const searchTv = async (imdbId, season = null, episode = null) => {
  if (!imdbId) return [];

  // Strip 'tt' prefix to get pure numeric IMDb ID
  const cleanImdbId = String(imdbId).replace(/^tt/, '');

  const mirrors = [
    'https://eztv.re',
    'https://eztv.wf',
    'https://eztv.tf',
  ];

  for (const mirror of mirrors) {
    try {
      const url = `${mirror}/api/get-torrents?imdb_id=${cleanImdbId}&limit=100`;

      const response = await axios.get(url, {
        timeout: 7000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      });

      const torrents = response.data?.torrents;
      if (!torrents || !Array.isArray(torrents)) continue;

      const streams = [];

      for (const t of torrents) {
        const tSeason = parseInt(t.season, 10);
        const tEpisode = parseInt(t.episode, 10);

        // If specific season and episode requested, filter
        if (season !== null && tSeason !== parseInt(season, 10)) continue;
        if (episode !== null && tEpisode !== parseInt(episode, 10)) continue;

        const infoHash = (t.hash || '').toLowerCase();
        if (!infoHash) continue;

        const title = t.title || t.filename;
        const quality = extractQuality(title);
        const magnet = t.magnet_url || buildMagnet(infoHash, title);

        streams.push({
          title,
          infoHash,
          magnet,
          torrentUrl: t.torrent_url || null,
          quality,
          size: t.size_bytes ? `${(t.size_bytes / (1024 * 1024)).toFixed(1)} MB` : 'Unknown',
          seeders: parseInt(t.seeds, 10) || 0,
          leechers: parseInt(t.peers, 10) || 0,
          provider: 'eztv',
          season: tSeason,
          episode: tEpisode,
        });
      }

      // Sort by seeders descending
      streams.sort((a, b) => b.seeders - a.seeders);
      return streams;
    } catch (err) {
      console.warn(`[EZTV Provider] Mirror failed (${mirror}):`, err.message);
    }
  }

  return [];
};

module.exports = {
  name: 'eztv',
  searchTv,
};

