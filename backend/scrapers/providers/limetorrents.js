const axios = require('axios');
const cheerio = require('cheerio');
const { applyResourceShield } = require('../engine/playwright-shield');

const BASE_URL = 'https://limetorrents.lol';

/**
 * Extract listing items from LimeTorrents HTML
 */
const parseListing = ($) => {
    const list = [];
    $('table.table2 tr').each((_, row) => {
        const titleLink = $(row).find('.tt-name a:nth-child(2)');
        const title = titleLink.text().trim();
        const href = titleLink.attr('href');
        const size = $(row).find('td.tdnormal').eq(1).text().trim() || 'Unknown';
        const seeds = parseInt($(row).find('td.tdseed').text().replace(/,/g, '').trim(), 10) || 0;
        const leeches = parseInt($(row).find('td.tdleech').text().replace(/,/g, '').trim(), 10) || 0;

        if (title && href) {
            list.push({
                title,
                url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
                size,
                seeders: seeds,
                leechers: leeches
            });
        }
    });
    return list;
};

// 1. Cheerio Fast Path: Fetches search listing and detail pages for magnets
const searchCheerio = async (query, category = 'movies') => {
    try {
        const cat = category.toLowerCase() === 'tv' ? 'tv' : 'movies';
        const searchUrl = `${BASE_URL}/search/${cat}/${encodeURIComponent(query)}/seeds/1/`;
        const response = await axios.get(searchUrl, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const candidates = parseListing($).slice(0, 3); // Top 3 seeded results
        if (candidates.length === 0) return null;

        const streams = [];
        for (const item of candidates) {
            try {
                const detailRes = await axios.get(item.url, {
                    timeout: 4000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                const $detail = cheerio.load(detailRes.data);
                const magnet = $detail('a[href^="magnet:?"]').attr('href');
                if (magnet) {
                    streams.push({
                        title: item.title,
                        magnet,
                        size: item.size,
                        seeders: item.seeders,
                        leechers: item.leechers,
                        provider: 'limetorrents'
                    });
                }
            } catch {
                // Ignore individual detail page timeout
            }
        }

        return streams.length > 0 ? streams : null;
    } catch {
        return null;
    }
};

// 2. Playwright Fallback: Opens page with browser if Cheerio blocked or details fail
const searchPlaywright = async (context, query) => {
    let page = null;
    try {
        page = await context.newPage();
        await applyResourceShield(page);

        const searchUrl = `${BASE_URL}/search/movies/${encodeURIComponent(query)}/seeds/1/`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        const html = await page.content();
        const $ = cheerio.load(html);
        const candidates = parseListing($).slice(0, 3);

        const streams = [];
        for (const item of candidates) {
            try {
                await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
                const magnet = await page.$eval('a[href^="magnet:?"]', el => el.getAttribute('href')).catch(() => null);
                if (magnet) {
                    streams.push({
                        title: item.title,
                        magnet,
                        size: item.size,
                        seeders: item.seeders,
                        leechers: item.leechers,
                        provider: 'limetorrents'
                    });
                }
            } catch {
                // skip
            }
        }

        return streams;
    } catch (err) {
        console.error('[LimeTorrents Playwright] Error:', err.message);
        return [];
    } finally {
        if (page && !page.isClosed()) {
            await page.close().catch(() => {});
        }
    }
};

module.exports = {
    name: 'limetorrents',
    searchCheerio,
    searchPlaywright
};
