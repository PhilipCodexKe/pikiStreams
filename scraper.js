const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const humanType = async (page, selector, text) => {
    await page.waitForSelector(selector);
    await page.click(selector);
    for (const char of text) {
        await page.keyboard.type(char, { delay: Math.random() * 100 + 50 });
    }
};

const parseDetails = (rawTitle) => {
    // Extract Size (e.g., 1.4GB, 700MB)
    const sizeMatch = rawTitle.match(/(\d+(?:\.\d+)?\s*[GM]B)/i);
    const size = sizeMatch ? sizeMatch[1].toUpperCase().replace(/\s+/g, '') : 'Unknown';

    // Extract Quality (e.g., 1080p, 720p, 2160p, 4k)
    const qualityMatch = rawTitle.match(/(2160p|1080p|720p|480p|4k|CAM|HDR|BluRay|BRRip|WEBRip)/i);
    const quality = qualityMatch ? qualityMatch[1] : 'Unknown';

    // Clean Title
    let cleanTitle = rawTitle
        .replace(/\./g, ' ')
        .replace(/(\d{4}).*/, '$1')
        .replace(/\(.*\)/, '')
        .replace(/\[.*\]/, '')
        .trim();
    
    if (cleanTitle.length < 2) {
        cleanTitle = rawTitle.split(/[\(\[\d]/)[0].trim();
    }

    return { cleanTitle, size, quality };
};

const scrapePirateBay = async (browser, searchTerm, domain) => {
    let page;
    let currentStep = 'INITIALIZING'; // Track current step for robust recovery

    try {
        page = await browser.newPage();
        await page.setDefaultNavigationTimeout(30000);
        
        console.log(`Navigating to: ${domain}`);

        // Enable request interception to block visual resources (ads/images)
        // ... (omitted for brevity, keeping existing logic)

        // Robust Popup Handling
        browser.on('targetcreated', async (target) => {
            try {
                if (target.type() === 'page') {
                    const newPage = await target.page();
                    const pages = await browser.pages();
                    // If it's not the initial blank page or our main scraping page, close it.
                    // We assume the main page is index 1 (after initial blank).
                    if (pages.length > 2) {
                        console.log(`Popup detected during step: ${currentStep}. Closing it...`);
                        await newPage.close();
                        console.log('Popup closed successfully.');
                        
                        // Refocus the main page to ensure scraping continues
                        const mainPage = pages[1]; 
                        if (mainPage && !mainPage.isClosed()) {
                            console.log('Refocusing main page...');
                            await mainPage.bringToFront();
                            
                            // Conditional Recovery based on Step
                            if (currentStep === 'TYPING' || currentStep === 'SEARCH_SUBMITTED') {
                                // User liked this logic: Retry search by pressing Enter again
                                try {
                                    console.log('Attempting to press Enter on main page to resume search...');
                                    await new Promise(r => setTimeout(r, 500)); // Small delay
                                    await mainPage.keyboard.press('Enter');
                                    console.log('Successfully pressed Enter on main page.');
                                } catch (err) {
                                    console.log('Failed to press Enter on main page:', err.message);
                                }
                            } else {
                                console.log(`Resuming ${currentStep} (no special recovery action needed other than focus).`);
                            }
                        }
                    }
                }
            } catch (e) {
                // Ignore errors during closure (target might be gone already)
            }
        });

        // Deny all downloads to prevent file explorer prompts
        try {
            const client = await page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', { behavior: 'deny' });
        } catch (e) {
            console.error('Failed to set download behavior:', e);
        }

        // Aggressive Resource Blocking (Images, Fonts, Media, Executables)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            const url = req.url().toLowerCase();
            
            // Block visual/heavy elements AND executables/archives
            if (['image', 'media', 'font', 'stylesheet'].includes(resourceType) || 
                url.match(/\.(exe|zip|rar|msi|apk|dmg|iso|bin)$/)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        currentStep = 'NAVIGATING';
        await page.goto(domain, { waitUntil: 'domcontentloaded' });
        
        // Human-like interaction
        const searchInputSelector = 'input[name="q"], #q, input[type="search"]';
        await page.waitForSelector(searchInputSelector);

        // Check 'Video' filter as requested
        currentStep = 'FILTERING';
        const videoCheckboxSelector = '#video';
        try {
            // ... existing filter logic ...
            await page.waitForSelector(videoCheckboxSelector, { timeout: 5000 });
            const isChecked = await page.$eval(videoCheckboxSelector, el => el.checked);
            if (!isChecked) {
                await page.click(videoCheckboxSelector);
                console.log('Checked "Video" filter.');
            } else {
                console.log('"Video" filter already checked.');
            }
        } catch (e) {
            console.log('Could not find or check "Video" filter:', e.message);
        }
        
        currentStep = 'TYPING';
        console.log(`Typing search term: ${searchTerm}`);
        await humanType(page, searchInputSelector, searchTerm);
        
        // Press Enter to search
        currentStep = 'SEARCH_SUBMITTED';
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        
        // Wait for results table
        currentStep = 'WAITING_RESULTS';
        await page.waitForSelector('tr .detName', { timeout: 60000 });
        
        const results = await page.evaluate(() => {
            // Select all rows that have a .detName class (which contains the title)
            // We look for tr elements that contain .detName
            const rows = Array.from(document.querySelectorAll('tr')).filter(row => row.querySelector('.detName'));
            
            return rows.slice(0, 10).map(row => {
                const titleElement = row.querySelector('.detName a');
                const magnetElement = row.querySelector('a[href^="magnet:"]');
                // Based on snippet: 1st td=cat, 2nd=details, 3rd=seeders, 4th=leechers
                const seedElement = row.querySelector('td:nth-child(3)');
                const descElement = row.querySelector('.detDesc');
                
                if (!titleElement || !magnetElement) return null;
                
                const rawTitle = titleElement.textContent.trim();
                const link = magnetElement.href;
                const seeders = seedElement ? parseInt(seedElement.textContent) || 0 : 0;
                
                // Extract size from description
                let size = 'Unknown';
                if (descElement) {
                    const sizeMatch = descElement.textContent.match(/Size\s+(\d+(?:\.\d+)?\s*[GM]i?B)/i);
                    if (sizeMatch) {
                        size = sizeMatch[1].replace('i', '').toUpperCase();
                    }
                }
                
                return { rawTitle, link, seeders, size };
            }).filter(Boolean);
        });
        
        return results.map(m => {
            const details = parseDetails(m.rawTitle);
            return {
                title: details.cleanTitle,
                size: m.size !== 'Unknown' ? m.size : details.size,
                quality: details.quality,
                seeders: m.seeders,
                link: m.link
            };
        });
    } catch (error) {
        if (!error.message.includes('Target closed') && !error.message.includes('Session closed')) {
            console.error(`PirateBay (${domain}) Error:`, error.message);
        }
        return [];
    } finally {
        try {
            if (page && !page.isClosed()) await page.close();
        } catch (e) {}
    }
};

const scrapeMovie = async (title) => {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-notifications',
            '--disable-extensions',
            '--disable-infobars',
            '--disable-popup-blocking', // We handle popups manually to ensure we don't lose context
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials',
            '--ignore-certificate-errors',
            '--mute-audio', // Mute any potential video ads
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-blink-features=AutomationControlled' // Mask automation
        ]
    });

    try {
        console.log(`Received scrape request for: ${title}`);

        // Only use the specific domain requested
        const domain = 'https://thepibay.site/';
        
        // Scrape using the single domain
        const results = await scrapePirateBay(browser, title, domain);
        
        // Helper to parse size to MB
        const parseSizeToMB = (sizeStr) => {
            if (!sizeStr || sizeStr === 'Unknown') return 0;
            const match = sizeStr.match(/([\d\.]+)\s*([GM]B)/i);
            if (!match) return 0;
            let val = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            if (unit.includes('G')) val *= 1024;
            return val;
        };

        // FILTERING LOGIC
        const filteredResults = results
            .filter(r => {
                const sizeMB = parseSizeToMB(r.size);
                return r.seeders >= 10 && sizeMB >= 400;
            })
            .sort((a, b) => b.seeders - a.seeders);

        return filteredResults;

    } catch (error) {
        console.log('Scraper failed:', error.message);
        return [];
    } finally {
        try {
            if (browser) await browser.close();
        } catch (e) {}
    }
};

module.exports = { scrapeMovie };
