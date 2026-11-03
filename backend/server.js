const express = require('express');
const cors = require('cors');
const { searchMovieStreams, searchTvStreams } = require('./scrapers/orchestrator');
const { getMovieStreams, getTvStreams } = require('./scrapers/torrentio');
const { searchSubtitles, fetchVttContent } = require('./services/subtitles');
const { 
    enqueueBulk, 
    enqueueTvBulk, 
    getStreamsForMovie,
    saveStreams,
    getTvStreamsFromDb,
    saveTvStreamsToDb,
    supabase 
} = require('./database/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// On-demand movie stream route
// Flow: 
// 1. DB Cache Check (0ms)
// 2. Pure Fast HTTP APIs (Torrentio + YTS Official API) running concurrently
// 3. Merge, Deduplicate by infoHash, Filter browser compatibility (x264/AAC)
// 4. Sort Top Seeders First -> Smallest File Size tiebreaker
// 5. Flexible 3-stream selection: [1080p, 720p, 480p] with graceful fallback so slots are never empty
// 6. Save top 3 winners to Supabase & return to frontend
app.get('/api/scrape/:title', async (req, res) => {
    try {
        const { title } = req.params;
        const { year, refresh, tmdb_id, imdb_id } = req.query;

        if (!title) {
            return res.status(400).json({ error: 'Movie title is required' });
        }

        const cleanTitle = title.trim();

        // 1. Check Supabase DB first (unless forced refresh)
        if (refresh !== 'true') {
            const cachedStreams = await getStreamsForMovie(cleanTitle, year);
            if (cachedStreams && cachedStreams.length > 0) {
                console.log(`[API /scrape] Cache HIT in Supabase: ${cachedStreams.length} streams for "${cleanTitle}".`);
                return res.json({ success: true, count: cachedStreams.length, data: cachedStreams });
            }
        }

        console.log(`[API /scrape] Fetching movie streams via fast HTTP APIs (Torrentio + YTS) for "${cleanTitle}"...`);
        const allCandidates = [];

        // 2A. Query Torrentio HTTP API (all providers aggregated)
        const torrentioPromise = (async () => {
            try {
                const streams = await getMovieStreams({
                    imdbId: imdb_id || null,
                    tmdbId: tmdb_id || null,
                    filterOptimal: false // return full candidate pool
                });
                if (streams && streams.length > 0) {
                    console.log(`[API /scrape] Torrentio returned ${streams.length} candidate streams.`);
                    allCandidates.push(...streams);
                }
            } catch (err) {
                console.warn(`[API /scrape] Torrentio error: ${err.message}`);
            }
        })();

        // 2B. Query YTS official fast JSON API
        const ytsPromise = (async () => {
            try {
                const ytsProvider = require('./scrapers/providers/yts');
                const searchQuery = year ? `${cleanTitle} ${year}` : cleanTitle;
                const ytsStreams = await ytsProvider.searchCheerio(searchQuery);
                if (ytsStreams && ytsStreams.length > 0) {
                    console.log(`[API /scrape] YTS API returned ${ytsStreams.length} direct streams.`);
                    allCandidates.push(...ytsStreams);
                }
            } catch (err) {
                console.warn(`[API /scrape] YTS API error: ${err.message}`);
            }
        })();

        await Promise.allSettled([torrentioPromise, ytsPromise]);

        // 3. Deduplicate across YTS and Torrentio by infoHash (preserve YTS direct torrentUrl if present)
        const uniqueMap = new Map();
        for (const item of allCandidates) {
            if (!item.infoHash) continue;
            const hash = item.infoHash.toLowerCase();
            if (!uniqueMap.has(hash)) {
                uniqueMap.set(hash, item);
            } else {
                const existing = uniqueMap.get(hash);
                // Keep the higher seed count and keep direct torrentUrl if available
                if ((item.seeders || 0) > (existing.seeders || 0)) {
                    existing.seeders = item.seeders;
                }
                if (item.torrentUrl && !existing.torrentUrl) {
                    existing.torrentUrl = item.torrentUrl;
                }
            }
        }
        const deduplicated = Array.from(uniqueMap.values());

        // 4. Run Selector: Top seeds first, smallest size, browser-playable, flexible 3 resolutions
        const { selectOptimalStreams } = require('./scrapers/torrentio/selector');
        let selectedStreams = selectOptimalStreams(deduplicated, { minSeeders: 5 });

        // If strict filter yielded fewer than 3, fill with next best healthy streams
        if (selectedStreams.length < 3 && deduplicated.length > 0) {
            const usedHashes = new Set(selectedStreams.map(s => s.infoHash));
            const fillPool = deduplicated
                .filter(s => !usedHashes.has(s.infoHash) && (s.seeders || 0) >= 2)
                .sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

            for (const item of fillPool) {
                selectedStreams.push(item);
                if (selectedStreams.length >= 3) break;
            }
        }

        if (selectedStreams.length > 0) {
            console.log(`[API /scrape] Matched ${selectedStreams.length} winning movie streams. Saving to DB:`);
            selectedStreams.forEach((s, idx) => {
                console.log(`   [${idx + 1}] (${s.quality}) ${s.size} | ${s.seeders} seeds | ${s.provider}`);
            });

            await saveStreams(cleanTitle, selectedStreams, year);
            return res.json({ success: true, count: selectedStreams.length, data: selectedStreams });
        }

        console.log(`[API /scrape] No streams found from Torrentio or YTS.`);
        res.json({ success: true, count: 0, data: [] });
    } catch (error) {
        console.error('Movie Scraping error:', error);
        res.status(500).json({ error: 'Failed to scrape streams', details: error.message });
    }
});

// On-demand TV show episode / season pack stream route
// Flow: 
// 1. Check DB Cache
// 2. Query ALL Providers simultaneously (Torrentio + EZTV + TorrentGalaxy + LimeTorrents)
// 3. Match, filter browser compatibility (x264/AAC), and select the True Top 3 by seeders & size
// 4. Save optimal streams to DB and return to client
app.get('/api/scrape/tv/:tmdbId', async (req, res) => {
    try {
        const { tmdbId } = req.params;
        const { season = 1, episode, title = '', refresh, is_pack, imdb_id } = req.query;

        if (!tmdbId) {
            return res.status(400).json({ error: 'TMDB Show ID is required' });
        }

        const isPack = is_pack === 'true' || episode === undefined || episode === null;
        const parsedEpisode = isPack ? null : parseInt(episode, 10);
        const parsedSeason = parseInt(season, 10);

        // 1. Check Supabase DB first (unless forced refresh)
        if (refresh !== 'true') {
            const cachedTvStreams = await getTvStreamsFromDb(tmdbId, parsedSeason, parsedEpisode);
            if (cachedTvStreams && cachedTvStreams.length > 0) {
                console.log(`[API /scrape/tv] Cache HIT in Supabase: ${cachedTvStreams.length} streams for TMDB ${tmdbId} S${parsedSeason}E${parsedEpisode || 'Pack'}.`);
                return res.json({ success: true, count: cachedTvStreams.length, data: cachedTvStreams });
            }
        }

        console.log(`[API /scrape/tv] Aggregating TV streams across ALL providers for TMDB ${tmdbId} S${parsedSeason}E${parsedEpisode || 'Pack'} ("${title}")...`);
        const allCandidates = [];

        // 2A. Query Torrentio (unfiltered pool of up to 100 streams from 1337x, TGx, TPB, etc.)
        const torrentioPromise = (async () => {
            try {
                const streams = await getTvStreams({
                    imdbId: imdb_id || null,
                    tmdbId: tmdbId,
                    season: parsedSeason,
                    episode: parsedEpisode || 1,
                    filterOptimal: false // return full candidate pool
                });
                if (streams && streams.length > 0) {
                    console.log(`[API /scrape/tv] Torrentio returned ${streams.length} candidate streams.`);
                    allCandidates.push(...streams);
                }
            } catch (err) {
                console.warn(`[API /scrape/tv] Torrentio query error: ${err.message}`);
            }
        })();

        // 2B. Query other providers via Cheerio fast paths
        const fallbackCheerioPromise = (async () => {
            try {
                const { eztv, torrentgalaxy, limetorrents } = require('./scrapers/providers');
                const epTag = parsedEpisode ? `S${String(parsedSeason).padStart(2, '0')}E${String(parsedEpisode).padStart(2, '0')}` : `S${String(parsedSeason).padStart(2, '0')}`;
                const query = `${title} ${epTag}`.trim();

                const [tgxRes, eztvRes, limeRes] = await Promise.allSettled([
                    torrentgalaxy.searchCheerio ? torrentgalaxy.searchCheerio(query) : Promise.resolve([]),
                    eztv.searchCheerio ? eztv.searchCheerio(query) : Promise.resolve([]),
                    limetorrents.searchCheerio ? limetorrents.searchCheerio(query) : Promise.resolve([])
                ]);

                if (tgxRes.status === 'fulfilled' && tgxRes.value) allCandidates.push(...tgxRes.value);
                if (eztvRes.status === 'fulfilled' && eztvRes.value) allCandidates.push(...eztvRes.value);
                if (limeRes.status === 'fulfilled' && limeRes.value) allCandidates.push(...limeRes.value);
            } catch (err) {
                console.warn(`[API /scrape/tv] Cheerio providers query error: ${err.message}`);
            }
        })();

        await Promise.allSettled([torrentioPromise, fallbackCheerioPromise]);

        // 3. Run Optimal Selector across all aggregated candidates:
        // - Filters out 4K and unplayable DTS audio
        // - Boosts x264/AAC for 100% browser compatibility
        // - Prioritizes top seeders, then smallest size
        // - Returns exactly 3 streams [1080p, 720p, 480p]
        const { selectOptimalStreams } = require('./scrapers/torrentio/selector');
        let selectedStreams = selectOptimalStreams(allCandidates, { minSeeders: 5 });

        // If strict filter yielded nothing, fallback to top 3 by seeders
        if (selectedStreams.length === 0 && allCandidates.length > 0) {
            console.log(`[API /scrape/tv] Relaxing filters to pick top seeded streams from pool...`);
            selectedStreams = allCandidates
                .filter(s => (s.seeders || 0) >= 2)
                .sort((a, b) => (b.seeders || 0) - (a.seeders || 0))
                .slice(0, 3);
        }

        if (selectedStreams.length > 0) {
            console.log(`[API /scrape/tv] Matched ${selectedStreams.length} winning streams across all providers. Saving to DB:`);
            selectedStreams.forEach((s, idx) => {
                console.log(`   [${idx + 1}] (${s.quality}) ${s.size} | ${s.seeders} seeds | ${s.provider}`);
            });

            await saveTvStreamsToDb({
                tmdbId,
                imdbId: imdb_id || null,
                showTitle: title,
                season: parsedSeason,
                episode: parsedEpisode,
                isSeasonPack: isPack,
                streamsList: selectedStreams
            });

            return res.json({ success: true, count: selectedStreams.length, data: selectedStreams });
        }

        // 4. Ultimate Fallback: if zero streams found across everything, run orchestrator Playwright waterfall
        console.log(`[API /scrape/tv] No streams found from fast providers. Triggering Playwright fallback...`);
        const fallbackStreams = await searchTvStreams(
            tmdbId, 
            parsedSeason, 
            parsedEpisode, 
            title, 
            refresh === 'true',
            isPack
        );
        res.json({ success: true, count: fallbackStreams.length, data: fallbackStreams });
    } catch (error) {
        console.error('TV Scraping error:', error);
        res.status(500).json({ error: 'Failed to scrape TV streams', details: error.message });
    }
});

// Bulk TV Shows queue route
app.post('/api/bulk/tv/enqueue', async (req, res) => {
    try {
        const { shows } = req.body;
        if (!shows || !Array.isArray(shows) || shows.length === 0) {
            return res.status(400).json({ error: 'Array of shows required ({ shows: [...] })' });
        }

        const enqueued = await enqueueTvBulk(shows);
        res.json({ success: true, count: enqueued.length, data: enqueued });
    } catch (error) {
        console.error('Bulk TV enqueue error:', error);
        res.status(500).json({ error: 'Failed to enqueue bulk TV shows', details: error.message });
    }
});

// ============================================================================
// SUBTITLES API (OpenSubtitles WebVTT)
// ============================================================================

// List available subtitles for movie or TV episode
app.get('/api/subtitles', async (req, res) => {
    try {
        const { imdb_id, season, episode, lang = 'eng' } = req.query;
        if (!imdb_id) {
            return res.status(400).json({ error: 'imdb_id is required' });
        }

        const subtitles = await searchSubtitles({
            imdbId: imdb_id,
            season: season ? parseInt(season, 10) : undefined,
            episode: episode ? parseInt(episode, 10) : undefined,
            lang
        });

        res.json({ success: true, count: subtitles.length, data: subtitles });
    } catch (err) {
        console.error('[API /subtitles] Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch subtitles', details: err.message });
    }
});

// Serve actual WebVTT file for browser <track> element
app.get('/api/subtitles/vtt', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).send('Subtitle download url is required');
        }

        const vttContent = await fetchVttContent(url);
        if (!vttContent) {
            return res.status(404).send('Subtitle not found or decompression failed');
        }

        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(vttContent);
    } catch (err) {
        console.error('[API /subtitles/vtt] Error:', err.message);
        res.status(500).send('Error rendering subtitle');
    }
});

app.listen(PORT, () => {
    console.log(`PikiStreams Backend running on http://localhost:${PORT}`);
});
