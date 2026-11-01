const yts = require('./yts');
const thepiratebay = require('./thepiratebay');
const limetorrents = require('./limetorrents');

/**
 * Clean & Ultra-Fast Active Providers
 * 1. YTS: Sub-second JSON hits (HD/4K encodes)
 * 2. ThePirateBay: Sub-second apibay.org hits (massive library, 1000+ seeds)
 * 3. LimeTorrents: Clean Cheerio hits (verified releases, fast)
 */
const providers = [
    yts,
    thepiratebay,
    limetorrents
];

module.exports = {
    providers,
    getProvider: (name) => providers.find(p => p.name === name)
};
