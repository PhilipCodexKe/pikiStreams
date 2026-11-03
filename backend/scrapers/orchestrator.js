const { chromium } = require('playwright');
const axios = require('axios');
const { providers, eztv, x1337, torrentgalaxy, limetorrents } = require('./providers');
const { normalizeAndDeduplicate } = require('./engine/normalizer');
const { applyPopupShield } = require('./engine/playwright-shield');
const { 
    getStreamsForMovie, 
    saveStreams, 
    getTvStreamsFromDb, 
    saveTvStreamsToDb 
} = require('../database/supabase');

// Shared Playwright browser instance for on-demand fallbacks
let browserInstance = null;

const getBrowser = async () => {
    if (!browserInstance) {
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });
    }
    return browserInstance;
};

/**
 * Main On-Demand Search Orchestrator
 * 1. Checks Supabase for existing saved streams.
 * 2. Fires Cheerio fast path across all providers simultaneously.
 * 3. Smart Cutoff: If Cheerio already found 3+ streams, skips slow Playwright fallback.
 * 4. Only triggers Playwright if Cheerio yielded insufficient streams.
 * 5. Normalizes, deduplicates by infoHash, saves to Supabase, and returns.
 */
const searchMovieStreams = async (title, year = null, forceRefresh = false, tmdbId = null) => {
    const cleanTitle = title.trim();
    console.log(`[Orchestrator] Searching streams for: "${cleanTitle}" (${year || 'any year'})${tmdbId ? ` [TMDB ID: ${tmdbId}]` : ''}`);

    // 1. Check database first (instant 0ms response)
    if (!forceRefresh) {
        const cachedStreams = await getStreamsForMovie(cleanTitle, year);
        if (cachedStreams && cachedStreams.length > 0) {
            console.log(`[Orchestrator] Cache HIT in Supabase: Found ${cachedStreams.length} streams for "${cleanTitle}".`);
            return cachedStreams;
        }
        console.log(`[Orchestrator] Cache MISS in Supabase. Initiating live scraper...`);
    }

    const searchQuery = year ? `${cleanTitle} ${year}` : cleanTitle;
    const allFoundStreams = [];

    // 2. Priority Phase: Call YTS API first
    const ytsProvider = providers.find((p) => p.name === 'yts');
    if (ytsProvider && ytsProvider.searchCheerio) {
        try {
            console.log(`[Orchestrator] Calling YTS API first for: "${searchQuery}"`);
            const ytsResults = await ytsProvider.searchCheerio(searchQuery);
            if (ytsResults && Array.isArray(ytsResults) && ytsResults.length > 0) {
                console.log(`[Orchestrator] YTS API found ${ytsResults.length} stream(s) instantly.`);
                allFoundStreams.push(...ytsResults);
            }
        } catch (ytsErr) {
            console.warn('[Orchestrator] YTS primary call failed:', ytsErr.message);
        }
    }

    // 3. Fallback Phase: If YTS didn't return streams (or fewer than 2), query other providers
    if (allFoundStreams.length < 2) {
        console.log(`[Orchestrator] Streams from YTS (${allFoundStreams.length}) insufficient. Triggering fallback scrapers...`);
        const fallbackProviders = providers.filter((p) => p.name !== 'yts');
        const providersNeedingPlaywright = [];

        const cheerioPromises = fallbackProviders.map(async (provider) => {
            try {
                if (provider.searchCheerio) {
                    const results = await provider.searchCheerio(searchQuery);
                    if (results && Array.isArray(results) && results.length > 0) {
                        console.log(`[Orchestrator] Provider [${provider.name}] (Cheerio) returned ${results.length} streams.`);
                        allFoundStreams.push(...results);
                        return;
                    }
                }
                if (provider.searchPlaywright) {
                    providersNeedingPlaywright.push(provider);
                }
            } catch (err) {
                console.warn(`[Orchestrator] Provider [${provider.name}] Cheerio failed:`, err.message);
                if (provider.searchPlaywright) {
                    providersNeedingPlaywright.push(provider);
                }
            }
        });

        await Promise.allSettled(cheerioPromises);

        // Smart Cutoff for heavy Playwright browser
        const shouldSkipPlaywright = allFoundStreams.length >= 3;

        if (shouldSkipPlaywright) {
            console.log(`[Orchestrator] Cheerio fast path yielded ${allFoundStreams.length} streams. Skipping slow Playwright fallback!`);
        } else if (providersNeedingPlaywright.length > 0) {
            console.log(`[Orchestrator] Streams still low (${allFoundStreams.length}). Running Playwright fallback for: ${providersNeedingPlaywright.map(p => p.name).join(', ')}`);
            let context = null;
            try {
                const browser = await getBrowser();
                context = await browser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                });
                applyPopupShield(context);

                for (const provider of providersNeedingPlaywright) {
                    try {
                        const results = await provider.searchPlaywright(context, searchQuery);
                        if (results && results.length > 0) {
                            console.log(`[Orchestrator] Provider [${provider.name}] (Playwright) returned ${results.length} streams.`);
                            allFoundStreams.push(...results);
                        }
                    } catch (pErr) {
                        console.error(`[Orchestrator] Provider [${provider.name}] Playwright error:`, pErr.message);
                    }
                }
            } catch (bErr) {
                console.error('[Orchestrator] Playwright launch error:', bErr.message);
            } finally {
                if (context) await context.close().catch(() => {});
            }
        }
    } else {
        console.log(`[Orchestrator] YTS provided sufficient streams (${allFoundStreams.length}). Skipping all other scrapers!`);
    }

    // 4. Normalize, deduplicate by infoHash, and rank by seeders
    const normalizedStreams = normalizeAndDeduplicate(allFoundStreams);
    console.log(`[Orchestrator] Total unique streams after normalization: ${normalizedStreams.length}`);

    // 5. Persist directly into Supabase
    if (normalizedStreams.length > 0) {
        try {
            await saveStreams(cleanTitle, year, normalizedStreams, tmdbId);
            console.log(`[Orchestrator] Successfully saved ${normalizedStreams.length} streams to Supabase.`);
        } catch (dbErr) {
            console.error('[Orchestrator] Error saving streams to Supabase:', dbErr.message);
        }
    }

    return normalizedStreams;
};

/**
 * TV Show Stream Orchestrator
 * Cascading Order: 1337x -> TorrentGalaxy -> EZTV -> LimeTorrents
 * 1. Checks Supabase tv_streams table cache.
 * 2. Resolves TMDB ID -> IMDb ID.
 * 3. Cascade Phase 1: 1337x (High seeds, small x265 file sizes).
 * 4. Cascade Phase 2: TorrentGalaxy (Fast daily episodes & direct magnets).
 * 5. Cascade Phase 3: EZTV (Instant JSON API).
 * 6. Cascade Phase 4: LimeTorrents (Fallback).
 * 7. Normalizes and caches to Supabase tv_streams table.
 */
const searchTvStreams = async (tmdbId, season, episode = null, title = '', forceRefresh = false, isSeasonPack = false) => {
    const sNum = parseInt(season, 10);
    const eNum = episode !== null && episode !== undefined ? parseInt(episode, 10) : null;
    const isPack = isSeasonPack || eNum === null;
    const episodeTag = isPack ? `S${String(sNum).padStart(2, '0')}` : `S${String(sNum).padStart(2, '0')}E${String(eNum).padStart(2, '0')}`;
    const cleanTitle = (title || 'TV Show').trim();
    const searchIdentifier = `${cleanTitle} ${episodeTag}`;

    console.log(`[TV Orchestrator] Searching TV streams: "${searchIdentifier}" [TMDB: ${tmdbId}, Mode: ${isPack ? 'Season Pack' : 'Episode'}]`);

    // 1. Check tv_streams table first
    if (!forceRefresh && tmdbId) {
        const cached = await getTvStreamsFromDb(tmdbId, sNum, eNum);
        if (cached && cached.length > 0) {
            console.log(`[TV Orchestrator] Cache HIT in Supabase tv_streams: Found ${cached.length} stream(s) for "${searchIdentifier}".`);
            return cached;
        }
    }

    // 2. Resolve IMDb ID from TMDB
    let imdbId = null;
    const tmdbApiKey = process.env.TMDB_API_KEY || 'ab060bf4b27b23c908e05859d2ef7451';

    if (tmdbId) {
        try {
            const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${tmdbApiKey}`, {
                timeout: 5000
            });
            imdbId = tmdbRes.data?.imdb_id;
            if (imdbId) {
                console.log(`[TV Orchestrator] Resolved TMDB ID ${tmdbId} to IMDb ID: ${imdbId}`);
            }
        } catch (tmdbErr) {
            console.warn(`[TV Orchestrator] TMDB external_ids failed:`, tmdbErr.message);
        }
    }

    // Fallback: If no IMDb ID yet, try TVMaze by title
    if (!imdbId && cleanTitle && cleanTitle !== 'TV Show') {
        try {
            const tvmazeRes = await axios.get(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(cleanTitle)}`, {
                timeout: 4000
            });
            imdbId = tvmazeRes.data?.externals?.imdb;
            if (imdbId) {
                console.log(`[TV Orchestrator] TVMaze resolved "${cleanTitle}" to IMDb ID: ${imdbId}`);
            }
        } catch (tvmazeErr) {
            console.warn(`[TV Orchestrator] TVMaze lookup failed for "${cleanTitle}":`, tvmazeErr.message);
        }
    }

    const allFoundStreams = [];
    let browserContext = null;

    const getContext = async () => {
        if (!browserContext) {
            const browser = await getBrowser();
            browserContext = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            });
            applyPopupShield(browserContext);
        }
        return browserContext;
    };

    try {
        // ====================================================================
        // STEP 1: 1337x (Best for x265, smallest sizes & high seeds)
        // ====================================================================
        try {
            const query1337x = isPack ? `${cleanTitle} S${String(sNum).padStart(2, '0')}` : `${cleanTitle} ${episodeTag}`;
            console.log(`[TV Orchestrator] [1/4] Trying 1337x TV for: "${query1337x}"...`);
            
            // Try Cheerio fast path first
            let xResults = await x1337.searchCheerio(query1337x, 'TV');
            if (!xResults) {
                const ctx = await getContext();
                xResults = await x1337.searchPlaywright(ctx, query1337x, 'TV');
            }
            if (xResults && xResults.length > 0) {
                console.log(`[TV Orchestrator] 1337x returned ${xResults.length} TV streams.`);
                allFoundStreams.push(...xResults);
            }
        } catch (err1337) {
            console.warn('[TV Orchestrator] 1337x TV error:', err1337.message);
        }

        // ====================================================================
        // STEP 2: TorrentGalaxy (Fast daily episodes & direct magnet rows)
        // ====================================================================
        if (allFoundStreams.length < 3) {
            try {
                // TGx supports both IMDb ID search or Title
                const queryTGx = imdbId ? `${imdbId} ${episodeTag}` : `${cleanTitle} ${episodeTag}`;
                console.log(`[TV Orchestrator] [2/4] Trying TorrentGalaxy for: "${queryTGx}"...`);

                let tgxResults = await torrentgalaxy.searchCheerio(queryTGx);
                if (!tgxResults || tgxResults.length === 0) {
                    const ctx = await getContext();
                    tgxResults = await torrentgalaxy.searchPlaywright(ctx, queryTGx);
                }
                if (tgxResults && tgxResults.length > 0) {
                    console.log(`[TV Orchestrator] TorrentGalaxy returned ${tgxResults.length} TV streams.`);
                    allFoundStreams.push(...tgxResults);
                }
            } catch (tgxErr) {
                console.warn('[TV Orchestrator] TorrentGalaxy error:', tgxErr.message);
            }
        }

        // ====================================================================
        // STEP 3: EZTV (Direct JSON API via IMDb ID)
        // ====================================================================
        if (allFoundStreams.length < 3 && imdbId && !isPack) {
            try {
                console.log(`[TV Orchestrator] [3/4] Trying EZTV API for IMDb: ${imdbId} (${episodeTag})...`);
                const eztvResults = await eztv.searchTv(imdbId, sNum, eNum);
                if (eztvResults && eztvResults.length > 0) {
                    console.log(`[TV Orchestrator] EZTV returned ${eztvResults.length} TV streams.`);
                    allFoundStreams.push(...eztvResults);
                }
            } catch (eztvErr) {
                console.warn('[TV Orchestrator] EZTV error:', eztvErr.message);
            }
        }

        // ====================================================================
        // STEP 4: LimeTorrents (Fallback)
        // ====================================================================
        if (allFoundStreams.length < 3) {
            try {
                const queryLime = `${cleanTitle} ${episodeTag}`;
                console.log(`[TV Orchestrator] [4/4] Trying LimeTorrents TV for: "${queryLime}"...`);
                const limeResults = await limetorrents.searchCheerio(queryLime, 'tv');
                if (limeResults && limeResults.length > 0) {
                    console.log(`[TV Orchestrator] LimeTorrents returned ${limeResults.length} TV streams.`);
                    allFoundStreams.push(...limeResults);
                }
            } catch (limeErr) {
                console.warn('[TV Orchestrator] LimeTorrents TV error:', limeErr.message);
            }
        }

    } finally {
        if (browserContext) {
            await browserContext.close().catch(() => {});
        }
    }

    // Normalize & Deduplicate
    const normalized = normalizeAndDeduplicate(allFoundStreams);
    console.log(`[TV Orchestrator] Total unique streams after normalization: ${normalized.length}`);

    // Persist to Supabase tv_streams table
    if (normalized.length > 0 && tmdbId) {
        try {
            await saveTvStreamsToDb({
                tmdbId,
                imdbId,
                showTitle: cleanTitle,
                season: sNum,
                episode: eNum,
                isSeasonPack: isPack,
                streamsList: normalized
            });
            console.log(`[TV Orchestrator] Cached ${normalized.length} TV streams to tv_streams table.`);
        } catch (dbErr) {
            console.error('[TV Orchestrator] Error caching to tv_streams table:', dbErr.message);
        }
    }

    return normalized;
};

module.exports = {
    searchMovieStreams,
    searchTvStreams
};
