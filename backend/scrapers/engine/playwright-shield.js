/**
 * Playwright Resource Shield
 * 1. Blocks heavy media, images, stylesheets, fonts, and known ad scripts at the network level.
 * 2. Immediately intercepts and closes any secondary popup tabs or ad redirects.
 */

const BLOCKED_RESOURCE_TYPES = new Set([
    'image',
    'media',
    'font',
    'stylesheet'
]);

const BLOCKED_DOMAINS = [
    'popads',
    'adcash',
    'doubleclick',
    'google-analytics',
    'adservice',
    'adnxs',
    'exoclick',
    'trafficjunky',
    'onclick',
    'betting',
    'casino'
];

/**
 * Configure page-level request abortion for fast, lightweight loading
 */
const applyResourceShield = async (page) => {
    await page.route('**/*', (route) => {
        try {
            const req = route.request();
            const resourceType = req.resourceType();
            const url = req.url().toLowerCase();

            // NEVER block the main document
            if (resourceType === 'document') {
                return route.continue().catch(() => {});
            }

            // 1. Drop heavy non-text resources instantly
            if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
                return route.abort().catch(() => {});
            }

            // 2. Drop known ad / tracking domains
            for (const adDomain of BLOCKED_DOMAINS) {
                if (url.includes(adDomain)) {
                    return route.abort().catch(() => {});
                }
            }

            return route.continue().catch(() => {});
        } catch {
            // Ignore route abortion race conditions safely
        }
    });
};

/**
 * Configure context-level anti-popup listeners
 * Auto-closes any popup tab while protecting the main scraping tab
 */
const applyPopupShield = (browserContext) => {
    browserContext.on('page', async (popup) => {
        try {
            const pages = browserContext.pages();
            // If there's more than 1 page open in this context, the new one is an ad popup!
            if (pages.length > 1 && popup !== pages[0]) {
                await popup.close().catch(() => {});
                console.log('[Playwright Shield] Terminated ad popup window.');
            }
        } catch {
            // Transient popup already closed
        }
    });
};

module.exports = {
    applyResourceShield,
    applyPopupShield
};
