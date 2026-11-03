/**
 * Torrentio Scraper Configuration
 * Purely independent module for querying Stremio's Torrentio addon.
 */

const TORRENTIO_HOSTS = [
    'https://torrentio.strem.fun'
];

const DEFAULT_TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://explodie.org:6969/announce',
    'udp://tracker.coppersurfer.tk:6969/announce',
    'udp://tracker.leechers-paradise.org:6969/announce',
    'udp://p4p.arenabg.com:1337/announce'
];

const TRACKERS_QUERY_STRING = DEFAULT_TRACKERS
    .map(tracker => `&tr=${encodeURIComponent(tracker)}`)
    .join('');

module.exports = {
    TORRENTIO_HOSTS,
    DEFAULT_TRACKERS,
    TRACKERS_QUERY_STRING,
    REQUEST_TIMEOUT_MS: 30000,
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
};
