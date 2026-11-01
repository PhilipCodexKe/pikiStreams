/**
 * Global Crawlee Configuration
 * Disables disk log dumping, debug key-value dumps, and keeps execution clean.
 */
const { Configuration } = require('crawlee');

const initCrawleeConfig = () => {
    const config = Configuration.getGlobalConfig();
    
    // Disable dumping request queues, key-value stores, and datasets to disk storage folder
    config.set('persistStorage', false);
    
    // Set logging level to ERROR to prevent console flooding
    config.set('logLevel', 'ERROR');

    return config;
};

module.exports = { initCrawleeConfig };

