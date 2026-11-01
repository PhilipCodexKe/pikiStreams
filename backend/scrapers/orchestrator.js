const { chromium } = require('playwright');
const { providers } = require('./providers');
const { normalizeAndDeduplicate } = require('./engine/normalizer');
const { applyPopupShield } = require('./engine/playwright-shield');
const { getStreamsForMovie, saveStreams } = require('../database/supabase');

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
const searchMovieStreams = async (title, year = null, forceRefresh = false) => {
    const cleanTitle = title.trim();
    console.log(`[Orchestrator] Searching streams for: "${cleanTitle}" (${year || 'any year'})`);

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
    const providersNeedingPlaywright = [];

    // 2. Fast Path: Run Cheerio across all providers in parallel
    const cheerioPromises = providers.map(async (provider) => {
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

    // 3. Smart Cutoff:
    // If Cheerio already returned 3 or more streams, skip heavy Playwright browser
    const shouldSkipPlaywright = allFoundStreams.length >= 3;

    if (shouldSkipPlaywright) {
        console.log(`[Orchestrator] Cheerio fast path yielded ${allFoundStreams.length} streams. Skipping slow Playwright fallback!`);
    } else if (providersNeedingPlaywright.length > 0) {
        console.log(`[Orchestrator] Cheerio streams low (${allFoundStreams.length}). Running Playwright fallback for: ${providersNeedingPlaywright.map(p => p.name).join(', ')}`);
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

    // 4. Normalize, deduplicate by infoHash, and rank by seeders
    const normalizedStreams = normalizeAndDeduplicate(allFoundStreams);
    console.log(`[Orchestrator] Total unique streams after normalization: ${normalizedStreams.length}`);

    // 5. Persist directly into Supabase
    if (normalizedStreams.length > 0) {
        try {
            await saveStreams(cleanTitle, year, normalizedStreams);
            console.log(`[Orchestrator] Successfully saved ${normalizedStreams.length} streams to Supabase.`);
        } catch (dbErr) {
            console.error('[Orchestrator] Error saving streams to Supabase:', dbErr.message);
        }
    }

    return normalizedStreams;
};

module.exports = {
    searchMovieStreams
};
