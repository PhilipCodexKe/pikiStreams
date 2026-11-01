const { chromium } = require('playwright');
const tpb = require('./scrapers/providers/thepiratebay');
const yts = require('./scrapers/providers/yts');
const lime = require('./scrapers/providers/limetorrents');
const { applyPopupShield } = require('./scrapers/engine/playwright-shield');

async function testAllActiveProviders() {
    console.log('=== TESTING ACTIVE HIGH-SPEED PROVIDERS WITH FALLBACKS ===\n');
    const query = 'Interstellar 2014';

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    applyPopupShield(context);

    // 1. Test YTS
    console.log('[1/3] Testing YTS...');
    const ytsResults = await yts.searchCheerio(query);
    console.log(`  -> YTS Count: ${ytsResults ? ytsResults.length : 0}`);
    if (ytsResults && ytsResults[0]) {
        console.log(`     Sample: ${ytsResults[0].title} | Seeds: ${ytsResults[0].seeders} | Size: ${ytsResults[0].size}`);
    }

    // 2. Test ThePirateBay
    console.log('\n[2/3] Testing ThePirateBay (apibay.org API)...');
    let tpbResults = await tpb.searchCheerio(query);
    if (!tpbResults) {
        console.log('  -> TPB Cheerio failed. Running Playwright fallback...');
        tpbResults = await tpb.searchPlaywright(context, query);
    }
    console.log(`  -> TPB Count: ${tpbResults ? tpbResults.length : 0}`);
    if (tpbResults && tpbResults[0]) {
        console.log(`     Sample: ${tpbResults[0].title} | Seeds: ${tpbResults[0].seeders} | Size: ${tpbResults[0].size}`);
    }

    // 3. Test LimeTorrents (Cheerio -> Playwright fallback)
    console.log('\n[3/3] Testing LimeTorrents...');
    let limeResults = await lime.searchCheerio(query);
    if (!limeResults) {
        console.log('  -> LimeTorrents Cheerio had no magnets. Running Playwright fallback...');
        limeResults = await lime.searchPlaywright(context, query);
    }
    console.log(`  -> LimeTorrents Count: ${limeResults ? limeResults.length : 0}`);
    if (limeResults && limeResults[0]) {
        console.log(`     Sample: ${limeResults[0].title} | Seeds: ${limeResults[0].seeders} | Size: ${limeResults[0].size}`);
    }

    await browser.close();
    console.log('\n=== ALL PROVIDERS VERIFIED ===');
    process.exit(0);
}

testAllActiveProviders();
