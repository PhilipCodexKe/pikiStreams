const axios = require('axios');
const cheerio = require('cheerio');
const { getHealthyMirror } = require('../engine/mirror-manager');
const { applyResourceShield } = require('../engine/playwright-shield');

const TRACKERS = [
    'udp://tracker.coppersurfer.tk:6969/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
    'udp://tracker.opentrackr.org:1337',
    'udp://tracker.leechers-paradise.org:6969/announce',
    'udp://9.rarbg.to:2710/announce',
    'udp://9.rarbg.me:2780/announce',
    'udp://p4p.arenabg.com:1337'
];

const buildMagnet = (hash, name) => {
    const dn = encodeURIComponent(name);
    const tr = TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    return `magnet:?xt=urn:btih:${hash}&dn=${dn}${tr}`;
};

const formatBytes = (bytes) => {
    const num = parseInt(bytes, 10);
    if (!num || isNaN(num)) return 'Unknown';
    if (num > 1024 * 1024 * 1024) {
        return (num / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
    return (num / (1024 * 1024)).toFixed(0) + ' MB';
};

// 1. Cheerio Fast Path: Direct apibay.org endpoint (Official PirateBay API)
const searchCheerio = async (query) => {
    try {
        const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=200`;
        const response = await axios.get(url, {
            timeout: 4000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const data = response.data;
        if (!Array.isArray(data) || data.length === 0 || data[0].name === 'No results returned') {
            return null;
        }

        return data.slice(0, 15).map(item => ({
            title: item.name,
            infoHash: item.info_hash.toLowerCase(),
            magnet: buildMagnet(item.info_hash, item.name),
            size: formatBytes(item.size),
            seeders: parseInt(item.seeders, 10) || 0,
            leechers: parseInt(item.leechers, 10) || 0,
            provider: 'thepiratebay'
        }));
    } catch {
        return null;
    }
};

// 2. Playwright Heavy Path: Scrapes TPB HTML mirrors if API is down
const searchPlaywright = async (context, query) => {
    let page = null;
    try {
        page = await context.newPage();
        await applyResourceShield(page);

        const mirror = await getHealthyMirror('thepiratebay') || 'https://tpb.party';
        const searchUrl = `${mirror}/search/${encodeURIComponent(query)}/1/99/200`;

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForSelector('.detLink, .detName a', { timeout: 6000 }).catch(() => null);

        const html = await page.content();
        const $ = cheerio.load(html);
        const rows = $('#searchResult tr:has(.detLink), #main-content tr:has(.detName)');

        const streams = [];
        rows.each((_, row) => {
            const title = $(row).find('.detLink, .detName a').text().trim();
            const magnet = $(row).find('a[href^="magnet:?"]').attr('href');
            if (title && magnet) {
                const desc = $(row).find('.detDesc').text() || '';
                const sizeMatch = desc.match(/Size\s+([\d.]+\s*(?:GiB|MiB|GB|MB))/i);
                const size = sizeMatch ? sizeMatch[1].replace('GiB', 'GB').replace('MiB', 'MB') : 'Unknown';
                const tds = $(row).find('td[align="right"]');
                streams.push({
                    title,
                    magnet,
                    size,
                    seeders: parseInt(tds.eq(0).text().trim(), 10) || 0,
                    leechers: parseInt(tds.eq(1).text().trim(), 10) || 0,
                    provider: 'thepiratebay'
                });
            }
        });

        return streams;
    } catch (err) {
        console.error('[TPB Playwright] Error:', err.message);
        return [];
    } finally {
        if (page && !page.isClosed()) {
            await page.close().catch(() => {});
        }
    }
};

module.exports = {
    name: 'thepiratebay',
    searchCheerio,
    searchPlaywright
};
