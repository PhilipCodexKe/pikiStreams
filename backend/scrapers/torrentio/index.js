/**
 * Torrentio Scraper Module Facade
 * 
 * Provides clean, high-level helper functions for movies and TV series.
 * Operates independently from existing scrapers.
 */

const axios = require('axios');
const { fetchMovieStreams, fetchTvStreams } = require('./client');
const { parseStreamsList } = require('./parser');
const { selectOptimalStreams } = require('./selector');

/**
 * Helper to resolve TMDB ID to IMDb ID if only TMDB ID is provided.
 */
async function resolveTmdbToImdb(tmdbId, type = 'movie') {
    const tmdbApiKey = process.env.TMDB_API_KEY;
    if (!tmdbApiKey || !tmdbId) return null;

    try {
        const endpoint = type === 'series' || type === 'tv'
            ? `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${tmdbApiKey}`
            : `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${tmdbApiKey}`;

        const res = await axios.get(endpoint, { timeout: 5000 });
        return res.data?.imdb_id || null;
    } catch {
        return null;
    }
}

/**
 * Get movie streams by IMDb ID (or TMDB fallback)
 * @param {Object} params
 * @param {string} [params.imdbId] - e.g. "tt1375666"
 * @param {string|number} [params.tmdbId] - TMDB ID if IMDb ID is not known
 * @param {boolean} [params.filterOptimal=true] - If true, selects exactly 3 browser-friendly streams (1080p, 720p, 480p)
 */
async function getMovieStreams({ imdbId, tmdbId, filterOptimal = true } = {}) {
    let finalImdbId = imdbId;

    if (!finalImdbId && tmdbId) {
        finalImdbId = await resolveTmdbToImdb(tmdbId, 'movie');
    }

    if (!finalImdbId) {
        console.warn('[Torrentio] No IMDb ID available for movie search.');
        return [];
    }

    const rawStreams = await fetchMovieStreams(finalImdbId);
    const parsed = parseStreamsList(rawStreams);

    if (filterOptimal) {
        return selectOptimalStreams(parsed, { minSeeders: 5 });
    }

    return parsed;
}

/**
 * Get TV series episode streams by IMDb ID (or TMDB fallback)
 * @param {Object} params
 * @param {string} [params.imdbId] - e.g. "tt0903747"
 * @param {string|number} [params.tmdbId] - TMDB ID if IMDb ID is not known
 * @param {number|string} params.season - Season number
 * @param {number|string} params.episode - Episode number
 * @param {boolean} [params.filterOptimal=true] - If true, selects exactly 3 browser-friendly streams (1080p, 720p, 480p)
 */
async function getTvStreams({ imdbId, tmdbId, season, episode, filterOptimal = true } = {}) {
    let finalImdbId = imdbId;

    if (!finalImdbId && tmdbId) {
        finalImdbId = await resolveTmdbToImdb(tmdbId, 'series');
    }

    if (!finalImdbId || season === undefined || episode === undefined) {
        console.warn('[Torrentio] Missing required IMDb ID, Season, or Episode for TV search.');
        return [];
    }

    const rawStreams = await fetchTvStreams(finalImdbId, season, episode);
    const parsed = parseStreamsList(rawStreams);

    if (filterOptimal) {
        return selectOptimalStreams(parsed, { minSeeders: 5 });
    }

    return parsed;
}

module.exports = {
    getMovieStreams,
    getTvStreams,
    selectOptimalStreams,
    resolveTmdbToImdb
};

