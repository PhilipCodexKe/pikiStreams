require('dotenv').config();
const { initCrawleeConfig } = require('../scrapers/engine/crawlee-config');
const { getNextBulkItem, updateBulkStatus } = require('../database/supabase');
const { searchMovieStreams } = require('../scrapers/orchestrator');

// Initialize Crawlee configuration with zero disk logs
initCrawleeConfig();

const DELAY_BETWEEN_JOBS_MS = 2000; // 2-second politeness delay between movies
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// SAFETY GUARD: Accidental Execution Prevention
// The worker will REFUSE to run unless explicitly passed '--run' in the CLI
// ============================================================================
const args = process.argv.slice(2);
const isExplicitRun = args.includes('--run');

if (!isExplicitRun) {
    console.error('\n🛑 SAFETY WARNING: Bulk crawler not started.');
    console.error('To run the bulk worker intentionally, you must use:');
    console.error('   npm run worker:start\n');
    process.exit(1);
}

async function runBulkWorker() {
    console.log('====================================================');
    console.log('   PikiStreams Crawlee Bulk Worker (STANDALONE)     ');
    console.log('====================================================');
    console.log('[Worker] Intentional start confirmed. Polling bulk_queue...\n');

    let isRunning = true;

    process.on('SIGINT', () => {
        console.log('\n[Worker] Gracefully stopping bulk worker...');
        isRunning = false;
        process.exit(0);
    });

    while (isRunning) {
        try {
            const item = await getNextBulkItem();

            if (!item) {
                // If queue is empty, exit cleanly or sleep
                console.log('[Worker] Bulk queue is empty. Idle (checking every 10s)...');
                await sleep(10000);
                continue;
            }

            console.log(`[Worker] Picked job #${item.id}: "${item.title}" (${item.year || 'any year'})${item.tmdb_id ? ` [TMDB: ${item.tmdb_id}]` : ''}`);

            const streams = await searchMovieStreams(item.title, item.year, false, item.tmdb_id);

            if (streams && streams.length > 0) {
                console.log(`[Worker] Successfully scraped & saved ${streams.length} streams for "${item.title}".`);
            } else {
                console.log(`[Worker] No streams found for "${item.title}".`);
            }

            await updateBulkStatus(item.id, 'completed');
            console.log(`[Worker] Resting ${DELAY_BETWEEN_JOBS_MS / 1000}s before next movie...\n`);
            await sleep(DELAY_BETWEEN_JOBS_MS);

        } catch (err) {
            console.error('[Worker] Error processing job:', err.message);
            await sleep(5000);
        }
    }
}

runBulkWorker();
