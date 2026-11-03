const axios = require('axios');
const cheerio = require('cheerio');
const { getHealthyMirror } = require('../engine/mirror-manager');
const { applyResourceShield } = require('../engine/playwright-shield');

const parse1337xList = ($, rows, mirror) => {
    const list = [];
    rows.each((_, row) => {
        const titleLink = $(row).find('td.coll-1 a:nth-child(2)');
        const title = titleLink.text().trim();
        const href = titleLink.attr('href');

        const seeds = parseInt($(row).find('td.coll-2').text().trim(), 10) || 0;
        const leeches = parseInt($(row).find('td.coll-3').text().trim(), 10) || 0;
        const size = $(row).find('td.coll-4').contents().first().text().trim() || 'Unknown';

        if (title && href) {
            list.push({
                title,
                url: href.startsWith('http') ? href : `${mirror}${href}`,
                seeders: seeds,
                leechers: leeches,
                size
            });
        }
    });
    return list;
};

// 1. Cheerio Fast Path
const searchCheerio = async (query, category = 'Movies') => {
    try {
        const mirror = await getHealthyMirror('1337x') || 'https://1337x.to';
        const searchUrl = `${mirror}/category-search/${encodeURIComponent(query)}/${category}/1/`;

        const response = await axios.get(searchUrl, {
            timeout: 4000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.data.includes('Just a moment...') || response.data.includes('cf-browser-verification')) {
            return null; // Trigger Playwright
        }

        const $ = cheerio.load(response.data);
        const rows = $('table.table-list tbody tr');
        if (rows.length === 0) return null;

        return parse1337xList($, rows, mirror);
    } catch {
        return null;
    }
};

// 2. Playwright Heavy Path: Waits for Turnstile/Challenge to clear
const searchPlaywright = async (context, query, category = 'Movies') => {
    let page = null;
    try {
        page = await context.newPage();
        await applyResourceShield(page);

        const mirror = await getHealthyMirror('1337x') || 'https://1337x.to';
        const searchUrl = `${mirror}/category-search/${encodeURIComponent(query)}/${category}/1/`;

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

        // Wait up to 10s for Cloudflare Turnstile token or results table
        await page.waitForFunction(() => {
            return document.querySelector('table.table-list') || document.title.includes('1337x');
        }, { timeout: 10000 }).catch(() => null);

        const html = await page.content();
        const $ = cheerio.load(html);
        const rows = $('table.table-list tbody tr');

        const results = parse1337xList($, rows, mirror).slice(0, 3);
        const streams = [];

        for (const item of results) {
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
                        provider: '1337x'
                    });
                }
            } catch {
                // skip
            }
        }

        return streams;
    } catch (err) {
        console.error('[1337x Playwright] Error:', err.message);
        return [];
    } finally {
        if (page && !page.isClosed()) {
            await page.close().catch(() => {});
        }
    }
};

module.exports = {
    name: '1337x',
    searchCheerio,
    searchPlaywright
};
