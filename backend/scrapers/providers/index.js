const yts = require('./yts');
const thepiratebay = require('./thepiratebay');
const limetorrents = require('./limetorrents');
const eztv = require('./eztv');

/**
 * Clean & Ultra-Fast Active Providers
 * 1. YTS: Sub-second JSON hits (HD/4K encodes)
 * 2. ThePirateBay: Sub-second apibay.org hits (massive library, 1000+ seeds)
 * 3. LimeTorrents: Clean Cheerio hits (verified releases, fast)
 * 4. EZTV: TV Show JSON API by IMDb ID
 */
const providers = [
    yts,
    thepiratebay,
    limetorrents,
    eztv
];

module.exports = {
    providers,
    eztv,
    getProvider: (name) => providers.find(p => p.name === name)
};
