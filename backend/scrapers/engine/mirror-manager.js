const axios = require('axios');

/**
 * Mirror Manager
 * Maintains active mirror lists for providers and tests responsiveness
 */
const MIRRORS = {
    thepiratebay: [
        'https://thepiratebay10.org',
        'https://pirateproxy.live',
        'https://tpb.party',
        'https://thepiratebay.zone'
    ],
    yts: [
        'https://yts.mx',
        'https://yts.lt',
        'https://yts.do'
    ],
    '1337x': [
        'https://1337x.to',
        'https://1337x.st',
        'https://x1337x.ws',
        'https://1337x.so'
    ]
};

// Cache for best working mirror per provider
const activeMirrorCache = new Map();

/**
 * Ping a mirror with a fast timeout (2.5 seconds)
 */
const testMirror = async (url) => {
    try {
        const response = await axios.get(url, {
            timeout: 2500,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            validateStatus: (status) => status < 400
        });
        return response.status < 400;
    } catch {
        return false;
    }
};

/**
 * Get the fastest healthy mirror for a provider
 */
const getHealthyMirror = async (providerName) => {
    if (activeMirrorCache.has(providerName)) {
        return activeMirrorCache.get(providerName);
    }

    const mirrorList = MIRRORS[providerName] || [];
    if (mirrorList.length === 0) return null;

    for (const mirror of mirrorList) {
        const isAlive = await testMirror(mirror);
        if (isAlive) {
            activeMirrorCache.set(providerName, mirror);
            return mirror;
        }
    }

    // Default to the first mirror
    return mirrorList[0];
};

const invalidateMirror = (providerName) => {
    activeMirrorCache.delete(providerName);
};

module.exports = {
    MIRRORS,
    getHealthyMirror,
    invalidateMirror
};
