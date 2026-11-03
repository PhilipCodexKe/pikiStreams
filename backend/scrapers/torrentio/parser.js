/**
 * Parser for Torrentio stream outputs.
 * Parses raw JSON streams into normalized objects matching the app's database schema.
 */

const { TRACKERS_QUERY_STRING } = require('./config');

/**
 * Parses Torrentio stream titles and raw fields into a structured object.
 *
 * Example Torrentio title structure:
 * "Inception.2010.1080p.BluRay.x264\n💾 2.1 GB  ⚙️ 1337x\n👤 450"
 */
function parseStream(stream) {
    if (!stream || !stream.infoHash) return null;

    const rawTitle = stream.title || '';
    const rawName = stream.name || '';
    const lines = rawTitle.split('\n').map(l => l.trim()).filter(Boolean);

    // Release filename or title usually occupies the first line
    const releaseTitle = lines[0] || 'Unknown Release';

    // 1. Extract resolution/quality
    let quality = 'Unknown';
    const qualityMatch = (rawName + ' ' + rawTitle).match(/\b(4k|2160p|1080p|720p|480p|cam|ts)\b/i);
    if (qualityMatch) {
        quality = qualityMatch[1].toUpperCase();
    }

    // 2. Extract file size (e.g., "💾 2.15 GB")
    let size = 'Unknown';
    const sizeMatch = rawTitle.match(/💾\s*([0-9.]+\s*[GMK]B)/i);
    if (sizeMatch) {
        size = sizeMatch[1].trim();
    }

    // 3. Extract seeders count (e.g., "👤 350")
    let seeders = 0;
    const seederMatch = rawTitle.match(/👤\s*(\d+)/);
    if (seederMatch) {
        seeders = parseInt(seederMatch[1], 10) || 0;
    }

    // 4. Extract underlying provider name (e.g., "⚙️ 1337x")
    let underlyingSource = 'Unknown';
    const providerMatch = rawTitle.match(/⚙️\s*([^\n👤💾]+)/);
    if (providerMatch) {
        underlyingSource = providerMatch[1].trim();
    }

    // 5. Reconstruct magnet URL
    const cleanHash = stream.infoHash.toLowerCase();
    const magnet = `magnet:?xt=urn:btih:${cleanHash}&dn=${encodeURIComponent(releaseTitle)}${TRACKERS_QUERY_STRING}`;

    return {
        title: releaseTitle,
        magnet,
        infoHash: cleanHash,
        quality,
        size,
        seeders,
        leechers: 0,
        provider: `Torrentio (${underlyingSource})`,
        fileIdx: stream.fileIdx ?? null
    };
}

/**
 * Parses and sorts an array of Torrentio streams.
 */
function parseStreamsList(rawStreams = []) {
    if (!Array.isArray(rawStreams)) return [];

    const parsed = rawStreams
        .map(parseStream)
        .filter(s => s !== null && s.infoHash);

    // Sort descending by seeders
    return parsed.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
}

module.exports = {
    parseStream,
    parseStreamsList
};

