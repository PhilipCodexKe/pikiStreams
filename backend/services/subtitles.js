/**
 * OpenSubtitles Service
 * 
 * Provides free subtitle searches and converts .srt to browser-native WebVTT (.vtt).
 * Works for both Movies (by IMDb ID) and TV Episodes (by IMDb ID, Season, Episode).
 * Zero API keys required.
 */

const zlib = require('zlib');

const USER_AGENT = 'TemporaryUserAgent';

/**
 * Convert standard SubRip (.srt) text format to WebVTT (.vtt) format for HTML5 <video>
 */
function srtToVtt(srtText) {
    if (!srtText) return 'WEBVTT\n\n';

    let vtt = 'WEBVTT\n\n' + srtText
        // Replace SRT comma millisecond separators with VTT period separators
        // 00:01:20,000 --> 00:01:23,000  =>  00:01:20.000 --> 00:01:23.000
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    return vtt;
}

/**
 * Search available subtitles on OpenSubtitles
 * @param {Object} params
 * @param {string} params.imdbId - e.g. "tt1375666" or "1375666"
 * @param {number|string} [params.season] - Optional season number
 * @param {number|string} [params.episode] - Optional episode number
 * @param {string} [params.lang="eng"] - 3-letter language code (eng, fre, spa, ger, etc.)
 */
async function searchSubtitles({ imdbId, season, episode, lang = 'eng' }) {
    if (!imdbId) return [];

    const cleanImdb = imdbId.replace(/^tt/i, '');
    let endpoint = `https://rest.opensubtitles.org/search/imdbid-${cleanImdb}`;

    if (season !== undefined && episode !== undefined && season !== null && episode !== null) {
        endpoint += `/season-${season}/episode-${episode}`;
    }

    if (lang) {
        endpoint += `/sublanguageid-${lang}`;
    }

    try {
        const response = await fetch(endpoint, {
            headers: { 'User-Agent': USER_AGENT }
        });

        if (!response.ok) return [];

        const data = await response.json();
        if (!Array.isArray(data)) return [];

        return data.slice(0, 10).map(item => ({
            id: item.IDSubtitleFile,
            lang: item.LanguageName || 'English',
            langCode: item.SubLanguageID || 'en',
            fileName: item.SubFileName,
            downloadUrl: item.SubDownloadLink,
            rating: parseFloat(item.SubRating) || 0,
            downloads: parseInt(item.SubDownloadsCnt, 10) || 0
        }));
    } catch (err) {
        console.warn(`[Subtitles] Search failed for ${imdbId}:`, err.message);
        return [];
    }
}

/**
 * Download a subtitle .gz from OpenSubtitles and return WebVTT text
 */
async function fetchVttContent(downloadUrl) {
    if (!downloadUrl) return null;

    try {
        const response = await fetch(downloadUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });

        if (!response.ok) return null;

        const buffer = await response.arrayBuffer();
        const decompressed = zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8');

        return srtToVtt(decompressed);
    } catch (err) {
        console.error('[Subtitles] Failed to download/decompress subtitle:', err.message);
        return null;
    }
}

module.exports = {
    searchSubtitles,
    fetchVttContent,
    srtToVtt
};

