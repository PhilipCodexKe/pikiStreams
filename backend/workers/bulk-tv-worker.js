require("dotenv").config();
const { initCrawleeConfig } = require("../scrapers/engine/crawlee-config");
const {
  getNextTvBulkItem,
  updateTvBulkStatus,
} = require("../database/supabase");
const { searchTvStreams } = require("../scrapers/orchestrator");

// Initialize Crawlee configuration with zero disk logs
initCrawleeConfig();

const DELAY_BETWEEN_JOBS_MS = 2500; // 2.5-second politeness delay between jobs
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// SAFETY GUARD: Accidental Execution Prevention
// The worker will REFUSE to run unless explicitly passed '--run' in the CLI
// ============================================================================
const args = process.argv.slice(2);
const isExplicitRun = args.includes("--run");

if (!isExplicitRun) {
  console.error("\n🛑 SAFETY WARNING: TV Bulk crawler not started.");
  console.error("To run the TV bulk worker intentionally, you must use:");
  console.error("   npm run worker:tv:start\n");
  process.exit(1);
}

async function runBulkTvWorker() {
  console.log("====================================================");
  console.log("   PikiStreams TV Series Bulk Worker (STANDALONE)   ");
  console.log("   Order: 1337x -> TorrentGalaxy -> EZTV -> Lime    ");
  console.log("====================================================");
  console.log(
    "[TV Worker] Intentional start confirmed. Polling bulk_tv_queue...\n",
  );

  let isRunning = true;

  process.on("SIGINT", () => {
    console.log("\n[TV Worker] Gracefully stopping bulk TV worker...");
    isRunning = false;
    process.exit(0);
  });

  while (isRunning) {
    try {
      const item = await getNextTvBulkItem();

      if (!item) {
        console.log(
          "[TV Worker] bulk_tv_queue is empty. Idle (checking every 10s)...",
        );
        await sleep(10000);
        continue;
      }

      const isPack = item.mode === "season_pack" || item.episode === null;
      const episodeStr = isPack
        ? `S${String(item.season).padStart(2, "0")} (Season Pack)`
        : `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}`;
      console.log(
        `[TV Worker] Picked Job #${item.id}: "${item.title}" [${episodeStr}] (TMDB: ${item.tmdb_id})`,
      );

      const streams = await searchTvStreams(
        item.tmdb_id,
        item.season,
        item.episode,
        item.title,
        false,
        isPack,
      );

      if (streams && streams.length > 0) {
        console.log(
          `[TV Worker] Successfully scraped & saved ${streams.length} TV stream(s) for "${item.title}" ${episodeStr}.`,
        );
      } else {
        console.log(
          `[TV Worker] No streams found for "${item.title}" ${episodeStr}.`,
        );
      }

      await updateTvBulkStatus(item.id, "completed");
      console.log(
        `[TV Worker] Resting ${DELAY_BETWEEN_JOBS_MS / 1000}s before next job...\n`,
      );
      await sleep(DELAY_BETWEEN_JOBS_MS);
    } catch (err) {
      console.error("[TV Worker] Error processing job:", err.message);
      await sleep(5000);
    }
  }
}

runBulkTvWorker();
