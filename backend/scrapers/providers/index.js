const yts = require('./yts');
const thepiratebay = require('./thepiratebay');
const limetorrents = require('./limetorrents');
const eztv = require('./eztv');
const x1337 = require('./1337x');
const torrentgalaxy = require('./torrentgalaxy');

/**
 * Clean & Ultra-Fast Active Providers
 * 1. YTS: Sub-second JSON hits (HD/4K encodes)
 * 2. ThePirateBay: Sub-second apibay.org hits (massive library, 1000+ seeds)
 * 3. 1337x: Highest quality x265/HEVC encodes, high seeds
 * 4. TorrentGalaxy: Fast TV episodes & direct magnet table rows
 * 5. EZTV: TV Show JSON API by IMDb ID
 * 6. LimeTorrents: Clean Cheerio hits (verified releases, fast)
 */
const providers = [
    yts,
    thepiratebay,
    x1337,
    torrentgalaxy,
    eztv,
    limetorrents
];

module.exports = {
    providers,
    eztv,
    x1337,
    torrentgalaxy,
    limetorrents,
    thepiratebay,
    yts,
    getProvider: (name) => providers.find(p => p.name === name)
};
