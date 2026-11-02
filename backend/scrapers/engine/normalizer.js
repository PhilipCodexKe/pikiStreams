/**
 * Unified Torrent & Magnet Normalizer
 * Cleans titles, extracts qualities/sizes, resolves infoHash from magnets,
 * deduplicates entries by hash keeping the highest seeders,
 * and filters out malware-suspicious files and un-streamable oversized remuxes.
 */

// ============================================================================
// STREAMING SAFETY FILTERS
// ============================================================================
const MIN_SIZE_BYTES = 250 * 1024 * 1024;           // 250 MB: below = sample/malware
const MAX_SIZE_BYTES = 25.0 * 1024 * 1024 * 1024;   // 25 GB: allows high-bitrate 1080p and 4K encodes

// Dangerous title keywords that indicate non-movie or malicious content
const BLOCKED_KEYWORDS = [
    'password',
    'cracked',
    'keygen',
    'setup.exe',
    'activator',
    '.exe',
    '.scr',
    '.bat',
    'xxx',
    'adult',
    'porn',
    'sample only',
    'trailer only',
    'yts.bz',
    'yts.gg',
    'yifystatus'
];

// Low-quality cam recordings not suitable for streaming
const CAM_QUALITY_TAGS = ['camrip', 'cam', 'ts', 'telesync', 'hdcam', 'dvdscr', 'scr', 'r5'];

/**
 * Extract InfoHash from magnet URI
 * e.g. magnet:?xt=urn:btih:4A5C7F... -> 4a5c7f...
 */
const extractInfoHash = (magnet) => {
    if (!magnet || typeof magnet !== 'string') return null;
    const match = magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
    return match ? match[1].toLowerCase() : null;
};

/**
 * Parse a human-readable size string into bytes
 * Handles: "2.26 GB", "2.26GB", "963 MB", "963MB", "1.2 TB"
 */
const parseSizeToBytes = (sizeStr) => {
    if (!sizeStr || typeof sizeStr !== 'string') return null;
    const match = sizeStr.trim().match(/^([\d.]+)\s*(GB|MB|TB|GiB|MiB)/i);
    if (!match) return null;
    const num = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === 'TB') return num * 1024 * 1024 * 1024 * 1024;
    if (unit === 'GB' || unit === 'GIB') return num * 1024 * 1024 * 1024;
    if (unit === 'MB' || unit === 'MIB') return num * 1024 * 1024;
    return null;
};

/**
 * Check whether a stream is safe and streamable
 * Returns false if it is a likely malware file, too small, or too large to stream
 */
const isStreamable = (stream) => {
    const title = (stream.title || '').toLowerCase();
    const size = stream.size || '';

    // 1. Block dangerous/suspicious keywords in the release title
    for (const keyword of BLOCKED_KEYWORDS) {
        if (title.includes(keyword.toLowerCase())) {
            return false;
        }
    }

    // 2. Parse size and enforce min/max byte limits
    const sizeBytes = parseSizeToBytes(size);

    if (sizeBytes !== null) {
        if (sizeBytes < MIN_SIZE_BYTES) return false;   // Too small: malware/fake/sample
        if (sizeBytes > MAX_SIZE_BYTES) return false;   // Too large: raw remux/disc clone
    }

    return true;
};

/**
 * Parse torrent raw title into cleanTitle, releaseYear, size, quality
 */
const parseTorrentDetails = (rawTitle, rawSize = null) => {
    if (!rawTitle) return { cleanTitle: 'Unknown', year: null, quality: 'Unknown', size: 'Unknown' };

    // 1. Extract Size (e.g. 1.4 GB, 750 MB)
    let size = rawSize;
    if (!size) {
        const sizeMatch = rawTitle.match(/(\d+(?:\.\d+)?\s*[GM]B)/i);
        size = sizeMatch ? sizeMatch[1].toUpperCase().replace(/\s+/g, '') : 'Unknown';
    }

    // 2. Extract Quality tags
    const qualityMatch = rawTitle.match(/(2160p|4k|1080p|720p|480p|CAM|HDR|BluRay|BRRip|WEBRip|HDTV)/i);
    let quality = qualityMatch ? qualityMatch[1].toUpperCase() : 'Unknown';
    if (quality === '4K') quality = '2160p';

    // 3. Extract Year (4-digit year between 1900 and 2099)
    const yearMatch = rawTitle.match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

    // 4. Clean human-readable title
    let cleanTitle = rawTitle
        .replace(/\./g, ' ')
        .replace(/\[.*?\]|\(.*?\)/g, '')
        .replace(/\b(2160p|4k|1080p|720p|480p|CAM|HDR|BluRay|BRRip|WEBRip|HDTV|x264|x265|HEVC|AAC|DTS|YTS|RARBG|TGx)\b.*/i, '')
        .trim();

    if (year && cleanTitle.includes(String(year))) {
        cleanTitle = cleanTitle.split(String(year))[0].trim();
    }

    return {
        cleanTitle: cleanTitle || rawTitle,
        year,
        quality,
        size
    };
};

/**
 * Standardize and deduplicate an array of torrent streams.
 * - Groups by infoHash, keeps highest seeders.
 * - Filters out malware, oversized, and non-streamable files.
 * - Sorts by seeders descending.
 */
const normalizeAndDeduplicate = (streamsList, defaultProvider = 'unknown') => {
    if (!Array.isArray(streamsList)) return [];

    const map = new Map();
    let dropped = 0;

    for (const item of streamsList) {
        const magnet = item.magnet || item.magnetUrl;
        const infoHash = item.infoHash ? item.infoHash.toLowerCase() : extractInfoHash(magnet);

        // Discard streams without valid magnet/infoHash
        if (!magnet || !infoHash) continue;

        const parsed = parseTorrentDetails(item.title || item.torrent_title, item.size);

        const normalizedStream = {
            title: item.title || item.torrent_title || parsed.cleanTitle,
            infoHash,
            magnet,
            // Preserve direct .torrent URL if provided (YTS supplies this).
            // Allows the stream server to skip DHT and fetch metadata instantly.
            torrentUrl: item.torrentUrl || item.torrent_url || null,
            quality: item.quality && item.quality !== 'Unknown' ? item.quality.toUpperCase() : parsed.quality,
            size: item.size && item.size !== 'Unknown' ? item.size : parsed.size,
            seeders: parseInt(item.seeders, 10) || 0,
            leechers: parseInt(item.leechers, 10) || 0,
            provider: item.provider || defaultProvider,
            year: item.year || parsed.year || null
        };

        // Apply streaming safety filter
        if (!isStreamable(normalizedStream)) {
            dropped++;
            continue;
        }

        // Use a composite key of infoHash + quality so that 720p, 1080p, 2160p are ALL preserved!
        const uniqueKey = `${infoHash}_${normalizedStream.quality}`;
        if (map.has(uniqueKey)) {
            const existing = map.get(uniqueKey);
            if (normalizedStream.seeders > existing.seeders) {
                map.set(uniqueKey, normalizedStream);
            }
        } else {
            map.set(uniqueKey, normalizedStream);
        }
    }

    if (dropped > 0) {
        console.log(`[Normalizer] Filtered out ${dropped} suspicious/un-streamable torrent(s) (malware/too small/too large).`);
    }

    // Sort by seeders descending
    return Array.from(map.values()).sort((a, b) => b.seeders - a.seeders);
};

module.exports = {
    extractInfoHash,
    parseTorrentDetails,
    parseSizeToBytes,
    isStreamable,
    normalizeAndDeduplicate
};
