/**
 * HTTP Client for querying the Torrentio stream API.
 * Uses native fetch (Node.js 18+) for HTTP/2 & optimal Cloudflare TLS negotiation.
 */

const { TORRENTIO_HOSTS, REQUEST_TIMEOUT_MS, USER_AGENT } = require('./config');

/**
 * Perform GET request to Torrentio endpoint
 * @param {string} endpoint - Relative path (e.g. "/stream/movie/tt1375666.json")
 */
async function fetchTorrentio(endpoint) {
    let lastError = null;

    for (const host of TORRENTIO_HOSTS) {
        const url = `${host}${endpoint}`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'application/json'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (data && Array.isArray(data.streams)) {
                return data.streams;
            }
        } catch (err) {
            lastError = err;
            console.warn(`[Torrentio Client] Host ${host} failed for ${endpoint}: ${err.message}`);
        }
    }

    if (lastError) {
        console.error(`[Torrentio Client] All hosts failed for ${endpoint}. Error: ${lastError.message}`);
    }
    return [];
}

/**
 * Query streams for a Movie
 * @param {string} imdbId - IMDb ID with 'tt' prefix (e.g., 'tt1375666')
 */
async function fetchMovieStreams(imdbId) {
    if (!imdbId) return [];
    const formattedId = imdbId.trim();
    return await fetchTorrentio(`/stream/movie/${formattedId}.json`);
}

/**
 * Query streams for a TV Episode
 * @param {string} imdbId - IMDb ID with 'tt' prefix (e.g., 'tt0903747')
 * @param {number|string} season - Season number (1-based)
 * @param {number|string} episode - Episode number (1-based)
 */
async function fetchTvStreams(imdbId, season, episode) {
    if (!imdbId || season === undefined || episode === undefined) return [];
    const formattedId = `${imdbId.trim()}:${season}:${episode}`;
    return await fetchTorrentio(`/stream/series/${formattedId}.json`);
}

module.exports = {
    fetchTorrentio,
    fetchMovieStreams,
    fetchTvStreams
};

