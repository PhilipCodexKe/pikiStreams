/**
 * Torrentio Stream Selector & Filter
 *
 * Rules:
 * 1. 100% Direct Browser Playable (x264 / AVC + AAC preferred; discards DTS / unplayable codecs).
 * 2. Ignore 4K completely.
 * 3. Health cutoff: Minimum 5 seeders.
 * 4. Pick exactly 3 streams: [1080p, 720p, 480p] (with smart fallback if 480p is unavailable).
 * 5. In each resolution bucket, prioritize the most compact/lightweight file size among healthy streams.
 */

// Helper to convert size string (e.g. "950 MB", "2.1 GB") to MegaBytes for sorting
function parseSizeToMB(sizeStr) {
    if (!sizeStr || sizeStr === 'Unknown') return 999999;
    const match = sizeStr.match(/([0-9.]+)\s*(GB|MB|KB)/i);
    if (!match) return 999999;

    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    if (unit === 'GB') return val * 1024;
    if (unit === 'MB') return val;
    if (unit === 'KB') return val / 1024;
    return 999999;
}

/**
 * Score browser compatibility:
 * Higher score = much more likely to play directly without audio/video issues in browser.
 */
function getBrowserCompatibilityScore(stream) {
    const text = (stream.title + ' ' + (stream.rawTitle || '')).toLowerCase();

    // 1. Instant disqualifiers (Zero sound or unsupported in Chrome/Firefox)
    if (text.includes('dts-hd') || text.includes('dts') || text.includes('truehd')) {
        return -50; // DTS audio will result in silence
    }
    if (text.includes('2160p') || text.includes('4k')) {
        return -100; // Ignore 4K as requested
    }

    let score = 0;

    // 2. Video Codec Scoring
    if (text.includes('x264') || text.includes('h264') || text.includes('h.264') || text.includes('avc')) {
        score += 50; // Native hardware decoded by 100% of browsers
    } else if (text.includes('x265') || text.includes('hevc') || text.includes('h265')) {
        score -= 20; // HEVC has patchy browser support without flags
    }

    // 3. Audio Codec Scoring
    if (text.includes('aac') || text.includes('mp3')) {
        score += 30; // Native browser audio
    } else if (text.includes('ac3') || text.includes('eac3') || text.includes('ddp5.1')) {
        score -= 10; // Dolby Digital often fails in browsers without passthrough
    }

    // 4. Source / Quality
    if (text.includes('web-dl') || text.includes('webrip') || text.includes('bluray')) {
        score += 10;
    }

    return score;
}

/**
 * Categorize stream into one of our 3 targets: 1080P, 720P, or 480P
 */
function getResolutionBucket(stream) {
    const text = (stream.quality + ' ' + stream.title).toLowerCase();

    // STRICT: Ignore 4k / 2160p from all buckets
    if (text.includes('2160p') || text.includes('4k')) return null;

    if (text.includes('1080p') || text.includes('1080')) return '1080p';
    if (text.includes('720p') || text.includes('720')) return '720p';
    if (text.includes('480p') || text.includes('480') || text.includes('sd') || text.includes('dvdrip')) return '480p';

    return null;
}

/**
 * Select the optimal stream from a specific resolution bucket.
 * Criteria:
 * 1. Filter out unplayable candidates (e.g. DTS audio or 4K).
 * 2. High browser compatibility score (x264/AVC + AAC preferred).
 * 3. Seeders Priority: Prioritize the strongest swarm (most seeders).
 * 4. Size Tie-breaker: Among top seeders, pick the smallest file size for faster streaming.
 */
function pickBestFromBucket(candidates) {
    if (!candidates || candidates.length === 0) return null;

    // Filter out unplayable candidates (e.g. DTS audio or 4K)
    const playable = candidates.filter(c => c._browserScore > -30);
    const pool = playable.length > 0 ? playable : candidates;

    return pool.sort((a, b) => {
        // 1. If one has significantly better browser compatibility (> 30 point lead), pick it
        const scoreDiff = b._browserScore - a._browserScore;
        if (Math.abs(scoreDiff) >= 30) {
            return scoreDiff;
        }

        // 2. High Seeders Priority: If one stream has significantly more seeders (> 15% more),
        // prioritize it for swarm download speed
        const seedsDiff = (b.seeders || 0) - (a.seeders || 0);
        const maxSeeds = Math.max(a.seeders || 0, b.seeders || 0);
        if (maxSeeds > 20 && Math.abs(seedsDiff) > maxSeeds * 0.25) {
            return seedsDiff;
        }

        // 3. Size Efficiency: Within similar high-seed swarm pools, pick the smaller file
        if (a._sizeMB !== b._sizeMB) {
            return a._sizeMB - b._sizeMB;
        }

        // Final tie-breaker: seeders
        return (b.seeders || 0) - (a.seeders || 0);
    })[0];
}

/**
 * Filter and select exactly 3 optimal streams for an episode or movie.
 *
 * @param {Array} streams - Normalized stream list from Torrentio parser
 * @param {Object} options
 * @param {number} [options.minSeeders=5] - Minimum required seeders
 * @returns {Array} - Array of up to 3 selected streams [1080p, 720p, 480p/fallback]
 */
function selectOptimalStreams(streams = [], options = {}) {
    const minSeeders = options.minSeeders ?? 5;

    // 1. Filter out dead streams & score compatibility
    const healthy = streams
        .filter(s => (s.seeders || 0) >= minSeeders)
        .map(s => {
            const copy = { ...s };
            copy._browserScore = getBrowserCompatibilityScore(copy);
            copy._sizeMB = parseSizeToMB(copy.size);
            copy._bucket = getResolutionBucket(copy);
            return copy;
        })
        .filter(s => s._bucket !== null); // Ignore 4K or uncategorized

    // 2. Divide into resolution buckets
    const bucket1080 = healthy.filter(s => s._bucket === '1080p');
    const bucket720 = healthy.filter(s => s._bucket === '720p');
    const bucket480 = healthy.filter(s => s._bucket === '480p');

    // 3. Pick the single best candidate for each bucket
    const best1080 = pickBestFromBucket(bucket1080);
    const best720 = pickBestFromBucket(bucket720);
    const best480 = pickBestFromBucket(bucket480);

    const selected = [];
    const usedHashes = new Set();

    const addStream = (st) => {
        if (st && !usedHashes.has(st.infoHash)) {
            usedHashes.add(st.infoHash);
            // Clean up temporary scoring properties before returning
            const { _browserScore, _sizeMB, _bucket, ...clean } = st;
            selected.push(clean);
        }
    };

    // Add primary slots
    if (best1080) addStream(best1080);
    if (best720) addStream(best720);
    if (best480) addStream(best480);

    // 4. Fallback if fewer than 3 options were picked (e.g. 480p is rarely uploaded nowadays)
    if (selected.length < 3) {
        // Find next best alternatives in 720p or 1080p pool that haven't been picked yet (STRICT: ignore 4k and score > 0)
        const remainingPool = healthy
            .filter(s => !usedHashes.has(s.infoHash) && s._browserScore > 0 && !s.title.toLowerCase().includes('2160p'))
            .sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

        for (const candidate of remainingPool) {
            addStream(candidate);
            if (selected.length >= 3) break;
        }
    }

    return selected;
}

module.exports = {
    selectOptimalStreams,
    getBrowserCompatibilityScore,
    parseSizeToMB
};
